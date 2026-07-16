const HABITATS_LAYER =
  "https://bio.discomap.eea.europa.eu/arcgis/rest/services/ProtectedSites/Natura2000Habitats/MapServer/0/query";
const SITES_LAYER =
  "https://bio.discomap.eea.europa.eu/arcgis/rest/services/ProtectedSites/Natura2000Sites/MapServer/0/query";
const TIMEOUT_MS = 9000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_HABITATS_PER_SITE = 60;

export interface SiteHabitat {
  code: string;
  description: string;
  cover: number | null;
}

// Polygone du site (anneaux [lng, lat]) et surface en km².
export interface SiteGeometry {
  rings: number[][][];
  areaKm2: number | null;
}

export interface SiteHabitatInfo {
  habitats: SiteHabitat[];
  geometry: SiteGeometry | null;
}

const cache = new Map<string, { at: number; data: SiteHabitatInfo }>();

function isValidSiteCode(code: string): boolean {
  return /^[A-Z]{2}\d{6,}$/i.test(code);
}

async function fetchJson(url: string): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchHabitats(code: string): Promise<SiteHabitat[]> {
  const params = new URLSearchParams({
    where: `SITECODE='${code}'`,
    outFields: "HABITATCODE,DESCRIPTION,CONTAINSHABITAT_PERCENTAGE_COVER",
    returnGeometry: "false",
    resultRecordCount: String(MAX_HABITATS_PER_SITE),
    f: "json",
  });
  const data = await fetchJson(`${HABITATS_LAYER}?${params.toString()}`);
  const features: any[] = Array.isArray(data?.features) ? data.features : [];
  const byCode = new Map<string, SiteHabitat>();
  for (const f of features) {
    const a = f?.attributes ?? {};
    const habitatCode = String(a.HABITATCODE ?? "").trim();
    if (!habitatCode) continue;
    const description = String(a.DESCRIPTION ?? "").trim();
    const rawCover = a.CONTAINSHABITAT_PERCENTAGE_COVER;
    const cover =
      rawCover != null && rawCover !== "" && !Number.isNaN(Number(rawCover))
        ? Number(rawCover)
        : null;
    const existing = byCode.get(habitatCode);
    if (!existing || (cover ?? 0) > (existing.cover ?? 0)) {
      byCode.set(habitatCode, { code: habitatCode, description, cover });
    }
  }
  return Array.from(byCode.values()).sort((a, b) => (b.cover ?? 0) - (a.cover ?? 0));
}

async function fetchGeometry(code: string): Promise<SiteGeometry | null> {
  const params = new URLSearchParams({
    where: `SITECODE='${code}'`,
    outFields: "SITECODE,Area_km2",
    returnGeometry: "true",
    outSR: "4326",
    f: "json",
  });
  const data = await fetchJson(`${SITES_LAYER}?${params.toString()}`);
  const feature = (Array.isArray(data?.features) ? data.features : [])[0];
  const rings: number[][][] | undefined = feature?.geometry?.rings;
  if (!Array.isArray(rings) || rings.length === 0) return null;
  const rawArea = feature?.attributes?.Area_km2;
  const areaKm2 =
    rawArea != null && !Number.isNaN(Number(rawArea)) ? Number(rawArea) : null;
  return { rings, areaKm2 };
}

// Récupère habitats d'intérêt communautaire + polygone d'un site Natura 2000
// (Directive Habitats). Les sites ZPS (oiseaux) n'ont pas de polygone ici :
// habitats/geometry peuvent être vides — l'appelant gère le repli.
export async function getSiteHabitatInfo(siteCode: string): Promise<SiteHabitatInfo | null> {
  const code = siteCode.trim().toUpperCase();
  if (!isValidSiteCode(code)) return null;

  const cached = cache.get(code);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.data;

  const [habitats, geometry] = await Promise.all([
    fetchHabitats(code).catch(() => [] as SiteHabitat[]),
    fetchGeometry(code).catch(() => null),
  ]);

  const info: SiteHabitatInfo = { habitats, geometry };
  // Ne mettre en cache que les réponses utiles (polygone ou habitats trouvés).
  if (geometry || habitats.length > 0) cache.set(code, { at: Date.now(), data: info });
  return info;
}
