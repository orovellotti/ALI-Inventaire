import { useEffect, useState } from "react";
import { AlertTriangle, Bot, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { DEFAULT_HARNESS_CONFIG, MCP_REGISTRY, type HarnessAgent, type HarnessConfig } from "@shared/harness";

export function HarnessDialog({
  open,
  onOpenChange,
  config,
  onConfigChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: HarnessConfig;
  onConfigChange: (config: HarnessConfig) => void;
}) {
  const [draft, setDraft] = useState(config);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => setDraft(config), [config, open]);

  const updateAgent = (id: string, patch: Partial<HarnessAgent>) =>
    setDraft((current) => ({
      ...current,
      agents: current.agents.map((agent) => agent.id === id ? { ...agent, ...patch } : agent),
    }));

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/harness", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Sauvegarde impossible");
      onConfigChange(data);
      setMessage("Configuration partagée enregistrée.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Sauvegarde impossible");
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/harness/reset", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Réinitialisation impossible");
      setDraft(data);
      onConfigChange(data);
      setMessage("Configuration par défaut restaurée.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Réinitialisation impossible");
    } finally {
      setSaving(false);
    }
  };

  const addAgent = () => {
    const suffix = Date.now().toString(36);
    setDraft((current) => ({
      ...current,
      agents: [...current.agents, {
        id: `agent-${suffix}`,
        name: "Nouvel agent",
        description: "",
        prompt: "Analyse uniquement les données disponibles et signale clairement les incertitudes.",
        enabled: false,
        native: false,
        mcpId: "none",
      }],
    }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="z-[4000] max-h-[90vh] max-w-3xl overflow-y-auto border-[#d9ddd1] bg-[#fffef9] text-[#426158]">
        <DialogHeader>
          <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-xl bg-[#1e594a] text-[#dcc05b]"><Bot className="h-5 w-5" /></div>
          <DialogTitle className="font-serif text-2xl text-[#17483d]">Configurer le harnais d’ALi</DialogTitle>
          <DialogDescription>Activez les agents, adaptez leurs consignes et associez un MCP autorisé.</DialogDescription>
        </DialogHeader>
        <div className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          Administration provisoire sans connexion : toute personne ayant accès à l’application peut modifier cette configuration partagée. Les garde-fous scientifiques restent imposés par ALi.
        </div>
        <p className="rounded-xl border border-[#dfe3da] bg-[#f3f6ef] p-3 text-xs leading-5 text-[#557067]">
          Le prompt Occurrences complète l’analyse IA. Les prompts Zonages et Potentiel documentent la méthode et le rapport ; ils ne modifient pas les calculs scientifiques déterministes.
        </p>
        <div className="space-y-4">
          {draft.agents.map((agent) => (
            <section key={agent.id} className="rounded-2xl border border-[#dfe3da] bg-[#faf9f3] p-4">
              <div className="flex items-center gap-3">
                <Switch checked={agent.enabled} onCheckedChange={(enabled) => updateAgent(agent.id, { enabled })} aria-label={`Activer ${agent.name}`} />
                <Input value={agent.name} onChange={(event) => updateAgent(agent.id, { name: event.target.value })} className="font-semibold text-[#17483d]" />
                {!agent.native && <Button variant="ghost" size="icon" onClick={() => setDraft((current) => ({ ...current, agents: current.agents.filter((item) => item.id !== agent.id) }))} aria-label={`Supprimer ${agent.name}`}><Trash2 className="h-4 w-4" /></Button>}
              </div>
              <div className="mt-3 grid gap-3">
                <div><Label>Description</Label><Input value={agent.description} maxLength={500} onChange={(event) => updateAgent(agent.id, { description: event.target.value })} /></div>
                <div><Label>Prompt de l’agent</Label><Textarea value={agent.prompt} maxLength={8000} rows={5} onChange={(event) => updateAgent(agent.id, { prompt: event.target.value })} /></div>
                <div>
                  <Label>MCP potentiel</Label>
                  <select value={agent.mcpId} onChange={(event) => updateAgent(agent.id, { mcpId: event.target.value as HarnessAgent["mcpId"] })} className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                    {MCP_REGISTRY.map((mcp) => <option key={mcp.id} value={mcp.id}>{mcp.label}{mcp.executable ? "" : " — déclaratif"}</option>)}
                  </select>
                  {agent.mcpId === "to-connect" && <p className="mt-1 text-xs text-[#6b7d76]">Association enregistrée, mais aucune connexion externe arbitraire ne sera exécutée.</p>}
                </div>
              </div>
            </section>
          ))}
        </div>
        {message && <p className="text-sm font-medium text-[#1e594a]" role="status">{message}</p>}
        <div className="flex flex-wrap justify-between gap-2 border-t pt-4">
          <Button variant="outline" onClick={reset} disabled={saving} className="gap-2"><RotateCcw className="h-4 w-4" />Réinitialiser</Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={addAgent} disabled={draft.agents.length >= 20} className="gap-2"><Plus className="h-4 w-4" />Ajouter un agent</Button>
            <Button onClick={save} disabled={saving} className="gap-2 bg-[#1e594a] text-white hover:bg-[#17483d]"><Save className="h-4 w-4" />{saving ? "Enregistrement…" : "Enregistrer"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
