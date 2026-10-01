import type { HarnessConfig } from "@shared/harness";
import { isStudyCoverage } from "./studySession";

export const CARHAB_WMS_URL = "https://data.geopf.fr/wms-v/wms";
export type CarhabLayer = "Carhab_habitat" | "Habitats_Carhab_Reunion";

export interface HabitatMapEligibility {
  layer: CarhabLayer | null;
  explanation: string;
}

/**
 * runtimeHarness must come from /api/runtime/harness, not editor/default config.
 * Its enabled flag is resolved by the server's isAgentOperational helper,
 * including ali-habitat / get_habitats authorization; MCP details are redacted.
 */
export function getHabitatMapEligibility(
  coverage: unknown,
  runtimeHarness: Pick<HarnessConfig, "agents"> | null,
): HabitatMapEligibility {
  if (!runtimeHarness) {
    return { layer: null, explanation: "Habitat layer unavailable until Harness authorization is verified." };
  }
  if (!runtimeHarness.agents.some((agent) => agent.id === "habitats" && agent.native && agent.enabled)) {
    return { layer: null, explanation: "The native Habitat agent and its CARHAB tool must be authorized in the Harness." };
  }
  if (!isStudyCoverage(coverage)) {
    return { layer: null, explanation: "Waiting for verified study-country coverage. No habitat absence is inferred." };
  }
  if (!coverage.frenchSources) {
    return { layer: null, explanation: "CARHAB mapped habitats are unavailable outside supported French areas. No habitat absence is inferred." };
  }
  const code = coverage.countryCode.trim().toUpperCase();
  if (code === "FR") {
    return { layer: "Carhab_habitat", explanation: "CARHAB mapped habitats — France, available mapped areas only." };
  }
  if (code === "RE") {
    return { layer: "Habitats_Carhab_Reunion", explanation: "CARHAB mapped habitats — Réunion, available mapped areas only." };
  }
  return { layer: null, explanation: "No supported CARHAB map layer is configured for this territory. No habitat absence is inferred." };
}

export interface HabitatMapLifecycle {
  studyId: string | null;
  mode: "idle" | "new" | "history";
  enabled: boolean;
  defaultApplied: boolean;
}

export const INITIAL_HABITAT_MAP: HabitatMapLifecycle = {
  studyId: null,
  mode: "idle",
  enabled: false,
  defaultApplied: false,
};

export type HabitatMapAction =
  | { type: "reset" }
  | { type: "start"; studyId: string }
  | { type: "restore"; studyId: string }
  | { type: "coverage"; studyId: string | null; eligible: boolean }
  | { type: "toggle"; studyId: string | null; eligible: boolean; enabled: boolean };

/** A new study gets one default enable; user choices and history never rerun it. */
export function habitatMapReducer(state: HabitatMapLifecycle, action: HabitatMapAction): HabitatMapLifecycle {
  if (action.type === "reset") return INITIAL_HABITAT_MAP;
  if (action.type === "start" || action.type === "restore") {
    return {
      studyId: action.studyId,
      mode: action.type === "start" ? "new" : "history",
      enabled: false,
      defaultApplied: action.type === "restore",
    };
  }
  if (action.studyId !== state.studyId || state.mode === "idle") return state;
  if (action.type === "toggle") {
    return { ...state, enabled: action.enabled && action.eligible, defaultApplied: true };
  }
  if (!action.eligible) return state.enabled ? { ...state, enabled: false } : state;
  if (state.mode === "new" && !state.defaultApplied) {
    return { ...state, enabled: true, defaultApplied: true };
  }
  return state;
}