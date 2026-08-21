import assert from "node:assert/strict";
import test from "node:test";
import { evaluatePotentialSpecies } from "./potentialSpeciesScore";

const compatibleSite = {
  code: "FR0000001",
  name: "Site test",
  habitats: [{ code: "1310", description: "Végétations pionnières à Salicornia", cover: 25 }],
  metrics: { overlapRatio: 0.5, distanceM: 0 },
};

test("classe une espèce non observée avec habitat favorable sans affirmer sa présence", () => {
  const result = evaluatePotentialSpecies({
    scientificName: "Triturus cristatus",
    speciesGroup: "Amphibians",
    observed: false,
    sites: [compatibleSite],
  });
  assert.equal(result.observed, false);
  assert.equal(result.status, "Potentielle");
  assert.ok(result.score !== null && result.score >= 45 && result.score <= 70);
  assert.equal(result.confidence, "Moyen");
  assert.ok(result.reasons.some((reason) => reason.includes("Correspondance EEA")));
});

test("l'occurrence réelle est le seul signal qui marque une espèce observée", () => {
  const observed = evaluatePotentialSpecies({
    scientificName: "Triturus cristatus",
    speciesGroup: "Amphibians",
    observed: true,
    sites: [compatibleSite],
  });
  const potential = evaluatePotentialSpecies({
    scientificName: "Triturus cristatus",
    speciesGroup: "Amphibians",
    observed: false,
    sites: [compatibleSite],
  });
  assert.equal(observed.observed, true);
  assert.equal(observed.score, potential.score);
  assert.match(observed.reasons[0], /Occurrence réelle/);
});

test("renonce au score quand les habitats sont absents", () => {
  const result = evaluatePotentialSpecies({
    scientificName: "Triturus cristatus",
    speciesGroup: "Amphibians",
    observed: false,
    sites: [{ ...compatibleSite, habitats: [] }],
  });
  assert.equal(result.status, "Non évaluée");
  assert.equal(result.score, null);
  assert.equal(result.confidence, "Faible");
});

test("renonce au score quand la géométrie est absente", () => {
  const result = evaluatePotentialSpecies({
    scientificName: "Triturus cristatus",
    speciesGroup: "Amphibians",
    observed: false,
    sites: [{ ...compatibleSite, metrics: null }],
  });
  assert.equal(result.status, "Non évaluée");
  assert.equal(result.score, null);
});

test("renonce au score pour une espèce absente du référentiel", () => {
  const result = evaluatePotentialSpecies({
    scientificName: "Testus incertus",
    speciesGroup: "Amphibians",
    observed: false,
    sites: [compatibleSite],
  });
  assert.equal(result.status, "Non évaluée");
  assert.equal(result.score, null);
  assert.ok(result.reasons.some((reason) => reason.includes("absente du référentiel")));
});

test("renonce au score quand les références explicites ne partagent aucun groupe", () => {
  const result = evaluatePotentialSpecies({
    scientificName: "Alosa fallax",
    speciesGroup: "Fish",
    observed: false,
    sites: [
      {
        ...compatibleSite,
        habitats: [{ code: "6210", description: "Pelouses sèches", cover: 30 }],
      },
    ],
  });
  assert.equal(result.status, "Non évaluée");
  assert.equal(result.score, null);
  assert.ok(result.reasons.some((reason) => reason.includes("Aucun groupe écologique commun")));
});

test("renonce à un score partiel si un site associé manque de données", () => {
  const result = evaluatePotentialSpecies({
    scientificName: "Triturus cristatus",
    speciesGroup: "Amphibians",
    observed: false,
    sites: [
      compatibleSite,
      {
        code: "FR0000002",
        name: "Site incomplet",
        habitats: [],
        metrics: null,
      },
    ],
  });
  assert.equal(result.status, "Non évaluée");
  assert.equal(result.score, null);
  assert.ok(result.reasons.some((reason) => reason.includes("aucun score partiel")));
});