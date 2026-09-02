import type { SiteGeometry } from "./natura2000Habitats";
import type { ProjectAreaFeatureCollection } from "@shared/types";

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

type Point = [number, number]; // [lng, lat]
type Polygon = Point[][];

function areaPolygons(area: ProjectAreaFeatureCollection): Polygon[] {
  return area.features.flatMap(({ geometry }) =>
    geometry.type === "Polygon" ? [geometry.coordinates as Polygon] : geometry.coordinates as Polygon[],
  );
}

function sitePolygons(site: SiteGeometry): Polygon[] {
  return site.polygons?.length ? site.polygons as Polygon[] : [site.rings as Point[][]];
}

function inRing(point: Point, ring: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > point[1] !== yj > point[1] &&
      point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi + Number.EPSILON) + xi) inside = !inside;
  }
  return inside;
}

function inPolygons(point: Point, polygons: Polygon[]): boolean {
  return polygons.some((polygon) => inRing(point, polygon[0]) && !polygon.slice(1).some((hole) => inRing(point, hole)));
}

function segments(polygons: Polygon[]): Array<[Point, Point]> {
  const output: Array<[Point, Point]> = [];
  for (const polygon of polygons) for (const ring of polygon) {
    for (let i = 1; i < ring.length; i++) output.push([ring[i - 1], ring[i]]);
  }
  return output;
}

function orientation(a: Point, b: Point, c: Point): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}
function onSegment(a: Point, b: Point, p: Point): boolean {
  return Math.min(a[0], b[0]) <= p[0] && p[0] <= Math.max(a[0], b[0]) &&
    Math.min(a[1], b[1]) <= p[1] && p[1] <= Math.max(a[1], b[1]);
}
/** Inclusive test: tangencies and collinear boundary contacts are overlap. */
function intersects(a: Point, b: Point, c: Point, d: Point): boolean {
  const abC = orientation(a, b, c), abD = orientation(a, b, d);
  const cdA = orientation(c, d, a), cdB = orientation(c, d, b);
  if (((abC > 0 && abD < 0) || (abC < 0 && abD > 0)) && ((cdA > 0 && cdB < 0) || (cdA < 0 && cdB > 0))) return true;
  return (abC === 0 && onSegment(a, b, c)) || (abD === 0 && onSegment(a, b, d)) ||
    (cdA === 0 && onSegment(c, d, a)) || (cdB === 0 && onSegment(c, d, b));
}

function localPoint(point: Point, referenceLat: number): [number, number] {
  const scaleY = 111_320, scaleX = scaleY * Math.max(0.01, Math.cos(referenceLat * Math.PI / 180));
  return [point[0] * scaleX, point[1] * scaleY];
}
function distancePointSegmentM(point: Point, a: Point, b: Point, referenceLat: number): number {
  const [px, py] = localPoint(point, referenceLat), [ax, ay] = localPoint(a, referenceLat), [bx, by] = localPoint(b, referenceLat);
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/**
 * Polygon/MultiPolygon overlap. Segment intersections and containment are exact
 * in lon/lat topology, so a boundary touch can never be reported as zero.
 * The ratio is a bounded adaptive raster estimate; it is deliberately only an
 * index for habitat compatibility, not a cadastral area calculation.
 */
export function computeProjectSiteMetrics(area: ProjectAreaFeatureCollection, site: SiteGeometry | null): HabitatMetrics | null {
  if (!site?.rings?.length) return null;
  const project = areaPolygons(area), target = sitePolygons(site);
  const projectSegments = segments(project), siteSegments = segments(target);
  if (!projectSegments.length || !siteSegments.length) return null;
  let boundaryTouch = false;
  for (const [a, b] of projectSegments) {
    for (const [c, d] of siteSegments) {
      if (intersects(a, b, c, d)) { boundaryTouch = true; break; }
    }
    if (boundaryTouch) break;
  }
  const projectPoint = project[0]?.[0]?.[0];
  const sitePoint = target[0]?.[0]?.[0];
  const contains = !!projectPoint && inPolygons(projectPoint, target) || !!sitePoint && inPolygons(sitePoint, project);
  const overlaps = boundaryTouch || contains;
  const vertices = project.flat(2);
  const lats = vertices.map((p) => p[1]), lngs = vertices.map((p) => p[0]);
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs), minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const complexity = Math.min(64, Math.max(12, Math.ceil(Math.sqrt(vertices.length / 8))));
  let total = 0, overlap = 0;
  for (let y = 0; y < complexity; y++) for (let x = 0; x < complexity; x++) {
    const point: Point = [minLng + (x + .5) * (maxLng - minLng) / complexity, minLat + (y + .5) * (maxLat - minLat) / complexity];
    if (!inPolygons(point, project)) continue;
    total++;
    if (inPolygons(point, target)) overlap++;
  }
  const estimatedRatio = total ? overlap / total : 0;
  if (overlaps) return { overlapRatio: Math.max(estimatedRatio, 1 / (complexity * complexity)), distanceM: 0 };
  const referenceLat = (minLat + maxLat) / 2;
  let distanceM = Infinity;
  for (const [a] of projectSegments) for (const [c, d] of siteSegments) distanceM = Math.min(distanceM, distancePointSegmentM(a, c, d, referenceLat));
  for (const [a] of siteSegments) for (const [c, d] of projectSegments) distanceM = Math.min(distanceM, distancePointSegmentM(a, c, d, referenceLat));
  return { overlapRatio: 0, distanceM };
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
