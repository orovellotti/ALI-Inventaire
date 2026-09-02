import assert from "node:assert/strict";
import test from "node:test";
import { createFinalStudyPromptTrace, formatConfiguredAgentInstructions } from "./llm";
import type { HarnessConfig } from "@shared/harness";

test("conserve intégralement les prompts multilignes de tous les agents activés", () => {
  const config: HarnessConfig = {
    version: 5,
    mcpServers: [],
    agents: [
      {
        id: "agent-one",
        name: "Agent un",
        description: "",
        prompt: "Première ligne.\nDeuxième ligne détaillée.",
        enabled: true,
        native: false,
        mcpId: "none",
        mcpToolIds: [],
      },
      {
        id: "agent-two",
        name: "Agent deux",
        description: "",
        prompt: "Consigne désactivée",
        enabled: false,
        native: false,
        mcpId: "none",
        mcpToolIds: [],
      },
    ],
  };

  const instructions = formatConfiguredAgentInstructions(config);

  assert.match(instructions, /Première ligne\.\nDeuxième ligne détaillée\./);
  assert.match(instructions, /\[DÉBUT CONSIGNE — Agent un\]/);
  assert.doesNotMatch(instructions, /Consigne désactivée/);
});

test("trace séparément le prompt système complet et le contexte de génération", () => {
  const trace = createFinalStudyPromptTrace("système complet", "contexte de l’étude");

  assert.equal(trace.systemCharacters, "système complet".length);
  assert.equal(trace.userCharacters, "contexte de l’étude".length);
  assert.equal(trace.totalCharacters, "système complet".length + "contexte de l’étude".length);
  assert.equal(trace.systemFingerprint.length, 16);
  assert.equal(trace.userFingerprint.length, 16);
  assert.notEqual(trace.systemFingerprint, trace.userFingerprint);
});