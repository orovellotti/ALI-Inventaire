import assert from "node:assert/strict";
import test from "node:test";
import { evaluatePotentialSpecies } from "./potentialSpeciesScore";
import {
  EEA_ECOLOGICAL_REFERENCE_META,
  EEA_HABITAT_ECOLOGICAL_GROUPS,
  EEA_SPECIES_ECOLOGICAL_GROUPS,
} from "../data/eeaEcologicalGroups";

const compatibleSite = {
  code: "FR0000001",
  name: "Site test",
  habitats: [{ code: "1310", description: "Végétations pionnières à Salicornia", cover: 25 }],
  metrics: { overlapRatio: 0.5, distanceM: 0 },
};

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function recordKeyComparator(a: string, b: string): number {
  const aIsInteger = /^(0|[1-9]\d*)$/.test(a) && Number(a) < 4_294_967_295;
  const bIsInteger = /^(0|[1-9]\d*)$/.test(b) && Number(b) < 4_294_967_295;
  if (aIsInteger && bIsInteger) return Number(a) - Number(b);
  if (aIsInteger) return -1;
  if (bIsInteger) return 1;
  return compareText(a, b);
}

function compareGroups(
  a: { code: string; label: string; level: string },
  b: { code: string; label: string; level: string },
): number {
  return (
    compareText(a.code, b.code) ||
    compareText(a.label, b.label) ||
    compareText(a.level, b.level)
  );
}

test("charge une version EEA DAT-143 traçable et suffisamment complète", () => {
  assert.equal(EEA_ECOLOGICAL_REFERENCE_META.id, "DAT-143-en");
  assert.equal(
    EEA_ECOLOGICAL_REFERENCE_META.recordId,
    "c9d7703d-734d-4471-8467-f768063f38dc",
  );
  assert.match(EEA_ECOLOGICAL_REFERENCE_META.archiveVersion, /^v\d{2}_r\d{2}$/);
  assert.match(EEA_ECOLOGICAL_REFERENCE_META.sourceUpdated, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(EEA_ECOLOGICAL_REFERENCE_META.workbookSha256, /^[a-f0-9]{64}$/);
  assert.ok(Object.keys(EEA_HABITAT_ECOLOGICAL_GROUPS).length >= 200);
  assert.ok(Object.keys(EEA_SPECIES_ECOLOGICAL_GROUPS).length >= 1_400);
});

test("préserve les correspondances EEA utilisées par le score écologique", () => {
  const habitatGroups = EEA_HABITAT_ECOLOGICAL_GROUPS["1310"];
  const speciesGroups =
    EEA_SPECIES_ECOLOGICAL_GROUPS["triturus cristatus"].groups;
  assert.ok(habitatGroups.some((group) => group.code === "5_Wetlands"));
  assert.ok(speciesGroups.some((group) => group.code === "5_Wetlands"));
});

test("conserve un ordre canonique indépendant de l'ordre des lignes source", () => {
  const habitatKeys = Object.keys(EEA_HABITAT_ECOLOGICAL_GROUPS);
  const speciesKeys = Object.keys(EEA_SPECIES_ECOLOGICAL_GROUPS);
  assert.deepEqual(habitatKeys, [...habitatKeys].sort(recordKeyComparator));
  assert.deepEqual(speciesKeys, [...speciesKeys].sort(recordKeyComparator));

  for (const groups of Object.values(EEA_HABITAT_ECOLOGICAL_GROUPS)) {
    assert.deepEqual(groups, [...groups].sort(compareGroups));
  }
  for (const profile of Object.values(EEA_SPECIES_ECOLOGICAL_GROUPS)) {
    assert.deepEqual(
      profile.groups,
      [...profile.groups].sort(
        (a, b) =>
          compareGroups(a, b) ||
          compareText(a.preference, b.preference) ||
          compareText(a.lifeStage, b.lifeStage),
      ),
    );
  }
});

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