import type { Express, Request as ExpressRequest, Response as ExpressResponse } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { z } from "zod";
import { lookup } from "node:dns/promises";
import { BlockList, isIP, type LookupFunction } from "node:net";
import { Agent, fetch as undiciFetch } from "undici";

import { searchGBIF, searchGBIFMultiCircle, fetchSpeciesDetails } from "./gbif";
import { findSINPPlatforms, SINP_PLATFORMS } from "./sinp";
import { STUDY_AREAS, PROJECT_PRESETS, TAXON_GROUPS } from "./constants";
import { analyzePrioritySpecies } from "./llm";
import { getZonages } from "./services/geoservices";
import type { BufferCircle, Occurrence, InventoryResult } from "@shared/types";
import type { CustomMcpServer, HarnessAgent, McpRegistryEntry } from "@shared/harness";

const APPROVED_INTERNAL_TOOL_IDS = new Set([
  "sinp_links",
  "zonages_for_location",
  "list_reference_data",
]);
const ALI_SPECIES_MCP_URL = "https://taxref-explorer.replit.app/api/mcp";
const APPROVED_ALI_SPECIES_TOOL_IDS = new Set(["search_taxons"]);
const ALI_HABITAT_MCP_URL = "https://ali-habitat.replit.app/mcp";
const APPROVED_ALI_HABITAT_TOOL_IDS = new Set(["get_habitats", "list_project_types"]);
const MCP_CONNECT_TIMEOUT_MS = 2000;
const MCP_TOOL_TIMEOUT_MS = 10000;
const ALI_HABITAT_CONNECT_TIMEOUT_MS = 10000;
const ALI_HABITAT_TOOL_TIMEOUT_MS = 30000;
const MCP_RESPONSE_MAX_BYTES = 1_000_000;
const BLOCKED_HOSTNAMES = new Set(["localhost", "localhost.localdomain"]);
const CUSTOM_ARGUMENT_NAMES = new Set([
  "lat", "latitude", "lng", "lon", "longitude",
  "radius", "radiusM", "radiusKm",
  "query", "q", "name", "scientificName",
]);
const NUMERIC_CUSTOM_ARGUMENT_NAMES = new Set([
  "lat", "latitude", "lng", "lon", "longitude",
  "radius", "radiusM", "radiusKm",
]);
const BLOCKED_IPS = new BlockList();
[
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
  ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24],
  ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24],
  ["203.0.113.0", 24], ["224.0.0.0", 4],
].forEach(([network, prefix]) => BLOCKED_IPS.addSubnet(network as string, prefix as number, "ipv4"));
[
  ["::", 128], ["::1", 128], ["fc00::", 7],
  ["fe80::", 10], ["ff00::", 8], ["2001:db8::", 32],
].forEach(([network, prefix]) => BLOCKED_IPS.addSubnet(network as string, prefix as number, "ipv6"));

export interface McpExecutionTrace {
  agentId: string;
  mcpId: string;
  toolId: string;
  status: "success" | "error" | "denied";
  startedAt: string;
  durationMs: number;
  summary: string;
  output?: string;
}

const MCP_CONTEXT_MAX_CHARACTERS = 50_000;

function contextOutput(value: string): string {
  return value.length > MCP_CONTEXT_MAX_CHARACTERS
    ? `${value.slice(0, MCP_CONTEXT_MAX_CHARACTERS)}\n[Réponse tronquée à ${MCP_CONTEXT_MAX_CHARACTERS} caractères]`
    : value;
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

async function connectAliSpeciesMcp(): Promise<{ client: Client }> {
  const client = new Client({ name: "ali-inventaire-harness", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(ALI_SPECIES_MCP_URL)));
  return { client };
}

async function connectAliHabitatMcp(): Promise<{ client: Client }> {
  const client = new Client({ name: "ali-inventaire-harness", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(ALI_HABITAT_MCP_URL)));
  return { client };
}

function isPrivateAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return BLOCKED_IPS.check(address, "ipv4");
  if (family === 6) {
    if (address.toLowerCase().startsWith("::ffff:")) return true;
    return BLOCKED_IPS.check(address, "ipv6");
  }
  return true;
}

async function resolvePublicMcpUrl(rawUrl: string): Promise<{ url: URL; addresses: Array<{ address: string; family: number }> }> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("URL MCP invalide.");
  }
  if (url.protocol !== "https:") throw new Error("Le serveur MCP doit utiliser HTTPS.");
  if (url.username || url.password) throw new Error("Les identifiants dans l’URL MCP sont interdits.");
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!hostname || BLOCKED_HOSTNAMES.has(hostname) || hostname.endsWith(".local") || hostname.endsWith(".internal")) {
    throw new Error("Cette adresse MCP n’est pas autorisée.");
  }
  let addresses = isIP(hostname)
    ? [{ address: hostname, family: isIP(hostname) }]
    : await lookup(hostname, { all: true, verbatim: true });
  // Replit routes public *.replit.app hosts through a private in-container proxy.
  // Confirm their real public DNS address before allowing this known hosting suffix.
  if (
    !isIP(hostname) &&
    hostname.endsWith(".replit.app") &&
    addresses.length > 0 &&
    addresses.every(({ address }) => isPrivateAddress(address))
  ) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), MCP_CONNECT_TIMEOUT_MS);
    try {
      const response = await fetch(
        `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(hostname)}&type=A`,
        { headers: { Accept: "application/dns-json" }, signal: controller.signal },
      );
      if (response.ok) {
        const data = await response.json() as { Answer?: Array<{ type?: number; data?: string }> };
        addresses = (data.Answer ?? [])
          .filter((answer) => answer.type === 1 && isIP(answer.data ?? "") === 4)
          .map((answer) => ({ address: answer.data!, family: 4 }));
      }
    } finally {
      clearTimeout(timer);
    }
  }
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new Error("Le serveur MCP doit résoudre vers une adresse publique.");
  }
  return { url, addresses };
}

export async function validatePublicMcpUrl(rawUrl: string): Promise<URL> {
  return (await resolvePublicMcpUrl(rawUrl)).url;
}

export function getCustomToolCompatibility(inputSchema: unknown): Pick<McpRegistryEntry["tools"][number], "supported" | "unsupportedReason"> {
  const schema = inputSchema as {
    type?: unknown;
    properties?: unknown;
    required?: unknown;
    allOf?: unknown;
    anyOf?: unknown;
    oneOf?: unknown;
    $ref?: unknown;
  } | undefined;
  if (
    !schema ||
    schema.type !== "object" ||
    !schema.properties ||
    typeof schema.properties !== "object" ||
    Array.isArray(schema.properties) ||
    schema.allOf ||
    schema.anyOf ||
    schema.oneOf ||
    schema.$ref
  ) {
    return {
      supported: false,
      unsupportedReason: "ALi prend uniquement en charge un schéma objet simple avec des propriétés explicites.",
    };
  }
  const properties = schema.properties as Record<string, unknown>;
  const required = Array.isArray(schema?.required)
    ? schema.required.filter((name): name is string => typeof name === "string")
    : [];
  const unsupported = required.filter(
    (name) => !CUSTOM_ARGUMENT_NAMES.has(name) || !Object.prototype.hasOwnProperty.call(properties, name),
  );
  if (unsupported.length) {
    return {
      supported: false,
      unsupportedReason: `Paramètres obligatoires non fournis par ALi : ${unsupported.join(", ")}`,
    };
  }
  const incompatibleTypes = Object.entries(properties)
    .filter(([name]) => CUSTOM_ARGUMENT_NAMES.has(name))
    .filter(([name, definition]) => {
      if (!definition || typeof definition !== "object" || Array.isArray(definition)) return true;
      const type = (definition as { type?: unknown }).type;
      return NUMERIC_CUSTOM_ARGUMENT_NAMES.has(name)
        ? type !== "number"
        : type !== "string";
    })
    .map(([name]) => name);
  if (incompatibleTypes.length) {
    return {
      supported: false,
      unsupportedReason: `Types de paramètres incompatibles avec ALi : ${incompatibleTypes.join(", ")}`,
    };
  }
  return { supported: true };
}

async function connectExternalMcp(rawUrl: string): Promise<{ client: Client; cleanup: () => Promise<void> }> {
  const { url, addresses } = await resolvePublicMcpUrl(rawUrl);
  const selected = addresses[0];
  const pinnedLookup: LookupFunction = (_hostname, options, callback) => {
    if (options?.all) {
      callback(null, addresses as never);
      return;
    }
    callback(null, selected.address, selected.family);
  };
  const dispatcher = new Agent({
    connect: {
      lookup: pinnedLookup,
    },
  });
  const client = new Client({ name: "ali-inventaire-harness", version: "1.0.0" });
  const safeFetch = async (input: string | URL | globalThis.Request, init?: RequestInit): Promise<globalThis.Response> => {
    const response = await undiciFetch(input as Parameters<typeof undiciFetch>[0], {
      ...(init as Parameters<typeof undiciFetch>[1]),
      dispatcher,
    });
    const announcedLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(announcedLength) && announcedLength > MCP_RESPONSE_MAX_BYTES) {
      await response.body?.cancel();
      throw new Error("La réponse MCP dépasse la taille maximale autorisée.");
    }
    let received = 0;
    const limiter = new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        received += chunk.byteLength;
        if (received > MCP_RESPONSE_MAX_BYTES) {
          controller.error(new Error("La réponse MCP dépasse la taille maximale autorisée."));
          return;
        }
        controller.enqueue(chunk);
      },
    });
    const body = response.body?.pipeThrough(limiter as never);
    return new globalThis.Response(body as BodyInit | null, {
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries()),
    });
  };
  const transport = new StreamableHTTPClientTransport(url, {
    requestInit: { redirect: "manual" },
    fetch: safeFetch as unknown as typeof fetch,
  });
  let timeout: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      client.connect(transport),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(
          () => reject(new Error("Délai de connexion MCP dépassé.")),
          MCP_CONNECT_TIMEOUT_MS,
        );
      }),
    ]);
  } catch (error) {
    await client.close().catch(() => undefined);
    await dispatcher.close().catch(() => undefined);
    throw error;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
  return { client, cleanup: () => dispatcher.close() };
}

export async function discoverMcpServer(server: CustomMcpServer): Promise<McpRegistryEntry> {
  let connection: { client: Client; cleanup: () => Promise<void> } | undefined;
  try {
    connection = await connectExternalMcp(server.url);
    const response = await connection.client.listTools(undefined, { timeout: MCP_CONNECT_TIMEOUT_MS });
    return {
      id: server.id,
      label: server.label,
      url: server.url,
      managed: true,
      connected: true,
      tools: response.tools.slice(0, 100).map((tool) => ({
        id: tool.name,
        title: tool.title ?? tool.name,
        description: (tool.description ?? "").slice(0, 1000),
        inputSchema: tool.inputSchema,
        ...getCustomToolCompatibility(tool.inputSchema),
      })),
    };
  } catch (error) {
    return {
      id: server.id,
      label: server.label,
      url: server.url,
      managed: true,
      connected: false,
      tools: [],
      error: error instanceof Error ? error.message : "Serveur MCP inaccessible.",
    };
  } finally {
    await connection?.client.close().catch(() => undefined);
    await connection?.cleanup().catch(() => undefined);
  }
}

export async function getMcpServerRegistry(customServers: CustomMcpServer[] = []): Promise<McpRegistryEntry[]> {
  const discover = async (
    id: string,
    label: string,
    approvedTools: Set<string>,
    connect: () => Promise<{ client: Client; server?: McpServer }>,
  ): Promise<McpRegistryEntry> => {
    let connection: Awaited<ReturnType<typeof connect>> | undefined;
    try {
      connection = await connect();
      const response = await connection.client.listTools(undefined, {
        timeout: id === "ali-habitat" ? ALI_HABITAT_CONNECT_TIMEOUT_MS : MCP_CONNECT_TIMEOUT_MS,
      });
      return {
        id,
        label,
        managed: true,
        connected: true,
        tools: response.tools
          .filter((tool) => approvedTools.has(tool.name))
          .map((tool) => ({
            id: tool.name,
            title: tool.title ?? tool.name,
            description: tool.description ?? "",
            inputSchema: tool.inputSchema,
             supported: true,
          })),
      };
    } catch {
      return { id, label, managed: true, connected: false, tools: [] };
    } finally {
      await connection?.client.close().catch(() => undefined);
      await connection?.server?.close().catch(() => undefined);
    }
  };

  return Promise.all([
    discover("ali-internal", "MCP interne ALi", APPROVED_INTERNAL_TOOL_IDS, connectInternalMcp),
    discover("ali-species", "ALI Species — TAXREF Explorer", APPROVED_ALI_SPECIES_TOOL_IDS, connectAliSpeciesMcp),
    discover("ali-habitat", "ALI Habitat — CARHAB", APPROVED_ALI_HABITAT_TOOL_IDS, connectAliHabitatMcp),
    ...customServers.map(discoverMcpServer),
  ]);
}

export async function executeApprovedMcpTool(
  agent: HarnessAgent,
  toolId: string,
  input: { lat: number; lng: number; radius?: number; scientificName?: string },
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
    agent.mcpId === "none" ||
    !(agent.mcpId.startsWith("custom-")
      ? true
      : agent.mcpId === "ali-internal"
      ? APPROVED_INTERNAL_TOOL_IDS.has(toolId)
      : agent.mcpId === "ali-species"
        ? APPROVED_ALI_SPECIES_TOOL_IDS.has(toolId)
        : agent.mcpId === "ali-habitat" && APPROVED_ALI_HABITAT_TOOL_IDS.has(toolId)) ||
    !agent.mcpToolIds?.includes(toolId)
  ) {
    return { ...base, status: "denied", durationMs: Date.now() - started, summary: "Outil non approuvé pour cet agent." };
  }
  const registry = (await registryProvider()).find((entry) => entry.id === agent.mcpId);
  const registeredTool = registry?.tools.find((tool) => tool.id === toolId);
  if (!registry?.connected || !registeredTool) {
    return { ...base, status: "error", durationMs: Date.now() - started, summary: "MCP indisponible ou capacité introuvable." };
  }
  if (registeredTool.supported === false) {
    return {
      ...base,
      status: "denied",
      durationMs: Date.now() - started,
      summary: registeredTool.unsupportedReason ?? "Schéma d’entrée MCP incompatible avec ALi.",
    };
  }
  let connection: { client: Client; server?: McpServer; cleanup?: () => Promise<void> } | undefined;
  try {
    let args: Record<string, unknown>;
    if (agent.mcpId.startsWith("custom-")) {
      const available: Record<string, unknown> = {
        lat: input.lat,
        latitude: input.lat,
        lng: input.lng,
        lon: input.lng,
        longitude: input.lng,
        radius: input.radius ?? 2000,
        radiusM: input.radius ?? 2000,
        radiusKm: Math.min(50, Math.max(0.001, (input.radius ?? 2000) / 1000)),
        query: input.scientificName,
        q: input.scientificName,
        name: input.scientificName,
        scientificName: input.scientificName,
      };
      const schema = registeredTool.inputSchema as {
        properties?: Record<string, unknown>;
        required?: string[];
      } | undefined;
      const propertyNames = Object.keys(schema?.properties ?? {});
      args = Object.fromEntries(
        propertyNames
          .filter((name) => available[name] !== undefined)
          .map((name) => [name, available[name]]),
      );
      const unsupported = (schema?.required ?? []).filter((name) => args[name] === undefined);
      if (unsupported.length) {
        throw new Error(`Paramètres MCP requis non disponibles : ${unsupported.join(", ")}`);
      }
    } else {
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
        case "search_taxons":
          if (!input.scientificName) throw new Error("Aucun taxon disponible pour interroger ALI Species");
          args = { query: input.scientificName, limit: 5 };
          break;
        case "get_habitats":
          args = {
            lng: input.lng,
            lat: input.lat,
            radiusKm: Math.min(50, Math.max(0.001, (input.radius ?? 2000) / 1000)),
          };
          break;
        case "list_project_types":
          args = {};
          break;
        default:
          throw new Error("Outil MCP inconnu");
      }
    }
    connection = agent.mcpId.startsWith("custom-")
      ? await connectExternalMcp(registry.url ?? "")
      : agent.mcpId === "ali-species"
      ? await connectAliSpeciesMcp()
      : agent.mcpId === "ali-habitat"
        ? await connectAliHabitatMcp()
        : await connectInternalMcp();
    const result = await connection.client.callTool(
      { name: toolId, arguments: args },
      undefined,
      { timeout: toolId === "get_habitats" ? ALI_HABITAT_TOOL_TIMEOUT_MS : MCP_TOOL_TIMEOUT_MS },
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
      output: result.isError ? undefined : contextOutput(text || JSON.stringify(result)),
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
    await connection?.server?.close().catch(() => undefined);
    await connection?.cleanup?.().catch(() => undefined);
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
  app.all("/mcp", async (req: ExpressRequest, res: ExpressResponse) => {
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
