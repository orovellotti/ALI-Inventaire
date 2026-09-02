import type { Analysis } from "@/components/PrioritySpeciesInline";
import type { ZonagesData } from "@/lib/zonages";
import type { HarnessConfig } from "@shared/harness";
import type { InventoryResult, PotentialSpeciesResult } from "@shared/types";

const MAX_INVENTORY_SPECIES = 180;
const MAX_POTENTIAL_SPECIES = 100;
const MAX_ZNIEFF_SPECIES = 100;
const MAX_ZONAGES = 120;
const MAX_SERIALIZED_CONTEXT_CHARACTERS = 110_000;

function limited<T, U>(items: T[], max: number, map: (item: T) => U) {
  return {
    items: items.slice(0, max).map(map),
    totalCount: items.length,
    omittedCount: Math.max(0, items.length - max),
  };
}

function short(value: string | undefined, max = 600): string | undefined {
  if (!value) return undefined;
  return value.length <= max ? value : `${value.slice(0, max)} […]`;
}

export interface FinalStudyContextInput {
  requestSummary?: string;
  toponym?: string;
  inventory: InventoryResult;
  zonages: ZonagesData | null;
  potentialSpecies: PotentialSpeciesResult | null;
  priorityAnalysis: Analysis | null;
  carhabSummary: unknown;
  harnessConfig?: HarnessConfig;
  filters: {
    activeTaxonGroups: string[];
    excludeMarine: boolean;
    includeINaturalist: boolean;
  };
  states: {
    zonagesLoading: boolean;
    potentialSpeciesLoading: boolean;
    potentialSpeciesError: boolean;
    habitatConsultation: string;
  };
}

export function buildFinalStudyContext(input: FinalStudyContextInput) {
  const inventorySpecies = [...input.inventory.occurrences].sort((a, b) => {
    const rank = { critique: 5, fort: 4, modere: 3, a_confirmer: 2, faible: 1 };
    return (rank[b.enjeuLevel ?? "faible"] - rank[a.enjeuLevel ?? "faible"])
      || ((b.observationCount ?? 0) - (a.observationCount ?? 0))
      || a.scientificName.localeCompare(b.scientificName);
  });
  const zonageItems = input.zonages?.groups.flatMap((group) =>
    group.zonages.map((zonage) => ({
      group: group.label,
      category: zonage.category,
      type: zonage.type,
      name: zonage.name,
      id: zonage.id,
      code: zonage.code,
      url: zonage.url,
      geometryAvailable: !!zonage.geometry,
    })),
  ) ?? [];

  return {
    schemaVersion: 1,
    purpose: "Contexte structuré canonique de la pré-étude ALi Inventaire",
    request: {
      summary: input.requestSummary,
      place: input.toponym,
      center: input.inventory.center,
      radiusMeters: input.inventory.radius,
      studyAreas: input.inventory.circles,
      filters: input.filters,
    },
    inventory: {
      statistics: input.inventory.stats,
      confidence: input.inventory.confidence,
      aliSpeciesEnrichment: input.inventory.aliSpeciesEnrichment ?? null,
      species: limited(inventorySpecies, MAX_INVENTORY_SPECIES, (species) => ({
        scientificName: species.scientificName,
        frenchName: species.vernacularName,
        englishName: species.englishName,
        taxonomy: {
          kingdom: species.kingdom,
          phylum: species.phylum,
          class: species.class,
          order: species.order,
          family: species.family,
        },
        identifiers: { gbif: species.taxonKey, taxref: species.cdNom },
        observation: {
          latitude: species.decimalLatitude,
          longitude: species.decimalLongitude,
          count: species.observationCount,
          lastYear: species.lastObservationYear,
          source: species.source,
          sourceUrl: species.sourceUrl,
          sourceNames: species.sourceNames,
        },
        habitatType: species.habitatType,
        globalIucnContext: species.iucnStatus,
        territorialStatuses: species.aliStatuses,
        enjeuLevel: species.enjeuLevel,
        enjeuWarnings: species.enjeuWarnings,
        invasive: species.isInvasive,
        protectedInFrance: species.frenchProtected,
      })),
    },
    zonages: {
      state: input.states.zonagesLoading ? "loading" : input.zonages ? "complete" : "unavailable",
      errors: input.zonages?.errors ?? [],
      results: limited(zonageItems, MAX_ZONAGES, (zone) => zone),
    },
    habitats: {
      consultationState: input.states.habitatConsultation,
      carhab: input.carhabSummary,
    },
    potentialSpecies: input.potentialSpecies
      ? {
          generatedAt: input.potentialSpecies.generatedAt,
          partial: input.potentialSpecies.partial,
          counts: {
            observed: input.potentialSpecies.observedCount,
            potential: input.potentialSpecies.potentialCount,
            evaluated: input.potentialSpecies.evaluatedCount,
            sites: input.potentialSpecies.siteCount,
            habitats: input.potentialSpecies.habitatCount,
          },
          reference: input.potentialSpecies.reference,
          species: limited(input.potentialSpecies.species, MAX_POTENTIAL_SPECIES, (species) => ({
            scientificName: species.scientificName,
            group: species.speciesGroup,
            observed: species.observed,
            status: species.status,
            score: species.score,
            confidence: species.confidence,
            reasons: species.reasons.map((reason) => short(reason)),
            sites: species.sites,
            habitats: species.habitats,
          })),
          znieffDocumentarySpecies: {
            partial: input.potentialSpecies.znieff.partial,
            reference: input.potentialSpecies.znieff.reference,
            species: limited(input.potentialSpecies.znieff.species, MAX_ZNIEFF_SPECIES, (species) => species),
          },
        }
      : {
          state: input.states.potentialSpeciesLoading
            ? "loading"
            : input.states.potentialSpeciesError ? "error" : "unavailable",
        },
    priorityAnalysis: input.priorityAnalysis
      ? {
          generatedAt: input.priorityAnalysis.generatedAt,
          species: input.priorityAnalysis.species,
          natura2000: input.priorityAnalysis.natura2000,
          mcpTrace: input.priorityAnalysis.mcpTrace?.map((trace) => ({
            agentId: trace.agentId,
            mcpId: trace.mcpId,
            toolId: trace.toolId,
            status: trace.status,
            startedAt: trace.startedAt,
            durationMs: trace.durationMs,
            summary: short(trace.summary),
          })),
        }
      : null,
    harness: {
      agents: input.harnessConfig?.agents.filter((agent) => agent.enabled).map((agent) => ({
        id: agent.id,
        name: agent.name,
        description: agent.description,
        native: agent.native,
      })) ?? [],
    },
    contextLimits: {
      inventorySpecies: MAX_INVENTORY_SPECIES,
      potentialSpecies: MAX_POTENTIAL_SPECIES,
      znieffSpecies: MAX_ZNIEFF_SPECIES,
      zonages: MAX_ZONAGES,
      rule: "Chaque section expose totalCount et omittedCount ; aucune omission n’est implicite.",
    },
  };
}

export function serializeFinalStudyContext(
  context: ReturnType<typeof buildFinalStudyContext>,
): string {
  const draft = structuredClone(context);
  type BoundedCollection = { items: unknown[]; totalCount: number; omittedCount: number };
  const collections: BoundedCollection[] = [
    draft.inventory.species as BoundedCollection,
    draft.zonages.results as BoundedCollection,
  ];
  const potentialCollections = draft.potentialSpecies as {
    species?: BoundedCollection;
    znieffDocumentarySpecies?: { species: BoundedCollection };
  };
  if (potentialCollections.species) {
    collections.push(potentialCollections.species);
  }
  if (potentialCollections.znieffDocumentarySpecies?.species) {
    collections.push(potentialCollections.znieffDocumentarySpecies.species);
  }

  let serialized = JSON.stringify(draft, (_key, value) =>
    typeof value === "string" && value.length > 2_000
      ? `${value.slice(0, 2_000)} […]`
      : value,
  );

  while (serialized.length > MAX_SERIALIZED_CONTEXT_CHARACTERS) {
    const collection = collections
      .filter((candidate) => candidate.items.length > 0)
      .sort((a, b) => b.items.length - a.items.length)[0];
    if (!collection) break;
    const removed = collection.items.splice(Math.max(0, collection.items.length - 10));
    collection.omittedCount += removed.length;
    serialized = JSON.stringify(draft);
  }

  if (serialized.length > MAX_SERIALIZED_CONTEXT_CHARACTERS) {
    throw new Error("Le contexte scientifique dépasse la taille exploitable, même après agrégation.");
  }
  return serialized;
}