import test from "node:test";
import assert from "node:assert/strict";
import { buildFinalStudyContext, serializeFinalStudyContext } from "./finalStudyContext";

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
    filters: { activeTaxonGroups: [], excludeMarine: false, includeINaturalist: false },
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
    filters: { activeTaxonGroups: [], excludeMarine: false, includeINaturalist: false },
    states: { zonagesLoading: false, potentialSpeciesLoading: false, potentialSpeciesError: false, habitatConsultation: "complete" },
  });

  const potential = context.potentialSpecies.species.items[0];
  assert.equal(potential.regionalRedList?.value, "EN");
  assert.match(potential.issueInterpretation ?? "", /potentiel élevé.*terrain/i);
  assert.equal(potential.observed, false);
});