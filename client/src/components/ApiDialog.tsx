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
     title: "Geocoding",
     description: "Converts a place name anywhere in the world to GPS coordinates (Nominatim/OpenStreetMap).",
     input: `{ "q": "Banff, Canada" }`,
  },
  {
    name: "inventory_simple",
     title: "GBIF inventory (single point)",
     description: "Public observations within a radius of a GPS point, including species, IUCN status, taxonomy and confidence score.",
     input: `{ "lat": 51.4968, "lng": -116.0527, "radius": 2000 }`,
  },
  {
    name: "inventory_multi",
     title: "Multi-area inventory",
     description: "Inventory across 1–10 concentric study areas: immediate, nearby and extended.",
    input: `{
  "circles": [
     { "id": "immediate", "center": [51.4968, -116.0527], "radius": 500,  "enabled": true },
     { "id": "rapprochee","center": [51.4968, -116.0527], "radius": 2000, "enabled": true },
     { "id": "eloignee",  "center": [51.4968, -116.0527], "radius": 6000, "enabled": true }
  ]
}`,
  },
  {
    name: "species_details",
     title: "Species details",
     description: "GBIF species profile: common name where available, IUCN status, image and taxonomy.",
    input: `{ "taxonKey": 2492010 }`,
  },
  {
    name: "sinp_links",
     title: "French SINP platforms",
     description: "French regional SINP platforms covering the coordinates, where available.",
    input: `{ "lat": 43.55, "lng": 5.03 }`,
  },
  {
    name: "priority_species_for_location",
     title: "Priority species (AI analysis)",
     description: "GBIF inventory and AI analysis of conservation concerns and species to check in the field. Regional status coverage varies.",
     input: `{ "toponym": "Banff, Canada", "lat": 51.4968, "lng": -116.0527, "radius": 2000 }`,
  },
  {
    name: "list_reference_data",
     title: "Reference data",
     description: "Project presets, study areas, taxonomic groups and French SINP platforms.",
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
       aria-label="Copy"
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

   const systemPrompt = `You are a naturalist assistant using ALi Inventory tools for preliminary biodiversity assessments anywhere in the world.

 Method:
 1. If the user provides a place name or address, call "geocode" for coordinates.
 2. For a standard assessment, call "priority_species_for_location" (default radius 2,000 m) to combine GBIF records and AI analysis.
 3. For a multi-area study, use "inventory_multi" with immediate (500 m), nearby (2,000 m) and extended (6,000 m) areas.
 4. Cite GBIF. State that public-data coverage varies globally and this assessment cannot replace field surveys.
 5. Mention IUCN status and local protections only when available; do not assume French regional data apply worldwide.
 6. Use "sinp_links" only for supplementary regional links in France.

 Respond in clear, concise professional English.`;

  const exampleQuestions = [
     "Prepare a preliminary biodiversity assessment within 2 km of Banff, Canada",
     "What species of conservation concern are documented near Nairobi, Kenya?",
     "Compare biodiversity records within 500 m, 2 km and 6 km of -2.33, 34.83",
     "Give me the GBIF species profile for taxonKey 2492010",
     "Which French SINP platforms cover 47.2, -1.5?",
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh]" data-testid="dialog-api">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-teal-600" />
             MCP — ALi Inventory AI agent
          </DialogTitle>
          <DialogDescription>
             Connect Claude, ChatGPT or another MCP-compatible client to ALi Inventory for worldwide biodiversity queries. Public-data coverage varies by region.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[65vh] pr-4">
          <div className="space-y-4 text-sm">
            <div className="bg-teal-50 border border-teal-200 rounded-lg p-3 flex gap-3">
              <Lightbulb className="h-5 w-5 text-teal-600 shrink-0 mt-0.5" />
              <div className="text-xs text-teal-900 leading-relaxed">
                 <strong className="block mb-1">What is an AI agent using MCP?</strong>
                 The <strong>Model Context Protocol</strong> (MCP) lets Claude, ChatGPT and other clients use ALi Inventory tools:
                 species search, geocoding, conservation analysis and regional links. Describe your request in natural language
                 and the agent calls the relevant tools.
              </div>
            </div>

            <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                     MCP server URL (Streamable HTTP, no authentication)
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
                 <span className="text-xs text-gray-700 font-medium">macOS / Windows application — free</span>
              </div>
              <div className="p-3 space-y-2.5">
                <ol className="text-xs text-gray-700 leading-relaxed list-decimal pl-4 space-y-1">
                   <li>Open Claude Desktop → <strong>Claude → Settings → Developer → Edit Config</strong> (or edit the file directly).</li>
                   <li>Path to <code className="text-[11px] bg-gray-100 px-1 py-0.5 rounded">claude_desktop_config.json</code>:
                    <ul className="list-disc pl-4 mt-1">
                      <li>macOS : <code className="text-[11px] bg-gray-100 px-1 py-0.5 rounded">~/Library/Application Support/Claude/</code></li>
                      <li>Windows : <code className="text-[11px] bg-gray-100 px-1 py-0.5 rounded">%APPDATA%\Claude\</code></li>
                    </ul>
                  </li>
                   <li>Paste the following (merge with any existing <code className="text-[11px] bg-gray-100 px-1 py-0.5 rounded">mcpServers</code>):</li>
                </ol>
                <div className="bg-gray-900 rounded p-2 flex items-start justify-between gap-2">
                  <pre className="text-[11px] font-mono text-green-300 overflow-x-auto whitespace-pre flex-1">{claudeConfig}</pre>
                  <CopyButton text={claudeConfig} />
                </div>
                <ol className="text-xs text-gray-700 leading-relaxed list-decimal pl-4 space-y-1" start={4}>
                   <li>Restart Claude Desktop. The <strong>inventaire-flash</strong> server appears in the 🔌 tools menu next to the input.</li>
                   <li>Ask a question, such as <em>“Assess biodiversity near Banff, Canada.”</em></li>
                </ol>
              </div>
            </div>

            <div className="border border-emerald-200 rounded-lg overflow-hidden bg-white">
              <div className="px-3 py-2 bg-emerald-50 border-b border-emerald-200 flex items-center gap-2">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider bg-emerald-200 text-emerald-800">
                  ChatGPT (OpenAI)
                </span>
                 <span className="text-xs text-gray-700 font-medium">Plus / Pro / Team / Enterprise — native connector</span>
              </div>
              <div className="p-3 space-y-2">
                <ol className="text-xs text-gray-700 leading-relaxed list-decimal pl-4 space-y-1">
                   <li>Open <strong>ChatGPT → Settings → Connectors</strong> (or <em>Beta features → Developer Mode</em>, depending on your version).</li>
                   <li>Click <strong>“Add custom connector”</strong>.</li>
                   <li>Enter:
                    <ul className="list-disc pl-4 mt-1">
                       <li>Name: <code className="text-[11px] bg-gray-100 px-1 py-0.5 rounded">ALi Inventory</code></li>
                       <li>Description: <em>Worldwide preliminary biodiversity assessment using public data; coverage varies</em></li>
                       <li>MCP Server URL: the URL above</li>
                      <li>Authentication : <strong>None</strong></li>
                    </ul>
                  </li>
                   <li>Enable the connector. In a new chat, choose <strong>“+ → Connectors”</strong> and select <strong>ALi Inventory</strong>.</li>
                   <li>For a custom GPT: use <strong>Explore GPTs → Create</strong>, add the MCP under <em>Configure → Actions / Connectors</em>, then paste the system prompt below.</li>
                </ol>
              </div>
            </div>

            <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
              <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 flex items-center gap-2">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider bg-orange-100 text-orange-700">
                   Claude.ai (web) · Cursor · others
                </span>
              </div>
              <div className="p-3">
                <p className="text-xs text-gray-700 leading-relaxed">
                   <strong>Claude.ai (Pro/Team)</strong>: <em>Settings → Integrations → Add custom integration</em>, select <strong>Streamable HTTP</strong>, use the URL above without authentication.<br />
                   <strong>Cursor</strong>: <em>Settings → MCP → Add new MCP server</em>, select <strong>HTTP</strong> and enter the URL above.<br />
                   <strong>Other clients</strong>: any client supporting <strong>MCP Streamable HTTP</strong>.
                </p>
              </div>
            </div>

            <div className="border border-amber-200 rounded-lg overflow-hidden bg-white">
              <div className="px-3 py-2 bg-amber-50 border-b border-amber-200 flex items-center gap-2">
                <Sparkles className="h-3.5 w-3.5 text-amber-600" />
                 <span className="text-xs font-semibold text-amber-900">Suggested system prompt (Custom GPT, Claude Project…)</span>
              </div>
              <div className="p-3 space-y-2">
                <p className="text-xs text-gray-600 leading-relaxed">
                   Paste this prompt into your custom GPT or Claude Project instructions:
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
                 <span className="text-xs font-semibold text-blue-900">Example questions for the agent</span>
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
                 <span className="text-xs font-semibold text-gray-700">Quick command-line test (curl)</span>
              </div>
              <div className="p-3 space-y-2">
                 <p className="text-xs text-gray-600">Check that the MCP server responds:</p>
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
                 {TOOLS.length} tools available to the agent
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
               <strong>Limits:</strong> maximum radius 50 km per circle and 10 circles per <code>inventory_multi</code> call.
               <code>priority_species_for_location</code> uses an OpenAI LLM call.
               Cite GBIF when using its data. Regional conservation data are not available everywhere.
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
