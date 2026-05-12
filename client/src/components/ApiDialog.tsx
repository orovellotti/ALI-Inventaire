import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plug, Copy, Check } from "lucide-react";
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
    description: "Espèces observées autour d'un point GPS dans un rayon donné. Renvoie la liste des espèces, statut UICN, classification, et un score de confiance.",
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh]" data-testid="dialog-api">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plug className="h-5 w-5 text-teal-600" />
            Serveur MCP Inventaire Flash
          </DialogTitle>
          <DialogDescription>
            Connecte Claude, ChatGPT ou tout client MCP à Inventaire Flash pour interroger la biodiversité depuis une conversation.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[65vh] pr-4">
          <div className="space-y-4 text-sm">
            <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                    URL du serveur MCP (Streamable HTTP, sans auth)
                  </div>
                  <code className="text-xs font-mono text-gray-800 break-all" data-testid="text-mcp-url">{mcpUrl}</code>
                </div>
                <CopyButton text={mcpUrl} />
              </div>
            </div>

            <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
              <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 flex items-center gap-2">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider bg-purple-100 text-purple-700">
                  Claude Desktop
                </span>
                <span className="text-xs text-gray-600">Configuration via le pont mcp-remote</span>
              </div>
              <div className="p-3 space-y-2">
                <p className="text-xs text-gray-600 leading-relaxed">
                  Ajoute ce bloc dans <code className="text-[11px] bg-gray-100 px-1 py-0.5 rounded">claude_desktop_config.json</code>
                  {" "}(macOS : <code className="text-[11px] bg-gray-100 px-1 py-0.5 rounded">~/Library/Application Support/Claude/</code> · Windows : <code className="text-[11px] bg-gray-100 px-1 py-0.5 rounded">%APPDATA%\Claude\</code>) puis redémarre Claude.
                </p>
                <div className="bg-gray-900 rounded p-2 flex items-start justify-between gap-2">
                  <pre className="text-[11px] font-mono text-green-300 overflow-x-auto whitespace-pre flex-1">{claudeConfig}</pre>
                  <CopyButton text={claudeConfig} />
                </div>
              </div>
            </div>

            <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
              <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 flex items-center gap-2">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider bg-orange-100 text-orange-700">
                  Claude.ai · ChatGPT · Cursor
                </span>
              </div>
              <div className="p-3">
                <p className="text-xs text-gray-600 leading-relaxed">
                  Ajoute un connector / serveur MCP de type <strong>Streamable HTTP</strong> avec l'URL ci-dessus.
                  Pas d'authentification requise.
                </p>
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 mt-4">
                Outils exposés ({TOOLS.length})
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
