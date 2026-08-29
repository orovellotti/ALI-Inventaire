import assert from "node:assert/strict";
import test from "node:test";

import { harnessAgentSchema, migrateHarnessConfig } from "@shared/harness";
import { executeApprovedMcpTool, getMcpServerRegistry } from "./mcp";

test("le registre vérifie la connexion MCP et découvre ses capacités", async () => {
  const registry = await getMcpServerRegistry();
  assert.ok(registry.length > 0);
  for (const mcp of registry) {
    assert.equal(mcp.connected, true);
    assert.ok(mcp.tools.length > 0);
    assert.equal(new Set(mcp.tools.map((tool) => tool.id)).size, mcp.tools.length);
  }
});

test("migre les associations déclaratives sans perdre les agents personnalisés", () => {
  const migrated = migrateHarnessConfig({
    version: 1,
    agents: [
      {
        id: "custom-agent",
        name: "Agent personnalisé",
        description: "Conservé",
        prompt: "Prompt conservé",
        enabled: true,
        native: false,
        mcpId: "to-connect",
      },
      ...["occurrences", "zonages", "potential"].map((id) => ({
        id,
        name: `Agent ${id}`,
        description: "",
        prompt: "Prompt",
        enabled: true,
        native: true,
        mcpId: "ali-internal",
      })),
    ],
  });

  assert.equal(migrated?.version, 3);
  assert.equal(migrated?.agents[0].prompt, "Prompt conservé");
  assert.equal(migrated?.agents[0].mcpId, "none");
  assert.equal(migrated?.agents.some((agent) => agent.id === "potential"), false);
});

test("refuse un outil qui n'est pas explicitement approuvé pour l'agent", async () => {
  const trace = await executeApprovedMcpTool(
    {
      id: "test-agent",
      name: "Agent test",
      description: "",
      prompt: "Tester",
      enabled: true,
      native: false,
      mcpId: "ali-internal",
      mcpToolIds: [],
    },
    "sinp_links",
    { lat: 48.85, lng: 2.35 },
  );

  assert.equal(trace.status, "denied");
  assert.match(trace.summary, /non approuvé/i);
});

test("exécute réellement un outil approuvé via le transport MCP", async () => {
  const trace = await executeApprovedMcpTool(
    {
      id: "test-agent",
      name: "Agent test",
      description: "",
      prompt: "Tester",
      enabled: true,
      native: false,
      mcpId: "ali-internal",
      mcpToolIds: ["sinp_links"],
    },
    "sinp_links",
    { lat: 48.85, lng: 2.35 },
  );

  assert.equal(trace.status, "success");
  assert.match(trace.summary, /Île-de-France/);
});

test("distingue une panne MCP d'un refus d'autorisation", async () => {
  const trace = await executeApprovedMcpTool(
    {
      id: "test-agent",
      name: "Agent test",
      description: "",
      prompt: "Tester",
      enabled: true,
      native: false,
      mcpId: "ali-internal",
      mcpToolIds: ["sinp_links"],
    },
    "sinp_links",
    { lat: 48.85, lng: 2.35 },
    async () => [{ id: "ali-internal", label: "MCP interne ALi", connected: false, tools: [] }],
  );

  assert.equal(trace.status, "error");
  assert.match(trace.summary, /indisponible/i);
});

test("le schéma navigateur rejette toute adresse de serveur MCP", () => {
  const parsed = harnessAgentSchema.safeParse({
    id: "test-agent",
    name: "Agent test",
    description: "",
    prompt: "Tester",
    enabled: true,
    native: false,
    mcpId: "ali-internal",
    mcpToolIds: ["sinp_links"],
    mcpUrl: "https://serveur-arbitraire.example/mcp",
  });

  assert.equal(parsed.success, false);
});