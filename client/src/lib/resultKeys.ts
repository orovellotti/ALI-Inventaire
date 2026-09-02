import type { Occurrence } from "@shared/types";

export function occurrenceKey(occurrence: Occurrence): string {
  if (occurrence.cdNom != null) return `taxref::${occurrence.cdNom}`;
  if (occurrence.taxonKey != null) {
    return `${occurrence.source ?? "unknown"}::taxon::${occurrence.taxonKey}`;
  }
  return `name::${occurrence.scientificName.normalize("NFKC").trim().toLowerCase()}`;
}

export function uniqueOccurrences(occurrences: Occurrence[]): Occurrence[] {
  const byTaxon = new Map<string, Occurrence>();
  for (const occurrence of occurrences) {
    const key = occurrenceKey(occurrence);
    if (!byTaxon.has(key)) byTaxon.set(key, occurrence);
  }
  return Array.from(byTaxon.values());
}