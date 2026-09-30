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
  const frenchSourcesUnavailable = input.inventory.coverage?.frenchSources === false;
  const inventorySpecies = [...input.inventory.occurrences].sort((a, b) => {
    const rank = { critique: 5, fort: 4, modere: 3, a_confirmer: 2, faible: 1 };
    return (rank[b.enjeuLevel ?? "faible"] - rank[a.enjeuLevel ?? "faible"])
      || ((b.observationCount ?? 0) - (a.observationCount ?? 0))
      || a.scientificName.localeCompare(b.scientificName);
  });
  const zonageItems = (frenchSourcesUnavailable ? null : input.zonages)?.groups.flatMap((group) =>
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
  const regionalRedListBySpecies = new Map(
    (input.priorityAnalysis?.species ?? []).flatMap((species) => {
      const regional = species.statuses?.find((status) => status.category === "Liste rouge régionale");
      return regional
        ? [[species.scientificName.trim().toLocaleLowerCase("fr").replace(/\s+/g, " "), regional] as const]
        : [];
    }),
  );

  return {
    schemaVersion: 1,
    purpose: "Canonical structured context for the ALi Inventory desk study",
    coverage: input.inventory.coverage ?? null,
    coverageCaveat: frenchSourcesUnavailable
      ? "France-only zoning, SINP, Natura 2000 / ZNIEFF species, CARHAB habitats and ALI/TAXREF statuses were not queried outside their coverage. Missing data must never be interpreted as zero findings, absence of biodiversity or no local legal protections. Consult applicable local sources and validate in the field."
      : null,
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
      aliSpeciesEnrichment: frenchSourcesUnavailable ? null : input.inventory.aliSpeciesEnrichment ?? null,
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
        territorialStatuses: frenchSourcesUnavailable ? null : species.aliStatuses,
        enjeuLevel: species.enjeuLevel,
        enjeuWarnings: species.enjeuWarnings,
        invasive: frenchSourcesUnavailable ? null : species.isInvasive,
        protectedInFrance: frenchSourcesUnavailable ? null : species.frenchProtected,
      })),
    },
    zonages: {
      state: frenchSourcesUnavailable ? "out_of_coverage" : input.states.zonagesLoading ? "loading" : input.zonages ? "complete" : "unavailable",
      errors: frenchSourcesUnavailable ? [] : input.zonages?.errors ?? [],
      results: limited(zonageItems, MAX_ZONAGES, (zone) => zone),
    },
    habitats: {
      consultationState: frenchSourcesUnavailable ? "out_of_coverage" : input.states.habitatConsultation,
      carhab: frenchSourcesUnavailable ? null : input.carhabSummary,
    },
    potentialSpecies: !frenchSourcesUnavailable && input.potentialSpecies
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
          species: limited(input.potentialSpecies.species, MAX_POTENTIAL_SPECIES, (species) => {
            const regionalRedList = regionalRedListBySpecies.get(
              species.scientificName.trim().toLocaleLowerCase("fr").replace(/\s+/g, " "),
            );
            return {
              scientificName: species.scientificName,
              group: species.speciesGroup,
              observed: species.observed,
              status: species.status,
              score: species.score,
              confidence: species.confidence,
              regionalRedList: regionalRedList ?? null,
              issueInterpretation: regionalRedList && ["CR", "EN", "VU"].includes(regionalRedList.value.toUpperCase())
                ? "Potentially high desk-based concern requiring field confirmation; presence within the project footprint is not asserted."
                : undefined,
              reasons: species.reasons.map((reason) => short(reason)),
              sites: species.sites,
              habitats: species.habitats,
            };
          }),
          znieffDocumentarySpecies: {
            partial: input.potentialSpecies.znieff.partial,
            reference: input.potentialSpecies.znieff.reference,
            species: limited(input.potentialSpecies.znieff.species, MAX_ZNIEFF_SPECIES, (species) => species),
          },
        }
      : {
          state: frenchSourcesUnavailable ? "out_of_coverage" : input.states.potentialSpeciesLoading
            ? "loading"
            : input.states.potentialSpeciesError ? "error" : "unavailable",
        },
    priorityAnalysis: !frenchSourcesUnavailable && input.priorityAnalysis
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
      agents: (frenchSourcesUnavailable ? [] : input.harnessConfig?.agents.filter((agent) => agent.enabled) ?? []).map((agent) => ({
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
      rule: "Each section specifies totalCount and omittedCount; no omission is implicit. An unavailable source is not a zero result.",
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
    throw new Error("The scientific context exceeds the supported size even after aggregation.");
  }
  return serialized;
}