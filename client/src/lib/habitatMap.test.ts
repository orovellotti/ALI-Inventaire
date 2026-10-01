import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_HARNESS_CONFIG, type HarnessConfig } from "@shared/harness";
import type { StudyCoverage } from "@shared/types";
import { getHabitatMapEligibility, habitatMapReducer, INITIAL_HABITAT_MAP } from "./habitatMap";

// The public runtime route has already checked the native MCP/tool permission
// with isAgentOperational, then redacts its connection and prompt details.
function runtimeHarness(authorized = true): HarnessConfig {
  return {
    ...DEFAULT_HARNESS_CONFIG,
    agents: DEFAULT_HARNESS_CONFIG.agents.map((agent) => ({
      ...agent,
      enabled: agent.id === "habitats" ? authorized : agent.enabled,
      prompt: "",
      mcpId: "none",
      mcpToolIds: [],
    })),
  };
}

function coverage(countryCode: string, frenchSources = true): StudyCoverage {
  return { countryCode, frenchSources, globalOccurrences: true, unavailableSources: [] };
}

test("CARHAB requires verified runtime authorization, never the initial defaults", () => {
  assert.equal(getHabitatMapEligibility(coverage("FR"), null).layer, null);
  assert.equal(getHabitatMapEligibility(coverage("FR"), runtimeHarness(false)).layer, null);
  assert.equal(getHabitatMapEligibility(coverage("FR"), runtimeHarness()).layer, "Carhab_habitat");
  const nonNative = runtimeHarness();
  nonNative.agents = nonNative.agents.map((agent) => ({ ...agent, native: false }));
  assert.equal(getHabitatMapEligibility(coverage("FR"), nonNative).layer, null);
});

test("country coverage must be complete and confirmed before loading the backdrop", () => {
  for (const value of [null, undefined, { countryCode: "FR" }, coverage("FR", false), coverage("GB", false), coverage("MULTIPLE", false)]) {
    assert.equal(getHabitatMapEligibility(value, runtimeHarness()).layer, null);
  }
});

test("Réunion uses its advertised WMS layer; other overseas territories are not blanket supported", () => {
  assert.equal(getHabitatMapEligibility(coverage("RE"), runtimeHarness()).layer, "Habitats_Carhab_Reunion");
  for (const code of ["GP", "MQ", "GF", "YT", "PF", "NC", "PM", "WF", "BL", "MF", "TF"]) {
    const eligibility = getHabitatMapEligibility(coverage(code), runtimeHarness());
    assert.equal(eligibility.layer, null);
    assert.match(eligibility.explanation, /No supported CARHAB map layer/);
  }
});

test("a new study enables as soon as coverage is confirmed, without inventory or AI state", () => {
  const pending = habitatMapReducer(INITIAL_HABITAT_MAP, { type: "start", studyId: "study-1" });
  assert.equal(pending.enabled, false);
  const eligible = Boolean(getHabitatMapEligibility(coverage("FR"), runtimeHarness()).layer);
  const ready = habitatMapReducer(pending, { type: "coverage", studyId: "study-1", eligible });
  assert.equal(ready.enabled, true);
  assert.equal(ready.defaultApplied, true);
  assert.equal(habitatMapReducer(ready, { type: "coverage", studyId: "study-1", eligible }), ready);
});

test("later coverage refreshes do not override a user's off toggle", () => {
  let state = habitatMapReducer(INITIAL_HABITAT_MAP, { type: "start", studyId: "study-1" });
  state = habitatMapReducer(state, { type: "coverage", studyId: "study-1", eligible: true });
  state = habitatMapReducer(state, { type: "toggle", studyId: "study-1", eligible: true, enabled: false });
  const refreshed = habitatMapReducer(state, { type: "coverage", studyId: "study-1", eligible: true });
  assert.equal(refreshed.enabled, false);
  assert.equal(refreshed, state);
});

test("turn off all during pending coverage prevents a later automatic enable", () => {
  let state = habitatMapReducer(INITIAL_HABITAT_MAP, { type: "start", studyId: "study-1" });
  state = habitatMapReducer(state, { type: "toggle", studyId: "study-1", eligible: false, enabled: false });
  state = habitatMapReducer(state, { type: "coverage", studyId: "study-1", eligible: true });
  assert.equal(state.enabled, false);
});

test("the next new study resets the choice and gets its own single default", () => {
  let state = habitatMapReducer(INITIAL_HABITAT_MAP, { type: "start", studyId: "study-1" });
  state = habitatMapReducer(state, { type: "toggle", studyId: "study-1", eligible: true, enabled: false });
  state = habitatMapReducer(state, { type: "start", studyId: "study-2" });
  assert.equal(state.enabled, false);
  assert.equal(state.defaultApplied, false);
  state = habitatMapReducer(state, { type: "coverage", studyId: "study-2", eligible: true });
  assert.equal(state.enabled, true);
});

test("history restoration resets the backdrop, using saved coverage only and no automatic enable", () => {
  let state = habitatMapReducer(INITIAL_HABITAT_MAP, { type: "start", studyId: "study-1" });
  state = habitatMapReducer(state, { type: "coverage", studyId: "study-1", eligible: true });
  state = habitatMapReducer(state, { type: "restore", studyId: "saved-study" });
  state = habitatMapReducer(state, { type: "coverage", studyId: "saved-study", eligible: true });
  assert.equal(state.enabled, false);
  assert.equal(state.mode, "history");
  state = habitatMapReducer(state, { type: "toggle", studyId: "saved-study", eligible: true, enabled: true });
  assert.equal(state.enabled, true);
});

test("location reset and stale responses cannot revive a previous study's backdrop", () => {
  let state = habitatMapReducer(INITIAL_HABITAT_MAP, { type: "start", studyId: "study-1" });
  state = habitatMapReducer(state, { type: "coverage", studyId: "study-1", eligible: true });
  state = habitatMapReducer(state, { type: "reset" });
  assert.deepEqual(state, INITIAL_HABITAT_MAP);
  assert.equal(habitatMapReducer(state, { type: "coverage", studyId: "study-1", eligible: true }), state);
  state = habitatMapReducer(state, { type: "start", studyId: "study-2" });
  assert.equal(habitatMapReducer(state, { type: "coverage", studyId: "study-1", eligible: true }), state);
});

test("completed multi-country inventory or revoked authorization disables the early backdrop", () => {
  let state = habitatMapReducer(INITIAL_HABITAT_MAP, { type: "start", studyId: "study-1" });
  state = habitatMapReducer(state, { type: "coverage", studyId: "study-1", eligible: true });
  state = habitatMapReducer(state, { type: "coverage", studyId: "study-1", eligible: false });
  assert.equal(state.enabled, false);
  state = habitatMapReducer(state, { type: "coverage", studyId: "study-1", eligible: true });
  assert.equal(state.enabled, false);
  state = habitatMapReducer(state, { type: "toggle", studyId: "study-1", eligible: false, enabled: true });
  assert.equal(state.enabled, false);
});