import { getBoundingBox } from "../lib/geo";

const GBIF_BASE = "https://api.gbif.org/v1";
const FRENCH_LANGS = new Set(["fra", "fr", "fre", "french", "français"]);
const ENGLISH_LANGS = new Set(["eng", "en", "english"]);
const VERNACULAR_PAGE_SIZE = 100;
const VERNACULAR_MAX_PAGES = 5;
const OCCURRENCE_TIMEOUT_MS = 15_000;
const ENRICHMENT_TIMEOUT_MS = 8_000;
const ENRICHMENT_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const ENRICHMENT_CACHE_MAX_ENTRIES = 5_000;

interface CacheEntry<T> {
  expiresAt: number;
  value: Promise<T>;
}

const enrichmentCache = new Map<string, CacheEntry<unknown>>();

function fetchWithTimeout(url: string | URL, timeoutMs: number): Promise<Response> {
  return fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
}

function cachedSuccessful<T>(key: string, loader: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const existing = enrichmentCache.get(key) as CacheEntry<T> | undefined;
  if (existing && existing.expiresAt > now) return existing.value;
  if (existing) enrichmentCache.delete(key);

  const value = loader().catch((error) => {
    if (enrichmentCache.get(key)?.value === value) enrichmentCache.delete(key);
    throw error;
  });
  enrichmentCache.set(key, { expiresAt: now + ENRICHMENT_CACHE_TTL_MS, value });

  while (enrichmentCache.size > ENRICHMENT_CACHE_MAX_ENTRIES) {
    const oldestKey = enrichmentCache.keys().next().value;
    if (oldestKey === undefined) break;
    enrichmentCache.delete(oldestKey);
  }
  return value;
}

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
  const longitudeRanges: Array<[number, number]> =
    bbox.maxLng - bbox.minLng >= 360 ? [[-180, 180]]
      : bbox.minLng <= -180 ? [[-180, Math.min(180, bbox.maxLng)], [Math.max(-180, bbox.minLng + 360), 180]]
      : bbox.maxLng >= 180 ? [[Math.max(-180, bbox.minLng), 180], [-180, Math.min(180, bbox.maxLng - 360)]]
        : [[bbox.minLng, bbox.maxLng]];
  const records = await Promise.all(longitudeRanges.map(async ([minLng, maxLng]) => {
    const url = new URL(`${GBIF_BASE}/occurrence/search`);
    url.searchParams.set("decimalLatitude", `${Math.max(-90, bbox.minLat).toFixed(4)},${Math.min(90, bbox.maxLat).toFixed(4)}`);
    url.searchParams.set("decimalLongitude", `${minLng.toFixed(4)},${maxLng.toFixed(4)}`);
    url.searchParams.set("hasCoordinate", "true");
    url.searchParams.set("hasGeospatialIssue", "false");
    url.searchParams.set("limit", String(limit));
    const response = await fetchWithTimeout(url, OCCURRENCE_TIMEOUT_MS);
    if (!response.ok) throw new Error(`GBIF API Error: ${response.status}`);
    const data = await response.json();
    return (data.results ?? []) as any[];
  }));
  return records.flat();
}

export async function fetchSpeciesMedia(speciesKey: number): Promise<string | undefined> {
  try {
    return await cachedSuccessful(`media:${speciesKey}`, async () => {
      const response = await fetchWithTimeout(
        `${GBIF_BASE}/species/${speciesKey}/media?limit=1`,
        ENRICHMENT_TIMEOUT_MS,
      );
      if (!response.ok) throw new Error(`GBIF media API Error: ${response.status}`);
      const data = await response.json();
      return data.results?.[0]?.identifier;
    });
  } catch {
    return undefined;
  }
}

export async function fetchSpeciesIucnStatus(speciesKey: number): Promise<string | undefined> {
  try {
    return await cachedSuccessful(`iucn:${speciesKey}`, async () => {
      const response = await fetchWithTimeout(
        `${GBIF_BASE}/species/${speciesKey}/iucnRedListCategory`,
        ENRICHMENT_TIMEOUT_MS,
      );
      if (!response.ok) throw new Error(`GBIF IUCN API Error: ${response.status}`);
      const data = await response.json();
      return data.category;
    });
  } catch {
    return undefined;
  }
}

function isFrench(lang?: string): boolean {
  return FRENCH_LANGS.has((lang ?? "").toLowerCase());
}

function isEnglish(lang?: string): boolean {
  return ENGLISH_LANGS.has((lang ?? "").toLowerCase());
}

export interface VernacularNames {
  french?: string;
  english?: string;
}

export function extractVernacularNames(rows: any[]): VernacularNames {
  const french = rows.find((row) => isFrench(row.language))?.vernacularName;
  const english = rows.find((row) => isEnglish(row.language))?.vernacularName;
  const names: VernacularNames = {};
  if (french) names.french = french;
  if (english) names.english = english;
  return names;
}

export async function fetchVernacularNames(speciesKey: number): Promise<VernacularNames> {
  try {
    return await cachedSuccessful(`vernacular:${speciesKey}`, async () => {
      const names: VernacularNames = {};
      for (let page = 0; page < VERNACULAR_MAX_PAGES; page++) {
        const offset = page * VERNACULAR_PAGE_SIZE;
        const response = await fetchWithTimeout(
          `${GBIF_BASE}/species/${speciesKey}/vernacularNames?limit=${VERNACULAR_PAGE_SIZE}&offset=${offset}`,
          ENRICHMENT_TIMEOUT_MS,
        );
        if (!response.ok) throw new Error(`GBIF vernacular API Error: ${response.status}`);
        const data = await response.json();
        const results: any[] = data.results ?? [];
        const pageNames = extractVernacularNames(results);
        names.french ||= pageNames.french;
        names.english ||= pageNames.english;
        if ((names.french && names.english) || data.endOfRecords || results.length < VERNACULAR_PAGE_SIZE) return names;
      }
      return names;
    });
  } catch {
    return {};
  }
}

export async function fetchFrenchVernacularName(speciesKey: number): Promise<string | undefined> {
  return (await fetchVernacularNames(speciesKey)).french;
}
