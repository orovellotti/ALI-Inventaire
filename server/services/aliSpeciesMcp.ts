import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

import type { AliStatusSummary, InventoryResult, Occurrence } from "@shared/types";
import { isPlantTaxon } from "@shared/iucn";
import { normalizeStatuses } from "../ali";
import { checkConsistency, computeEnjeuLevel } from "../scoring";
import { reverseGeocode } from "./nominatim";
import type { RawAliStatus } from "./aliApi";

const ALI_SPECIES_MCP_URL = "https://taxref-explorer.replit.app/api/mcp";
const MAX_ENRICHED_TAXA = 80;
const CONCURRENCY = 4;
const CONNECT_TIMEOUT_MS = 5_000;
const TOOL_TIMEOUT_MS = 12_000;
const REGION_LOOKUP_TIMEOUT_MS = 3_000;
const PHASE_BUDGET_MS = 25_000;

interface McpDriver {
  label?: string;
  code?: string;
  title?: string;
  kind?: string;
}

interface McpStatusPayload {
  territoire?: string;
  patrimonialite?: {
    drivers?: McpDriver[];
  };
  statuts?: RawAliStatus[];
}

export function territorialScopeFromRegions(
  regions: string[],
  expectedLocationCount: number,
): { region?: string; scope: "single" | "multiple" | "unknown" } {
  const unique = Array.from(new Set(regions.filter(Boolean)));
  if (regions.length < expectedLocationCount || unique.length === 0) {
    return { scope: "unknown" };
  }
  if (unique.length > 1) return { scope: "multiple" };
  return { region: unique[0], scope: "single" };
}

function canonicalTerritory(value: string | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function sameTerritory(left: string | undefined, right: string | undefined): boolean {
  const canonicalLeft = canonicalTerritory(left);
  const canonicalRight = canonicalTerritory(right);
  return Boolean(canonicalLeft && canonicalRight && canonicalLeft === canonicalRight);
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function parseToolPayload(result: unknown, requestedRegion?: string): McpStatusPayload | null {
  const response = result as {
    isError?: boolean;
    content?: Array<{ type?: string; text?: string }>;
  };
  if (response?.isError) return null;
  const content = response?.content;
  const text = content
    ?.filter((item) => item.type === "text" && typeof item.text === "string")
    .map((item) => item.text)
    .join("\n");
  if (!text) return null;
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.statuts)) return null;
    if (requestedRegion && !sameTerritory(parsed.territoire, requestedRegion)) return null;
    return parsed as McpStatusPayload;
  } catch {
    return null;
  }
}

/**
 * Le MCP renvoie tous les statuts régionaux historiques du taxon. Pour éviter
 * qu'une liste rouge d'une autre région ne fausse l'analyse, seul le driver LRR
 * calculé par ALi Species pour le territoire demandé est conservé.
 */
export function statusesForStudyRegion(
  payload: McpStatusPayload,
  requestedRegion?: string,
): AliStatusSummary[] {
  const rawWithoutRegionalRedLists = (payload.statuts ?? []).filter(
    (status) => status.cdTypeStatut !== "LRR",
  );
  const statuses: AliStatusSummary[] = normalizeStatuses(rawWithoutRegionalRedLists).map(
    ({ category, value, label, tone, scope }) => ({ category, value, label, tone, scope }),
  );

  const regionalDriver = payload.patrimonialite?.drivers?.find(
    (driver) =>
      driver.kind === "redlist" &&
      typeof driver.label === "string" &&
      driver.label.toUpperCase().startsWith("LRR"),
  );
  if (
    requestedRegion &&
    sameTerritory(payload.territoire, requestedRegion) &&
    regionalDriver?.code
  ) {
    statuses.unshift({
      category: "Liste rouge régionale",
      value: regionalDriver.code,
      label: regionalDriver.title ?? regionalDriver.label ?? regionalDriver.code,
      tone: ["EX", "EW", "RE", "CR", "EN"].includes(regionalDriver.code)
        ? "danger"
        : ["VU", "NT"].includes(regionalDriver.code)
          ? "warn"
          : "neutral",
      scope: payload.territoire || requestedRegion,
    });
  }

  return statuses;
}

function applyStatuses(
  occurrence: Occurrence,
  aliStatuses: AliStatusSummary[] | undefined,
  verified: boolean,
): Occurrence {
  if (!verified) {
    const isPlant = isPlantTaxon(occurrence);
    return {
      ...occurrence,
      aliStatuses: undefined,
      enjeuLevel: occurrence.isInvasive
        ? "faible"
        : occurrence.frenchProtected || (!isPlant && occurrence.alertLevel === "high")
          ? "a_confirmer"
          : "faible",
      enjeuWarnings: occurrence.isInvasive
        ? undefined
        : [isPlant
          ? "Flore : statuts territoriaux ALI Species indisponibles — le statut UICN mondial n’est pas utilisé seul"
          : "Statuts territoriaux ALI Species indisponibles — enjeu local à confirmer"],
    };
  }
  const { enjeuLevel, enjeuWarnings } = computeEnjeuLevel({
    globalIucn: occurrence.iucnStatus,
    frenchProtected: occurrence.frenchProtected === true,
    isInvasive: occurrence.isInvasive === true,
    isPlant: isPlantTaxon(occurrence),
    aliStatuses,
  });
  const warnings = [
    ...enjeuWarnings,
    ...checkConsistency({
      enjeuLevel,
      globalIucn: occurrence.iucnStatus,
      aliStatuses,
      frenchProtected: occurrence.frenchProtected === true,
    }),
  ].filter(Boolean);
  return {
    ...occurrence,
    aliStatuses: aliStatuses?.length ? aliStatuses : undefined,
    enjeuLevel,
    enjeuWarnings: warnings.length ? Array.from(new Set(warnings)) : undefined,
  };
}

function enrichmentPriority(occurrence: Occurrence): number {
  if (occurrence.isInvasive) return 0;
  if (occurrence.alertLevel === "high") return 3;
  if (occurrence.frenchProtected) return 2;
  return 1;
}

export async function enrichInventoryWithAliSpeciesMcp(
  inventory: InventoryResult,
): Promise<InventoryResult> {
  if (inventory.occurrences.length === 0) {
    return {
      ...inventory,
      aliSpeciesEnrichment: {
        source: "ALI Species MCP",
        region: undefined,
        territorialScope: "unknown",
        attempted: 0,
        enriched: 0,
        failed: 0,
        skipped: 0,
        partial: false,
      },
    };
  }

  const phaseStartedAt = Date.now();
  const deadline = phaseStartedAt + PHASE_BUDGET_MS;
  const enabledCenters = inventory.circles
    .filter((circle) => circle.enabled)
    .map((circle) => circle.center);
  const uniqueCenters = Array.from(
    new Map(
      (enabledCenters.length ? enabledCenters : [inventory.center])
        .map((center) => [`${center[0].toFixed(5)}:${center[1].toFixed(5)}`, center]),
    ).values(),
  );
  const resolvedRegions: string[] = [];
  const regionAbort = new AbortController();
  const regionTimer = setTimeout(
    () => regionAbort.abort(),
    Math.min(REGION_LOOKUP_TIMEOUT_MS, Math.max(1, deadline - Date.now())),
  );
  try {
    for (const center of uniqueCenters) {
      const location = await reverseGeocode(center[0], center[1], regionAbort.signal);
      if (location.region) resolvedRegions.push(location.region);
    }
  } catch {
    // Un périmètre non résolu reste sans attribution régionale.
  } finally {
    clearTimeout(regionTimer);
  }
  const territorial = territorialScopeFromRegions(resolvedRegions, uniqueCenters.length);
  const region = territorial.region;
  const candidates = [...inventory.occurrences]
    .filter((occurrence) => Number.isInteger(occurrence.cdNom))
    .sort((a, b) => enrichmentPriority(b) - enrichmentPriority(a))
    .slice(0, MAX_ENRICHED_TAXA);
  const statusesByCdNom = new Map<number, AliStatusSummary[]>();
  let failed = 0;
  let cursor = 0;
  let client: Client | undefined;

  try {
    client = new Client({ name: "ali-inventaire-taxon-enrichment", version: "1.0.0" });
    await withTimeout(
      client.connect(new StreamableHTTPClientTransport(new URL(ALI_SPECIES_MCP_URL))),
      CONNECT_TIMEOUT_MS,
      "Connexion ALI Species MCP expirée",
    );
    const workers = Array.from({ length: Math.min(CONCURRENCY, candidates.length) }, async () => {
      while (cursor < candidates.length && Date.now() < deadline) {
        const occurrence = candidates[cursor++];
        try {
          const remainingMs = Math.max(1, deadline - Date.now());
          const result = await client!.callTool(
            {
              name: "get_statuts",
              arguments: {
                cdNom: occurrence.cdNom,
                ...(region ? { region } : {}),
              },
            },
            undefined,
            { timeout: Math.min(TOOL_TIMEOUT_MS, remainingMs) },
          );
          const payload = parseToolPayload(result, region);
          if (!payload) {
            failed++;
            continue;
          }
          statusesByCdNom.set(
            occurrence.cdNom!,
            statusesForStudyRegion(payload, region),
          );
        } catch {
          failed++;
        }
      }
    });
    await Promise.all(workers);
  } catch {
    failed = candidates.length;
  } finally {
    await client?.close().catch(() => undefined);
  }

  const occurrences = inventory.occurrences.map((occurrence) =>
    applyStatuses(
      occurrence,
      occurrence.cdNom == null ? undefined : statusesByCdNom.get(occurrence.cdNom),
      occurrence.cdNom != null && statusesByCdNom.has(occurrence.cdNom),
    ),
  );
  const skipped = inventory.occurrences.length - candidates.length;
  const enriched = statusesByCdNom.size;
  failed = Math.max(failed, candidates.length - enriched);
  return {
    ...inventory,
    occurrences,
    stats: {
      ...inventory.stats,
      sensitiveCount: occurrences.filter((occurrence) =>
        occurrence.enjeuLevel === "critique" ||
        occurrence.enjeuLevel === "fort" ||
        occurrence.enjeuLevel === "modere" ||
        occurrence.enjeuLevel === "a_confirmer"
      ).length,
    },
    aliSpeciesEnrichment: {
      source: "ALI Species MCP",
      region,
      territorialScope: territorial.scope,
      attempted: candidates.length,
      enriched,
      failed,
      skipped,
      partial: failed > 0 || skipped > 0,
    },
  };
}