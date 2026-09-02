// Types partagés pour la synchronisation liste ↔ carte des zonages.
// Les emprises proviennent du WFS Géoplateforme (GeoJSON) via /api/zonages?geometry=1.
import type { ZonagesData } from "@/lib/zonages";

export interface ZonageMapFeature {
  /** Identifiant stable côté client, partagé avec la liste de résultats. */
  id: string;
  name: string;
  type: string;
  category: string; // reglementaire | natura2000 | znieff | autre
  /**
   * Polygones en [lat, lng] (ordre Leaflet). Chaque polygone est une liste
   * d'anneaux : le premier est extérieur, les suivants sont ses trous.
   */
  polygons: [number, number][][][];
}

/** Clé stable d'un zonage, identique dans la liste et sur la carte. */
export function zonageKey(z: {
  type: string;
  name: string;
  id?: string | null;
  code?: string | null;
}): string {
  const identifier = z.id?.trim() || z.code?.trim() || z.name.normalize("NFKC").trim();
  return `${z.type.normalize("NFKC").trim()}::${identifier}`;
}

/**
 * Convertit immédiatement une réponse zonages en emprises Leaflet.
 * La conversion ne dépend pas du panneau de résultats : les polygones peuvent
 * donc apparaître sur la carte pendant que l'inventaire espèces continue.
 */
export function toZonageMapFeatures(zonages: ZonagesData | null): ZonageMapFeature[] {
  if (!zonages) return [];

  const features: ZonageMapFeature[] = [];
  const seen = new Set<string>();

  for (const group of zonages.groups) {
    for (const zonage of group.zonages) {
      const polygons = zonage.geometry?.polygons?.length
        ? zonage.geometry.polygons
        : (zonage.geometry?.rings || []).map((ring) => [ring]);
      if (polygons.length === 0) continue;

      const id = zonageKey(zonage);
      if (seen.has(id)) continue;
      seen.add(id);

      features.push({
        id,
        name: zonage.name,
        type: zonage.type,
        category: group.category,
        polygons: polygons.map((polygon) =>
          polygon.map((ring) =>
            ring.map((point) => [point[1], point[0]] as [number, number]),
          ),
        ),
      });
    }
  }

  return features;
}

export const ZONAGE_MAP_COLORS: Record<string, string> = {
  reglementaire: "#dc2626",
  natura2000: "#ea580c",
  znieff: "#f59e0b",
  autre: "#64748b",
};
