import type { GeocodingResult } from "@shared/types";
export type { GeocodingResult };

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
