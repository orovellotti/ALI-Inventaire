import { getTaxonGroupId, isMarineSpecies, type Occurrence } from "./gbif";
import { concernBucket } from "./concern";
import { occurrenceKey } from "./resultKeys";
import type { PotentialSpeciesResult } from "@shared/types";

export interface StudySpeciesFilters {
  /** undefined = no group filter; an empty selection deliberately selects none. */
  activeTaxonGroups?: readonly string[];
  excludeMarine: boolean;
}

export function selectInventorySpecies(
  occurrences: readonly Occurrence[],
  filters: StudySpeciesFilters,
): Occurrence[] {
  const byTaxon = new Map<string, Occurrence>();
  const alertRank = { high: 3, medium: 2, low: 1 };
  for (const occurrence of occurrences) {
    if (filters.excludeMarine && isMarineSpecies(occurrence)) continue;
    const key = occurrenceKey(occurrence);
    const existing = byTaxon.get(key);
    if (!existing) {
      byTaxon.set(key, occurrence);
      continue;
    }
    // A legacy alert must not displace an explicitly enriched territorial result.
    const preferred = (!existing.enjeuLevel && occurrence.enjeuLevel) ||
      (!existing.enjeuLevel && !occurrence.enjeuLevel &&
        alertRank[occurrence.alertLevel] > alertRank[existing.alertLevel])
      ? occurrence : existing;
    byTaxon.set(key, {
      ...preferred,
      isInvasive: existing.isInvasive || occurrence.isInvasive,
      sourceNames: Array.from(new Set([
        ...(existing.sourceNames ?? [existing.scientificName]),
        ...(occurrence.sourceNames ?? [occurrence.scientificName]),
      ])),
      enjeuWarnings: Array.from(new Set([
        ...(existing.enjeuWarnings ?? []), ...(occurrence.enjeuWarnings ?? []),
      ])),
    });
  }
  const groups = filters.activeTaxonGroups === undefined ? null : new Set(filters.activeTaxonGroups);
  return Array.from(byTaxon.values()).filter((occurrence) =>
    !groups || groups.has(getTaxonGroupId(occurrence)),
  );
}

export function selectedInventoryCounts(species: readonly Occurrence[]) {
  return {
    speciesCount: species.length,
    sensitiveCount: species.filter((item) => concernBucket(item) !== "low").length,
    marineSpeciesCount: species.filter(isMarineSpecies).length,
  };
}

const GROUP_ALIASES: Record<string, string[]> = {
  birds: ["oiseaux"], oiseaux: ["oiseaux"],
  mammals: ["mammiferes"], mammiferes: ["mammiferes"],
  reptiles: ["reptiles"], amphibians: ["amphibiens"], amphibiens: ["amphibiens"],
  fish: ["poissons"], poissons: ["poissons"],
  plants: ["plantes"], plantes: ["plantes"], "terrestrial plants": ["plantes"],
  insects: ["insectes"], insectes: ["insectes"],
  arachnids: ["arachnides"], arachnides: ["arachnides"],
  molluscs: ["mollusques"], mollusques: ["mollusques"],
  fungi: ["champignons"], champignons: ["champignons"],
  invertebrates: ["insectes", "arachnides", "crustaces", "myriapodes", "mollusques", "annelides", "cnidaires", "echinodermes", "eponges", "autres-invertebres"],
  invertebres: ["insectes", "arachnides", "crustaces", "myriapodes", "mollusques", "annelides", "cnidaires", "echinodermes", "eponges", "autres-invertebres"],
};

function normalized(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase().replace(/\s+/g, " ");
}

/** Uses known inventory taxonomy first, then the source's documented broad group.
 * Unknown marine affinity is retained, never guessed from a name or score.
 */
export function selectSupportingSpecies<T extends { scientificName: string }>(
  species: readonly T[],
  groupOf: (item: T) => string,
  filters: StudySpeciesFilters,
  inventory: readonly Occurrence[],
): T[] {
  const inventoryByName = new Map<string, Occurrence[]>();
  for (const occurrence of inventory) {
    const key = normalized(occurrence.scientificName);
    inventoryByName.set(key, [...(inventoryByName.get(key) ?? []), occurrence]);
  }
  const active = filters.activeTaxonGroups === undefined ? null : new Set(filters.activeTaxonGroups);
  return species.filter((item) => {
    const known = inventoryByName.get(normalized(item.scientificName));
    if (known) return selectInventorySpecies(known, filters).length > 0;
    if (!active) return true;
    const group = normalized(groupOf(item));
    const candidates = GROUP_ALIASES[group] ?? [group];
    return candidates.some((candidate) => active.has(candidate));
  });
}

export function selectPotentialSpecies(
  result: PotentialSpeciesResult | null,
  filters: StudySpeciesFilters,
  inventory: readonly Occurrence[],
): PotentialSpeciesResult | null {
  if (!result) return null;
  const species = selectSupportingSpecies(result.species, (item) => item.speciesGroup, filters, inventory);
  const documentary = selectSupportingSpecies(result.znieff.species, (item) => item.speciesGroup, filters, inventory);
  return {
    ...result,
    species,
    observedCount: species.filter((item) => item.observed).length,
    potentialCount: species.filter((item) => !item.observed).length,
    evaluatedCount: species.filter((item) => item.score !== null).length,
    znieff: { ...result.znieff, species: documentary, speciesCount: documentary.length },
  };
}

export const STUDY_SELECTION_CAVEAT =
  "Species conclusions and counts use the active taxonomic and marine filters. Raw source statistics, confidence, enrichment totals, sites and habitat metadata describe the original consultation, not a recalculated filtered assessment. Supporting taxa use matched inventory taxonomy or documented broad source groups; broad groups cannot resolve subgroups, and unknown marine affinity is not guessed. Source scores and scientific provenance are unchanged. Exclusion by a user filter never establishes absence.";