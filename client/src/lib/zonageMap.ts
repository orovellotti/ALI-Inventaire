// Types partagés pour la synchronisation liste ↔ carte des zonages.
// Les emprises proviennent du WFS Géoplateforme (GeoJSON) via /api/zonages?geometry=1.

export interface ZonageMapFeature {
  /** Identifiant stable côté client : `${type}::${nom}` */
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
export function zonageKey(z: { type: string; name: string }): string {
  return `${z.type}::${z.name}`;
}

export const ZONAGE_MAP_COLORS: Record<string, string> = {
  reglementaire: "#dc2626",
  natura2000: "#ea580c",
  znieff: "#f59e0b",
  autre: "#64748b",
};
