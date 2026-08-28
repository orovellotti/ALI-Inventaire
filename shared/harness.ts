import { z } from "zod";

export const MCP_REGISTRY = [
  { id: "none", label: "Aucun MCP", executable: false },
  { id: "ali-internal", label: "MCP interne ALi", executable: true },
  { id: "to-connect", label: "MCP à connecter", executable: false },
] as const;

export const harnessAgentSchema = z.object({
  id: z.string().trim().min(2).max(60).regex(/^[a-z0-9-]+$/),
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(500),
  prompt: z.string().trim().min(1).max(8000),
  enabled: z.boolean(),
  native: z.boolean(),
  mcpId: z.enum(["none", "ali-internal", "to-connect"]),
});

const NATIVE_AGENT_IDS = ["occurrences", "zonages", "potential"] as const;

export const harnessConfigSchema = z.object({
  version: z.literal(1),
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

export const DEFAULT_HARNESS_CONFIG: HarnessConfig = {
  version: 1,
  agents: [
    {
      id: "occurrences",
      name: "Agent Occurrences",
      description: "Consolide les données naturalistes disponibles dans les aires d’étude.",
      prompt: "Consolide et déduplique les occurrences. Distingue toujours donnée bibliographique et présence confirmée sur le terrain.",
      enabled: true,
      native: true,
      mcpId: "ali-internal",
    },
    {
      id: "zonages",
      name: "Agent Zonages",
      description: "Recherche et qualifie les zonages environnementaux proches du site.",
      prompt: "Qualifie chaque zonage sans confondre inventaire patrimonial et protection réglementaire.",
      enabled: true,
      native: true,
      mcpId: "ali-internal",
    },
    {
      id: "potential",
      name: "Agent Potentiel écologique",
      description: "Croise les espèces documentées, les habitats et le contexte territorial.",
      prompt: "Présente toute compatibilité écologique comme une présence potentielle à confirmer sur le terrain.",
      enabled: true,
      native: true,
      mcpId: "ali-internal",
    },
  ],
};
