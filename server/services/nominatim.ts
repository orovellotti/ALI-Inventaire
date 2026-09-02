import { badGateway, notFound } from "../lib/httpError";

const NOMINATIM_BASE = "https://nominatim.openstreetmap.org";
const USER_AGENT = "InventaireFlash/1.0";

const PLACE_TYPES = new Set([
  "hamlet", "isolated_dwelling", "farm", "locality", "neighbourhood",
  "quarter", "village", "suburb", "allotments",
  "city", "town", "municipality", "administrative",
]);

const ADMIN_TYPES = new Set(["administrative", "boundary"]);

async function nominatimFetch(
  path: string,
  params: Record<string, string>,
  signal?: AbortSignal,
) {
  const url = `${NOMINATIM_BASE}${path}?${new URLSearchParams(params).toString()}`;
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal });
  if (!response.ok) throw badGateway("Erreur du service de géocodage");
  return response.json();
}

export interface GeocodeResult {
  lat: number;
  lon: number;
  display_name: string;
}

export function formatGeocodeDisplayName(row: any): string {
  const addr = row?.address ?? {};
  const primary = row?.name || extractPlace(addr, "");
  const localAdmin = addr.village || addr.town || addr.city || "";
  const parts = [
    primary,
    localAdmin && localAdmin !== primary ? localAdmin : null,
    addr.county || null,
    addr.state || null,
  ].filter((part, index, values): part is string => Boolean(part) && values.indexOf(part) === index);
  return parts.join(", ") || row?.display_name || "";
}

export async function geocodePlace(query: string): Promise<GeocodeResult> {
  const data = await nominatimFetch("/search", {
    q: query,
    format: "json",
    limit: "1",
    addressdetails: "1",
  });
  if (!data?.length) throw notFound("Lieu introuvable");
  return {
    lat: parseFloat(data[0].lat),
    lon: parseFloat(data[0].lon),
    display_name: formatGeocodeDisplayName(data[0]),
  };
}

export interface ReverseGeocodeResult {
  lat: number;
  lng: number;
  name: string;
  shortName: string;
  displayName: string;
  commune: string;
  departement: string;
  region: string;
}

function extractPlace(addr: any, fallbackName: string): string {
  return (
    addr.hamlet || addr.isolated_dwelling || addr.farm || addr.locality ||
    addr.neighbourhood || addr.quarter || addr.suburb || addr.village ||
    addr.town || addr.municipality || addr.city || fallbackName || ""
  );
}

function extractCommune(addr: any): string {
  return addr.village || addr.town || addr.municipality || addr.city || addr.hamlet || "";
}

export async function reverseGeocode(
  lat: number,
  lng: number,
  signal?: AbortSignal,
): Promise<ReverseGeocodeResult> {
  const data = await nominatimFetch("/reverse", {
    lat: String(lat),
    lon: String(lng),
    format: "json",
    zoom: "14",
    addressdetails: "1",
  }, signal);
  if (!data || data.error) throw notFound("Aucun toponyme trouvé");

  const addr = data.address ?? {};
  const place = extractPlace(addr, data.name);
  const commune = extractCommune(addr);
  const departement = addr.county || addr.state_district || "";
  const region = addr.state || "";

  const parts = [place, commune && commune !== place ? commune : null, departement, region].filter(Boolean);
  const shortName = parts.join(", ") || data.display_name || `Point ${lat.toFixed(4)}, ${lng.toFixed(4)}`;

  return {
    lat,
    lng,
    name: place || commune || data.display_name,
    shortName,
    displayName: data.display_name,
    commune,
    departement,
    region,
  };
}

export interface LieuDitResult {
  id: string;
  name: string;
  displayName: string;
  type: string;
  lat: number;
  lng: number;
  commune: string;
  departement: string;
  region: string;
  geometry: any;
  boundingbox: number[] | null;
}

function isAcceptedPlace(row: any): boolean {
  if (row.class === "place" && PLACE_TYPES.has(row.type)) return true;
  if (row.class === "boundary" && ADMIN_TYPES.has(row.type)) return true;
  return false;
}

function mapLieuDit(row: any): LieuDitResult {
  const addr = row.address ?? {};
  const hasPolygon = row.geojson && (row.geojson.type === "Polygon" || row.geojson.type === "MultiPolygon");
  return {
    id: `${row.osm_type}-${row.osm_id}`,
    name: row.name || row.display_name.split(",")[0],
    displayName: row.display_name,
    type: row.type,
    lat: parseFloat(row.lat),
    lng: parseFloat(row.lon),
    commune: extractCommune(addr),
    departement: addr.county || addr.state_district || "",
    region: addr.state || "",
    geometry: hasPolygon ? row.geojson : null,
    boundingbox: row.boundingbox ? row.boundingbox.map(parseFloat) : null,
  };
}

export async function searchLieuxDits(query: string): Promise<LieuDitResult[]> {
  const data = await nominatimFetch("/search", {
    q: query,
    format: "json",
    limit: "15",
    addressdetails: "1",
    polygon_geojson: "1",
    countrycodes: "fr,gp,mq,gf,re,yt,pm",
  });
  return (Array.isArray(data) ? data : []).filter(isAcceptedPlace).map(mapLieuDit);
}
