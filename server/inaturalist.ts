import type { Occurrence } from "@shared/types";

const INAT_BASE = "https://api.inaturalist.org/v1/observations";

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

export async function searchINaturalist(
  lat: number,
  lng: number,
  radiusMeters: number
): Promise<{ occurrences: Occurrence[]; summary: INatRawSummary }> {
  const radiusKm = Math.max(0.1, Math.min(radiusMeters / 1000, 100));

  const params = new URLSearchParams({
    lat: lat.toFixed(6),
    lng: lng.toFixed(6),
    radius: radiusKm.toFixed(3),
    per_page: "200",
    order_by: "observed_on",
    order: "desc",
    quality_grade: "research,needs_id",
    geoprivacy: "open",
    photos: "false",
  });

  let results: any[] = [];
  try {
    const response = await fetch(`${INAT_BASE}?${params.toString()}`, {
      headers: { "User-Agent": "InventaireFlash/1.0 (https://github.com/natural-solutions/inventaire-flash)" },
    });
    if (!response.ok) {
      return { occurrences: [], summary: { records: 0, species: 0 } };
    }
    const data = await response.json();
    results = Array.isArray(data?.results) ? data.results : [];
  } catch {
    return { occurrences: [], summary: { records: 0, species: 0 } };
  }

  const speciesMap = new Map<string, Occurrence>();

  for (const r of results) {
    const taxon = r?.taxon;
    if (!taxon) continue;
    const scientificName: string | undefined = taxon.name;
    if (!scientificName) continue;
    if (taxon.rank && !["species", "subspecies", "variety", "form"].includes(taxon.rank)) continue;

    const coords = r?.geojson?.coordinates;
    const decimalLongitude = Array.isArray(coords) ? Number(coords[0]) : NaN;
    const decimalLatitude = Array.isArray(coords) ? Number(coords[1]) : NaN;
    if (!Number.isFinite(decimalLatitude) || !Number.isFinite(decimalLongitude)) continue;

    const ancestors: any[] = Array.isArray(taxon.ancestors) ? taxon.ancestors : [];
    const findRank = (rank: string): string | undefined => {
      const a = ancestors.find((x) => x?.rank === rank);
      return a?.name;
    };

    const consStatus =
      taxon?.conservation_status?.iucn_status_code ||
      taxon?.conservation_status?.status ||
      undefined;

    const alertLevel = getAlertLevelFromStatus(consStatus);

    const occ: Occurrence = {
      key: Number(r?.id) || Date.now() + Math.random(),
      scientificName,
      decimalLatitude,
      decimalLongitude,
      vernacularName: taxon.preferred_common_name || undefined,
      kingdom: findRank("kingdom"),
      phylum: findRank("phylum"),
      class: findRank("class"),
      order: findRank("order"),
      family: findRank("family"),
      alertLevel,
      imageUrl: taxon.default_photo?.medium_url || taxon.default_photo?.square_url || undefined,
      iucnStatus: consStatus,
      taxonKey: undefined,
      source: "inaturalist",
      sourceUrl: r?.uri || `https://www.inaturalist.org/observations/${r?.id}`,
    };

    const existing = speciesMap.get(scientificName);
    if (!existing) {
      speciesMap.set(scientificName, occ);
    } else {
      const priority = (lvl: string) => (lvl === "high" ? 3 : lvl === "medium" ? 2 : 1);
      if (priority(occ.alertLevel) > priority(existing.alertLevel)) {
        speciesMap.set(scientificName, occ);
      }
    }
  }

  const occurrences = Array.from(speciesMap.values());
  return {
    occurrences,
    summary: { records: results.length, species: occurrences.length },
  };
}
