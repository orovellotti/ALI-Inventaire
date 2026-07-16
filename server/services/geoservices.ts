import { badGateway } from "../lib/httpError";
import type { SiteGeometry } from "./natura2000Habitats";

const WFS_BASE = "https://data.geopf.fr/wfs/ows";
const PER_LAYER_TIMEOUT_MS = 9000;
const CONCURRENCY = 6;

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

// Aplati une géométrie GeoJSON (Polygon/MultiPolygon) en une liste d'anneaux.
function collectRings(geom: any): number[][][] {
  if (!geom) return [];
  const coords = geom.coordinates;
  if (!Array.isArray(coords)) return [];
  if (geom.type === "Polygon") return coords as number[][][];
  if (geom.type === "MultiPolygon") {
    const rings: number[][][] = [];
    for (const poly of coords) {
      if (Array.isArray(poly)) for (const ring of poly) rings.push(ring);
    }
    return rings;
  }
  return [];
}

// Normalise les anneaux WFS en [lng, lat] (ordre attendu par habitatCompat).
// L'ordre des axes GeoJSON du WFS Géoplateforme dépend du CRS ; on le déduit en
// choisissant l'interprétation qui place le polygone le plus près du centre.
function normalizeRings(
  rings: number[][][],
  centerLat: number,
  centerLng: number,
): SiteGeometry | null {
  const first = rings[0]?.[0];
  if (!Array.isArray(first) || first.length < 2) return null;
  const [a, b] = first;
  const distLngLat = haversineM(centerLat, centerLng, b, a); // [lng=a, lat=b]
  const distLatLng = haversineM(centerLat, centerLng, a, b); // [lat=a, lng=b]
  const swap = distLatLng < distLngLat; // anneaux en [lat, lng] → à inverser
  const out = rings.map((ring) =>
    ring.map((pt) => (swap ? [pt[1], pt[0]] : [pt[0], pt[1]])),
  );
  return { rings: out, areaKm2: null };
}

async function fetchLayer(
  layer: LayerDef,
  bbox: string,
  center?: { lat: number; lng: number },
): Promise<Zonage[]> {
  const params = new URLSearchParams({
    SERVICE: "WFS",
    VERSION: "2.0.0",
    REQUEST: "GetFeature",
    TYPENAMES: layer.typeName,
    SRSNAME: "urn:ogc:def:crs:EPSG::4326",
    OUTPUTFORMAT: "application/json",
    COUNT: "50",
    BBOX: bbox,
  });
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
          ? normalizeRings(collectRings(f?.geometry), center.lat, center.lng)
          : null;
      zonages.push({ category: layer.category, type: layer.type, name, url, id, code, geometry });
    }
    return zonages;
  } finally {
    clearTimeout(timer);
  }
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
): Promise<ZonagesResult> {
  const bbox = bboxFromRadius(lat, lng, radius);
  const errors: string[] = [];

  const perLayer = await runWithConcurrency(ZONAGE_LAYERS, CONCURRENCY, async (layer) => {
    try {
      return await fetchLayer(layer, bbox);
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
