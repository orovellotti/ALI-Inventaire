import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Code2, Copy, Check, ExternalLink } from "lucide-react";
import { useState } from "react";

interface ApiDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface Endpoint {
  method: "GET" | "POST";
  path: string;
  description: string;
  example?: string;
  body?: string;
}

const ENDPOINTS: Endpoint[] = [
  {
    method: "POST",
    path: "/api/inventory",
    description: "Inventaire multi-aires : retourne toutes les espèces présentes dans les cercles activés, avec UICN, image, nom vernaculaire et indice de confiance.",
    body: `{
  "circles": [
    {
      "id": "immediate",
      "center": [48.8566, 2.3522],
      "radius": 500,
      "label": "Aire immédiate",
      "enabled": true
    }
  ]
}`,
  },
  {
    method: "GET",
    path: "/api/inventory/simple",
    description: "Inventaire rapide à partir d'un point et d'un rayon (mètres).",
    example: "/api/inventory/simple?lat=48.8566&lng=2.3522&radius=500",
  },
  {
    method: "GET",
    path: "/api/species/:taxonKey",
    description: "Détails d'une espèce GBIF : image, statut UICN, nom vernaculaire FR.",
    example: "/api/species/2492010",
  },
  {
    method: "GET",
    path: "/api/geocode",
    description: "Géocodage d'un lieu via Nominatim (OpenStreetMap).",
    example: "/api/geocode?q=Lille",
  },
  {
    method: "GET",
    path: "/api/lieux-dits",
    description: "Recherche de lieux-dits français (hameaux, fermes, quartiers) avec leur contour OSM si disponible — utilisable comme emprise projet.",
    example: "/api/lieux-dits?q=Le+Bois+du+Cerf",
  },
  {
    method: "GET",
    path: "/api/data-sources",
    description: "Catalogue d'autres sources de données biodiversité (DataCatalog) — 56 fournisseurs (Bretagne Vivante, Tela Botanica, OBIS, GeoNature régionaux…).",
    example: "/api/data-sources",
  },
  {
    method: "GET",
    path: "/api/sinp",
    description: "Liens SINP régionaux pertinents pour des coordonnées données.",
    example: "/api/sinp?lat=48.85&lng=2.35",
  },
  {
    method: "GET",
    path: "/api/sinp/all",
    description: "Liste complète des plateformes SINP couvertes.",
    example: "/api/sinp/all",
  },
  {
    method: "GET",
    path: "/api/presets",
    description: "Configurations préétablies pour les types de projets EIE.",
    example: "/api/presets",
  },
  {
    method: "GET",
    path: "/api/study-areas",
    description: "Définitions des trois aires d'étude EIE standard.",
    example: "/api/study-areas",
  },
  {
    method: "GET",
    path: "/api/taxon-groups",
    description: "Groupes taxonomiques utilisés pour le filtrage.",
    example: "/api/taxon-groups",
  },
  {
    method: "GET",
    path: "/api/health",
    description: "Vérification de l'état de l'API et liste des endpoints.",
    example: "/api/health",
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
      className="text-gray-400 hover:text-gray-600 p-1 rounded transition-colors"
      aria-label="Copier"
      data-testid={`button-copy-${text.slice(0, 20)}`}
    >
      {copied ? <Check className="h-3.5 w-3.5 text-teal-600" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

export function ApiDialog({ open, onOpenChange }: ApiDialogProps) {
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh]" data-testid="dialog-api">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Code2 className="h-5 w-5 text-teal-600" />
            API Inventaire Flash
          </DialogTitle>
          <DialogDescription>
            Endpoints REST publics pour intégrer les inventaires biodiversité dans vos outils.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[65vh] pr-4">
          <div className="space-y-4 text-sm">
            <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Base URL</div>
                  <code className="text-xs font-mono text-gray-800 break-all">{baseUrl}</code>
                </div>
                <CopyButton text={baseUrl} />
              </div>
            </div>

            <div className="space-y-3">
              {ENDPOINTS.map((endpoint) => {
                const fullExample = endpoint.example ? `${baseUrl}${endpoint.example}` : null;
                return (
                  <div
                    key={endpoint.path + endpoint.method}
                    className="border border-gray-200 rounded-lg overflow-hidden bg-white"
                    data-testid={`endpoint-${endpoint.method}-${endpoint.path.replace(/[^a-z0-9]/gi, '-')}`}
                  >
                    <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border-b border-gray-200">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                          endpoint.method === "GET"
                            ? "bg-blue-100 text-blue-700"
                            : "bg-green-100 text-green-700"
                        }`}
                      >
                        {endpoint.method}
                      </span>
                      <code className="text-xs font-mono font-semibold text-gray-900 flex-1 truncate">
                        {endpoint.path}
                      </code>
                      {fullExample && (
                        <a
                          href={fullExample}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-gray-400 hover:text-teal-600 p-1 rounded transition-colors"
                          aria-label="Tester l'endpoint"
                          data-testid={`link-test-${endpoint.path.replace(/[^a-z0-9]/gi, '-')}`}
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </div>
                    <div className="p-3 space-y-2">
                      <p className="text-xs text-gray-600 leading-relaxed">{endpoint.description}</p>
                      {endpoint.example && (
                        <div className="bg-gray-900 rounded p-2 flex items-start justify-between gap-2">
                          <code className="text-[11px] font-mono text-green-300 break-all">
                            curl "{baseUrl}{endpoint.example}"
                          </code>
                          <CopyButton text={`curl "${baseUrl}${endpoint.example}"`} />
                        </div>
                      )}
                      {endpoint.body && (
                        <div className="bg-gray-900 rounded p-2 flex items-start justify-between gap-2">
                          <pre className="text-[11px] font-mono text-green-300 overflow-x-auto whitespace-pre flex-1">
{`curl -X POST "${baseUrl}${endpoint.path}" \\
  -H "Content-Type: application/json" \\
  -d '${endpoint.body}'`}
                          </pre>
                          <CopyButton text={`curl -X POST "${baseUrl}${endpoint.path}" -H "Content-Type: application/json" -d '${endpoint.body}'`} />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
              <strong>Limites :</strong> rayon maximum 50 km par cercle, 10 cercles maximum par requête.
              Données sourcées de GBIF (api.gbif.org) — merci de citer GBIF dans vos productions.
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
