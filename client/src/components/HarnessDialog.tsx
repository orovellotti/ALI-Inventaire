import { useEffect, useState } from "react";
import { Activity, Bot, FileText, Link2, LockKeyhole, Plus, RefreshCw, RotateCcw, Save, Settings2, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { type HarnessAgent, type HarnessConfig, type McpRegistryEntry } from "@shared/harness";

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
  const [mcpRegistry, setMcpRegistry] = useState<McpRegistryEntry[]>([]);
  const [testingMcpId, setTestingMcpId] = useState<string | null>(null);
  const [pinging, setPinging] = useState(false);
  const [lastPingAt, setLastPingAt] = useState<Date | null>(null);
  const [access, setAccess] = useState<{ signedIn: boolean; canManage: boolean } | null>(null);
  const [activeTab, setActiveTab] = useState<"agents" | "final-prompt">("agents");
  const [finalStudyPrompt, setFinalStudyPrompt] = useState("");

  useEffect(() => setDraft(config), [config, open]);
  useEffect(() => {
    if (!open) return;
    setAccess(null);
    setMcpRegistry([]);
    setFinalStudyPrompt("");
    setActiveTab("agents");
    setMessage(null);
    fetch("/api/harness/access")
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Vérification des droits impossible");
        setAccess(data);
        const promptResponse = await fetch("/api/runtime/final-study-prompt");
        if (promptResponse.ok) {
          const promptData = await promptResponse.json();
          setFinalStudyPrompt(promptData.prompt ?? "");
        }
        if (!data.canManage) return;

        const [configResponse, registryResponse] = await Promise.all([
          fetch("/api/harness"),
          fetch("/api/harness/mcp-registry"),
        ]);
        if (!configResponse.ok || !registryResponse.ok) {
          throw new Error("Chargement de la configuration d’administration impossible");
        }
        const [adminConfig, registry] = await Promise.all([
          configResponse.json(),
          registryResponse.json(),
        ]);
        setDraft(adminConfig);
        setMcpRegistry(registry);
        setLastPingAt(new Date());
      })
      .catch((error) => {
        setAccess({ signedIn: false, canManage: false });
        setMessage(error instanceof Error ? error.message : "Vérification des droits impossible");
      });
  }, [open]);

  useEffect(() => {
    if (!open || !access?.canManage) return;
    const interval = window.setInterval(() => {
      fetch("/api/harness/mcp-registry")
        .then(async (response) => {
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || "Ping MCP impossible");
          setMcpRegistry(data);
          setLastPingAt(new Date());
        })
        .catch(() => undefined);
    }, 30_000);
    return () => window.clearInterval(interval);
  }, [open, access?.canManage]);

  const readOnly = !access?.canManage;

  const pingMcpServers = async () => {
    if (pinging) return;
    setPinging(true);
    setMessage(null);
    try {
      const response = await fetch("/api/harness/mcp-registry");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Ping MCP impossible");
      setMcpRegistry(data);
      setLastPingAt(new Date());
      setMessage("Ping MCP terminé.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Ping MCP impossible");
    } finally {
      setPinging(false);
    }
  };

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
      const promptResponse = await fetch("/api/runtime/final-study-prompt");
      if (promptResponse.ok) {
        const promptData = await promptResponse.json();
        setFinalStudyPrompt(promptData.prompt ?? "");
      }
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
        mcpToolIds: [],
      }],
    }));
  };

  const addMcpServer = () => {
    const id = `custom-${crypto.randomUUID()}`;
    setDraft((current) => ({
      ...current,
      mcpServers: [...current.mcpServers, { id, label: "Nouveau serveur MCP", url: "https://" }],
    }));
  };

  const updateMcpServer = (id: string, patch: { label?: string; url?: string }) => {
    setDraft((current) => ({
      ...current,
      mcpServers: current.mcpServers.map((server) => server.id === id ? { ...server, ...patch } : server),
    }));
    setMcpRegistry((current) => current.filter((entry) => entry.id !== id));
  };

  const removeMcpServer = (id: string) => {
    setDraft((current) => ({
      ...current,
      mcpServers: current.mcpServers.filter((server) => server.id !== id),
      agents: current.agents.map((agent) => agent.mcpId === id
        ? { ...agent, mcpId: "none", mcpToolIds: [] }
        : agent),
    }));
    setMcpRegistry((current) => current.filter((entry) => entry.id !== id));
  };

  const testMcpServer = async (id: string) => {
    const server = draft.mcpServers.find((candidate) => candidate.id === id);
    if (!server) return;
    setTestingMcpId(id);
    setMessage(null);
    try {
      const response = await fetch("/api/harness/mcp-discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: server.label, url: server.url }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Connexion MCP impossible");
      const entry = { ...data, id };
      setMcpRegistry((current) => [...current.filter((item) => item.id !== id), entry]);
      setMessage(`${server.label} connecté : ${entry.tools.length} outil${entry.tools.length > 1 ? "s" : ""} découvert${entry.tools.length > 1 ? "s" : ""}.`);
    } catch (error) {
      setMcpRegistry((current) => [...current.filter((item) => item.id !== id), {
        id,
        label: server.label,
        url: server.url,
        managed: true,
        connected: false,
        tools: [],
        error: error instanceof Error ? error.message : "Connexion MCP impossible",
      }]);
      setMessage(error instanceof Error ? error.message : "Connexion MCP impossible");
    } finally {
      setTestingMcpId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="z-[4000] max-h-[90vh] max-w-3xl overflow-y-auto border-[#d9ddd1] bg-[#fffef9] text-[#426158]">
        <DialogHeader>
          <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-xl bg-[#1e594a] text-[#dcc05b]"><Bot className="h-5 w-5" /></div>
          <DialogTitle className="font-serif text-2xl text-[#17483d]">Configurer le harnais d’ALi</DialogTitle>
          <DialogDescription>Activez les agents, adaptez leurs consignes et associez un MCP autorisé.</DialogDescription>
        </DialogHeader>
        <div className="flex gap-2 rounded-xl border border-[#d9ddd1] bg-[#f3f6ef] p-3 text-xs leading-5 text-[#426158]">
          <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-[#1e594a]" />
          <div>
            {access === null && "Vérification de vos droits d’administration…"}
            {access?.canManage && "Vous êtes autorisé à modifier cette configuration partagée. Les URL MCP sont contrôlées et appelées uniquement côté serveur."}
            {access && !access.signedIn && <>Configuration active en lecture seule. <a className="font-semibold underline" href={`${import.meta.env.BASE_URL}sign-in`}>Se connecter comme administrateur</a>.</>}
            {access?.signedIn && !access.canManage && "Configuration active en lecture seule : votre compte n’est pas autorisé à administrer le Harnais."}
          </div>
        </div>
        <p className="rounded-xl border border-[#dfe3da] bg-[#f3f6ef] p-3 text-xs leading-5 text-[#557067]">
          Les agents pilotent les consultations autorisées. L’Agent Taxonomie et statuts utilise ALI Species pour documenter les statuts territoriaux sans confirmer la présence sur le terrain.
        </p>
        <div className="grid grid-cols-2 gap-1 rounded-xl border border-[#d9ddd1] bg-[#f3f6ef] p-1">
          <button
            type="button"
            onClick={() => setActiveTab("agents")}
            className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${activeTab === "agents" ? "bg-white text-[#17483d] shadow-sm" : "text-[#557067] hover:bg-white/60"}`}
          >
            <Settings2 className="h-4 w-4" /> Agents et MCP
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("final-prompt")}
            className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${activeTab === "final-prompt" ? "bg-white text-[#17483d] shadow-sm" : "text-[#557067] hover:bg-white/60"}`}
          >
            <FileText className="h-4 w-4" /> Prompt final de l’étude
          </button>
        </div>
        {activeTab === "agents" && <>
        {!readOnly && <section className="space-y-3 rounded-2xl border border-[#dfe3da] bg-[#f3f6ef] p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold text-[#17483d]">Serveurs MCP</h3>
              <p className="text-xs text-[#6b7d76]">
                État actualisé toutes les 30 secondes
                {lastPingAt ? ` · dernier ping à ${lastPingAt.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : ""}.
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => void pingMcpServers()} disabled={pinging} className="gap-1">
                <RefreshCw className={`h-3.5 w-3.5 ${pinging ? "animate-spin" : ""}`} />
                {pinging ? "Ping…" : "Ping"}
              </Button>
              <Button variant="outline" size="sm" onClick={addMcpServer} disabled={draft.mcpServers.length >= 10} className="gap-1"><Plus className="h-3.5 w-3.5" />Ajouter</Button>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {mcpRegistry.map((mcp) => (
              <div key={mcp.id} className="flex items-center justify-between gap-3 rounded-xl border border-[#dfe3da] bg-white px-3 py-2">
                <span className="flex min-w-0 items-start gap-2 text-sm font-medium text-[#315b4e]">
                  <Activity className="h-4 w-4 shrink-0" />
                  <span className="min-w-0">
                    <span className="block truncate">{mcp.label}</span>
                    {mcp.url && (
                      <a
                        href={mcp.url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-0.5 block truncate text-[11px] font-normal text-[#6b7d76] underline"
                        title={mcp.url}
                      >
                        {mcp.url}
                      </a>
                    )}
                  </span>
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-bold tracking-wide ${
                    mcp.connected
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-red-100 text-red-800"
                  }`}
                  title={mcp.connected ? `${mcp.tools.length} outil(s) disponible(s)` : mcp.error}
                >
                  {mcp.connected ? "UP" : "DOWN"}
                </span>
              </div>
            ))}
          </div>
          {draft.mcpServers.map((server) => {
            const status = mcpRegistry.find((entry) => entry.id === server.id);
            return (
              <div key={server.id} className="grid gap-2 rounded-xl border border-[#dfe3da] bg-white p-3 sm:grid-cols-[1fr_1.5fr_auto]">
                <Input value={server.label} maxLength={80} onChange={(event) => updateMcpServer(server.id, { label: event.target.value })} aria-label="Nom du serveur MCP" />
                <Input value={server.url} maxLength={500} onChange={(event) => updateMcpServer(server.id, { url: event.target.value })} aria-label="URL HTTPS du serveur MCP" />
                <div className="flex gap-1">
                  <Button variant="outline" size="sm" onClick={() => void testMcpServer(server.id)} disabled={testingMcpId === server.id} className="gap-1"><Link2 className="h-3.5 w-3.5" />{testingMcpId === server.id ? "Test…" : "Tester"}</Button>
                  <Button variant="ghost" size="icon" onClick={() => removeMcpServer(server.id)} aria-label={`Supprimer ${server.label}`}><Trash2 className="h-4 w-4" /></Button>
                </div>
                {status && <p className={`text-xs sm:col-span-3 ${status.connected ? "text-emerald-700" : "text-red-700"}`}>{status.connected ? `${status.tools.length} outil${status.tools.length > 1 ? "s" : ""} disponible${status.tools.length > 1 ? "s" : ""}` : status.error}</p>}
              </div>
            );
          })}
        </section>}
        <div className="space-y-4">
          {draft.agents.map((agent) => (
            <section key={agent.id} className="rounded-2xl border border-[#dfe3da] bg-[#faf9f3] p-4">
              <div className="flex items-center gap-3">
                <Switch disabled={readOnly} checked={agent.enabled} onCheckedChange={(enabled) => updateAgent(agent.id, { enabled })} aria-label={`Activer ${agent.name}`} />
                <Input disabled={readOnly} value={agent.name} onChange={(event) => updateAgent(agent.id, { name: event.target.value })} className="font-semibold text-[#17483d]" />
                {!agent.native && !readOnly && <Button variant="ghost" size="icon" onClick={() => setDraft((current) => ({ ...current, agents: current.agents.filter((item) => item.id !== agent.id) }))} aria-label={`Supprimer ${agent.name}`}><Trash2 className="h-4 w-4" /></Button>}
              </div>
              <div className="mt-3 grid gap-3">
                <div><Label>Description</Label><Input disabled={readOnly} value={agent.description} maxLength={500} onChange={(event) => updateAgent(agent.id, { description: event.target.value })} /></div>
                {!readOnly && <div><Label>Prompt de l’agent</Label><Textarea value={agent.prompt} maxLength={8000} rows={5} onChange={(event) => updateAgent(agent.id, { prompt: event.target.value })} /></div>}
                {!readOnly && <div>
                  <Label>MCP approuvé</Label>
                   {agent.mcpId !== "none" && (() => {
                     const status = mcpRegistry.find((mcp) => mcp.id === agent.mcpId);
                     return status ? (
                       <span className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                         status.connected ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"
                       }`}>
                         {status.connected ? "UP" : "DOWN"}
                       </span>
                     ) : null;
                   })()}
                  <select value={agent.mcpId} onChange={(event) => updateAgent(agent.id, { mcpId: event.target.value as HarnessAgent["mcpId"], mcpToolIds: [] })} className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                    <option value="none">Aucun MCP</option>
                    {mcpRegistry.filter((mcp) => mcp.connected).map((mcp) => <option key={mcp.id} value={mcp.id}>{mcp.label} — connecté</option>)}
                  </select>
                   {agent.mcpId !== "none" && (() => {
                     const selectedMcp = mcpRegistry.find((mcp) => mcp.id === agent.mcpId);
                     return selectedMcp?.url ? (
                       <a
                         href={selectedMcp.url}
                         target="_blank"
                         rel="noreferrer"
                         className="mt-1 flex items-center gap-1 break-all text-xs text-[#557067] underline"
                       >
                         <Link2 className="h-3 w-3 shrink-0" />
                         {selectedMcp.url}
                       </a>
                     ) : null;
                   })()}
                  {agent.mcpId !== "none" && (
                    <div className="mt-2 space-y-2 rounded-lg border border-[#dfe3da] bg-white p-3">
                      {(mcpRegistry.find((mcp) => mcp.id === agent.mcpId)?.tools ?? []).map((tool) => (
                        <label key={tool.id} className="flex items-start gap-2 text-xs">
                          <input
                            type="checkbox"
                            className="mt-0.5"
                            checked={agent.mcpToolIds.includes(tool.id)}
                             disabled={tool.supported === false && !agent.mcpToolIds.includes(tool.id)}
                            onChange={(event) => updateAgent(agent.id, {
                              mcpToolIds: event.target.checked
                                ? [...agent.mcpToolIds, tool.id]
                                : agent.mcpToolIds.filter((id) => id !== tool.id),
                            })}
                          />
                           <span>
                             <strong>{tool.title}</strong><br />{tool.description}
                             {tool.supported === false && (
                               <span className="mt-1 block text-amber-700">
                                 {tool.unsupportedReason ?? "Schéma d’entrée non pris en charge par ALi."}
                               </span>
                             )}
                           </span>
                        </label>
                      ))}
                    </div>
                  )}
                  <p className="mt-1 text-xs text-[#6b7d76]">Seuls les serveurs testés et les outils cochés peuvent être exécutés. Les nouveaux outils découverts ne sont jamais activés automatiquement.</p>
                </div>}
              </div>
            </section>
          ))}
        </div>
        </>}
        {activeTab === "final-prompt" && (
          <section className="space-y-3 rounded-2xl border border-[#dfe3da] bg-[#faf9f3] p-4">
            <div>
              <h3 className="font-semibold text-[#17483d]">Prompt réellement envoyé au modèle</h3>
              <p className="mt-1 text-xs leading-5 text-[#6b7d76]">
                Cet aperçu en lecture seule combine les garde-fous de rédaction et les prompts de tous les agents activés. Il est recalculé à l’ouverture du Harnais.
              </p>
            </div>
            <Textarea
              readOnly
              value={finalStudyPrompt}
              rows={24}
              className="min-h-[420px] resize-y border-[#cfd5ce] bg-[#ecefea] font-mono text-xs leading-5 text-[#66746f] shadow-inner focus-visible:ring-[#9aa79f]"
              aria-label="Prompt final de génération de la pré-étude"
              data-testid="textarea-final-study-prompt"
            />
          </section>
        )}
        {message && <p className="text-sm font-medium text-[#1e594a]" role="status">{message}</p>}
        {!readOnly && <div className="flex flex-wrap justify-between gap-2 border-t pt-4">
          <Button variant="outline" onClick={reset} disabled={saving} className="gap-2"><RotateCcw className="h-4 w-4" />Réinitialiser</Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={addAgent} disabled={draft.agents.length >= 20} className="gap-2"><Plus className="h-4 w-4" />Ajouter un agent</Button>
            <Button onClick={save} disabled={saving} className="gap-2 bg-[#1e594a] text-white hover:bg-[#17483d]"><Save className="h-4 w-4" />{saving ? "Enregistrement…" : "Enregistrer"}</Button>
          </div>
        </div>}
      </DialogContent>
    </Dialog>
  );
}
