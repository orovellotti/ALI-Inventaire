import type { SINPPlatform } from "@shared/types";
export type { SINPPlatform };

export async function findSINPPlatforms(lat: number, lng: number): Promise<SINPPlatform[]> {
  try {
    const params = new URLSearchParams({ lat: lat.toString(), lng: lng.toString() });
    const response = await fetch(`/api/sinp?${params.toString()}`);
    if (!response.ok) return [];
    const data = await response.json();
    return data.platforms || [];
  } catch {
    return [];
  }
}
