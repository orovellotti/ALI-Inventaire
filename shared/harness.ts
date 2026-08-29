import { z } from "zod";

export const mcpToolSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
});

export const mcpRegistryEntrySchema = z.object({
  id: z.string(),
  label: z.string(),
  connected: z.boolean(),
  tools: z.array(mcpToolSchema),
});

export const mcpRegistrySchema = z.array(mcpRegistryEntrySchema);
export type McpRegistryEntry = z.infer<typeof mcpRegistryEntrySchema>;

export const MCP_IDS = ["none", "ali-internal", "ali-species", "ali-habitat"] as const;

const DEFAULT_TOOLS_BY_AGENT: Record<string, string[]> = {
  occurrences: ["sinp_links"],
  zonages: ["zonages_for_location"],
  potential: ["list_reference_data"],
};

export const harnessAgentSchema = z.object({
  id: z.string().trim().min(2).max(60).regex(/^[a-z0-9-]+$/),
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(500),
  prompt: z.string().trim().min(1).max(8000),
  enabled: z.boolean(),
  native: z.boolean(),
  mcpId: z.enum(MCP_IDS),
  mcpToolIds: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
}).strict();

const NATIVE_AGENT_IDS = ["occurrences", "zonages", "potential"] as const;

export const harnessConfigSchema = z.object({
  version: z.literal(2),
  agents: z.array(harnessAgentSchema).min(1).max(20).refine(
    (agents) => new Set(agents.map((agent) => agent.id)).size === agents.length,
    "Chaque agent doit avoir un identifiant unique",
  ),
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
  }
});

export type HarnessAgent = z.infer<typeof harnessAgentSchema>;
export type HarnessConfig = z.infer<typeof harnessConfigSchema>;

export function migrateHarnessConfig(value: unknown): HarnessConfig | undefined {
  const current = harnessConfigSchema.safeParse(value);
  if (current.success) return current.data;
  if (!value || typeof value !== "object" || !Array.isArray((value as { agents?: unknown }).agents)) return undefined;
  const legacy = value as { version?: unknown; agents: Array<Record<string, unknown>> };
  if (legacy.version !== 1) return undefined;
  const migrated = harnessConfigSchema.safeParse({
    version: 2,
    agents: legacy.agents.map((agent) => {
      const mcpId = agent.mcpId === "ali-internal" ? "ali-internal" : "none";
      return {
        ...agent,
        mcpId,
        mcpToolIds: mcpId === "ali-internal" ? (DEFAULT_TOOLS_BY_AGENT[String(agent.id)] ?? []) : [],
      };
    }),
  });
  return migrated.success ? migrated.data : undefined;
}

export const DEFAULT_HARNESS_CONFIG: HarnessConfig = {
  version: 2,
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
    {
      id: "potential",
      name: "Agent Potentiel écologique",
      description: "Croise les espèces documentées, les habitats et le contexte territorial.",
      prompt: "Présente toute compatibilité écologique comme une présence potentielle à confirmer sur le terrain.",
      enabled: true,
      native: true,
      mcpId: "ali-internal",
      mcpToolIds: ["list_reference_data"],
    },
  ],
};
