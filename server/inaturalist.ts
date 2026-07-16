import type { Occurrence } from "@shared/types";
import { applyFrenchPriorityBoost, isFrenchPriority } from "./frenchPriority";

const INAT_SPECIES_COUNTS = "https://api.inaturalist.org/v1/observations/species_counts";
const INAT_OBSERVATIONS = "https://api.inaturalist.org/v1/observations";

const ICONIC_MAP: Record<string, { kingdom: string; phylum?: string; class?: string }> = {
  Aves: { kingdom: "Animalia", phylum: "Chordata", class: "Aves" },
  Mammalia: { kingdom: "Animalia", phylum: "Chordata", class: "Mammalia" },
  Reptilia: { kingdom: "Animalia", phylum: "Chordata", class: "Reptilia" },
  Amphibia: { kingdom: "Animalia", phylum: "Chordata", class: "Amphibia" },
  Actinopterygii: { kingdom: "Animalia", phylum: "Chordata", class: "Actinopterygii" },
  Insecta: { kingdom: "Animalia", phylum: "Arthropoda", class: "Insecta" },
  Arachnida: { kingdom: "Animalia", phylum: "Arthropoda", class: "Arachnida" },
  Mollusca: { kingdom: "Animalia", phylum: "Mollusca" },
  Animalia: { kingdom: "Animalia" },
  Plantae: { kingdom: "Plantae" },
  Fungi: { kingdom: "Fungi" },
  Protozoa: { kingdom: "Protozoa" },
  Chromista: { kingdom: "Chromista" },
};

function getAlertLevelFromStatus(code: string | undefined): "high" | "medium" | "low" {
  const s = code?.toUpperCase();
  switch (s) {
    case "EX":
    case "EW":
    case "RE":
    case "CR":
    case "EN":
    case "VU":
    case "NT":
      return "high";
    default:
      return "low";
  }
}

export interface INatRawSummary {
  records: number;
  species: number;
}

const PER_PAGE = 200;
const MAX_PAGES = 5;

export async function searchINaturalist(
  lat: number,
  lng: number,
  radiusMeters: number
): Promise<{ occurrences: Occurrence[]; summary: INatRawSummary }> {
  const radiusKm = Math.max(0.1, Math.min(radiusMeters / 1000, 100));
  const speciesMap = new Map<string, Occurrence>();
  let totalRecords = 0;

  for (let page = 1; page <= MAX_PAGES; page++) {
    const params = new URLSearchParams({
      lat: lat.toFixed(6),
      lng: lng.toFixed(6),
      radius: radiusKm.toFixed(3),
      per_page: String(PER_PAGE),
      page: String(page),
      quality_grade: "research,needs_id",
      geoprivacy: "open",
      hrank: "species",
      locale: "fr",
      preferred_place_id: "6753",
    });

    let results: any[] = [];
    let total = 0;
    try {
      const response = await fetch(`${INAT_SPECIES_COUNTS}?${params.toString()}`, {
        headers: { "User-Agent": "InventaireFlash/1.0 (https://github.com/natural-solutions/inventaire-flash)" },
      });
      if (!response.ok) break;
      const data = await response.json();
      results = Array.isArray(data?.results) ? data.results : [];
      total = Number(data?.total_results) || 0;
    } catch {
      break;
    }

    if (results.length === 0) break;
    totalRecords = total;

    for (const r of results) {
      const taxon = r?.taxon;
      if (!taxon) continue;
      const scientificName: string | undefined = taxon.name;
      if (!scientificName) continue;
      if (taxon.rank && !["species", "subspecies", "variety", "form"].includes(taxon.rank)) continue;
      if (speciesMap.has(scientificName)) continue;

      const iconic = taxon.iconic_taxon_name as string | undefined;
      const mapping = (iconic && ICONIC_MAP[iconic]) || {};

      const consStatus =
        taxon?.conservation_status?.iucn_status_code ||
        taxon?.conservation_status?.status ||
        undefined;

      const occ: Occurrence = {
        key: Number(taxon.id) || Date.now() + Math.random(),
        scientificName,
        decimalLatitude: lat,
        decimalLongitude: lng,
        vernacularName: taxon.preferred_common_name || undefined,
        kingdom: mapping.kingdom,
        phylum: mapping.phylum,
        class: mapping.class,
        order: undefined,
        family: undefined,
        alertLevel: applyFrenchPriorityBoost(
          getAlertLevelFromStatus(consStatus),
          undefined,
          undefined,
          mapping.class,
        ),
        frenchProtected: isFrenchPriority(undefined, undefined, mapping.class),
        imageUrl: taxon.default_photo?.medium_url || taxon.default_photo?.square_url || undefined,
        iucnStatus: consStatus,
        taxonKey: undefined,
        source: "inaturalist",
        sourceUrl: `https://www.inaturalist.org/taxa/${taxon.id}`,
        observationCount: Number(r.count) || undefined,
      };

      speciesMap.set(scientificName, occ);
    }

    if (results.length < PER_PAGE) break;
    if (page * PER_PAGE >= totalRecords) break;
  }

  const occurrences = Array.from(speciesMap.values());

  await enrichLastObservationYears(occurrences, lat, lng, radiusKm);

  return {
    occurrences,
    summary: { records: totalRecords, species: occurrences.length },
  };
}

// Cache de courte durée des années de dernière observation par zone. Comme les
// dates par taxon évoluent lentement, on évite de réinterroger le endpoint
// observations lorsqu'un même secteur est ré-inventorié. La clé arrondit
// lat/lng/rayon pour regrouper les requêtes proches.
const OBS_YEAR_CACHE_TTL_MS = 10 * 60 * 1000;
const OBS_YEAR_CACHE_MAX_ENTRIES = 200;
const obsYearCache = new Map<string, { years: Map<number, number>; expires: number }>();

function obsYearCacheKey(lat: number, lng: number, radiusKm: number): string {
  return `${lat.toFixed(2)}:${lng.toFixed(2)}:${radiusKm.toFixed(1)}`;
}

function getCachedObsYears(key: string): Map<number, number> | undefined {
  const entry = obsYearCache.get(key);
  if (!entry) return undefined;
  if (entry.expires < Date.now()) {
    obsYearCache.delete(key);
    return undefined;
  }
  // On rafraîchit la position LRU en réinsérant l'entrée.
  obsYearCache.delete(key);
  obsYearCache.set(key, entry);
  return entry.years;
}

function setCachedObsYears(key: string, years: Map<number, number>): void {
  obsYearCache.set(key, { years, expires: Date.now() + OBS_YEAR_CACHE_TTL_MS });
  while (obsYearCache.size > OBS_YEAR_CACHE_MAX_ENTRIES) {
    const oldest = obsYearCache.keys().next().value;
    if (oldest === undefined) break;
    obsYearCache.delete(oldest);
  }
}

// Le endpoint species_counts ne renvoie pas de date par espèce. On interroge donc
// le endpoint observations trié par date décroissante pour attribuer à chaque
// taxon l'année de son observation la plus récente, afin que le score de qualité
// ne pénalise pas systématiquement les espèces issues d'iNaturalist.
async function enrichLastObservationYears(
  occurrences: Occurrence[],
  lat: number,
  lng: number,
  radiusKm: number,
): Promise<void> {
  if (occurrences.length === 0) return;

  const byTaxonId = new Map<number, Occurrence>();
  for (const o of occurrences) {
    if (typeof o.key === "number") byTaxonId.set(o.key, o);
  }
  if (byTaxonId.size === 0) return;

  const cacheKey = obsYearCacheKey(lat, lng, radiusKm);
  const cached = getCachedObsYears(cacheKey);
  const years: Map<number, number> = cached ? new Map(cached) : new Map();

  // Applique d'abord les années déjà connues en cache.
  if (cached) {
    byTaxonId.forEach((occ, taxonId) => {
      const year = cached.get(taxonId);
      if (year !== undefined && occ.lastObservationYear === undefined) {
        occ.lastObservationYear = year;
      }
    });
  }

  const remaining = new Set(
    Array.from(byTaxonId.keys()).filter((id) => byTaxonId.get(id)!.lastObservationYear === undefined),
  );

  // Tout est déjà résolu par le cache : aucun appel réseau nécessaire.
  if (remaining.size === 0) return;

  for (let page = 1; page <= MAX_PAGES && remaining.size > 0; page++) {
    const params = new URLSearchParams({
      lat: lat.toFixed(6),
      lng: lng.toFixed(6),
      radius: radiusKm.toFixed(3),
      per_page: String(PER_PAGE),
      page: String(page),
      quality_grade: "research,needs_id",
      geoprivacy: "open",
      hrank: "species",
      order_by: "observed_on",
      order: "desc",
      // On limite la charge utile aux champs strictement nécessaires.
      only_id: "false",
    });

    let results: any[] = [];
    try {
      const response = await fetch(`${INAT_OBSERVATIONS}?${params.toString()}`, {
        headers: { "User-Agent": "InventaireFlash/1.0 (https://github.com/natural-solutions/inventaire-flash)" },
      });
      if (!response.ok) break;
      const data = await response.json();
      results = Array.isArray(data?.results) ? data.results : [];
    } catch {
      break;
    }

    if (results.length === 0) break;

    for (const r of results) {
      const taxonId = Number(r?.taxon?.id);
      if (!Number.isFinite(taxonId) || !remaining.has(taxonId)) continue;
      const year =
        Number(r?.observed_on_details?.year) ||
        (typeof r?.observed_on === "string" ? Number(r.observed_on.slice(0, 4)) : NaN);
      if (!Number.isFinite(year) || year <= 0) continue;
      const occ = byTaxonId.get(taxonId);
      // Résultats triés par date décroissante : la première occurrence rencontrée
      // pour un taxon est la plus récente.
      if (occ && occ.lastObservationYear === undefined) {
        occ.lastObservationYear = year;
        years.set(taxonId, year);
        remaining.delete(taxonId);
      }
    }

    if (results.length < PER_PAGE) break;
  }

  // Mémorise les années résolues (cache + nouvelles) pour les ré-inventaires.
  setCachedObsYears(cacheKey, years);
}
