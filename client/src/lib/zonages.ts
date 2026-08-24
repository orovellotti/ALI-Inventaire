export interface ZonageItem {
  category: string;
  type: string;
  name: string;
  url: string | null;
  id: string | null;
  code?: string | null;
  /** Emprise WFS : polygones en anneaux [lng, lat] (null si indisponible). */
  geometry?: { rings: number[][][]; polygons?: number[][][][] } | null;
}

export interface ZonageGroupData {
  category: string;
  label: string;
  count: number;
  zonages: ZonageItem[];
}

export interface ZonagesData {
  lat: number;
  lng: number;
  radius: number;
  count: number;
  groups: ZonageGroupData[];
  errors: string[];
}

export async function fetchZonages(
  lat: number,
  lng: number,
  radius: number,
  signal?: AbortSignal,
): Promise<ZonagesData> {
  const params = new URLSearchParams({
    lat: String(lat),
    lng: String(lng),
    radius: String(radius),
    geometry: "1",
  });
  const response = await fetch(`/api/zonages?${params.toString()}`, { signal });
  if (!response.ok) {
    throw new Error(`Impossible de charger les zonages (${response.status})`);
  }
  return response.json();
}