import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bot, Copy, Check, Sparkles, MessageSquare, Terminal, Lightbulb } from "lucide-react";
import { useState } from "react";

interface ApiDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface McpTool {
  name: string;
  title: string;
  description: string;
  input: string;
}

const TOOLS: McpTool[] = [
  {
    name: "geocode",
    title: "Géocodage",
    description: "Convertit un nom de lieu en coordonnées GPS (Nominatim/OpenStreetMap).",
    input: `{ "q": "Saint-Chamas" }`,
  },
  {
    name: "inventory_simple",
    title: "Inventaire GBIF (un point)",
    description: "Espèces avérées autour d'un point GPS dans un rayon donné. Renvoie la liste des espèces, statut UICN, classification, et un score de confiance.",
    input: `{ "lat": 43.5497, "lng": 5.0341, "radius": 2000 }`,
  },
  {
    name: "inventory_multi",
    title: "Inventaire EIE multi-aires",
    description: "Inventaire sur plusieurs aires concentriques (1 à 10 cercles). Standard EIE : aire immédiate, rapprochée, éloignée.",
    input: `{
  "circles": [
    { "id": "immediate", "center": [43.55, 5.03], "radius": 500,  "enabled": true },
    { "id": "rapprochee","center": [43.55, 5.03], "radius": 2000, "enabled": true },
    { "id": "eloignee",  "center": [43.55, 5.03], "radius": 6000, "enabled": true }
  ]
}`,
  },
  {
    name: "species_details",
    title: "Détails d'une espèce",
    description: "Fiche d'une espèce GBIF : nom vernaculaire FR, statut UICN, image, taxonomie.",
    input: `{ "taxonKey": 2492010 }`,
  },
  {
    name: "sinp_links",
    title: "Plateformes SINP",
    description: "Plateformes SINP régionales couvrant les coordonnées — sources de données complémentaires.",
    input: `{ "lat": 43.55, "lng": 5.03 }`,
  },
  {
    name: "priority_species_for_location",
    title: "Espèces à enjeux (analyse IA)",
    description: "Inventaire GBIF + analyse LLM : espèces à enjeux (UICN, protégées, ZNIEFF, directives) + espèces patrimoniales attendues à rechercher en terrain.",
    input: `{ "toponym": "Saint-Chamas", "lat": 43.55, "lng": 5.03, "radius": 2000 }`,
  },
  {
    name: "list_reference_data",
    title: "Référentiels embarqués",
    description: "Presets de projets EIE, aires d'étude, groupes taxonomiques ou plateformes SINP complètes.",
    input: `{ "kind": "presets" }`,
  },
];

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="text-gray-400 hover:text-gray-600 p-1 rounded transition-colors shrink-0"
      aria-label="Copier"
      data-testid={`button-copy-${text.slice(0, 20)}`}
    >
      {copied ? <Check className="h-3.5 w-3.5 text-teal-600" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

export function ApiDialog({ open, onOpenChange }: ApiDialogProps) {
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
  const mcpUrl = `${baseUrl}/mcp`;

  const claudeConfig = `{
  "mcpServers": {
    "inventaire-flash": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "${mcpUrl}"]
    }
  }
}`;

  const systemPrompt = `Tu es un assistant naturaliste qui utilise les outils Inventaire Flash pour répondre aux questions de pré-diagnostic écologique en France.

Méthode :
1. Si l'utilisateur donne un nom de lieu (commune, lieu-dit, adresse), commence par appeler "geocode" pour obtenir lat/lng.
2. Pour un pré-diagnostic standard, appelle "priority_species_for_location" (rayon 2000 m par défaut) — il combine inventaire GBIF + analyse IA des espèces à enjeux.
3. Pour une étude d'impact (EIE), utilise "inventory_multi" avec les 3 aires concentriques : immédiate (500 m), rapprochée (2000 m), éloignée (6000 m).
4. Cite toujours GBIF comme source et rappelle qu'un inventaire flash ne remplace pas un inventaire terrain.
5. Pour les espèces sensibles, mentionne le statut UICN, la protection nationale, les ZNIEFF déterminantes et les directives Habitats/Oiseaux quand c'est disponible.
6. Pour des liens régionaux complémentaires, appelle "sinp_links".

Réponds en français, ton professionnel et concis.`;

  const exampleQuestions = [
    "Fais-moi un pré-diagnostic écologique autour de Saint-Chamas dans un rayon de 2 km",
    "Quelles sont les espèces à enjeux sur la commune de Porquerolles ?",
    "Compare les enjeux biodiversité d'un projet éolien à 500 m, 2 km et 6 km autour de 43.55, 5.03",
    "Donne-moi la fiche détaillée de l'espèce GBIF taxonKey 2492010",
    "Quelles plateformes SINP couvrent les coordonnées 47.2, -1.5 ?",
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh]" data-testid="dialog-api">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-teal-600" />
            MCP — Agent IA Inventaire Flash
          </DialogTitle>
          <DialogDescription>
            Connecte Claude, ChatGPT ou tout client compatible MCP à Inventaire Flash pour interroger la biodiversité française depuis une simple conversation.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[65vh] pr-4">
          <div className="space-y-4 text-sm">
            <div className="bg-teal-50 border border-teal-200 rounded-lg p-3 flex gap-3">
              <Lightbulb className="h-5 w-5 text-teal-600 shrink-0 mt-0.5" />
              <div className="text-xs text-teal-900 leading-relaxed">
                <strong className="block mb-1">Qu'est-ce qu'un agent IA via MCP ?</strong>
                Le <strong>Model Context Protocol</strong> (MCP) permet à un chatbot (Claude, ChatGPT…) d'utiliser
                directement les outils d'Inventaire Flash : recherche d'espèces, géocodage, analyse d'enjeux, plateformes SINP…
                Tu décris ton besoin en langage naturel, l'agent appelle automatiquement les bons outils.
              </div>
            </div>

            <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                    URL du serveur MCP (Streamable HTTP, sans authentification)
                  </div>
                  <code className="text-xs font-mono text-gray-800 break-all" data-testid="text-mcp-url">{mcpUrl}</code>
                </div>
                <CopyButton text={mcpUrl} />
              </div>
            </div>

            <div className="border border-purple-200 rounded-lg overflow-hidden bg-white">
              <div className="px-3 py-2 bg-purple-50 border-b border-purple-200 flex items-center gap-2">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider bg-purple-200 text-purple-800">
                  Claude Desktop
                </span>
                <span className="text-xs text-gray-700 font-medium">Application macOS / Windows — gratuit</span>
              </div>
              <div className="p-3 space-y-2.5">
                <ol className="text-xs text-gray-700 leading-relaxed list-decimal pl-4 space-y-1">
                  <li>Ouvre Claude Desktop → menu <strong>Claude → Settings → Developer → Edit Config</strong> (ou édite directement le fichier).</li>
                  <li>Chemin du fichier <code className="text-[11px] bg-gray-100 px-1 py-0.5 rounded">claude_desktop_config.json</code> :
                    <ul className="list-disc pl-4 mt-1">
                      <li>macOS : <code className="text-[11px] bg-gray-100 px-1 py-0.5 rounded">~/Library/Application Support/Claude/</code></li>
                      <li>Windows : <code className="text-[11px] bg-gray-100 px-1 py-0.5 rounded">%APPDATA%\Claude\</code></li>
                    </ul>
                  </li>
                  <li>Colle le bloc ci-dessous (fusionne avec un éventuel <code className="text-[11px] bg-gray-100 px-1 py-0.5 rounded">mcpServers</code> existant) :</li>
                </ol>
                <div className="bg-gray-900 rounded p-2 flex items-start justify-between gap-2">
                  <pre className="text-[11px] font-mono text-green-300 overflow-x-auto whitespace-pre flex-1">{claudeConfig}</pre>
                  <CopyButton text={claudeConfig} />
                </div>
                <ol className="text-xs text-gray-700 leading-relaxed list-decimal pl-4 space-y-1" start={4}>
                  <li>Redémarre Claude Desktop. Le serveur <strong>inventaire-flash</strong> apparaît dans le menu 🔌 (icône d'outils) à côté du champ de saisie.</li>
                  <li>Pose ta question ! Exemple : <em>« Fais-moi un pré-diagnostic écologique autour de Saint-Chamas »</em>.</li>
                </ol>
              </div>
            </div>

            <div className="border border-emerald-200 rounded-lg overflow-hidden bg-white">
              <div className="px-3 py-2 bg-emerald-50 border-b border-emerald-200 flex items-center gap-2">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider bg-emerald-200 text-emerald-800">
                  ChatGPT (OpenAI)
                </span>
                <span className="text-xs text-gray-700 font-medium">Plus / Pro / Team / Enterprise — connecteur natif</span>
              </div>
              <div className="p-3 space-y-2">
                <ol className="text-xs text-gray-700 leading-relaxed list-decimal pl-4 space-y-1">
                  <li>Ouvre <strong>ChatGPT → Settings → Connectors</strong> (ou <em>Beta features → Developer Mode</em> selon ta version).</li>
                  <li>Clique sur <strong>« Add custom connector »</strong> (Ajouter un connecteur personnalisé).</li>
                  <li>Renseigne :
                    <ul className="list-disc pl-4 mt-1">
                      <li>Name : <code className="text-[11px] bg-gray-100 px-1 py-0.5 rounded">Inventaire Flash</code></li>
                      <li>Description : <em>Pré-diagnostic écologique GBIF / iNaturalist / IUCN pour la France</em></li>
                      <li>MCP Server URL : l'URL ci-dessus</li>
                      <li>Authentication : <strong>None</strong></li>
                    </ul>
                  </li>
                  <li>Active le connecteur, puis dans une nouvelle conversation utilise le bouton <strong>« + → Connectors »</strong> et coche <strong>Inventaire Flash</strong>.</li>
                  <li>Pour un GPT personnalisé permanent : <strong>Explore GPTs → Create</strong>, dans <em>Configure → Actions / Connectors</em> ajoute le même MCP, puis colle le prompt système ci-dessous.</li>
                </ol>
              </div>
            </div>

            <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
              <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 flex items-center gap-2">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider bg-orange-100 text-orange-700">
                  Claude.ai (web) · Cursor · autres
                </span>
              </div>
              <div className="p-3">
                <p className="text-xs text-gray-700 leading-relaxed">
                  <strong>Claude.ai (plan Pro/Team)</strong> : <em>Settings → Integrations → Add custom integration</em>, type <strong>Streamable HTTP</strong>, URL ci-dessus, sans auth.<br />
                  <strong>Cursor</strong> : <em>Settings → MCP → Add new MCP server</em>, type <strong>HTTP</strong>, URL ci-dessus.<br />
                  <strong>Autres clients</strong> : tout client supportant le transport <strong>MCP Streamable HTTP</strong> fonctionne.
                </p>
              </div>
            </div>

            <div className="border border-amber-200 rounded-lg overflow-hidden bg-white">
              <div className="px-3 py-2 bg-amber-50 border-b border-amber-200 flex items-center gap-2">
                <Sparkles className="h-3.5 w-3.5 text-amber-600" />
                <span className="text-xs font-semibold text-amber-900">Prompt système recommandé (Custom GPT, Project Claude…)</span>
              </div>
              <div className="p-3 space-y-2">
                <p className="text-xs text-gray-600 leading-relaxed">
                  Colle ce prompt dans les instructions de ton GPT personnalisé ou de ton Project Claude pour orienter l'agent :
                </p>
                <div className="bg-gray-900 rounded p-2 flex items-start justify-between gap-2">
                  <pre className="text-[11px] font-mono text-amber-200 overflow-x-auto whitespace-pre-wrap flex-1">{systemPrompt}</pre>
                  <CopyButton text={systemPrompt} />
                </div>
              </div>
            </div>

            <div className="border border-blue-200 rounded-lg overflow-hidden bg-white">
              <div className="px-3 py-2 bg-blue-50 border-b border-blue-200 flex items-center gap-2">
                <MessageSquare className="h-3.5 w-3.5 text-blue-600" />
                <span className="text-xs font-semibold text-blue-900">Exemples de questions à poser à l'agent</span>
              </div>
              <div className="p-3 space-y-1.5">
                {exampleQuestions.map((q, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-gray-700 bg-blue-50/40 rounded px-2 py-1.5">
                    <span className="text-blue-400 font-mono shrink-0">›</span>
                    <span className="italic">{q}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
              <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 flex items-center gap-2">
                <Terminal className="h-3.5 w-3.5 text-gray-500" />
                <span className="text-xs font-semibold text-gray-700">Test rapide en ligne de commande (curl)</span>
              </div>
              <div className="p-3 space-y-2">
                <p className="text-xs text-gray-600">Vérifie que le serveur MCP répond :</p>
                <div className="bg-gray-900 rounded p-2 flex items-start justify-between gap-2">
                  <pre className="text-[11px] font-mono text-cyan-300 overflow-x-auto whitespace-pre flex-1">{`curl -X POST ${mcpUrl} \\
  -H "Content-Type: application/json" \\
  -H "Accept: application/json, text/event-stream" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`}</pre>
                  <CopyButton text={`curl -X POST ${mcpUrl} -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`} />
                </div>
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 mt-4">
                Les {TOOLS.length} outils que l'agent peut utiliser
              </div>
              <div className="space-y-3">
                {TOOLS.map((tool) => (
                  <div
                    key={tool.name}
                    className="border border-gray-200 rounded-lg overflow-hidden bg-white"
                    data-testid={`tool-${tool.name}`}
                  >
                    <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border-b border-gray-200">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider bg-teal-100 text-teal-700">
                        TOOL
                      </span>
                      <code className="text-xs font-mono font-semibold text-gray-900 flex-1 truncate">
                        {tool.name}
                      </code>
                      <span className="text-[11px] text-gray-500 truncate hidden sm:inline">{tool.title}</span>
                    </div>
                    <div className="p-3 space-y-2">
                      <p className="text-xs text-gray-600 leading-relaxed">{tool.description}</p>
                      <div className="bg-gray-900 rounded p-2 flex items-start justify-between gap-2">
                        <pre className="text-[11px] font-mono text-green-300 overflow-x-auto whitespace-pre flex-1">{tool.input}</pre>
                        <CopyButton text={tool.input} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
              <strong>Limites :</strong> rayon max 50 km par cercle, 10 cercles max par appel <code>inventory_multi</code>.
              L'outil <code>priority_species_for_location</code> consomme un appel LLM (OpenAI).
              Données sourcées de GBIF — merci de citer GBIF dans vos productions.
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
