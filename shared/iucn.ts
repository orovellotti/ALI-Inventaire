import type { AliStatusSummary, Occurrence } from "./types";

const TERRITORIAL_RED_LIST_PRIORITY = [
  "Liste rouge régionale",
  "Liste rouge nationale",
  "Liste rouge européenne",
] as const;

export function isPlantTaxon(taxon: Pick<Occurrence, "kingdom">): boolean {
  return taxon.kingdom?.trim().toLowerCase() === "plantae";
}

export function getPreferredTerritorialRedList(
  statuses: AliStatusSummary[] | undefined,
): AliStatusSummary | undefined {
  if (!statuses?.length) return undefined;
  for (const category of TERRITORIAL_RED_LIST_PRIORITY) {
    const match = statuses.find((status) => status.category === category);
    if (match) return match;
  }
  return undefined;
}
