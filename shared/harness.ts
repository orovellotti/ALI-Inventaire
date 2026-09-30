import { z } from "zod";

export const mcpToolSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  inputSchema: z.record(z.string(), z.unknown()).optional(),
  supported: z.boolean().default(true),
  unsupportedReason: z.string().optional(),
});

export const mcpRegistryEntrySchema = z.object({
  id: z.string(),
  label: z.string(),
  connected: z.boolean(),
  tools: z.array(mcpToolSchema),
  url: z.string().url().optional(),
  managed: z.boolean().default(true),
  error: z.string().optional(),
});

export const mcpRegistrySchema = z.array(mcpRegistryEntrySchema);
export type McpRegistryEntry = z.infer<typeof mcpRegistryEntrySchema>;

export const MCP_IDS = ["none", "ali-internal", "ali-species", "ali-habitat"] as const;

export const customMcpServerSchema = z.object({
  id: z.string().regex(/^custom-[a-z0-9-]{8,}$/),
  label: z.string().trim().min(2).max(80),
  url: z.string().trim().url().max(500),
}).strict();
export type CustomMcpServer = z.infer<typeof customMcpServerSchema>;

const DEFAULT_TOOLS_BY_AGENT: Record<string, string[]> = {
  occurrences: ["sinp_links"],
  zonages: ["zonages_for_location"],
};

export const harnessAgentSchema = z.object({
  id: z.string().trim().min(2).max(60).regex(/^[a-z0-9-]+$/),
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(500),
  prompt: z.string().trim().min(1).max(8000),
  enabled: z.boolean(),
  native: z.boolean(),
  mcpId: z.string().trim().min(1).max(80).regex(/^(none|ali-internal|ali-species|ali-habitat|custom-[a-z0-9-]{8,})$/),
  mcpToolIds: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
}).strict();

const NATIVE_AGENT_IDS = ["occurrences", "zonages", "habitats", "taxonomy-status"] as const;

const NATIVE_HABITAT_AGENT = {
  id: "habitats",
  name: "Agent Habitat",
  description: "Documents available habitats in French study areas using CARHAB.",
  prompt: "Use CARHAB only for covered French locations. Distinguish mapped habitats from Natura 2000 habitats and habitats requiring field confirmation. Write in English.",
  enabled: true,
  native: true,
  mcpId: "ali-habitat",
  mcpToolIds: ["get_habitats"],
};

const NATIVE_TAXONOMY_STATUS_AGENT = {
  id: "taxonomy-status",
  name: "Taxonomy and status agent",
  description: "Verifies TAXREF identity and enriches French taxa with territorial ALI Species statuses.",
  prompt: "Use French territorial statuses only in covered French locations, never as evidence of presence. If geographic coverage or local status is uncertain, flag the local concern for field confirmation. Write in English.",
  enabled: true,
  native: true,
  mcpId: "ali-species",
  mcpToolIds: ["get_statuts"],
};

export const harnessConfigSchema = z.object({
  version: z.literal(5),
  agents: z.array(harnessAgentSchema).min(1).max(20).refine(
    (agents) => new Set(agents.map((agent) => agent.id)).size === agents.length,
    "Each agent must have a unique identifier",
  ),
  mcpServers: z.array(customMcpServerSchema).max(10).default([]),
}).superRefine((config, context) => {
  for (const id of NATIVE_AGENT_IDS) {
    const agent = config.agents.find((candidate) => candidate.id === id);
    if (!agent || !agent.native) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: `Native agent ${id} is required` });
    }
  }
  for (const agent of config.agents) {
    const reserved = NATIVE_AGENT_IDS.includes(agent.id as (typeof NATIVE_AGENT_IDS)[number]);
    if (agent.native !== reserved) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: `Invalid native identity for ${agent.id}` });
    }
    if (agent.mcpId.startsWith("custom-") && !config.mcpServers.some((server) => server.id === agent.mcpId)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: `Unknown MCP server for ${agent.name}` });
    }
  }
  if (new Set(config.mcpServers.map((server) => server.id)).size !== config.mcpServers.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Each MCP server must have a unique identifier" });
  }
});

export type HarnessAgent = z.infer<typeof harnessAgentSchema>;
export type HarnessConfig = z.infer<typeof harnessConfigSchema>;

export function migrateHarnessConfig(value: unknown): HarnessConfig | undefined {
  const current = harnessConfigSchema.safeParse(value);
  if (current.success) return current.data;
  if (!value || typeof value !== "object" || !Array.isArray((value as { agents?: unknown }).agents)) return undefined;
  const legacy = value as { version?: unknown; agents: Array<Record<string, unknown>> };
  if (legacy.version !== 1 && legacy.version !== 2 && legacy.version !== 3 && legacy.version !== 4 && legacy.version !== 5) return undefined;
  const agents = legacy.agents.filter((agent) => agent.id !== "potential");
  if (!agents.some((agent) => agent.id === "habitats")) agents.push({ ...NATIVE_HABITAT_AGENT });
  if (!agents.some((agent) => agent.id === "taxonomy-status")) agents.push({ ...NATIVE_TAXONOMY_STATUS_AGENT });
  const migrated = harnessConfigSchema.safeParse({
    version: 5,
    mcpServers: Array.isArray((value as { mcpServers?: unknown }).mcpServers)
      ? (value as { mcpServers: unknown[] }).mcpServers
      : [],
    agents: agents.map((agent) => {
      const mcpId = MCP_IDS.includes(agent.mcpId as (typeof MCP_IDS)[number])
        ? agent.mcpId
        : "none";
      return {
        ...agent,
        mcpId,
        mcpToolIds: legacy.version === 1
          ? (
              mcpId === "ali-internal"
                ? (DEFAULT_TOOLS_BY_AGENT[String(agent.id)] ?? [])
                : (Array.isArray(agent.mcpToolIds) ? agent.mcpToolIds : [])
            )
          : (Array.isArray(agent.mcpToolIds) ? agent.mcpToolIds : []),
      };
    }),
  });
  return migrated.success ? migrated.data : undefined;
}

export const DEFAULT_HARNESS_CONFIG: HarnessConfig = {
  version: 5,
  mcpServers: [],
  agents: [
    {
      id: "occurrences",
      name: "Occurrence agent",
      description: "Consolidates biodiversity occurrence data in study areas worldwide.",
      prompt: "Consolidate and deduplicate records. Distinguish public occurrence data from field-confirmed presence. Write in English.",
      enabled: true,
      native: true,
      mcpId: "ali-internal",
      mcpToolIds: ["sinp_links"],
    },
    {
      id: "zonages",
      name: "Zoning agent",
      description: "Reviews environmental designations near covered French study sites.",
      prompt: "Use French zoning only for covered French sites. Distinguish inventory designations from regulatory protection. Write in English.",
      enabled: true,
      native: true,
      mcpId: "ali-internal",
      mcpToolIds: ["zonages_for_location"],
    },
    { ...NATIVE_HABITAT_AGENT },
    { ...NATIVE_TAXONOMY_STATUS_AGENT },
  ],
};
