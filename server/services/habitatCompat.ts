import type { SiteGeometry } from "./natura2000Habitats";

// Distance de dispersion / mobilité écologique par groupe taxonomique (mètres).
// Sert de "distance écologique" : rayon au-delà duquel une espèce du site
// devient peu plausible dans l'emprise si l'habitat ne s'y recoupe pas.
const GROUP_DISPERSAL_M: Record<string, number> = {
  Oiseaux: 10000,
  Mammifères: 6000,
  "Chauves-souris": 8000,
  Poissons: 3000,
  Reptiles: 1500,
  Amphibiens: 1500,
  Insectes: 1200,
  Arachnides: 800,
  Mollusques: 800,
  Plantes: 500,
  Champignons: 500,
};
const DEFAULT_DISPERSAL_M = 2000;

export function groupDispersalM(group: string | undefined): number {
  return (group && GROUP_DISPERSAL_M[group]) || DEFAULT_DISPERSAL_M;
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

// Point [lng, lat] dans l'un des anneaux du polygone (règle pair-impair).
function pointInRings(lng: number, lat: number, rings: number[][][]): boolean {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0], yi = ring[i][1];
      const xj = ring[j][0], yj = ring[j][1];
      const intersect =
        yi > lat !== yj > lat &&
        lng < ((xj - xi) * (lat - yi)) / (yj - yi + 1e-12) + xi;
      if (intersect) inside = !inside;
    }
  }
  return inside;
}

// Distance minimale (m) du centre à un sommet du polygone. 0 si le centre est
// à l'intérieur. Approximation par sommets (suffisante à cette échelle).
function minDistanceToPolygonM(
  lat: number,
  lng: number,
  rings: number[][][],
): number {
  if (pointInRings(lng, lat, rings)) return 0;
  let min = Infinity;
  for (const ring of rings) {
    for (const [vLng, vLat] of ring) {
      const d = haversineM(lat, lng, vLat, vLng);
      if (d < min) min = d;
    }
  }
  return Number.isFinite(min) ? min : Infinity;
}

// Ratio de recouvrement emprise/site : fraction d'un disque (centre, rayon) qui
// tombe dans le polygone du site, estimée par échantillonnage déterministe
// (anneaux concentriques). 0 = aucun recouvrement, 1 = emprise incluse.
function overlapRatio(
  lat: number,
  lng: number,
  radiusM: number,
  rings: number[][][],
): number {
  const RINGS = 5;
  const SECTORS = 12;
  const latPerM = 1 / 111320;
  const lngPerM = 1 / (111320 * Math.max(0.01, Math.cos((lat * Math.PI) / 180)));
  let inside = 0;
  let total = 0;
  // Centre.
  total++;
  if (pointInRings(lng, lat, rings)) inside++;
  for (let r = 1; r <= RINGS; r++) {
    const dist = (radiusM * r) / RINGS;
    for (let s = 0; s < SECTORS; s++) {
      const angle = (2 * Math.PI * s) / SECTORS;
      const pLat = lat + dist * Math.sin(angle) * latPerM;
      const pLng = lng + dist * Math.cos(angle) * lngPerM;
      total++;
      if (pointInRings(pLng, pLat, rings)) inside++;
    }
  }
  return total > 0 ? inside / total : 0;
}

export interface HabitatMetrics {
  overlapRatio: number;
  distanceM: number;
}

// Métriques géométriques emprise/site (indépendantes du groupe taxonomique).
export function computeSiteMetrics(
  lat: number,
  lng: number,
  radiusM: number,
  geometry: SiteGeometry | null,
): HabitatMetrics | null {
  if (!geometry || !Array.isArray(geometry.rings) || geometry.rings.length === 0) {
    return null;
  }
  return {
    overlapRatio: overlapRatio(lat, lng, radiusM, geometry.rings),
    distanceM: minDistanceToPolygonM(lat, lng, geometry.rings),
  };
}

// Score de compatibilité d'habitat 0–100 pour une espèce d'un site donné.
// Combine le recouvrement géométrique emprise/site (l'habitat désigné tombe
// littéralement dans l'emprise) et la distance écologique propre au groupe.
// `metrics` null (site sans polygone, ex. ZPS) → repli distance-proximité.
export function habitatCompatScore(
  group: string | undefined,
  metrics: HabitatMetrics | null,
  fallbackDistanceM: number,
): number {
  const dispersal = groupDispersalM(group);
  if (!metrics) {
    // Pas de polygone : compat modérée fondée uniquement sur la proximité connue.
    const distComponent = Math.max(0, 1 - fallbackDistanceM / dispersal);
    return Math.round(60 * distComponent);
  }
  // Recouvrement : un faible chevauchement suffit déjà à indiquer que l'habitat
  // désigné est présent dans l'emprise.
  const overlapComponent = Math.min(1, metrics.overlapRatio * 3);
  const distComponent = Math.max(0, 1 - metrics.distanceM / dispersal);
  return Math.round(100 * Math.max(overlapComponent, distComponent));
}
