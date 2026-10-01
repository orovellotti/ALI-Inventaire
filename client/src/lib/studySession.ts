import type { StudyCoverage } from "@shared/types";
import type {
  AnalysisConversation,
  AnalysisConversationParameters,
} from "./analysisHistory";

/** A result owns its launch settings, never the mutable next-analysis draft. */
export function snapshotStudyParameters(
  parameters: AnalysisConversationParameters,
): AnalysisConversationParameters {
  return structuredClone(parameters);
}

export function isStudyCoverage(value: unknown): value is StudyCoverage {
  if (!value || typeof value !== "object") return false;
  const coverage = value as Partial<StudyCoverage>;
  return typeof coverage.countryCode === "string" &&
    coverage.countryCode.trim().length > 0 &&
    typeof coverage.frenchSources === "boolean" &&
    typeof coverage.globalOccurrences === "boolean" &&
    Array.isArray(coverage.unavailableSources) &&
    coverage.unavailableSources.every((source) => typeof source === "string");
}

/**
 * Inventory coverage describes the entire completed inventory (including
 * multi-country studies); a point lookup is only a fallback. Reconcile before
 * dispatching any regional agent, and do not retain an obsolete lookup error.
 */
export function resolveStudyCoverage(
  inventoryCoverage: unknown,
  lookupCoverage: unknown,
  lookupError: string | null,
): { coverage: StudyCoverage | null; error: string | null } {
  const coverage = isStudyCoverage(inventoryCoverage)
    ? inventoryCoverage
    : isStudyCoverage(lookupCoverage)
      ? lookupCoverage
      : null;
  return {
    coverage,
    error: coverage ? null : lookupError ??
      "Country coverage could not be verified. France-only sources were skipped; this is not evidence of absence.",
  };
}

/** Autosaves update progress only; draft edits cannot rewrite study provenance. */
export function updateStudyConversation(
  conversation: AnalysisConversation,
  progress: Pick<AnalysisConversation, "status" | "results" | "agentErrors" | "updatedAt">,
): AnalysisConversation {
  return { ...conversation, ...progress, parameters: conversation.parameters };
}

export function buildStudyRequestSummary(parameters: AnalysisConversationParameters): string {
  const enabled = parameters.circles.filter((circle) => circle.enabled);
  const siteLabel = parameters.projectPolygon?.name ||
    parameters.toponym.split(",")[0]?.trim() || "Selected site";
  const areaLabel = enabled
    .map((circle) => `${circle.label} (${circle.radius >= 1000 ? `${circle.radius / 1000} km` : `${circle.radius} m`})`)
    .join(", ");
  const sources = `GBIF${parameters.includeINaturalist ? " and iNaturalist" : ""}`;
  return `Site: ${siteLabel}. Study areas: ${areaLabel}. Sources: ${sources}.${parameters.projectPolygon ? " Imported boundary." : ""}`;
}