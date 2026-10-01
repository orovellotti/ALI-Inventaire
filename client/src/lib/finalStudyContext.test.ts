import test from "node:test";
import assert from "node:assert/strict";
import { buildFinalStudyContext, serializeFinalStudyContext, buildFinalStudyRequestSnapshot } from "./finalStudyContext";
import { TAXON_GROUPS } from "./gbif";
import type { FinalStudyContextInput } from "./finalStudyContext";

const allGroups = TAXON_GROUPS.map((group) => group.id);

test("transmet toutes les familles de contexte générées par l'application", () => {
  const context = buildFinalStudyContext({
    requestSummary: "Étudier le site",
    toponym: "Site test",
    inventory: {
      occurrences: [{
        key: 1,
        scientificName: "Testus test",
        decimalLatitude: 43,
        decimalLongitude: 5,
        alertLevel: "low",
        kingdom: "Plantae",
        aliStatuses: [{ category: "Liste rouge régionale", value: "VU", label: "Vulnérable", tone: "warn", scope: "PACA" }],
        enjeuLevel: "fort",
      }],
      stats: { total: 1, speciesCount: 1, sensitiveCount: 1 },
      center: [43, 5],
      radius: 2000,
      circles: [{ id: "main", center: [43, 5], radius: 2000, label: "Site", enabled: true }],
      confidence: { total: 80, geo: 80, tax: 80, time: 80, trace: 80, issues: 80, dup: 80, interpretation: "excellent", message: "OK", rawCount: 1, filteredCount: 1, dedupCount: 1 },
    },
    zonages: { lat: 43, lng: 5, radius: 2000, count: 1, errors: [], groups: [{ category: "natura", label: "Natura 2000", count: 1, zonages: [{ category: "natura", type: "ZSC", name: "Zone test", url: null, id: "1" }] }] },
    potentialSpecies: null,
    priorityAnalysis: null,
    carhabSummary: { habitats: [{ label: "Pelouse" }] },
    filters: { activeTaxonGroups: ["plantes"], excludeMarine: true, includeINaturalist: false },
    states: { zonagesLoading: false, potentialSpeciesLoading: false, potentialSpeciesError: false, habitatConsultation: "success" },
  });

  assert.equal(context.request.place, "Site test");
  assert.equal(context.inventory.species.items[0].territorialStatuses?.[0].scope, "PACA");
  assert.equal(context.zonages.results.items[0].name, "Zone test");
  assert.deepEqual(context.habitats.carhab, { habitats: [{ label: "Pelouse" }] });
  assert.equal(context.potentialSpecies.state, "unavailable");
  assert.match(JSON.stringify(context), /contextLimits/);
});

test("déclare explicitement les espèces omises par la borne de contexte", () => {
  const occurrences = Array.from({ length: 190 }, (_, index) => ({
    key: index + 1,
    scientificName: `Species ${index}`,
    decimalLatitude: 43,
    decimalLongitude: 5,
    alertLevel: "low" as const,
  }));
  const context = buildFinalStudyContext({
    inventory: {
      occurrences,
      stats: { total: 190, speciesCount: 190, sensitiveCount: 0 },
      center: [43, 5],
      radius: 2000,
      circles: [],
      confidence: { total: 50, geo: 50, tax: 50, time: 50, trace: 50, issues: 50, dup: 50, interpretation: "moderate", message: "Partiel", rawCount: 190, filteredCount: 190, dedupCount: 190 },
    },
    zonages: null,
    potentialSpecies: null,
    priorityAnalysis: null,
    carhabSummary: null,
    filters: { activeTaxonGroups: allGroups, excludeMarine: false, includeINaturalist: false },
    states: { zonagesLoading: false, potentialSpeciesLoading: false, potentialSpeciesError: false, habitatConsultation: "unavailable" },
  });

  assert.equal(context.inventory.species.totalCount, 190);
  assert.equal(context.inventory.species.items.length, 180);
  assert.equal(context.inventory.species.omittedCount, 10);
  assert.ok(serializeFinalStudyContext(context).length <= 110_000);
});

test("relie une espèce potentielle à son statut UICN régional sans affirmer sa présence", () => {
  const context = buildFinalStudyContext({
    inventory: {
      occurrences: [],
      stats: { total: 0, speciesCount: 0, sensitiveCount: 0 },
      center: [43, 5],
      radius: 2000,
      circles: [],
      confidence: { total: 50, geo: 50, tax: 50, time: 50, trace: 50, issues: 50, dup: 50, interpretation: "moderate", message: "Partiel", rawCount: 0, filteredCount: 0, dedupCount: 0 },
    },
    zonages: null,
    potentialSpecies: {
      species: [{
        scientificName: "Testus potentialis",
        speciesGroup: "Oiseaux",
        observed: false,
        status: "Potentielle",
        score: 60,
        confidence: "Moyen",
        reasons: ["Habitat compatible"],
        sites: [],
        habitats: [],
      }],
      observedCount: 0,
      potentialCount: 1,
      evaluatedCount: 1,
      siteCount: 1,
      habitatCount: 1,
      partial: false,
      reference: { id: "test", title: "Test", publisher: "Test", sourceUrl: "https://example.test", sourceUpdated: "2026-01-01" },
      znieff: { species: [], speciesCount: 0, siteCount: 0, partial: false, reference: { id: "z", title: "Z", publisher: "Z", sourceUrl: "https://example.test", sourceUpdated: "2026-01-01", sourceVersion: "1" } },
      generatedAt: "2026-01-01T00:00:00.000Z",
    },
    priorityAnalysis: {
      toponym: "Site test",
      generatedAt: "2026-01-01T00:00:00.000Z",
      species: [{
        scientificName: "Testus potentialis",
        group: "Oiseaux",
        icon: "",
        reason: "Natura 2000",
        level: "fort",
        inInventory: false,
        evidenceClass: "C",
        evidenceLabel: "Très probable localement",
        score: 70,
        scoreLabel: "70",
        statuses: [{ category: "Liste rouge régionale", value: "EN", label: "En danger", tone: "danger", scope: "PACA" }],
      }],
      natura2000: [],
      mcpTrace: [],
    },
    carhabSummary: null,
    filters: { activeTaxonGroups: allGroups, excludeMarine: false, includeINaturalist: false },
    states: { zonagesLoading: false, potentialSpeciesLoading: false, potentialSpeciesError: false, habitatConsultation: "complete" },
  });

  const potential = context.potentialSpecies.species.items[0];
  assert.equal(potential.regionalRedList?.value, "EN");
  assert.match(potential.issueInterpretation ?? "", /Potentially high.*field confirmation/i);
  assert.equal(potential.observed, false);
});

test("out-of-coverage French sources stay unavailable, not zero findings, in the generation context", () => {
  const context = buildFinalStudyContext({
    inventory: {
      occurrences: [{
        key: 1, scientificName: "Testus documented", decimalLatitude: 51, decimalLongitude: 0,
        alertLevel: "low", frenchProtected: false,
        aliStatuses: [{ category: "Liste rouge régionale", value: "VU", label: "Vulnerable", tone: "warn" }],
      }],
      stats: { total: 1, speciesCount: 1, sensitiveCount: 0 },
      center: [51, 0], radius: 2000, circles: [],
      coverage: { countryCode: "GB", country: "United Kingdom", globalOccurrences: true, frenchSources: false, unavailableSources: ["French SINP", "CARHAB habitats"] },
      confidence: { total: 70, geo: 70, tax: 70, time: 70, trace: 70, issues: 70, dup: 70, interpretation: "good", message: "Good", rawCount: 1, filteredCount: 1, dedupCount: 1 },
    },
    zonages: null, potentialSpecies: null, priorityAnalysis: null, carhabSummary: null,
    filters: { activeTaxonGroups: allGroups, excludeMarine: false, includeINaturalist: true },
    states: { zonagesLoading: false, potentialSpeciesLoading: false, potentialSpeciesError: false, habitatConsultation: "idle" },
  });
  assert.equal(context.zonages.state, "out_of_coverage");
  assert.equal(context.potentialSpecies.state, "out_of_coverage");
  assert.equal(context.habitats.consultationState, "out_of_coverage");
  assert.equal(context.inventory.species.totalCount, 1);
  assert.equal(context.inventory.species.items[0].territorialStatuses, null);
  assert.equal(context.inventory.species.items[0].protectedInFrance, null);
  assert.match(context.coverageCaveat ?? "", /never be interpreted as zero findings/i);
});

test("filtered conclusions exclude marine and deselected taxa while preserving raw scientific metadata", () => {
  const inventory = {
    occurrences: [
      { key: 1, scientificName: "Testus bird", class: "Aves", decimalLatitude: 43, decimalLongitude: 5, alertLevel: "high" as const, enjeuLevel: "modere" as const, source: "gbif" as const, sourceNames: ["Bird authority"] },
      { key: 2, scientificName: "Testus marine", class: "Cephalopoda", phylum: "Mollusca", decimalLatitude: 43, decimalLongitude: 5, alertLevel: "high" as const, enjeuLevel: "fort" as const },
      { key: 3, scientificName: "Testus plant", kingdom: "Plantae", decimalLatitude: 43, decimalLongitude: 5, alertLevel: "high" as const, enjeuLevel: "critique" as const },
    ],
    stats: { total: 18, speciesCount: 3, sensitiveCount: 3, rawNameCount: 4, duplicatesRemoved: 1 },
    center: [43, 5] as [number, number], radius: 2000, circles: [],
    confidence: { total: 70, geo: 70, tax: 70, time: 70, trace: 70, issues: 70, dup: 70, interpretation: "good" as const, message: "Good", rawCount: 20, filteredCount: 18, dedupCount: 3 },
  };
  const potentialSpecies = {
    species: [
      { scientificName: "Testus bird", speciesGroup: "Birds", observed: false, status: "Potentielle" as const, score: 60, confidence: "Moyen" as const, reasons: ["Source reason"], sites: [{ code: "FR1", name: "Source site" }], habitats: [] },
      { scientificName: "Testus marine", speciesGroup: "Invertebrates", observed: false, status: "Potentielle" as const, score: 99, confidence: "Élevé" as const, reasons: [], sites: [], habitats: [] },
      { scientificName: "Testus plant", speciesGroup: "Plants", observed: false, status: "Potentielle" as const, score: 98, confidence: "Élevé" as const, reasons: [], sites: [], habitats: [] },
    ],
    observedCount: 0, potentialCount: 3, evaluatedCount: 3, siteCount: 1, habitatCount: 0, partial: true,
    errors: ["One reference unavailable"],
    reference: { id: "reference", title: "Scientific reference", publisher: "Publisher", sourceUrl: "https://example.test", sourceUpdated: "2026-01-01" },
    znieff: { species: [], speciesCount: 0, siteCount: 0, partial: false, reference: { id: "z", title: "Z", publisher: "Z", sourceUrl: "https://example.test", sourceUpdated: "2026-01-01", sourceVersion: "1" } },
    generatedAt: "2026-01-01T00:00:00.000Z",
  };
  const original = structuredClone({ inventory, potentialSpecies });
  const input = {
    inventory, potentialSpecies, zonages: null, priorityAnalysis: null, carhabSummary: null,
    filters: { activeTaxonGroups: ["oiseaux", "mollusques"], excludeMarine: true, includeINaturalist: true },
    states: { zonagesLoading: false, potentialSpeciesLoading: false, potentialSpeciesError: false, habitatConsultation: "complete" },
  };
  const context = buildFinalStudyContext(input);
  assert.deepEqual(context.inventory.species.items.map((item) => item.scientificName), ["Testus bird"]);
  assert.equal(context.inventory.statistics.speciesCount, 1);
  assert.deepEqual(context.inventory.rawStatistics, original.inventory.stats);
  assert.deepEqual(context.inventory.confidence, original.inventory.confidence);
  assert.deepEqual(context.inventory.species.items[0].observation.sourceNames, ["Bird authority"]);
  assert.equal(context.inventory.species.items[0].displayConcern, "modere");
  assert.equal(context.potentialSpecies.species.totalCount, 1);
  assert.equal(context.potentialSpecies.species.items[0].score, 60);
  assert.equal(context.potentialSpecies.species.items[0].observed, true);
  assert.equal(context.potentialSpecies.counts.observed, 1);
  assert.equal(context.potentialSpecies.rawCounts.potential, 3);
  assert.equal(context.potentialSpecies.reference.publisher, "Publisher");
  assert.deepEqual(context.potentialSpecies.errors, ["One reference unavailable"]);
  assert.match(context.inventory.selection.rule, /never establishes absence/);
  assert.deepEqual({ inventory, potentialSpecies }, original);

  const empty = buildFinalStudyContext({ ...input, filters: { ...input.filters, activeTaxonGroups: [] } });
  assert.equal(empty.inventory.species.totalCount, 0);
  assert.equal(empty.potentialSpecies.species.totalCount, 0);
  assert.equal(empty.inventory.rawStatistics.speciesCount, 3);

  const request = buildFinalStudyRequestSnapshot("Confirmed source report", input);
  inventory.occurrences[0].scientificName = "Changed after confirmation";
  input.filters.activeTaxonGroups.length = 0;
  potentialSpecies.species[0].score = 1;
  const frozen = JSON.parse(request.context);
  assert.equal(request.report, "Confirmed source report");
  assert.equal(frozen.inventory.species.items[0].scientificName, "Testus bird");
  assert.deepEqual(frozen.request.filters.activeTaxonGroups, ["oiseaux", "mollusques"]);
  assert.equal(frozen.potentialSpecies.species.items[0].score, 60);
});

test("canonical context preserves unavailable and partial occurrence sources and both enrichment traces", () => {
  const enrichment = {
    source: "ALI Species MCP" as const, territorialScope: "multiple" as const,
    attempted: 2, enriched: 0, failed: 2, skipped: 1, partial: true,
    error: "ALI deadline exceeded", nameResolutionAttempted: 2, nameResolved: 0,
  };
  const input: FinalStudyContextInput = {
    inventory: {
      occurrences: [], stats: { total: 0, speciesCount: 0, sensitiveCount: 0 },
      center: [43, 5], radius: 2000,
      circles: [
        { id: "fr", center: [43, 5], radius: 2000, label: "France", enabled: true },
        { id: "outside", center: [51, 0], radius: 1000, label: "Second area", enabled: true },
        { id: "disabled", center: [45, 6], radius: 500, label: "Disabled", enabled: false },
      ],
      confidence: { total: 0, geo: 0, tax: 0, time: 0, trace: 0, issues: 0, dup: 0, interpretation: "low", message: "Collection incomplete", rawCount: 0, filteredCount: 0, dedupCount: 0 },
      sourceStatus: {
        gbif: { state: "unavailable", error: "GBIF request failed" },
        inaturalist: { state: "partial", error: "One study area could not be collected" },
      },
      aliSpeciesEnrichment: enrichment,
    },
    priorityAnalysis: {
      toponym: "Study", species: [], generatedAt: "2026-01-01T00:00:00.000Z",
      aliSpeciesEnrichment: { ...enrichment, attempted: 0, failed: 0, skipped: 3, error: "ALI source unavailable" },
      coverage: { countryCode: "MULTIPLE", globalOccurrences: true, frenchSources: false, unavailableSources: ["French territorial sources"] },
    },
    zonages: null, potentialSpecies: null, carhabSummary: null,
    filters: { activeTaxonGroups: allGroups, excludeMarine: false, includeINaturalist: true },
    states: { zonagesLoading: false, potentialSpeciesLoading: false, potentialSpeciesError: false, habitatConsultation: "error" },
  };
  const original = structuredClone(input);
  const context = buildFinalStudyContext(input);
  assert.deepEqual(context.inventory.sourceStatus, input.inventory.sourceStatus);
  assert.equal(context.inventory.sourceWarnings.length, 2);
  assert.match(context.inventory.sourceWarnings[0], /GBIF request failed.*not a finding of zero species/);
  assert.match(context.inventory.sourceWarnings[1], /partial.*could not be collected/);
  assert.deepEqual(context.inventory.aliSpeciesEnrichment, enrichment);
  assert.match(context.inventory.enrichmentWarning ?? "", /ALI deadline exceeded.*unknown, not verified absent/);
  assert.equal(context.priorityAnalysis?.aliSpeciesEnrichment?.attempted, 0);
  assert.match(context.priorityAnalysis?.enrichmentWarning ?? "", /ALI source unavailable.*no low-concern conclusion/);
  assert.equal(context.priorityAnalysis?.coverage?.frenchSources, false);
  assert.match(context.priorityAnalysis?.coverageWarning ?? "", /not consulted.*not zero findings/);
  assert.deepEqual(context.request.studyAreas, original.inventory.circles);
  const serialized = JSON.parse(serializeFinalStudyContext(context));
  assert.equal(serialized.inventory.sourceStatus.gbif.state, "unavailable");
  assert.equal(serialized.priorityAnalysis.aliSpeciesEnrichment.error, "ALI source unavailable");
  assert.deepEqual(input, original);

  const legacy = buildFinalStudyContext({
    ...input,
    inventory: { ...input.inventory, sourceStatus: undefined, aliSpeciesEnrichment: undefined },
    priorityAnalysis: { ...input.priorityAnalysis!, aliSpeciesEnrichment: undefined },
  });
  assert.equal(legacy.inventory.sourceStatus, null);
  assert.match(legacy.inventory.sourceStatusRule, /unknown, not confirmation/);
  assert.equal(legacy.priorityAnalysis?.aliSpeciesEnrichment, null);
});