import type { GeocodingResult } from "@shared/types";
export type { GeocodingResult };

export interface ReverseGeocodingResult {
  lat: number;
  lng: number;
  name: string;
  shortName: string;
  displayName: string;
  commune: string;
  departement: string;
  region: string;
}

export async function reverseGeocode(lat: number, lng: number): Promise<ReverseGeocodingResult | null> {
  try {
    const params = new URLSearchParams({ lat: String(lat), lng: String(lng) });
    const response = await fetch(`/api/geocode/reverse?${params.toString()}`);
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.error("Reverse geocoding error:", error);
    return null;
  }
}

export async function searchPlace(query: string): Promise<GeocodingResult | null> {
  try {
    const params = new URLSearchParams({ q: query });
    const response = await fetch(`/api/geocode?${params.toString()}`);

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new Error("Geocoding failed");
    }

    return await response.json();
  } catch (error) {
    console.error("Geocoding error:", error);
    return null;
  }
}
