import assert from "node:assert/strict";
import test from "node:test";
import type { ProjectAreaFeatureCollection } from "@shared/types";

process.env.AI_INTEGRATIONS_OPENAI_API_KEY ||= "test-only";
process.env.AI_INTEGRATIONS_OPENAI_BASE_URL ||= "http://localhost";

const { computeProjectSiteMetrics } = await import("./services/habitatCompat");

test("calcule le recouvrement depuis le polygone projet plutôt qu'un cercle fixe", () => {
  const area: ProjectAreaFeatureCollection = {
    type: "FeatureCollection",
    features: [{
      type: "Feature",
      properties: null,
      geometry: {
        type: "Polygon",
        coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
      },
    }],
  };
  const metrics = computeProjectSiteMetrics(area, {
    rings: [[[0.5, 0.5], [1.5, 0.5], [1.5, 1.5], [0.5, 1.5], [0.5, 0.5]]],
    areaKm2: null,
  });
  assert.ok(metrics);
  assert.ok(metrics.overlapRatio > 0.2 && metrics.overlapRatio < 0.3);
  assert.equal(metrics.distanceM, 0);
});

test("gère une MultiPolygon et retourne une distance pour un site disjoint", () => {
  const area: ProjectAreaFeatureCollection = {
    type: "FeatureCollection",
    features: [{
      type: "Feature",
      geometry: {
        type: "MultiPolygon",
        coordinates: [
          [[[0, 0], [0.1, 0], [0.1, 0.1], [0, 0.1], [0, 0]]],
          [[[1, 1], [1.1, 1], [1.1, 1.1], [1, 1.1], [1, 1]]],
        ],
      },
    }],
  };
  const metrics = computeProjectSiteMetrics(area, {
    rings: [[[2, 2], [2.1, 2], [2.1, 2.1], [2, 2.1], [2, 2]]],
    areaKm2: null,
  });
  assert.ok(metrics);
  assert.equal(metrics.overlapRatio, 0);
  assert.ok(metrics.distanceM > 100_000);
});

test("ne rapporte jamais un recouvrement nul lorsque les frontières se touchent", () => {
  const area: ProjectAreaFeatureCollection = {
    type: "FeatureCollection",
    features: [{
      type: "Feature",
      geometry: { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] },
    }],
  };
  const metrics = computeProjectSiteMetrics(area, {
    rings: [[[1, 0.2], [2, 0.2], [2, 0.8], [1, 0.8], [1, 0.2]]],
    areaKm2: null,
  });
  assert.ok(metrics);
  assert.ok(metrics.overlapRatio > 0);
  assert.equal(metrics.distanceM, 0);
});