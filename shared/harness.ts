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

const NATIVE_AGENT_IDS = ["occurrences", "zonages", "habitats"] as const;

const NATIVE_HABITAT_AGENT = {
  id: "habitats",
  name: "Agent Habitat",
  description: "Documente les habitats disponibles autour de l’aire d’étude via CARHAB.",
  prompt: "Distingue les habitats documentés par CARHAB des habitats Natura 2000 et des habitats à confirmer sur le terrain.",
  enabled: true,
  native: true,
  mcpId: "ali-habitat",
  mcpToolIds: ["get_habitats"],
};

export const harnessConfigSchema = z.object({
  version: z.literal(4),
  agents: z.array(harnessAgentSchema).min(1).max(20).refine(
    (agents) => new Set(agents.map((agent) => agent.id)).size === agents.length,
    "Chaque agent doit avoir un identifiant unique",
  ),
  mcpServers: z.array(customMcpServerSchema).max(10).default([]),
}).superRefine((config, context) => {
  for (const id of NATIVE_AGENT_IDS) {
    const agent = config.agents.find((candidate) => candidate.id === id);
    if (!agent || !agent.native) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: `L’agent natif ${id} est obligatoire` });
    }
  }
  for (const agent of config.agents) {
    const reserved = NATIVE_AGENT_IDS.includes(agent.id as (typeof NATIVE_AGENT_IDS)[number]);
    if (agent.native !== reserved) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: `Identité native invalide pour ${agent.id}` });
    }
    if (agent.mcpId.startsWith("custom-") && !config.mcpServers.some((server) => server.id === agent.mcpId)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: `Serveur MCP inconnu pour ${agent.name}` });
    }
  }
  if (new Set(config.mcpServers.map((server) => server.id)).size !== config.mcpServers.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Chaque serveur MCP doit avoir un identifiant unique" });
  }
});

export type HarnessAgent = z.infer<typeof harnessAgentSchema>;
export type HarnessConfig = z.infer<typeof harnessConfigSchema>;

export function migrateHarnessConfig(value: unknown): HarnessConfig | undefined {
  const current = harnessConfigSchema.safeParse(value);
  if (current.success) return current.data;
  if (!value || typeof value !== "object" || !Array.isArray((value as { agents?: unknown }).agents)) return undefined;
  const legacy = value as { version?: unknown; agents: Array<Record<string, unknown>> };
  if (legacy.version !== 1 && legacy.version !== 2 && legacy.version !== 3 && legacy.version !== 4) return undefined;
  const agents = legacy.agents.filter((agent) => agent.id !== "potential");
  if (!agents.some((agent) => agent.id === "habitats")) agents.push({ ...NATIVE_HABITAT_AGENT });
  const migrated = harnessConfigSchema.safeParse({
    version: 4,
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
          ? (mcpId === "ali-internal" ? (DEFAULT_TOOLS_BY_AGENT[String(agent.id)] ?? []) : [])
          : (Array.isArray(agent.mcpToolIds) ? agent.mcpToolIds : []),
      };
    }),
  });
  return migrated.success ? migrated.data : undefined;
}

export const DEFAULT_HARNESS_CONFIG: HarnessConfig = {
  version: 4,
  mcpServers: [],
  agents: [
    {
      id: "occurrences",
      name: "Agent Occurrences",
      description: "Consolide les données naturalistes disponibles dans les aires d’étude.",
      prompt: "Consolide et déduplique les occurrences. Distingue toujours donnée bibliographique et présence confirmée sur le terrain.",
      enabled: true,
      native: true,
      mcpId: "ali-internal",
      mcpToolIds: ["sinp_links"],
    },
    {
      id: "zonages",
      name: "Agent Zonages",
      description: "Recherche et qualifie les zonages environnementaux proches du site.",
      prompt: "Qualifie chaque zonage sans confondre inventaire patrimonial et protection réglementaire.",
      enabled: true,
      native: true,
      mcpId: "ali-internal",
      mcpToolIds: ["zonages_for_location"],
    },
    { ...NATIVE_HABITAT_AGENT },
  ],
};
