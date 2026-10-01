import type { Occurrence, ConfidenceScore, BufferCircle, InventoryResult } from "@shared/types";
import { searchINaturalist } from "./inaturalist";
import { applyFrenchPriorityBoost, isFrenchPriority } from "./frenchPriority";
import { isInvasiveExotic } from "./invasive";
import { calculateConfidenceScore, emptyConfidence } from "./confidence";
import { haversineDistance } from "./lib/geo";
import { mapWithConcurrency } from "./lib/concurrency";
import { enrichInventoryWithAliSpeciesMcp } from "./services/aliSpeciesMcp";
import { getStudyCoverage } from "./services/coverage";
import { reduceStudyCoverage } from "@shared/coverage";
import { normalizeTaxonIdentity as normalizeName } from "@shared/taxonomy";
import type { InventorySourceStatus, StudyCoverage } from "@shared/types";
import {
  searchOccurrences,
  fetchSpeciesMedia,
  fetchSpeciesIucnStatus,
  fetchVernacularNames,
} from "./services/gbifApi";

type AlertLevel = "high" | "medium" | "low";

const SPECIES_ENRICHMENT_CONCURRENCY = 8;
const MULTI_CIRCLE_SEARCH_CONCURRENCY = 3;

const HIGH_ALERT_IUCN = new Set([
  "EX", "EXTINCT",
  "EW", "EXTINCT_IN_THE_WILD",
  "RE", "REGIONALLY_EXTINCT",
  "CR", "CRITICALLY_ENDANGERED",
  "EN", "ENDANGERED",
  "VU", "VULNERABLE",
  "NT", "NEAR_THREATENED",
]);

const ALERT_PRIORITY: Record<AlertLevel, number> = { high: 3, medium: 2, low: 1 };

interface SearchOptions {
  includeINaturalist?: boolean;
  skipAliSpeciesMcp?: boolean;
  /** Internally verified aggregate coverage, resolved before classification. */
  coverage?: StudyCoverage;
}

type InatResult = Awaited<ReturnType<typeof searchINaturalist>>;

const EMPTY_INAT: InatResult = {
  occurrences: [],
  summary: { records: 0, species: 0 },
  status: { state: "skipped" },
};

function getAlertLevelFromIucn(iucnStatus: string | undefined): AlertLevel {
  return HIGH_ALERT_IUCN.has((iucnStatus ?? "").toUpperCase()) ? "high" : "low";
}

function fetchINatSafe(lat: number, lng: number, radiusMeters: number, enabled: boolean, french: boolean): Promise<InatResult> {
  if (!enabled) return Promise.resolve(EMPTY_INAT);
  return searchINaturalist(lat, lng, radiusMeters, french).catch((error) => ({
    ...EMPTY_INAT,
    status: { state: "unavailable", error: error instanceof Error ? error.message : "iNaturalist collection failed" },
  }));
}

interface SpeciesObsStats {
  count: number;
  lastYear?: number;
}

// Agrège, avant dédoublonnage, le nombre d'observations et l'année la plus
// récente par nom scientifique, pour alimenter la composante « qualité » du score.
function computeSpeciesObsStats(rawRecords: any[]): Map<string, SpeciesObsStats> {
  const stats = new Map<string, SpeciesObsStats>();
  for (const r of rawRecords) {
    const name: string | undefined = r.scientificName;
    if (!name) continue;
    const year: number | undefined =
      typeof r.year === "number"
        ? r.year
        : r.eventDate
          ? new Date(r.eventDate).getFullYear() || undefined
          : undefined;
    const existing = stats.get(name);
    if (!existing) {
      stats.set(name, { count: 1, lastYear: year });
    } else {
      existing.count++;
      if (year && (!existing.lastYear || year > existing.lastYear)) existing.lastYear = year;
    }
  }
  return stats;
}

function dedupBySpecies<T extends { scientificName?: string; decimalLatitude?: number; decimalLongitude?: number }>(
  records: T[],
): T[] {
  const map = new Map<string, T>();
  for (const r of records) {
    if (r.scientificName && r.decimalLatitude != null && r.decimalLongitude != null) {
      if (!map.has(r.scientificName)) map.set(r.scientificName, r);
    }
  }
  return Array.from(map.values());
}

// Rangs taxonomiques acceptés comme "espèce" (GBIF nomenclature).
const SPECIES_RANKS = new Set([
  "SPECIES", "SUBSPECIES", "VARIETY", "FORM", "SUBVARIETY", "RACE",
]);

/** Renvoie true si le rang est au niveau espèce ou infra-espèce. */
function isSpeciesLevel(rank: string | undefined): boolean {
  if (!rank) return true; // rang absent → on l'inclut par défaut
  return SPECIES_RANKS.has(rank.toUpperCase());
}

/** Déduit l'habitat principal à partir de la taxonomie (heuristique). */
function deriveHabitatType(
  phylum: string | undefined,
  klass: string | undefined,
): "terrestrial" | "marine" {
  const MARINE_PHYLA = new Set([
    "Cnidaria", "Echinodermata", "Porifera", "Ctenophora", "Brachiopoda",
    "Chaetognatha", "Bryozoa", "Hemichordata", "Phoronida", "Xenacoelomorpha", "Placozoa",
  ]);
  const MARINE_CLASSES = new Set([
    "Chondrichthyes", "Cephalopoda", "Polyplacophora", "Scaphopoda",
    "Ascidiacea", "Thaliacea", "Appendicularia",
    "Anthozoa", "Hydrozoa", "Scyphozoa", "Cubozoa",
    "Asteroidea", "Echinoidea", "Holothuroidea", "Crinoidea", "Ophiuroidea",
  ]);
  if (phylum && MARINE_PHYLA.has(phylum)) return "marine";
  if (klass && MARINE_CLASSES.has(klass)) return "marine";
  return "terrestrial";
}

async function enrichSpecies(record: any, french: boolean): Promise<Occurrence> {
  const speciesKey = record.speciesKey || record.taxonKey;

  const [mediaResult, iucnResult, namesResult] = speciesKey
    ? await Promise.allSettled([
        fetchSpeciesMedia(speciesKey),
        fetchSpeciesIucnStatus(speciesKey),
        fetchVernacularNames(speciesKey),
      ])
    : [];
  const imageUrl = mediaResult?.status === "fulfilled" ? mediaResult.value : undefined;
  const iucnStatus = iucnResult?.status === "fulfilled" ? iucnResult.value : undefined;
  const vernacularNames =
    namesResult?.status === "fulfilled" ? namesResult.value : {};

  const baseLevel = getAlertLevelFromIucn(iucnStatus);
  const alertLevel = french ? applyFrenchPriorityBoost(baseLevel, record.family, record.order, record.class) : baseLevel;
  const frenchProtected = french ? isFrenchPriority(record.family, record.order, record.class) : undefined;
  const isInvasive = french ? isInvasiveExotic(record.scientificName) : undefined;
  const taxonRank: string | undefined = record.taxonRank;
  const habitatType = deriveHabitatType(record.phylum, record.class);

  return {
    key: record.key,
    scientificName: record.scientificName || "Inconnu",
    decimalLatitude: record.decimalLatitude,
    decimalLongitude: record.decimalLongitude,
    vernacularName: vernacularNames.french,
    englishName: vernacularNames.english,
    kingdom: record.kingdom,
    phylum: record.phylum,
    class: record.class,
    order: record.order,
    family: record.family,
    alertLevel,
    imageUrl,
    iucnStatus,
    taxonKey: speciesKey,
    source: "gbif",
    sourceUrl: speciesKey ? `https://www.gbif.org/species/${speciesKey}` : undefined,
    frenchProtected,
    isInvasive,
    taxonRank,
    habitatType,
  };
}

function filterWithinRadius<T extends { decimalLatitude: number; decimalLongitude: number }>(
  records: T[],
  lat: number,
  lng: number,
  radiusMeters: number,
): T[] {
  return records.filter((occ) =>
    haversineDistance(lat, lng, occ.decimalLatitude, occ.decimalLongitude) <= radiusMeters,
  );
}

function mergeInatWithGbif(gbifOccurrences: Occurrence[], inatOccurrences: Occurrence[]): Occurrence[] {
  const merged = new Map<string, Occurrence>();
  for (const occ of gbifOccurrences) merged.set(occ.scientificName, occ);

  for (const iocc of inatOccurrences) {
    const existing = merged.get(iocc.scientificName);
    if (!existing) {
      merged.set(iocc.scientificName, iocc);
      continue;
    }
    const enriched: Occurrence = {
      ...existing,
      imageUrl: existing.imageUrl || iocc.imageUrl,
      vernacularName: existing.vernacularName || iocc.vernacularName,
      englishName: existing.englishName || iocc.englishName,
      iucnStatus: existing.iucnStatus || iocc.iucnStatus,
      cdNom: existing.cdNom ?? iocc.cdNom,
      frenchProtected: existing.frenchProtected || iocc.frenchProtected,
    };
    if (!existing.iucnStatus && iocc.iucnStatus) {
      enriched.alertLevel = iocc.alertLevel;
    }
    merged.set(iocc.scientificName, enriched);
  }

  return Array.from(merged.values());
}

function countSensitive(occurrences: Occurrence[]): number {
  return occurrences.filter((o) => o.alertLevel === "high" || o.alertLevel === "medium").length;
}

interface ConsolidationResult {
  consolidated: Occurrence[];
  rawNameCount: number;
  duplicatesRemoved: number;
}

// Consolide les occurrences par taxon accepté (cdRef TAXREF), avec repli sur le
// nom normalisé. Fusionne les doublons « avec / sans auteur » et agrège les noms
// sources dans sourceNames[].
export function consolidateByCdRef(occurrences: Occurrence[]): ConsolidationResult {
  const rawNameCount = new Set(occurrences.map((o) => o.scientificName)).size;
  const byKey = new Map<string, Occurrence>();
  // Rapproche les variantes d'un même taxon même quand l'une porte un cdRef et
  // l'autre non (échec/timeout TAXREF sur une source) : le nom normalisé fait le
  // pont entre la clé « cd: » et la clé « nm: ».
  const nameToKey = new Map<string, string>();

  for (const occ of occurrences) {
    const normName = normalizeName(occ.scientificName);
    const cdKey = occ.cdNom != null ? `cd:${occ.cdNom}` : undefined;
    const key = byKey.has(cdKey ?? "")
      ? (cdKey as string)
      : nameToKey.get(normName) ?? cdKey ?? `nm:${normName}`;

    const existing = byKey.get(key);
    if (!existing) {
      const seed: Occurrence = {
        ...occ,
        sourceNames: occ.sourceNames ? [...occ.sourceNames] : [occ.scientificName],
      };
      byKey.set(key, seed);
      nameToKey.set(normName, key);
      continue;
    }
    nameToKey.set(normName, key);
    existing.sourceNames = Array.from(
      new Set([...(existing.sourceNames ?? []), ...(occ.sourceNames ?? [occ.scientificName])]),
    );
    existing.imageUrl = existing.imageUrl || occ.imageUrl;
    existing.vernacularName = existing.vernacularName || occ.vernacularName;
    existing.englishName = existing.englishName || occ.englishName;
    existing.iucnStatus = existing.iucnStatus || occ.iucnStatus;
    existing.cdNom = existing.cdNom ?? occ.cdNom;
    existing.frenchProtected = existing.frenchProtected || occ.frenchProtected;
    existing.isInvasive = existing.isInvasive || occ.isInvasive;
    // Conserver l'aliStatuses/enjeuLevel de l'occurrence la plus informée
    if (!existing.aliStatuses && occ.aliStatuses) {
      existing.aliStatuses = occ.aliStatuses;
      existing.enjeuLevel = occ.enjeuLevel;
      existing.enjeuWarnings = occ.enjeuWarnings;
    }
    if (ALERT_PRIORITY[occ.alertLevel] > ALERT_PRIORITY[existing.alertLevel]) {
      existing.alertLevel = occ.alertLevel;
    }
    if (occ.observationCount) {
      existing.observationCount = (existing.observationCount ?? 0) + occ.observationCount;
    }
    if (
      occ.lastObservationYear &&
      (!existing.lastObservationYear || occ.lastObservationYear > existing.lastObservationYear)
    ) {
      existing.lastObservationYear = occ.lastObservationYear;
    }
  }

  const consolidated = Array.from(byKey.values());
  return { consolidated, rawNameCount, duplicatesRemoved: rawNameCount - consolidated.length };
}

function buildEmptyResult(
  inat: InatResult,
  lat: number,
  lng: number,
  radiusMeters: number,
): InventoryResult {
  const confidence = emptyConfidence();
  if (inat.occurrences.length > 0) {
    confidence.message = `No GBIF records • iNaturalist: ${inat.occurrences.length} species`;
  }
  const { consolidated, rawNameCount, duplicatesRemoved } = consolidateByCdRef(inat.occurrences);
  return {
    occurrences: consolidated,
    sourceStatus: { gbif: { state: "complete" }, inaturalist: inat.status },
    stats: {
      total: consolidated.length,
      speciesCount: consolidated.length,
      sensitiveCount: countSensitive(consolidated),
      rawNameCount,
      duplicatesRemoved,
    },
    center: [lat, lng],
    radius: radiusMeters,
    circles: [{ id: "main", center: [lat, lng], radius: radiusMeters, label: "Zone", enabled: true }],
    confidence,
  };
}

export async function searchGBIF(
  lat: number,
  lng: number,
  radiusMeters: number,
  options: SearchOptions = {},
): Promise<InventoryResult> {
  const coverage = options.coverage ?? await getStudyCoverage(lat, lng);
  const includeINaturalist = options.includeINaturalist !== false;
  const inatPromise = fetchINatSafe(lat, lng, radiusMeters, includeINaturalist, coverage.frenchSources);

  const rawRecords = await searchOccurrences({ lat, lng, radiusMeters });

  if (rawRecords.length === 0) {
    const empty = buildEmptyResult(await inatPromise, lat, lng, radiusMeters);
    empty.coverage = coverage;
    return options.skipAliSpeciesMcp || !coverage.frenchSources ? empty : enrichInventoryWithAliSpeciesMcp(empty);
  }

  const confidence = calculateConfidenceScore(rawRecords);
  const obsStats = computeSpeciesObsStats(rawRecords);
  // Filtre les rangs supra-spécifiques (genres, familles…) : on ne veut pas
  // les taxons non identifiés à l'espèce dans la liste d'inventaire.
  const speciesLevelRecords = rawRecords.filter((r) => isSpeciesLevel(r.taxonRank));
  const uniqueRecords = dedupBySpecies(speciesLevelRecords);
  const enriched = await mapWithConcurrency(
    uniqueRecords,
    SPECIES_ENRICHMENT_CONCURRENCY,
    (record) => enrichSpecies(record, coverage.frenchSources),
  );
  for (const o of enriched) {
    const st = obsStats.get(o.scientificName);
    if (st) {
      o.observationCount = st.count;
      o.lastObservationYear = st.lastYear;
    }
  }
  const gbifOccurrences = filterWithinRadius(enriched, lat, lng, radiusMeters);

  const inat = await inatPromise;
  const merged = mergeInatWithGbif(gbifOccurrences, inat.occurrences);

  if (inat.summary.species > 0) {
    const inedits = inat.occurrences.filter(
      (i) => !gbifOccurrences.some((g) => g.scientificName === i.scientificName),
    ).length;
    confidence.message = `${confidence.message} • iNaturalist: +${inedits} additional species out of ${inat.summary.species}`;
  }

  const { consolidated, rawNameCount, duplicatesRemoved } = consolidateByCdRef(merged);

  const result: InventoryResult = {
    coverage,
    sourceStatus: {
      gbif: { state: rawRecords.length >= 1000 ? "partial" : "complete" },
      inaturalist: inat.status,
    },
    occurrences: consolidated,
    stats: {
      total: consolidated.length,
      speciesCount: consolidated.length,
      sensitiveCount: countSensitive(consolidated),
      rawNameCount,
      duplicatesRemoved,
    },
    center: [lat, lng],
    radius: radiusMeters,
    circles: [{ id: "main", center: [lat, lng], radius: radiusMeters, label: "Zone", enabled: true }],
    confidence,
  };
  return options.skipAliSpeciesMcp || !coverage.frenchSources ? result : enrichInventoryWithAliSpeciesMcp(result);
}

function averageConfidences(scores: ConfidenceScore[], areaCount: number): ConfidenceScore {
  const sum = (k: keyof ConfidenceScore) => scores.reduce((s, c) => s + (c[k] as number), 0);
  const avg = (k: keyof ConfidenceScore) => Math.round(sum(k) / scores.length);
  const total = avg("total");
  return {
    total,
    geo: avg("geo"),
    tax: avg("tax"),
    time: avg("time"),
    trace: avg("trace"),
    issues: avg("issues"),
    dup: avg("dup"),
    interpretation:
      total >= 80 ? "excellent" : total >= 60 ? "good" : total >= 40 ? "moderate" : "low",
    message: `Average across ${areaCount} study areas`,
    rawCount: sum("rawCount"),
    filteredCount: sum("filteredCount"),
    dedupCount: sum("dedupCount"),
  };
}

function mergeMultiCircleOccurrences(results: InventoryResult[]): Occurrence[] {
  const merged = new Map<string, Occurrence>();
  for (const result of results) {
    for (const occ of result.occurrences) {
      const existing = merged.get(occ.scientificName);
      if (!existing || ALERT_PRIORITY[occ.alertLevel] > ALERT_PRIORITY[existing.alertLevel]) {
        merged.set(occ.scientificName, occ);
      }
    }
  }
  return Array.from(merged.values());
}

function mergeSourceStatus(results: InventoryResult[], source: "gbif" | "inaturalist"): InventorySourceStatus {
  const statuses = results.map((result) => result.sourceStatus?.[source]);
  const state = statuses.every((status) => status?.state === "complete") ? "complete"
    : statuses.every((status) => status?.state === "skipped") ? "skipped"
      : statuses.every((status) => status?.state === "unavailable") ? "unavailable" : "partial";
  const errors = Array.from(new Set(statuses.flatMap((status) => status?.error ? [status.error] : [])));
  return { state, ...(errors.length ? { error: errors.join(" • ") } : {}) };
}

export async function searchGBIFMultiCircle(
  circles: BufferCircle[],
  options: SearchOptions = {},
): Promise<InventoryResult> {
  const enabledCircles = circles.filter((c) => c.enabled);
  if (enabledCircles.length === 0) throw new Error("No circles enabled");
  // Resolve the entire study before any per-circle French classification.
  const coverage = reduceStudyCoverage(await Promise.all(enabledCircles.map(
    (circle) => getStudyCoverage(circle.center[0], circle.center[1]),
  )));

  if (enabledCircles.length === 1) {
    const c = enabledCircles[0];
    const result = await searchGBIF(c.center[0], c.center[1], c.radius, {
      ...options,
      skipAliSpeciesMcp: true,
      coverage,
    });
    result.circles = circles;
    return options.skipAliSpeciesMcp || !coverage.frenchSources
      ? result : enrichInventoryWithAliSpeciesMcp(result);
  }

  const results = await mapWithConcurrency(
    enabledCircles,
    MULTI_CIRCLE_SEARCH_CONCURRENCY,
    (c) => searchGBIF(c.center[0], c.center[1], c.radius, {
      ...options,
      skipAliSpeciesMcp: true,
      coverage,
    }),
  );

  const merged = mergeMultiCircleOccurrences(results);
  const referenceCircle = enabledCircles.find((c) => c.id === "immediate") ?? enabledCircles[0];
  const { consolidated, rawNameCount, duplicatesRemoved } = consolidateByCdRef(merged);

  const result: InventoryResult = {
    coverage,
    sourceStatus: {
      gbif: mergeSourceStatus(results, "gbif"),
      inaturalist: mergeSourceStatus(results, "inaturalist"),
    },
    occurrences: consolidated,
    stats: {
      total: consolidated.length,
      speciesCount: consolidated.length,
      sensitiveCount: countSensitive(consolidated),
      rawNameCount,
      duplicatesRemoved,
    },
    center: referenceCircle.center,
    radius: referenceCircle.radius,
    circles,
    confidence: averageConfidences(results.map((r) => r.confidence), enabledCircles.length),
  };
  // Never apply French statuses to a mixed-country study.
  return options.skipAliSpeciesMcp || !result.coverage?.frenchSources
    ? result : enrichInventoryWithAliSpeciesMcp(result);
}

export async function fetchSpeciesDetails(taxonKey: number) {
  const [mediaResult, iucnResult, namesResult] = await Promise.allSettled([
    fetchSpeciesMedia(taxonKey),
    fetchSpeciesIucnStatus(taxonKey),
    fetchVernacularNames(taxonKey),
  ]);
  const imageUrl = mediaResult.status === "fulfilled" ? mediaResult.value : undefined;
  const iucnStatus = iucnResult.status === "fulfilled" ? iucnResult.value : undefined;
  const vernacularNames = namesResult.status === "fulfilled" ? namesResult.value : {};
  return { taxonKey, imageUrl, iucnStatus, vernacularName: vernacularNames.french, englishName: vernacularNames.english };
}
