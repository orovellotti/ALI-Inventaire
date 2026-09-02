import type { PotentialSpeciesResult, ProjectAreaFeatureCollection } from "@shared/types";
import { storage } from "../storage";
import { getNaturaZones, getZnieffZones } from "./geoservices";
import { computeProjectSiteMetrics, computeSiteMetrics } from "./habitatCompat";
import { getSiteHabitatInfo } from "./natura2000Habitats";
import {
  evaluatePotentialSpecies,
  normalizeSpeciesName,
  type PotentialSpeciesSiteEvidence,
} from "./potentialSpeciesScore";
import { EEA_ECOLOGICAL_REFERENCE_META } from "../data/eeaEcologicalGroups";
import {
  buildZnieffDocumentedSpecies,
  buildZnieffReference,
  canonicalTaxonName,
} from "./znieffSpecies";

const SITE_FETCH_CONCURRENCY = 4;
const REQUEST_BUDGET_MS = 15_000;
const NATURA_ZONES_BUDGET_MS = 8_000;
const ZNIEFF_ZONES_BUDGET_MS = 8_000;
const EARTH_RADIUS_M = 6_371_000;

export interface PotentialOccurrence {
  key: number;
  scientificName: string;
  decimalLatitude: number;
  decimalLongitude: number;
  source: "gbif" | "inaturalist";
}

/** Conserve le résultat des autres sources lorsqu'une source échoue. */
export function retainSourceResult<T>(
  settled: PromiseSettledResult<T | null>,
  errors: string[],
  message: string,
): T | null {
  if (settled.status === "rejected") {
    errors.push(message);
    return null;
  }
  return settled.value;
}

export function haversineM(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  const toRad = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const value =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) *
      Math.cos(toRad(bLat)) *
      Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(value)));
}

export function isOccurrenceInStudyArea(
  occurrence: PotentialOccurrence,
  lat: number,
  lng: number,
  radius: number,
): boolean {
  return (
    (occurrence.source === "gbif" || occurrence.source === "inaturalist") &&
    Number.isInteger(occurrence.key) &&
    haversineM(
      lat,
      lng,
      occurrence.decimalLatitude,
      occurrence.decimalLongitude,
    ) <= radius
  );
}

async function withDeadline<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T | null> {
  if (timeoutMs <= 0) return null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function getPotentialSpecies(
  lat: number,
  lng: number,
  radius: number,
  occurrences: PotentialOccurrence[],
  options: { includeHabitats?: boolean; projectArea?: ProjectAreaFeatureCollection } = {},
): Promise<PotentialSpeciesResult> {
  const deadline = Date.now() + REQUEST_BUDGET_MS;
  let partial = false;
  let znieffPartial = false;
  const errors: string[] = [];
  const [zonesSettled, znieffZonesSettled] = await Promise.allSettled([
    withDeadline(getNaturaZones(lat, lng, radius), NATURA_ZONES_BUDGET_MS),
    withDeadline(getZnieffZones(lat, lng, radius), ZNIEFF_ZONES_BUDGET_MS),
  ]);
  const zonesResult = retainSourceResult(zonesSettled, errors, "Natura 2000 : consultation des zones indisponible.");
  const znieffZonesResult = retainSourceResult(znieffZonesSettled, errors, "ZNIEFF : consultation des zones indisponible.");
  const zones = zonesResult ?? [];
  if (!zonesResult) partial = true;
  const znieffZones = znieffZonesResult?.zones ?? [];
  if (!znieffZonesResult || znieffZonesResult.partial) {
    znieffPartial = true;
    partial = true;
  }
  const zoneByCode = new Map(
    zones
      .filter((zone) => zone.code && /^FR\d{7,}$/i.test(zone.code))
      .map((zone) => [zone.code!.trim().toUpperCase(), zone] as const),
  );
  const codes = Array.from(zoneByCode.keys());
  const znieffZoneByCode = new Map(
    znieffZones
      .filter((zone) => zone.code?.trim())
      .map((zone) => [zone.code!.trim(), zone] as const),
  );
  const znieffCodes = Array.from(znieffZoneByCode.keys());
  const [rowsSettled, znieffRowsSettled, znieffMetaSettled] = await Promise.allSettled([
    withDeadline(
      storage.getNaturaSpeciesForSites(codes),
      deadline - Date.now(),
    ),
    withDeadline(
      storage.getZnieffSpeciesForZones(znieffCodes).catch(() => null),
      deadline - Date.now(),
    ),
    withDeadline(
      storage.getZnieffReferenceMeta().catch(() => undefined),
      deadline - Date.now(),
    ),
  ]);
  const rowsResult = retainSourceResult(rowsSettled, errors, "Natura 2000 : espèces désignatrices indisponibles.");
  const znieffRowsResult = retainSourceResult(znieffRowsSettled, errors, "ZNIEFF : espèces documentaires indisponibles.");
  const znieffMetaResult = retainSourceResult(znieffMetaSettled, errors, "ZNIEFF : métadonnées de référence indisponibles.");
  const rows = rowsResult ?? [];
  if (!rowsResult) partial = true;
  const znieffRows = znieffRowsResult ?? [];
  if (!znieffRowsResult || !znieffMetaResult) {
    znieffPartial = true;
    partial = true;
  }
  const evidenceCodes = Array.from(
    new Set(
      rows
        .map((row) => row.siteCode.trim().toUpperCase())
        .filter((code) => zoneByCode.has(code)),
    ),
  );
  const evidenceByCode = new Map<string, PotentialSpeciesSiteEvidence>();
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < evidenceCodes.length) {
      const index = nextIndex++;
      const code = evidenceCodes[index];
      const zone = zoneByCode.get(code)!;
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) {
        partial = true;
        continue;
      }
      try {
        if (options.includeHabitats === false) {
          evidenceByCode.set(code, {
            code,
            name: zone.name,
            habitats: [],
            metrics: options.projectArea ? computeProjectSiteMetrics(options.projectArea, zone.geometry ?? null) : computeSiteMetrics(lat, lng, radius, zone.geometry ?? null),
          });
          continue;
        }
        const info = await withDeadline(
          getSiteHabitatInfo(code),
          remainingMs,
        );
        if (!info) partial = true;
        const geometry = info?.geometry ?? zone.geometry ?? null;
        evidenceByCode.set(code, {
          code,
          name: zone.name,
          habitats: info?.habitats ?? [],
          metrics: options.projectArea ? computeProjectSiteMetrics(options.projectArea, geometry) : computeSiteMetrics(lat, lng, radius, geometry),
        });
      } catch {
        partial = true;
        evidenceByCode.set(code, {
          code,
          name: zone.name,
          habitats: [],
          metrics: null,
        });
      }
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(SITE_FETCH_CONCURRENCY, evidenceCodes.length) },
      () => worker(),
    ),
  );

  const observedNames = new Set(
    occurrences
      // L'entrée vient de l'inventaire interne, mais on refuse tout de même de
      // marquer « observée » une occurrence située hors de l'aire demandée.
      .filter(
        (occ) => isOccurrenceInStudyArea(occ, lat, lng, radius),
      )
      .flatMap((occ) => [
        normalizeSpeciesName(occ.scientificName),
        canonicalTaxonName(occ.scientificName),
      ]),
  );
  const znieffSpecies = buildZnieffDocumentedSpecies(
    znieffRows,
    znieffZones,
    observedNames,
  );
  const candidates = new Map<
    string,
    {
      scientificName: string;
      speciesGroup: string;
      observed: boolean;
      sites: PotentialSpeciesSiteEvidence[];
    }
  >();

  for (const row of rows) {
    const key = normalizeSpeciesName(row.scientificName);
    if (!key) continue;
    let candidate = candidates.get(key);
    if (!candidate) {
      candidate = {
        scientificName: row.scientificName,
        speciesGroup: row.speciesGroup,
        observed: observedNames.has(key),
        sites: [],
      };
      candidates.set(key, candidate);
    }
    if (!candidate.speciesGroup && row.speciesGroup) {
      candidate.speciesGroup = row.speciesGroup;
    }
    const code = row.siteCode.trim().toUpperCase();
    const zone = zoneByCode.get(code);
    const siteEvidence =
      evidenceByCode.get(code) ??
      (zone
        ? {
            code,
            name: zone.name || row.siteName,
            habitats: [],
            metrics: null,
          }
        : null);
    if (siteEvidence && !candidate.sites.some((site) => site.code === code)) {
      candidate.sites.push(siteEvidence);
    }
  }

  const species = Array.from(candidates.values()).map(evaluatePotentialSpecies);
  species.sort(
    (a, b) =>
      Number(a.observed) - Number(b.observed) ||
      (b.score ?? -1) - (a.score ?? -1) ||
      a.scientificName.localeCompare(b.scientificName, "fr"),
  );
  const habitatCodes = new Set(
    Array.from(evidenceByCode.values()).flatMap((site) =>
      site.habitats.map((habitat) => habitat.code),
    ),
  );

  return {
    species,
    observedCount: species.filter((item) => item.observed).length,
    potentialCount: species.filter((item) => !item.observed).length,
    evaluatedCount: species.filter((item) => item.score !== null).length,
    siteCount: codes.length,
    habitatCount: habitatCodes.size,
    partial,
    ...(errors.length ? { errors } : {}),
    reference: EEA_ECOLOGICAL_REFERENCE_META,
    znieff: {
      species: znieffSpecies,
      speciesCount: znieffSpecies.length,
      siteCount: znieffCodes.length,
      partial: znieffPartial,
      reference: buildZnieffReference(znieffMetaResult ?? undefined),
    },
    generatedAt: new Date().toISOString(),
  };
}