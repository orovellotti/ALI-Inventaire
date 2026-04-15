import shp from "shpjs";
import type { FeatureCollection, Geometry, Position } from "geojson";

export interface ProjectPolygon {
  geojson: FeatureCollection;
  centroid: [number, number];
  bounds: [[number, number], [number, number]];
  name: string;
}

const POLYGON_TYPES = new Set(["Polygon", "MultiPolygon"]);

function getPolygonRings(geometry: Geometry): Position[][] {
  if (geometry.type === "Polygon") {
    return geometry.coordinates;
  }
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.flat();
  }
  return [];
}

function ringArea(ring: Position[]): number {
  let area = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[i + 1];
    area += x1 * y2 - x2 * y1;
  }
  return Math.abs(area) / 2;
}

function ringCentroid(ring: Position[]): [number, number] {
  let cx = 0, cy = 0, a = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[i + 1];
    const cross = x1 * y2 - x2 * y1;
    cx += (x1 + x2) * cross;
    cy += (y1 + y2) * cross;
    a += cross;
  }
  a /= 2;
  if (Math.abs(a) < 1e-12) {
    let sx = 0, sy = 0;
    for (const [x, y] of ring) { sx += x; sy += y; }
    return [sy / ring.length, sx / ring.length];
  }
  cx /= (6 * a);
  cy /= (6 * a);
  return [cy, cx];
}

function computeCentroid(fc: FeatureCollection): [number, number] {
  let totalArea = 0;
  let weightedLat = 0;
  let weightedLng = 0;

  for (const feature of fc.features) {
    if (!feature.geometry) continue;
    const rings = getPolygonRings(feature.geometry);
    if (rings.length === 0) continue;
    const outerRing = rings[0];
    const area = ringArea(outerRing);
    const [lat, lng] = ringCentroid(outerRing);
    totalArea += area;
    weightedLat += lat * area;
    weightedLng += lng * area;
  }

  if (totalArea < 1e-12) {
    throw new Error("Aucune surface valide trouvée dans le shapefile");
  }

  return [weightedLat / totalArea, weightedLng / totalArea];
}

function flattenCoords(geometry: Geometry): Position[] {
  switch (geometry.type) {
    case "Polygon":
      return geometry.coordinates.flat();
    case "MultiPolygon":
      return geometry.coordinates.flat(2);
    default:
      return [];
  }
}

function computeBounds(fc: FeatureCollection): [[number, number], [number, number]] {
  const allCoords: Position[] = [];
  for (const feature of fc.features) {
    if (feature.geometry) {
      allCoords.push(...flattenCoords(feature.geometry));
    }
  }
  if (allCoords.length === 0) throw new Error("Aucune coordonnée trouvée");

  let minLat = Infinity, maxLat = -Infinity;
  let minLng = Infinity, maxLng = -Infinity;
  for (const coord of allCoords) {
    minLng = Math.min(minLng, coord[0]);
    maxLng = Math.max(maxLng, coord[0]);
    minLat = Math.min(minLat, coord[1]);
    maxLat = Math.max(maxLat, coord[1]);
  }
  return [[minLat, minLng], [maxLat, maxLng]];
}

export async function parseShapefile(file: File): Promise<ProjectPolygon> {
  const buffer = await file.arrayBuffer();
  const result = await shp(buffer);

  let fc: FeatureCollection;
  if (Array.isArray(result)) {
    fc = {
      type: "FeatureCollection",
      features: result.flatMap(r => r.features),
    };
  } else {
    fc = result as FeatureCollection;
  }

  if (!fc.features || fc.features.length === 0) {
    throw new Error("Le shapefile ne contient aucune entité");
  }

  const polyFeatures = fc.features.filter(
    f => f.geometry && POLYGON_TYPES.has(f.geometry.type)
  );

  if (polyFeatures.length === 0) {
    throw new Error(
      "Le shapefile ne contient aucun polygone. Seuls les fichiers contenant des polygones (emprise projet) sont acceptés."
    );
  }

  const polyFc: FeatureCollection = {
    type: "FeatureCollection",
    features: polyFeatures,
  };

  const centroid = computeCentroid(polyFc);
  const bounds = computeBounds(polyFc);
  const name = file.name.replace(/\.zip$/i, "");

  return { geojson: polyFc, centroid, bounds, name };
}
