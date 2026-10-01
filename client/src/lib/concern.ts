import { getPatrimonialite, type EnjeuLevel, type Occurrence } from "./gbif";
import { isPlantTaxon } from "@shared/iucn";

export type ConcernLevel = EnjeuLevel | "eee";

export const CONCERN_INTERPRETATION_RULE =
  "Explicit inventory enjeuLevel is the canonical territorial concern classification and takes precedence over legacy alerts or AI summary levels for the same taxon. Unenriched fallback labels are heuristics, not verified territorial assessments. Source suitability and priority scores are separate evidence, not replacements for territorial statuses. Invasive alien species are management concerns, never conservation concerns by virtue of their threat score.";

export const CONCERN_LABEL: Record<ConcernLevel, string> = {
  critique: "Critical",
  fort: "High",
  modere: "Moderate",
  a_confirmer: "To confirm",
  faible: "Low",
  eee: "Invasive alien species — management concern",
};

/** Display classification only; never replaces or recomputes scientific scores. */
export function classifyConcern(occurrence: Occurrence): ConcernLevel {
  if (occurrence.isInvasive) return "eee";
  if (occurrence.enjeuLevel) return occurrence.enjeuLevel;
  // A missing canonical plant assessment cannot be filled by global UICN.
  if (isPlantTaxon(occurrence) && occurrence.alertLevel !== "low") return "a_confirmer";
  // Preserve the pre-enrichment inventory heuristic, explicitly labelled as such.
  if (occurrence.alertLevel === "high") {
    return getPatrimonialite(occurrence.iucnStatus, occurrence.alertLevel).level >= 4
      ? "critique"
      : "fort";
  }
  return occurrence.alertLevel === "medium" ? "modere" : "faible";
}

export function concernBucket(occurrence: Occurrence): "high" | "medium" | "low" {
  const level = classifyConcern(occurrence);
  if (level === "critique" || level === "fort") return "high";
  if (level === "modere" || level === "a_confirmer") return "medium";
  return "low";
}

export function concernLabel(occurrence: Occurrence): string {
  const level = classifyConcern(occurrence);
  return `${CONCERN_LABEL[level]}${!occurrence.enjeuLevel && level !== "eee" ? " (heuristic)" : ""}`;
}