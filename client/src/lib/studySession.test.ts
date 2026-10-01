import test from "node:test";
import assert from "node:assert/strict";
import type { StudyCoverage } from "@shared/types";
import type { AnalysisConversation, AnalysisConversationParameters } from "./analysisHistory";
import {
  buildStudyRequestSummary,
  isStudyCoverage,
  resolveStudyCoverage,
  snapshotStudyParameters,
  updateStudyConversation,
} from "./studySession";

function parameters(): AnalysisConversationParameters {
  return {
    toponym: "Camargue, France",
    center: [43.5396, 4.4697],
    circles: [{
      id: "immediate",
      center: [43.5396, 4.4697],
      radius: 500,
      label: "Immediate",
      enabled: true,
    }],
    activePresetId: "custom",
    activeTaxonFilters: ["birds"],
    excludeMarine: true,
    includeINaturalist: true,
    projectPolygon: {
      name: "Site boundary",
      centroid: [43.5396, 4.4697],
      bounds: [[43.53, 4.46], [43.55, 4.48]],
      geojson: {
        type: "FeatureCollection",
        features: [{
          type: "Feature",
          properties: { name: "Site boundary" },
          geometry: {
            type: "Polygon",
            coordinates: [[[4.46, 43.53], [4.48, 43.53], [4.48, 43.55], [4.46, 43.53]]],
          },
        }],
      },
    },
  };
}

function coverage(countryCode: string, frenchSources: boolean): StudyCoverage {
  return {
    countryCode,
    globalOccurrences: true,
    frenchSources,
    unavailableSources: frenchSources ? [] : ["French protected-area zoning"],
  };
}

function conversation(launchParameters: AnalysisConversationParameters): AnalysisConversation {
  return {
    version: 1,
    id: "saved-study",
    title: "Camargue",
    parameters: launchParameters,
    status: "running",
    results: { inventory: null, zonages: null, potentialSpecies: null },
    agentErrors: {},
    createdAt: "2026-01-01T10:00:00.000Z",
    updatedAt: "2026-01-01T10:00:00.000Z",
  };
}

test("launch parameters are detached from nested draft circles, filters and boundary", () => {
  const draft = parameters();
  const launch = snapshotStudyParameters(draft);
  const expected = parameters();
  draft.center[0] = 50;
  draft.circles[0].center[1] = 9;
  draft.circles[0].radius = 2000;
  draft.circles[0].enabled = false;
  draft.activePresetId = "wind-farm";
  draft.activeTaxonFilters.push("plants");
  draft.includeINaturalist = false;
  draft.excludeMarine = false;
  draft.projectPolygon!.bounds[0][0] = 50;
  draft.projectPolygon!.geojson.features[0].properties!.name = "Edited boundary";
  const geometry = draft.projectPolygon!.geojson.features[0].geometry;
  assert.equal(geometry.type, "Polygon");
  if (geometry.type === "Polygon") geometry.coordinates[0][0][0] = 9;
  draft.projectPolygon = null;
  assert.deepEqual(launch, expected);
});

test("autosaves preserve launch provenance while draft radius, preset and boundary change", () => {
  const draft = parameters();
  const saved = conversation(snapshotStudyParameters(draft));
  const summary = buildStudyRequestSummary(saved.parameters);
  draft.circles[0].radius = 2000;
  draft.activePresetId = "new-preset";
  draft.projectPolygon = null;
  draft.includeINaturalist = false;
  const inventory: NonNullable<AnalysisConversation["results"]["inventory"]> = {
    occurrences: [],
    stats: { total: 0, speciesCount: 0, sensitiveCount: 0 },
    center: saved.parameters.center,
    radius: 500,
    circles: saved.parameters.circles,
    confidence: {
      total: 0, geo: 0, tax: 0, time: 0, trace: 0, issues: 0, dup: 0,
      interpretation: "low", message: "No observations returned",
      rawCount: 0, filteredCount: 0, dedupCount: 0,
    },
    coverage: coverage("FR", true),
  };
  const updated = updateStudyConversation(saved, {
    status: "complete",
    results: { ...saved.results, inventory },
    agentErrors: {},
    updatedAt: "2026-01-01T10:01:00.000Z",
  });
  assert.equal(updated.results.inventory, inventory);
  assert.deepEqual(updated.parameters, parameters());
  assert.equal(updated.parameters.circles[0].radius, updated.results.inventory?.radius);
  assert.equal(buildStudyRequestSummary(updated.parameters), summary);
  assert.match(summary, /500 m.*GBIF and iNaturalist.*Imported boundary/);
  assert.notEqual(buildStudyRequestSummary(draft), summary);
  assert.equal(saved.status, "running");
});

test("a restored draft can change without modifying the saved study", () => {
  const saved = conversation(snapshotStudyParameters(parameters()));
  const restoredDraft = snapshotStudyParameters(saved.parameters);
  restoredDraft.circles[0].radius = 1500;
  restoredDraft.projectPolygon = null;
  assert.deepEqual(saved.parameters, parameters());
  assert.notEqual(restoredDraft.circles[0].radius, saved.parameters.circles[0].radius);
});

test("inventory country overrides a competing French lookup before regional dispatch", () => {
  for (const countryCode of ["US", "GB", "MULTIPLE"]) {
    const inventoryCoverage = coverage(countryCode, false);
    const resolved = resolveStudyCoverage(inventoryCoverage, coverage("FR", true), null);
    assert.equal(resolved.coverage, inventoryCoverage);
    assert.equal(resolved.coverage?.frenchSources, false);
    assert.equal(resolved.error, null);
  }
});

test("verified inventory coverage clears a failed or timed-out lookup", () => {
  for (const inventoryCoverage of [coverage("FR", true), coverage("US", false)]) {
    const resolved = resolveStudyCoverage(inventoryCoverage, null, "Country lookup timed out");
    assert.equal(resolved.coverage, inventoryCoverage);
    assert.equal(resolved.error, null);
  }
});

test("one inventory coverage wins even when the fallback identifies a different country", () => {
  const inventoryCoverage = coverage("FR", true);
  const resolved = resolveStudyCoverage(inventoryCoverage, coverage("GB", false), null);
  assert.equal(resolved.coverage, inventoryCoverage);
  assert.equal(resolved.coverage?.frenchSources, true);
});

test("legacy inventory uses verified lookup coverage without losing global observations", () => {
  const lookupCoverage = coverage("US", false);
  const resolved = resolveStudyCoverage(undefined, lookupCoverage, "Obsolete error");
  assert.equal(resolved.coverage, lookupCoverage);
  assert.equal(resolved.coverage?.globalOccurrences, true);
  assert.equal(resolved.error, null);
});

test("missing or malformed coverage remains explicitly unknown, never confirmed French", () => {
  const malformed = [
    undefined,
    null,
    { countryCode: "FR" },
    { ...coverage("FR", true), countryCode: "" },
    { ...coverage("FR", true), frenchSources: "true" },
    { ...coverage("FR", true), unavailableSources: [null] },
  ];
  for (const value of malformed) {
    assert.equal(isStudyCoverage(value), false);
    const resolved = resolveStudyCoverage(value, null, "Lookup failed");
    assert.notEqual(resolved.coverage?.frenchSources, true);
    assert.equal(resolved.coverage, null);
    assert.equal(resolved.error, "Lookup failed");
  }
  assert.match(resolveStudyCoverage(undefined, undefined, null).error!, /not evidence of absence/);
});