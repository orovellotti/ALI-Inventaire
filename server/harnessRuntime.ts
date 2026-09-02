import {
  DEFAULT_HARNESS_CONFIG,
  migrateHarnessConfig,
  type HarnessConfig,
} from "@shared/harness";
import { storage } from "./storage";

export async function getRuntimeHarnessConfig(): Promise<HarnessConfig> {
  return migrateHarnessConfig(await storage.getHarnessConfig()) ?? DEFAULT_HARNESS_CONFIG;
}

export function isAgentEnabled(config: HarnessConfig, agentId: string): boolean {
  return config.agents.some((agent) => agent.id === agentId && agent.enabled);
}

export function isAgentToolEnabled(
  config: HarnessConfig,
  agentId: string,
  mcpId: string,
  toolId: string,
): boolean {
  return config.agents.some(
    (agent) =>
      agent.id === agentId &&
      agent.enabled &&
      agent.mcpId === mcpId &&
      agent.mcpToolIds.includes(toolId),
  );
}

export function isAgentOperational(config: HarnessConfig, agentId: string): boolean {
  if (!isAgentEnabled(config, agentId)) return false;
  if (agentId === "taxonomy-status") {
    return isAgentToolEnabled(config, agentId, "ali-species", "get_statuts");
  }
  if (agentId === "habitats") {
    return isAgentToolEnabled(config, agentId, "ali-habitat", "get_habitats");
  }
  return true;
}