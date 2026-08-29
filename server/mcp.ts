import type { Express, Request, Response } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { z } from "zod";

import { searchGBIF, searchGBIFMultiCircle, fetchSpeciesDetails } from "./gbif";
import { findSINPPlatforms, SINP_PLATFORMS } from "./sinp";
import { STUDY_AREAS, PROJECT_PRESETS, TAXON_GROUPS } from "./constants";
import { analyzePrioritySpecies } from "./llm";
import { getZonages } from "./services/geoservices";
import type { BufferCircle, Occurrence, InventoryResult } from "@shared/types";
import type { HarnessAgent, McpRegistryEntry } from "@shared/harness";

const APPROVED_INTERNAL_TOOL_IDS = new Set([
  "sinp_links",
  "zonages_for_location",
  "list_reference_data",
]);
const MCP_CONNECT_TIMEOUT_MS = 2000;
const MCP_TOOL_TIMEOUT_MS = 10000;

export interface McpExecutionTrace {
  agentId: string;
  mcpId: string;
  toolId: string;
  status: "success" | "error" | "denied";
  startedAt: string;
  durationMs: number;
  summary: string;
}

function traceSummary(value: unknown): string {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > 500 ? `${text.slice(0, 497)}…` : text;
}

async function connectInternalMcp(): Promise<{ client: Client; server: McpServer }> {
  const server = buildMcpServer();
  const client = new Client({ name: "ali-harness", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);
  return { client, server };
}

export async function getMcpServerRegistry(): Promise<McpRegistryEntry[]> {
  let connection: Awaited<ReturnType<typeof connectInternalMcp>> | undefined;
  try {
    connection = await connectInternalMcp();
    const response = await connection.client.listTools(undefined, { timeout: MCP_CONNECT_TIMEOUT_MS });
    return [{
      id: "ali-internal",
      label: "MCP interne ALi",
      connected: true,
      tools: response.tools
        .filter((tool) => APPROVED_INTERNAL_TOOL_IDS.has(tool.name))
        .map((tool) => ({
          id: tool.name,
          title: tool.title ?? tool.name,
          description: tool.description ?? "",
        })),
    }];
  } catch {
    return [{ id: "ali-internal", label: "MCP interne ALi", connected: false, tools: [] }];
  } finally {
    await connection?.client.close().catch(() => undefined);
    await connection?.server.close().catch(() => undefined);
  }
}

export async function executeApprovedMcpTool(
  agent: HarnessAgent,
  toolId: string,
  input: { lat: number; lng: number; radius?: number },
  registryProvider: () => Promise<McpRegistryEntry[]> = getMcpServerRegistry,
): Promise<McpExecutionTrace> {
  const started = Date.now();
  const base = {
    agentId: agent.id,
    mcpId: agent.mcpId,
    toolId,
    startedAt: new Date(started).toISOString(),
  };
  if (
    !agent.enabled ||
    agent.mcpId !== "ali-internal" ||
    !APPROVED_INTERNAL_TOOL_IDS.has(toolId) ||
    !agent.mcpToolIds?.includes(toolId)
  ) {
    return { ...base, status: "denied", durationMs: Date.now() - started, summary: "Outil non approuvé pour cet agent." };
  }
  const registry = (await registryProvider()).find((entry) => entry.id === agent.mcpId);
  if (!registry?.connected || !registry.tools.some((tool) => tool.id === toolId)) {
    return { ...base, status: "error", durationMs: Date.now() - started, summary: "MCP indisponible ou capacité introuvable." };
  }
  let connection: Awaited<ReturnType<typeof connectInternalMcp>> | undefined;
  try {
    let args: Record<string, unknown>;
    switch (toolId) {
      case "sinp_links":
        args = { lat: input.lat, lng: input.lng };
        break;
      case "zonages_for_location":
        args = { lat: input.lat, lng: input.lng, radius: input.radius ?? 2000 };
        break;
      case "list_reference_data":
        args = { kind: "study_areas" };
        break;
      default:
        throw new Error("Outil MCP inconnu");
    }
    connection = await connectInternalMcp();
    const result = await connection.client.callTool(
      { name: toolId, arguments: args },
      undefined,
      { timeout: MCP_TOOL_TIMEOUT_MS },
    );
    const content = Array.isArray(result.content)
      ? result.content as Array<{ type?: string; text?: string }>
      : [];
    const text = content
      .filter((item) => item.type === "text" && typeof item.text === "string")
      .map((item) => item.text)
      .join("\n");
    return {
      ...base,
      status: result.isError ? "error" : "success",
      durationMs: Date.now() - started,
      summary: traceSummary(text || result),
    };
  } catch (error) {
    return {
      ...base,
      status: "error",
      durationMs: Date.now() - started,
      summary: error instanceof Error ? error.message : "Échec MCP",
    };
  } finally {
    await connection?.client.close().catch(() => undefined);
    await connection?.server.close().catch(() => undefined);
  }
}

function summariseInventory(result: InventoryResult, max = 200) {
  const map = new Map<
    string,
    {
      scientificName: string;
      vernacularName?: string;
      iucnStatus?: string;
      alertLevel: "high" | "medium" | "low";
      kingdom?: string;
      class?: string;
      taxonKey?: number;
      occurrenceCount: number;
    }
  >();

  for (const o of result.occurrences) {
    const key = o.scientificName;
    const existing = map.get(key);
    if (existing) {
      existing.occurrenceCount += 1;
    } else {
      map.set(key, {
        scientificName: o.scientificName,
        vernacularName: o.vernacularName,
        iucnStatus: o.iucnStatus,
        alertLevel: o.alertLevel,
        kingdom: o.kingdom,
        class: o.class,
        taxonKey: o.taxonKey,
        occurrenceCount: 1,
      });
    }
  }

  const species = Array.from(map.values()).sort(
    (a, b) => b.occurrenceCount - a.occurrenceCount,
  );

  return {
    totalSpecies: species.length,
    totalOccurrences: result.stats.total,
    sensitiveCount: result.stats.sensitiveCount,
    confidence: result.confidence,
    species: species.slice(0, max),
    truncated: species.length > max,
  };
}

function buildMcpServer(): McpServer {
  const server = new McpServer(
    { name: "inventaire-flash", version: "1.0.0" },
    {
      capabilities: { tools: {} },
      instructions:
        "Inventaire Flash : pré-diagnostic écologique français basé sur GBIF, " +
        "destiné aux études d'impact environnemental (EIE). Utilise les outils pour " +
        "interroger la biodiversité autour d'un point GPS, obtenir les détails " +
        "d'une espèce, géocoder un lieu, lister les plateformes SINP régionales " +
        "et obtenir une analyse IA des espèces à enjeux.",
    },
  );

  const ok = (data: unknown) => ({
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  });

  const fail = (message: string) => ({
    isError: true,
    content: [{ type: "text" as const, text: message }],
  });

  server.registerTool(
    "inventory_simple",
    {
      title: "Inventaire GBIF (un point)",
      description:
        "Récupère les espèces observées (occurrences GBIF) autour d'un point GPS dans un rayon donné. " +
        "Renvoie la liste des espèces avec statut UICN, nom vernaculaire, classification taxonomique, " +
        "et un score de confiance des données.",
      inputSchema: {
        lat: z.number().min(-90).max(90).describe("Latitude WGS84"),
        lng: z.number().min(-180).max(180).describe("Longitude WGS84"),
        radius: z
          .number()
          .positive()
          .max(50000)
          .default(500)
          .describe("Rayon en mètres (défaut 500, max 50 000)"),
      },
    },
    async ({ lat, lng, radius }) => {
      try {
        const result = await searchGBIF(lat, lng, radius ?? 500);
        return ok(summariseInventory(result));
      } catch (e: any) {
        return fail(e.message || "Erreur inventaire");
      }
    },
  );

  server.registerTool(
    "inventory_multi",
    {
      title: "Inventaire EIE multi-aires",
      description:
        "Inventaire sur plusieurs aires concentriques (standard EIE : aire immédiate, rapprochée, éloignée). " +
        "Chaque cercle a un id, un centre [lat, lng], un rayon en mètres et peut être activé.",
      inputSchema: {
        circles: z
          .array(
            z.object({
              id: z.string(),
              label: z.string().optional(),
              center: z.tuple([
                z.number().min(-90).max(90),
                z.number().min(-180).max(180),
              ]),
              radius: z.number().positive().max(50000),
              enabled: z.boolean().default(true),
            }),
          )
          .min(1)
          .max(10)
          .describe("Liste des cercles (1 à 10)"),
      },
    },
    async ({ circles }) => {
      try {
        const normalised = (circles as any[]).map((c) => ({
          id: c.id,
          label: c.label ?? c.id,
          center: c.center,
          radius: c.radius,
          enabled: c.enabled ?? true,
        })) as BufferCircle[];
        const result = await searchGBIFMultiCircle(normalised);
        return ok(summariseInventory(result));
      } catch (e: any) {
        return fail(e.message || "Erreur inventaire");
      }
    },
  );

  server.registerTool(
    "species_details",
    {
      title: "Détails d'une espèce GBIF",
      description: "Détails d'une espèce : nom vernaculaire FR, statut UICN, image, taxonomie.",
      inputSchema: {
        taxonKey: z.number().int().describe("Identifiant GBIF (taxonKey)"),
      },
    },
    async ({ taxonKey }) => {
      try {
        return ok(await fetchSpeciesDetails(taxonKey));
      } catch (e: any) {
        return fail(e.message || "Erreur espèce");
      }
    },
  );

  server.registerTool(
    "geocode",
    {
      title: "Géocodage (Nominatim)",
      description: "Convertit un nom de lieu en coordonnées GPS via OpenStreetMap.",
      inputSchema: { q: z.string().min(1).describe("Lieu, commune ou adresse") },
    },
    async ({ q }) => {
      try {
        const params = new URLSearchParams({
          q: q.trim(),
          format: "json",
          limit: "1",
          addressdetails: "1",
        });
        const r = await fetch(
          `https://nominatim.openstreetmap.org/search?${params.toString()}`,
          { headers: { "User-Agent": "InventaireFlash-MCP/1.0" } },
        );
        if (!r.ok) return fail("Service de géocodage indisponible");
        const data = await r.json();
        if (!data?.length) return fail("Lieu introuvable");
        return ok({
          lat: parseFloat(data[0].lat),
          lng: parseFloat(data[0].lon),
          displayName: data[0].display_name,
        });
      } catch (e: any) {
        return fail(e.message || "Erreur géocodage");
      }
    },
  );

  server.registerTool(
    "sinp_links",
    {
      title: "Plateformes SINP régionales",
      description:
        "Renvoie les plateformes SINP (Système d'Information Nature et Paysages) " +
        "couvrant les coordonnées données — sources de données complémentaires régionales.",
      inputSchema: {
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
      },
    },
    async ({ lat, lng }) => {
      try {
        return ok({ platforms: findSINPPlatforms(lat, lng) });
      } catch (e: any) {
        return fail(e.message || "Erreur SINP");
      }
    },
  );

  server.registerTool(
    "zonages_for_location",
    {
      title: "Zonages environnementaux (ZNIEFF, Natura 2000…)",
      description:
        "Renvoie les zonages environnementaux (inventaire ZNIEFF I/II, Natura 2000 ZSC/ZPS, réserves naturelles, " +
        "parcs, arrêtés de protection de biotope, Ramsar, etc.) qui intersectent l'aire d'étude autour d'un point GPS. " +
        "Source : IGN Géoplateforme / PatriNat (MNHN). Chaque zonage inclut son nom et le lien vers sa fiche INPN.",
      inputSchema: {
        lat: z.number().min(-90).max(90).describe("Latitude WGS84"),
        lng: z.number().min(-180).max(180).describe("Longitude WGS84"),
        radius: z
          .number()
          .positive()
          .max(50000)
          .default(2000)
          .describe("Rayon de recherche en mètres autour du point (défaut 2000, max 50 000)"),
      },
    },
    async ({ lat, lng, radius }) => {
      try {
        return ok(await getZonages(lat, lng, radius ?? 2000));
      } catch (e: any) {
        return fail(e.message || "Erreur zonages");
      }
    },
  );

  server.registerTool(
    "priority_species_for_location",
    {
      title: "Top 5 espèces à enjeux (analyse IA)",
      description:
        "Lance un inventaire GBIF autour du point puis demande à un LLM expert d'identifier " +
        "les 5 espèces les plus sensibles pour une étude d'impact (UICN, protégées France, ZNIEFF, directives Habitats/Oiseaux).",
      inputSchema: {
        toponym: z.string().describe("Nom du lieu (utilisé dans l'analyse)"),
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
        radius: z
          .number()
          .positive()
          .max(50000)
          .default(2000)
          .describe("Rayon d'inventaire en mètres (défaut 2000)"),
      },
    },
    async ({ toponym, lat, lng, radius }) => {
      try {
        const inv = await searchGBIF(lat, lng, radius ?? 2000);
        if (inv.occurrences.length === 0) {
          return fail("Aucune occurrence GBIF dans le rayon, analyse impossible");
        }
        const analysis = await analyzePrioritySpecies(
          toponym,
          [lat, lng],
          inv.occurrences as Occurrence[],
        );
        return ok({
          inventory: {
            totalOccurrences: inv.stats.total,
            speciesCount: inv.stats.speciesCount,
            sensitiveCount: inv.stats.sensitiveCount,
          },
          analysis,
        });
      } catch (e: any) {
        return fail(e.message || "Erreur analyse IA");
      }
    },
  );

  server.registerTool(
    "list_reference_data",
    {
      title: "Référentiels (presets, aires, groupes, SINP)",
      description:
        "Renvoie les référentiels embarqués : presets de projets EIE, définitions d'aires d'étude, " +
        "groupes taxonomiques et toutes les plateformes SINP. Utile pour construire un appel à inventory_multi.",
      inputSchema: {
        kind: z
          .enum(["presets", "study_areas", "taxon_groups", "sinp_all"])
          .describe("Référentiel à retourner"),
      },
    },
    async ({ kind }) => {
      switch (kind) {
        case "presets": return ok({ presets: PROJECT_PRESETS });
        case "study_areas": return ok({ studyAreas: STUDY_AREAS });
        case "taxon_groups": return ok({ groups: TAXON_GROUPS });
        case "sinp_all": return ok({ platforms: SINP_PLATFORMS });
      }
    },
  );

  return server;
}

export function registerMcpEndpoint(app: Express): void {
  app.all("/mcp", async (req: Request, res: Response) => {
    try {
      const server = buildMcpServer();
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      res.on("close", () => {
        transport.close();
        server.close();
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error: any) {
      console.error("MCP request error:", error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal MCP error: " + (error.message || "unknown") },
          id: null,
        });
      }
    }
  });
}
