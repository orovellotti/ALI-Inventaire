import type { Occurrence } from "@shared/types";
import { applyFrenchPriorityBoost, isFrenchPriority } from "./frenchPriority";

const INAT_SPECIES_COUNTS = "https://api.inaturalist.org/v1/observations/species_counts";

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
      };

      speciesMap.set(scientificName, occ);
    }

    if (results.length < PER_PAGE) break;
    if (page * PER_PAGE >= totalRecords) break;
  }

  const occurrences = Array.from(speciesMap.values());
  return {
    occurrences,
    summary: { records: totalRecords, species: occurrences.length },
  };
}
