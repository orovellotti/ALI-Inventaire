import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_REFORMAT_CONTEXT_CHARACTERS,
  MAX_REFORMAT_REPORT_CHARACTERS,
  reformatBodySchema,
  priorityBodySchema,
  SlidingWindowCostLimiter,
} from "./validation";

test("accepte un rapport dépassant l'ancien plafond de 50 000 caractères", () => {
  const result = reformatBodySchema.safeParse({ report: "a".repeat(50_001), context: "{}" });
  assert.equal(result.success, true);
});

test("conserve une limite explicite contre les requêtes démesurées", () => {
  const result = reformatBodySchema.safeParse({
    report: "a".repeat(MAX_REFORMAT_REPORT_CHARACTERS + 1),
    context: "{}",
  });
  assert.equal(result.success, false);
  if (!result.success) {
    assert.match(result.error.issues[0]?.message ?? "", /200[  ]000 caractères/);
  }
});

test("borne séparément le contexte scientifique structuré", () => {
  const result = reformatBodySchema.safeParse({
    report: "Rapport",
    context: "a".repeat(MAX_REFORMAT_CONTEXT_CHARACTERS + 1),
  });
  assert.equal(result.success, false);
  if (!result.success) {
    assert.match(result.error.issues[0]?.message ?? "", /Contexte trop long/);
  }
});

const square = {
  type: "FeatureCollection" as const,
  features: [{
    type: "Feature" as const,
    properties: null,
    geometry: {
      type: "Polygon" as const,
      coordinates: [[[3, 43], [3.01, 43], [3.01, 43.01], [3, 43.01], [3, 43]]],
    },
  }],
};

test("valide une emprise Polygon dans la requête prioritaire", () => {
  assert.equal(priorityBodySchema.safeParse({
    toponym: "Site test",
    coords: [43, 3],
    occurrences: [{}],
    projectArea: square,
  }).success, true);
});

test("refuse une emprise non fermée ou hors limites", () => {
  const invalid = structuredClone(square);
  invalid.features[0].geometry.coordinates[0][4] = [999, 43];
  assert.equal(priorityBodySchema.safeParse({
    toponym: "Site test",
    coords: [43, 3],
    occurrences: [{}],
    projectArea: invalid,
  }).success, false);
});

test("borne débit et concurrence des appels coûteux par clé", () => {
  const limiter = new SlidingWindowCostLimiter(1_000, 2, 1);
  const first = limiter.acquire("ip", 0);
  assert.equal(first.allowed, true);
  assert.equal(limiter.acquire("ip", 1).reason, "concurrency");
  first.release();
  const second = limiter.acquire("ip", 2);
  assert.equal(second.allowed, true);
  second.release();
  assert.equal(limiter.acquire("ip", 3).reason, "rate");
  assert.equal(limiter.acquire("ip", 1_001).allowed, true);
});