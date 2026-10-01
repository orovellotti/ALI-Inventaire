import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

import type { AliStatusSummary, InventoryResult, Occurrence } from "@shared/types";
import { isPlantTaxon } from "@shared/iucn";
import { computePatrimonialite, normalizeStatuses, type Patrimonialite, type SpeciesStatus } from "../ali";
import { mapWithDeadline } from "../lib/concurrency";
import { checkConsistency, computeEnjeuLevel } from "../scoring";
import { reverseGeocode } from "./nominatim";
import type { RawAliStatus } from "./aliApi";

const ALI_SPECIES_MCP_URL = "https://taxref-explorer.replit.app/api/mcp";
const MAX_ENRICHED_TAXA = 80;
const CONCURRENCY = 4;
const CONNECT_TIMEOUT_MS = 5_000;
const TOOL_TIMEOUT_MS = 12_000;
const REGION_LOOKUP_TIMEOUT_MS = 3_000;
const PHASE_BUDGET_MS = 40_000;

interface McpDriver {
  label?: string;
  code?: string;
  title?: string;
  kind?: string;
}

interface McpStatusPayload {
  resolvedTaxon?: {
    cdNom?: number;
    cdRef?: number;
    scientificName?: string;
    matchedName?: string;
    rank?: string;
  };
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
export function rawStatusesForStudyRegion(
  payload: McpStatusPayload,
  requestedRegion?: string,
): RawAliStatus[] {
  const raws = (payload.statuts ?? []).filter(
    (status) => status.cdTypeStatut !== "LRR",
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
    raws.push({
      cdTypeStatut: "LRR",
      regroupementType: "Liste rouge",
      codeStatut: regionalDriver.code,
      labelStatut: regionalDriver.title ?? regionalDriver.label ?? regionalDriver.code,
      lbAdmTr: payload.territoire || requestedRegion,
    });
  }

  return raws;
}

export function statusesForStudyRegion(
  payload: McpStatusPayload,
  requestedRegion?: string,
): AliStatusSummary[] {
  return normalizeStatuses(rawStatusesForStudyRegion(payload, requestedRegion)).map(
    ({ category, value, label, tone, scope }) => ({ category, value, label, tone, scope }),
  );
}

interface AliStudyTaxon {
  scientificName: string;
  cdNom?: number;
}

interface AliStudyEnrichment {
  statuses: SpeciesStatus[];
  patrimonialite: Patrimonialite;
  cdNom?: number;
}

/** Shared inventory/priority lookup: identical territorial rules and deadlines. */
export async function lookupAliSpeciesForStudy<T extends AliStudyTaxon>(
  taxa: readonly T[],
  centers: readonly [number, number][],
  options: { concurrency?: number; budgetMs?: number } = {},
): Promise<{
  results: Map<T, AliStudyEnrichment>;
  trace: NonNullable<InventoryResult["aliSpeciesEnrichment"]>;
}> {
  const deadline = Date.now() + (options.budgetMs ?? PHASE_BUDGET_MS);
  const uniqueCenters = Array.from(new Map(centers.map(
    (center) => [`${center[0].toFixed(5)}:${center[1].toFixed(5)}`, center],
  )).values());
  const resolvedRegions: string[] = [];
  const regionDeadline = Math.min(deadline, Date.now() + REGION_LOOKUP_TIMEOUT_MS);
  const regionAbort = new AbortController();
  const regionTimer = setTimeout(
    () => regionAbort.abort(),
    Math.max(1, regionDeadline - Date.now()),
  );
  try {
    for (const [lat, lng] of uniqueCenters) {
      if (regionAbort.signal.aborted || Date.now() >= deadline) break;
      const location = await withTimeout(
        reverseGeocode(lat, lng, regionAbort.signal),
        Math.max(1, regionDeadline - Date.now()),
        "ALI study-region lookup timed out",
      );
      if (location.region) resolvedRegions.push(location.region);
    }
  } catch {
    // Unresolved locations must never select another region's red list.
  } finally {
    clearTimeout(regionTimer);
    regionAbort.abort();
  }
  const territorial = territorialScopeFromRegions(resolvedRegions, uniqueCenters.length);
  const results = new Map<T, AliStudyEnrichment>();
  let attempted = 0;
  let nameResolutionAttempted = 0;
  let nameResolved = 0;
  let client: Client | undefined;
  const phaseAbort = new AbortController();
  const phaseTimer = setTimeout(() => phaseAbort.abort(), Math.max(0, deadline - Date.now()));
  try {
    if (taxa.length && Date.now() < deadline) {
      client = new Client({ name: "ali-study-taxon-enrichment", version: "1.0.0" });
      await withTimeout(
        client.connect(new StreamableHTTPClientTransport(new URL(ALI_SPECIES_MCP_URL), {
          requestInit: { signal: phaseAbort.signal },
        })),
        Math.min(CONNECT_TIMEOUT_MS, Math.max(1, deadline - Date.now())),
        "ALI Species MCP connection timed out",
      );
      const work = await mapWithDeadline(taxa, options.concurrency ?? CONCURRENCY, deadline, async (taxon, _, signal) => {
        const resolveByName = !Number.isInteger(taxon.cdNom);
        if (resolveByName) nameResolutionAttempted++;
        const result = await client!.callTool(
          {
            name: "get_statuts",
            arguments: {
              ...(resolveByName ? { scientificName: taxon.scientificName } : { cdNom: taxon.cdNom }),
              ...(territorial.region ? { region: territorial.region } : {}),
            },
          },
          undefined,
          { timeout: Math.min(TOOL_TIMEOUT_MS, Math.max(1, deadline - Date.now())), signal },
        );
        const payload = parseToolPayload(result, territorial.region);
        if (!payload) throw new Error("Invalid ALI Species territorial response");
        const cdNom = payload.resolvedTaxon?.cdRef ?? payload.resolvedTaxon?.cdNom ?? taxon.cdNom;
        const raws = rawStatusesForStudyRegion(payload, territorial.region);
        return {
          statuses: normalizeStatuses(raws),
          patrimonialite: computePatrimonialite(raws),
          cdNom: Number.isInteger(cdNom) ? cdNom : undefined,
        };
      });
      attempted = work.attempted;
      for (const [index, enrichment] of Array.from(work.results)) {
        const taxon = taxa[index];
        results.set(taxon, enrichment);
        if (!Number.isInteger(taxon.cdNom) && enrichment.cdNom) nameResolved++;
      }
    }
  } catch {
    // Connection/source failure is partial, not a successful empty assessment.
  } finally {
    clearTimeout(phaseTimer);
    phaseAbort.abort();
    if (client) {
      await withTimeout(client.close(), 500, "ALI Species MCP close timed out").catch(() => undefined);
    }
  }
  return {
    results,
    trace: {
      source: "ALI Species MCP",
      region: territorial.region,
      territorialScope: territorial.scope,
      attempted,
      enriched: results.size,
      failed: attempted - results.size,
      skipped: taxa.length - attempted,
      partial: results.size < taxa.length,
      ...(results.size < taxa.length ? {
        error: "ALI Species status lookup incomplete or unavailable; missing statuses do not indicate absence of local concern.",
      } : {}),
      nameResolutionAttempted,
      nameResolved,
    },
  };
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
          ? "Plants: ALI Species territorial statuses unavailable; global IUCN alone is insufficient"
          : "ALI Species territorial statuses unavailable; local concern requires confirmation"],
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
  if (inventory.coverage && !inventory.coverage.frenchSources) return inventory;
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
        nameResolutionAttempted: 0,
        nameResolved: 0,
      },
    };
  }

  const enabledCenters = inventory.circles
    .filter((circle) => circle.enabled)
    .map((circle) => circle.center);
  const prioritized = [...inventory.occurrences]
    .sort((a, b) => enrichmentPriority(b) - enrichmentPriority(a))
    .slice(0, MAX_ENRICHED_TAXA);
  const { results, trace } = await lookupAliSpeciesForStudy(
    prioritized, enabledCenters.length ? enabledCenters : [inventory.center],
  );

  const occurrences = inventory.occurrences.map((occurrence) =>
    applyStatuses(
      { ...occurrence, cdNom: results.get(occurrence)?.cdNom ?? occurrence.cdNom },
      results.get(occurrence)?.statuses,
      results.has(occurrence),
    ),
  );
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
      ...trace,
      skipped: inventory.occurrences.length - trace.attempted,
      partial: trace.partial || inventory.occurrences.length > prioritized.length,
    },
  };
}