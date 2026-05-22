import type { Occurrence, ConfidenceScore, BufferCircle, InventoryResult } from "@shared/types";
import { searchINaturalist } from "./inaturalist";
import { fetchTaxRefCdNom } from "./taxref";
import { applyFrenchPriorityBoost } from "./frenchPriority";
import { calculateConfidenceScore, emptyConfidence } from "./confidence";
import { haversineDistance } from "./lib/geo";
import {
  searchOccurrences,
  fetchSpeciesMedia,
  fetchSpeciesIucnStatus,
  fetchFrenchVernacularName,
} from "./services/gbifApi";

type AlertLevel = "high" | "medium" | "low";

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
}

type InatResult = Awaited<ReturnType<typeof searchINaturalist>>;

const EMPTY_INAT: InatResult = {
  occurrences: [],
  summary: { records: 0, species: 0 },
};

function getAlertLevelFromIucn(iucnStatus: string | undefined): AlertLevel {
  return HIGH_ALERT_IUCN.has((iucnStatus ?? "").toUpperCase()) ? "high" : "low";
}

function fetchINatSafe(lat: number, lng: number, radiusMeters: number, enabled: boolean): Promise<InatResult> {
  if (!enabled) return Promise.resolve(EMPTY_INAT);
  return searchINaturalist(lat, lng, radiusMeters).catch(() => EMPTY_INAT);
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

async function enrichSpecies(record: any): Promise<Occurrence> {
  const speciesKey = record.speciesKey || record.taxonKey;

  const [imageUrl, iucnStatus, frenchName, cdNom] = speciesKey
    ? await Promise.all([
        fetchSpeciesMedia(speciesKey),
        fetchSpeciesIucnStatus(speciesKey),
        fetchFrenchVernacularName(speciesKey),
        fetchTaxRefCdNom(record.scientificName ?? ""),
      ])
    : [undefined, undefined, undefined, await fetchTaxRefCdNom(record.scientificName ?? "")];

  const baseLevel = getAlertLevelFromIucn(iucnStatus);
  const alertLevel = applyFrenchPriorityBoost(baseLevel, record.family, record.order, record.class);

  return {
    key: record.key,
    scientificName: record.scientificName || "Inconnu",
    decimalLatitude: record.decimalLatitude,
    decimalLongitude: record.decimalLongitude,
    vernacularName: frenchName || undefined,
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
    cdNom,
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

async function assignCdNomsToInat(occurrences: Occurrence[], existing: Map<string, Occurrence>): Promise<void> {
  const needing = occurrences.filter((o) => !existing.has(o.scientificName));
  const cdNoms = await Promise.all(needing.map((o) => fetchTaxRefCdNom(o.scientificName).catch(() => undefined)));
  needing.forEach((o, i) => {
    o.cdNom = cdNoms[i];
  });
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
      iucnStatus: existing.iucnStatus || iocc.iucnStatus,
      cdNom: existing.cdNom ?? iocc.cdNom,
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

function buildEmptyResult(
  inat: InatResult,
  lat: number,
  lng: number,
  radiusMeters: number,
): InventoryResult {
  const confidence = emptyConfidence();
  if (inat.occurrences.length > 0) {
    confidence.message = `Aucune donnée GBIF • iNaturalist : ${inat.occurrences.length} espèce(s)`;
  }
  return {
    occurrences: inat.occurrences,
    stats: {
      total: inat.occurrences.length,
      speciesCount: inat.occurrences.length,
      sensitiveCount: countSensitive(inat.occurrences),
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
  const includeINaturalist = options.includeINaturalist !== false;
  const inatPromise = fetchINatSafe(lat, lng, radiusMeters, includeINaturalist);

  const rawRecords = await searchOccurrences({ lat, lng, radiusMeters });

  if (rawRecords.length === 0) {
    return buildEmptyResult(await inatPromise, lat, lng, radiusMeters);
  }

  const confidence = calculateConfidenceScore(rawRecords);
  const uniqueRecords = dedupBySpecies(rawRecords);
  const enriched = await Promise.all(uniqueRecords.map(enrichSpecies));
  const gbifOccurrences = filterWithinRadius(enriched, lat, lng, radiusMeters);

  const inat = await inatPromise;
  const occurrencesMap = new Map<string, Occurrence>(gbifOccurrences.map((o) => [o.scientificName, o]));
  await assignCdNomsToInat(inat.occurrences, occurrencesMap);
  const merged = mergeInatWithGbif(gbifOccurrences, inat.occurrences);

  if (inat.summary.species > 0) {
    const inedits = inat.occurrences.filter(
      (i) => !gbifOccurrences.some((g) => g.scientificName === i.scientificName),
    ).length;
    confidence.message = `${confidence.message} • iNaturalist : +${inedits} espèce(s) inédite(s) sur ${inat.summary.species}`;
  }

  return {
    occurrences: merged,
    stats: {
      total: merged.length,
      speciesCount: new Set(merged.map((o) => o.scientificName)).size,
      sensitiveCount: countSensitive(merged),
    },
    center: [lat, lng],
    radius: radiusMeters,
    circles: [{ id: "main", center: [lat, lng], radius: radiusMeters, label: "Zone", enabled: true }],
    confidence,
  };
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
    message: `Moyenne sur ${areaCount} aires d'étude`,
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

export async function searchGBIFMultiCircle(
  circles: BufferCircle[],
  options: SearchOptions = {},
): Promise<InventoryResult> {
  const enabledCircles = circles.filter((c) => c.enabled);
  if (enabledCircles.length === 0) throw new Error("No circles enabled");

  if (enabledCircles.length === 1) {
    const c = enabledCircles[0];
    const result = await searchGBIF(c.center[0], c.center[1], c.radius, options);
    result.circles = circles;
    return result;
  }

  const results = await Promise.all(
    enabledCircles.map((c) => searchGBIF(c.center[0], c.center[1], c.radius, options)),
  );

  const occurrences = mergeMultiCircleOccurrences(results);
  const referenceCircle = enabledCircles.find((c) => c.id === "immediate") ?? enabledCircles[0];

  return {
    occurrences,
    stats: {
      total: occurrences.length,
      speciesCount: new Set(occurrences.map((o) => o.scientificName)).size,
      sensitiveCount: countSensitive(occurrences),
    },
    center: referenceCircle.center,
    radius: referenceCircle.radius,
    circles,
    confidence: averageConfidences(results.map((r) => r.confidence), enabledCircles.length),
  };
}

export async function fetchSpeciesDetails(taxonKey: number) {
  const [imageUrl, iucnStatus, vernacularName] = await Promise.all([
    fetchSpeciesMedia(taxonKey),
    fetchSpeciesIucnStatus(taxonKey),
    fetchFrenchVernacularName(taxonKey),
  ]);
  return { taxonKey, imageUrl, iucnStatus, vernacularName };
}
