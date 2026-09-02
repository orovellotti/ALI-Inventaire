import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_HARNESS_CONFIG } from "@shared/harness";
import { isAgentEnabled, isAgentOperational, isAgentToolEnabled } from "./harnessRuntime";

test("respecte l’activation des agents natifs", () => {
  const config = {
    ...DEFAULT_HARNESS_CONFIG,
    agents: DEFAULT_HARNESS_CONFIG.agents.map((agent) =>
      agent.id === "zonages" ? { ...agent, enabled: false } : agent
    ),
  };
  assert.equal(isAgentEnabled(config, "zonages"), false);
  assert.equal(isAgentEnabled(config, "occurrences"), true);
});

test("l’enrichissement ALI Species exige agent, MCP et outil autorisés", () => {
  assert.equal(
    isAgentToolEnabled(
      DEFAULT_HARNESS_CONFIG,
      "taxonomy-status",
      "ali-species",
      "get_statuts",
    ),
    true,
  );
  const disabled = {
    ...DEFAULT_HARNESS_CONFIG,
    agents: DEFAULT_HARNESS_CONFIG.agents.map((agent) =>
      agent.id === "taxonomy-status" ? { ...agent, enabled: false } : agent
    ),
  };
  assert.equal(
    isAgentToolEnabled(disabled, "taxonomy-status", "ali-species", "get_statuts"),
    false,
  );
  assert.equal(isAgentOperational(disabled, "taxonomy-status"), false);
});

test("n’annonce pas Habitat si son outil MCP n’est pas autorisé", () => {
  const withoutTool = {
    ...DEFAULT_HARNESS_CONFIG,
    agents: DEFAULT_HARNESS_CONFIG.agents.map((agent) =>
      agent.id === "habitats" ? { ...agent, mcpToolIds: [] } : agent
    ),
  };
  assert.equal(isAgentOperational(withoutTool, "habitats"), false);
});

test("un outil personnalisé homonyme ne déclenche pas le chemin CARHAB natif", () => {
  const customHomonym = {
    ...DEFAULT_HARNESS_CONFIG,
    agents: DEFAULT_HARNESS_CONFIG.agents.map((agent) =>
      agent.id === "habitats"
        ? { ...agent, mcpId: "custom-12345678", mcpToolIds: ["get_habitats"] }
        : agent
    ),
    mcpServers: [{
      id: "custom-12345678",
      label: "Habitats personnalisés",
      url: "https://example.org/mcp",
    }],
  };
  assert.equal(isAgentOperational(customHomonym, "habitats"), false);
});