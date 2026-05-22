import { getBoundingBox } from "../lib/geo";

const GBIF_BASE = "https://api.gbif.org/v1";
const FRENCH_LANGS = new Set(["fra", "fr", "fre", "french", "français"]);
const VERNACULAR_PAGE_SIZE = 100;
const VERNACULAR_MAX_PAGES = 5;

export interface GbifOccurrenceQuery {
  lat: number;
  lng: number;
  radiusMeters: number;
  limit?: number;
}

export async function searchOccurrences({
  lat,
  lng,
  radiusMeters,
  limit = 1000,
}: GbifOccurrenceQuery): Promise<any[]> {
  const bbox = getBoundingBox(lat, lng, radiusMeters);
  const url = new URL(`${GBIF_BASE}/occurrence/search`);
  url.searchParams.set("decimalLatitude", `${bbox.minLat.toFixed(4)},${bbox.maxLat.toFixed(4)}`);
  url.searchParams.set("decimalLongitude", `${bbox.minLng.toFixed(4)},${bbox.maxLng.toFixed(4)}`);
  url.searchParams.set("hasCoordinate", "true");
  url.searchParams.set("hasGeospatialIssue", "false");
  url.searchParams.set("limit", String(limit));

  const response = await fetch(url.toString());
  if (!response.ok) throw new Error(`GBIF API Error: ${response.status}`);
  const data = await response.json();
  return data.results ?? [];
}

export async function fetchSpeciesMedia(speciesKey: number): Promise<string | undefined> {
  try {
    const response = await fetch(`${GBIF_BASE}/species/${speciesKey}/media?limit=1`);
    if (!response.ok) return undefined;
    const data = await response.json();
    return data.results?.[0]?.identifier;
  } catch {
    return undefined;
  }
}

export async function fetchSpeciesIucnStatus(speciesKey: number): Promise<string | undefined> {
  try {
    const response = await fetch(`${GBIF_BASE}/species/${speciesKey}/iucnRedListCategory`);
    if (!response.ok) return undefined;
    const data = await response.json();
    return data.category;
  } catch {
    return undefined;
  }
}

function isFrench(lang?: string): boolean {
  return FRENCH_LANGS.has((lang ?? "").toLowerCase());
}

export async function fetchFrenchVernacularName(speciesKey: number): Promise<string | undefined> {
  try {
    for (let page = 0; page < VERNACULAR_MAX_PAGES; page++) {
      const offset = page * VERNACULAR_PAGE_SIZE;
      const response = await fetch(
        `${GBIF_BASE}/species/${speciesKey}/vernacularNames?limit=${VERNACULAR_PAGE_SIZE}&offset=${offset}`,
      );
      if (!response.ok) return undefined;
      const data = await response.json();
      const results: any[] = data.results ?? [];
      const french = results.find((v) => isFrench(v.language));
      if (french?.vernacularName) return french.vernacularName;
      if (data.endOfRecords || results.length < VERNACULAR_PAGE_SIZE) return undefined;
    }
  } catch {
    /* fallthrough */
  }
  return undefined;
}
