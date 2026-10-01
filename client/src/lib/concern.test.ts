import assert from "node:assert/strict";
import test from "node:test";
import type { Occurrence } from "@shared/types";
import { classifyConcern, concernBucket, concernLabel } from "./concern";

const occurrence: Occurrence = {
  key: 1, scientificName: "Testus test", decimalLatitude: 43, decimalLongitude: 5,
  alertLevel: "high", iucnStatus: "CR",
};

test("territorial classifications always outrank conflicting legacy alerts", () => {
  for (const level of ["critique", "fort", "modere", "a_confirmer", "faible"] as const) {
    assert.equal(classifyConcern({ ...occurrence, enjeuLevel: level }), level);
  }
  assert.equal(concernBucket({ ...occurrence, enjeuLevel: "modere" }), "medium");
  assert.equal(concernLabel({ ...occurrence, enjeuLevel: "a_confirmer" }), "To confirm");
  assert.equal(concernBucket({ ...occurrence, enjeuLevel: "faible" }), "low");
});

test("EEE are management concerns regardless of territorial or global threat status", () => {
  const invasive = { ...occurrence, enjeuLevel: "critique" as const, isInvasive: true };
  assert.equal(classifyConcern(invasive), "eee");
  assert.equal(concernBucket(invasive), "low");
  assert.match(concernLabel(invasive), /management concern/);
});

test("legacy fallback is preserved and identified as heuristic", () => {
  assert.equal(classifyConcern(occurrence), "critique");
  assert.equal(concernLabel({ ...occurrence, iucnStatus: "LC" }), "High (heuristic)");
  assert.equal(concernLabel({ ...occurrence, alertLevel: "medium" }), "Moderate (heuristic)");
});

test("global-only plant threat cannot become a strong territorial concern", () => {
  const plant = { ...occurrence, kingdom: "Plantae" };
  assert.equal(classifyConcern(plant), "a_confirmer");
  assert.equal(concernBucket(plant), "medium");
  assert.equal(classifyConcern({ ...plant, enjeuLevel: "fort" }), "fort");
  assert.equal(classifyConcern({ ...plant, alertLevel: "low" }), "faible");
});