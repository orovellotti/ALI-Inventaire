import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_HARNESS_CONFIG, harnessAgentSchema, migrateHarnessConfig } from "@shared/harness";
import {
  executeApprovedMcpTool,
  getCustomToolCompatibility,
  getMcpServerRegistry,
  validatePublicMcpUrl,
} from "./mcp";

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

  assert.equal(migrated?.version, 4);
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
  assert.match(trace.output ?? "", /Île-de-France/);
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

test("refuse les URL MCP locales, privées ou non chiffrées", async () => {
  await assert.rejects(() => validatePublicMcpUrl("http://example.com/mcp"), /HTTPS/i);
  await assert.rejects(() => validatePublicMcpUrl("https://localhost/mcp"), /pas autorisée/i);
  await assert.rejects(() => validatePublicMcpUrl("https://127.0.0.1/mcp"), /adresse publique/i);
  await assert.rejects(() => validatePublicMcpUrl("https://10.0.0.5/mcp"), /adresse publique/i);
  await assert.rejects(() => validatePublicMcpUrl("https://[::ffff:7f00:1]/mcp"), /(publique|invalide|ENOTFOUND)/i);
  await assert.rejects(() => validatePublicMcpUrl("https://user:pass@example.com/mcp"), /identifiants/i);
});

test("découvre les outils d'un serveur MCP administré", async () => {
  const registry = await getMcpServerRegistry([{
    id: "custom-ali-habitat",
    label: "ALI Habitat personnalisé",
    url: "https://ali-habitat.replit.app/mcp",
  }]);
  const custom = registry.find((entry) => entry.id === "custom-ali-habitat");
  assert.equal(custom?.connected, true);
  assert.ok(custom?.tools.some((tool) => tool.id === "get_habitats"));
  assert.ok(custom?.tools.every((tool) => tool.inputSchema));
});

test("un outil personnalisé homonyme reste soumis à son propre schéma", async () => {
  const customAgent = {
    ...DEFAULT_HARNESS_CONFIG.agents[0],
    mcpId: "custom-collision",
    mcpToolIds: ["get_habitats"],
  };
  const result = await executeApprovedMcpTool(
    customAgent,
    "get_habitats",
    { lat: 48, lng: -4, radius: 2000 },
    async () => [{
      id: "custom-collision",
      label: "Collision",
      url: "https://example.com/mcp",
      managed: true,
      connected: true,
      tools: [{
        id: "get_habitats",
        title: "Autre outil",
        description: "",
        supported: false,
        unsupportedReason: "Paramètres obligatoires non fournis par ALi : geometry",
        inputSchema: {
          type: "object",
          properties: { geometry: { type: "object" } },
          required: ["geometry"],
        },
      }],
    }],
  );
  assert.equal(result.status, "denied");
  assert.match(result.summary, /geometry/);
});

test("un paramètre entier est incompatible avec les coordonnées décimales émises par ALi", () => {
  const compatibility = getCustomToolCompatibility({
    type: "object",
    properties: { lat: { type: "integer" }, lng: { type: "number" } },
    required: ["lat", "lng"],
  });
  assert.equal(compatibility.supported, false);
  assert.match(compatibility.unsupportedReason ?? "", /lat/);
});