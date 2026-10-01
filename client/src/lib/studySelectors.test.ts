import test from "node:test";
import assert from "node:assert/strict";
import type { Occurrence } from "@shared/types";
import { selectInventorySpecies, selectSupportingSpecies, selectedInventoryCounts } from "./studySelectors";

const bird: Occurrence = {
  key: 1, scientificName: "Testus bird", class: "Aves",
  decimalLatitude: 43, decimalLongitude: 5, alertLevel: "high",
  enjeuLevel: "modere", sourceNames: ["Bird authority"],
};
const marine: Occurrence = {
  ...bird, key: 2, scientificName: "Testus marine", class: "Cephalopoda",
  phylum: "Mollusca", enjeuLevel: "fort",
};

test("selection shares taxon/marine semantics, including an empty group selection", () => {
  assert.deepEqual(selectInventorySpecies([bird, marine], { activeTaxonGroups: ["oiseaux", "mollusques"], excludeMarine: true }), [bird]);
  assert.deepEqual(selectInventorySpecies([bird], { activeTaxonGroups: [], excludeMarine: false }), []);
  assert.equal(selectInventorySpecies([bird, marine], { excludeMarine: false }).length, 2);
  assert.deepEqual(selectedInventoryCounts([bird]), { speciesCount: 1, sensitiveCount: 1, marineSpeciesCount: 0 });
  const marineMammal = { ...bird, class: "Mammalia", habitatType: "marine" as const };
  assert.equal(selectInventorySpecies([marineMammal], { excludeMarine: true }).length, 0);
});

test("deduplication prefers territorial enrichment and preserves names and warnings without mutation", () => {
  const legacy = { ...bird, enjeuLevel: undefined, sourceNames: ["Legacy name"], enjeuWarnings: ["Legacy warning"] };
  const original = structuredClone([legacy, bird]);
  const [selected] = selectInventorySpecies([legacy, bird], { excludeMarine: false });
  assert.equal(selected.enjeuLevel, "modere");
  assert.deepEqual(selected.sourceNames, ["Legacy name", "Bird authority"]);
  assert.deepEqual(selected.enjeuWarnings, ["Legacy warning"]);
  assert.deepEqual([legacy, bird], original);
});

test("supporting species use known taxonomy and source groups without inventing marine affinity", () => {
  const species = [
    { scientificName: bird.scientificName, group: "Oiseaux", score: 70 },
    { scientificName: marine.scientificName, group: "Invertebrates", score: 99 },
    { scientificName: "Unknown bird", group: "Birds", score: 80 },
  ];
  const filtered = selectSupportingSpecies(species, (item) => item.group, { activeTaxonGroups: ["oiseaux"], excludeMarine: true }, [bird, marine]);
  assert.deepEqual(filtered.map((item) => item.score), [70, 80]);
  assert.equal(species[1].score, 99);
});