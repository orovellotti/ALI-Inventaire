import { badGateway } from "../lib/httpError";
import type { SiteGeometry } from "./natura2000Habitats";

const WFS_BASE = "https://data.geopf.fr/wfs/ows";
const PER_LAYER_TIMEOUT_MS = 9000;
const CONCURRENCY = 6;
const ZNIEFF_PAGE_SIZE = 200;
const ZNIEFF_MAX_FEATURES_PER_LAYER = 2000;

export type ZonageCategory = "znieff" | "natura2000" | "reglementaire" | "autre";

interface LayerDef {
  key: string;
  typeName: string;
  type: string;
  category: ZonageCategory;
}

export const ZONAGE_LAYERS: LayerDef[] = [
  { key: "znieff1", typeName: "patrinat_znieff1:znieff1", type: "ZNIEFF de type I", category: "znieff" },
  { key: "znieff2", typeName: "patrinat_znieff2:znieff2", type: "ZNIEFF de type II", category: "znieff" },
  { key: "znieff1_mer", typeName: "patrinat_znieff1_mer:znieff1_mer", type: "ZNIEFF de type I (mer)", category: "znieff" },
  { key: "znieff2_mer", typeName: "patrinat_znieff2_mer:znieff2_mer", type: "ZNIEFF de type II (mer)", category: "znieff" },

  { key: "sic", typeName: "patrinat_sic:sic", type: "Natura 2000 — ZSC/SIC (Directive Habitats)", category: "natura2000" },
  { key: "zps", typeName: "patrinat_zps:zps", type: "Natura 2000 — ZPS (Directive Oiseaux)", category: "natura2000" },

  { key: "pn", typeName: "patrinat_pn:parc_national", type: "Parc national", category: "reglementaire" },
  { key: "rnn", typeName: "patrinat_rnn:rnn", type: "Réserve naturelle nationale", category: "reglementaire" },
  { key: "rnr", typeName: "patrinat_rnr:rnr", type: "Réserve naturelle régionale", category: "reglementaire" },
  { key: "rb", typeName: "patrinat_rb:reserve_biologique", type: "Réserve biologique", category: "reglementaire" },
  { key: "apb", typeName: "patrinat_apb:apb", type: "Arrêté de protection de biotope (APPB)", category: "reglementaire" },
  { key: "aphn", typeName: "patrinat_aphn:aire_protection_habitats_naturels", type: "Aire de protection des habitats naturels", category: "reglementaire" },

  { key: "pnr", typeName: "patrinat_pnr:pnr", type: "Parc naturel régional", category: "autre" },
  { key: "pnm", typeName: "patrinat_pnm:pnm", type: "Parc naturel marin", category: "autre" },
  { key: "ramsar", typeName: "patrinat_ramsar:pnm", type: "Site Ramsar (zone humide)", category: "autre" },
  { key: "bios", typeName: "patrinat_bios:bios", type: "Réserve de biosphère (MAB)", category: "autre" },
  { key: "cdl", typeName: "patrinat_cdl:conservatoire_littoral", type: "Terrain du Conservatoire du littoral", category: "autre" },
];

export const CATEGORY_LABELS: Record<ZonageCategory, string> = {
  znieff: "Inventaire ZNIEFF",
  natura2000: "Natura 2000",
  reglementaire: "Protection réglementaire",
  autre: "Autres zonages et reconnaissances",
};

export interface Zonage {
  category: ZonageCategory;
  type: string;
  name: string;
  url: string | null;
  id: string | null;
  code: string | null;
  geometry?: SiteGeometry | null;
}

export interface ZonageGroup {
  category: ZonageCategory;
  label: string;
  count: number;
  zonages: Zonage[];
}

export interface ZonagesResult {
  lat: number;
  lng: number;
  radius: number;
  count: number;
  groups: ZonageGroup[];
  errors: string[];
}

function bboxFromRadius(lat: number, lng: number, radiusM: number): string {
  const latDeg = radiusM / 111320;
  const lngDeg = radiusM / (111320 * Math.max(0.01, Math.cos((lat * Math.PI) / 180)));
  const minLat = lat - latDeg;
  const maxLat = lat + latDeg;
  const minLng = lng - lngDeg;
  const maxLng = lng + lngDeg;
  return `${minLat},${minLng},${maxLat},${maxLng},urn:ogc:def:crs:EPSG::4326`;
}

const EARTH_R = 6371000;
function haversineM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.min(1, Math.sqrt(s)));
}

// Préserve la structure GeoJSON : chaque polygone garde son contour extérieur
// et ses éventuels trous.
function collectPolygons(geom: any): number[][][][] {
  if (!geom) return [];
  const coords = geom.coordinates;
  if (!Array.isArray(coords)) return [];
  if (geom.type === "Polygon") return [coords as number[][][]];
  if (geom.type === "MultiPolygon") {
    return (coords as number[][][][]).filter((polygon) => Array.isArray(polygon));
  }
  return [];
}

// Normalise les polygones WFS en [lng, lat] (ordre attendu par habitatCompat).
// L'ordre des axes GeoJSON du WFS Géoplateforme dépend du CRS ; on le déduit en
// choisissant l'interprétation qui place le polygone le plus près du centre.
function normalizePolygons(
  polygons: number[][][][],
  centerLat: number,
  centerLng: number,
): SiteGeometry | null {
  const first = polygons[0]?.[0]?.[0];
  if (!Array.isArray(first) || first.length < 2) return null;
  const [a, b] = first;
  const distLngLat = haversineM(centerLat, centerLng, b, a); // [lng=a, lat=b]
  const distLatLng = haversineM(centerLat, centerLng, a, b); // [lat=a, lng=b]
  const swap = distLatLng < distLngLat; // points en [lat, lng] → à inverser
  const normalized = polygons.map((polygon) =>
    polygon.map((ring) =>
      ring.map((pt) => (swap ? [pt[1], pt[0]] : [pt[0], pt[1]])),
    ),
  );
  return { rings: normalized.flat(), polygons: normalized, areaKm2: null };
}

export interface LayerPage {
  zonages: Zonage[];
  numberMatched: number | null;
  numberReturned: number;
}

export function parseWfsNumberMatched(value: unknown): number | null {
  if (value === null || value === undefined || value === "unknown") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

async function fetchLayerPage(
  layer: LayerDef,
  bbox: string,
  center?: { lat: number; lng: number },
  startIndex = 0,
  count = 50,
): Promise<LayerPage> {
  const params = new URLSearchParams({
    SERVICE: "WFS",
    VERSION: "2.0.0",
    REQUEST: "GetFeature",
    TYPENAMES: layer.typeName,
    SRSNAME: "urn:ogc:def:crs:EPSG::4326",
    OUTPUTFORMAT: "application/json",
    COUNT: String(count),
    BBOX: bbox,
  });
  if (startIndex > 0) params.set("STARTINDEX", String(startIndex));
  const wantGeometry = !!center;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PER_LAYER_TIMEOUT_MS);
  try {
    const response = await fetch(`${WFS_BASE}?${params.toString()}`, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const features: any[] = Array.isArray(data?.features) ? data.features : [];
    const numberMatched = parseWfsNumberMatched(data?.numberMatched);

    const seen = new Set<string>();
    const zonages: Zonage[] = [];
    for (const f of features) {
      const p = f?.properties ?? {};
      const name = String(p.nom_site ?? p.nom ?? p.libelle ?? "").trim();
      if (!name) continue;
      const url = p.url_fiche ? String(p.url_fiche) : null;
      const id = p.id_local != null ? String(p.id_local) : null;
      let code: string | null = p.id_mnhn != null ? String(p.id_mnhn) : null;
      if (!code && url) {
        const m = url.match(/(FR\d{7,})/i);
        if (m) code = m[1].toUpperCase();
      }
      const dedupeKey = (url || name).toLowerCase();
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      const geometry =
        wantGeometry && center
          ? normalizePolygons(collectPolygons(f?.geometry), center.lat, center.lng)
          : null;
      zonages.push({ category: layer.category, type: layer.type, name, url, id, code, geometry });
    }
    return {
      zonages,
      numberMatched,
      numberReturned: features.length,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchLayer(
  layer: LayerDef,
  bbox: string,
  center?: { lat: number; lng: number },
): Promise<Zonage[]> {
  return (await fetchLayerPage(layer, bbox, center)).zonages;
}

async function fetchLayerPaginated(
  layer: LayerDef,
  bbox: string,
): Promise<{ zones: Zonage[]; partial: boolean }> {
  return collectPaginatedZonages((startIndex, count) =>
    fetchLayerPage(layer, bbox, undefined, startIndex, count),
  );
}

export async function collectPaginatedZonages(
  fetchPage: (startIndex: number, count: number) => Promise<LayerPage>,
  pageSize = ZNIEFF_PAGE_SIZE,
  maxFeatures = ZNIEFF_MAX_FEATURES_PER_LAYER,
): Promise<{ zones: Zonage[]; partial: boolean }> {
  const zonesByKey = new Map<string, Zonage>();
  let startIndex = 0;
  let partial = false;
  let completed = false;

  while (startIndex < maxFeatures) {
    const remaining = maxFeatures - startIndex;
    const page = await fetchPage(startIndex, Math.min(pageSize, remaining));
    const sizeBeforePage = zonesByKey.size;
    for (const zone of page.zonages) {
      const key = (zone.code || zone.url || `${zone.type}:${zone.name}`).toLowerCase();
      zonesByKey.set(key, zone);
    }
    const newZoneCount = zonesByKey.size - sizeBeforePage;
    const startBeforePage = startIndex;
    startIndex += page.numberReturned;

    // Certains serveurs WFS ignorent STARTINDEX et répètent la première page.
    // Le compteur brut ne suffit donc pas : une page non vide sans nouvelle
    // entité est une pagination incohérente, jamais un résultat complet.
    if (
      page.numberReturned > 0 &&
      newZoneCount === 0 &&
      (page.numberMatched === null || startBeforePage < page.numberMatched)
    ) {
      partial = true;
      break;
    }
    if (page.numberMatched !== null && startIndex >= page.numberMatched) {
      if (zonesByKey.size < page.numberMatched) partial = true;
      completed = true;
      break;
    }
    if (page.numberReturned === 0) {
      partial = page.numberMatched !== null && startIndex < page.numberMatched;
      break;
    }
    if (
      page.numberMatched === null &&
      page.numberReturned < pageSize
    ) {
      completed = true;
      break;
    }
  }

  if (startIndex >= maxFeatures && !completed) {
    partial = true;
  }
  return { zones: Array.from(zonesByKey.values()), partial };
}

async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  let index = 0;
  async function next(): Promise<void> {
    while (index < items.length) {
      const current = index++;
      results[current] = await worker(items[current]);
    }
  }
  const runners = Array.from({ length: Math.min(limit, items.length) }, () => next());
  await Promise.all(runners);
  return results;
}

export async function getZonages(
  lat: number,
  lng: number,
  radius: number,
  opts?: { includeGeometry?: boolean },
): Promise<ZonagesResult> {
  const bbox = bboxFromRadius(lat, lng, radius);
  const errors: string[] = [];
  const center = opts?.includeGeometry ? { lat, lng } : undefined;

  const perLayer = await runWithConcurrency(ZONAGE_LAYERS, CONCURRENCY, async (layer) => {
    try {
      return await fetchLayer(layer, bbox, center);
    } catch (e: any) {
      errors.push(`${layer.type}: ${e?.name === "AbortError" ? "délai dépassé" : e?.message || "erreur"}`);
      return [] as Zonage[];
    }
  });

  if (perLayer.every((z) => z.length === 0) && errors.length === ZONAGE_LAYERS.length) {
    throw badGateway("Service de zonages (IGN Géoplateforme) indisponible");
  }

  const all = perLayer.flat();
  const order: ZonageCategory[] = ["reglementaire", "natura2000", "znieff", "autre"];
  const groups: ZonageGroup[] = order
    .map((category) => {
      const zonages = all.filter((z) => z.category === category);
      return { category, label: CATEGORY_LABELS[category], count: zonages.length, zonages };
    })
    .filter((g) => g.count > 0);

  return { lat, lng, radius, count: all.length, groups, errors };
}

export async function getNaturaZones(lat: number, lng: number, radius: number): Promise<Zonage[]> {
  const bbox = bboxFromRadius(lat, lng, radius);
  const naturaLayers = ZONAGE_LAYERS.filter((l) => l.category === "natura2000");
  const perLayer = await runWithConcurrency(naturaLayers, CONCURRENCY, async (layer) => {
    try {
      return await fetchLayer(layer, bbox, { lat, lng });
    } catch {
      return [] as Zonage[];
    }
  });
  return perLayer.flat();
}

/**
 * Charge seulement les quatre couches ZNIEFF. Cette voie ciblée évite de
 * requêter tous les zonages lorsque le moteur d'espèces documentaires s'ouvre.
 * L'identifiant national vient de `id_mnhn` ; contrairement à Natura 2000, il
 * ne suit pas le motif FR####### et ne doit pas passer par ce filtre.
 */
export interface ZnieffZonesResult {
  zones: Zonage[];
  partial: boolean;
}

export async function getZnieffZones(
  lat: number,
  lng: number,
  radius: number,
): Promise<ZnieffZonesResult> {
  const bbox = bboxFromRadius(lat, lng, radius);
  const znieffLayers = ZONAGE_LAYERS.filter((layer) => layer.category === "znieff");
  const perLayer = await runWithConcurrency(znieffLayers, CONCURRENCY, async (layer) => {
    try {
      return await fetchLayerPaginated(layer, bbox);
    } catch {
      return { zones: [] as Zonage[], partial: true };
    }
  });
  return {
    zones: perLayer.flatMap((result) => result.zones),
    partial: perLayer.some((result) => result.partial),
  };
}
