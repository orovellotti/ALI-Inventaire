import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MapPin, Search, Shapes, AlertCircle } from "lucide-react";
import { useState } from "react";
import type { ProjectPolygon } from "@/lib/shapefile";
import type { Geometry } from "geojson";

export interface LieuDitResult {
  id: string;
  name: string;
  displayName: string;
  type: string;
  lat: number;
  lng: number;
  commune: string;
  departement: string;
  region: string;
  geometry: Geometry | null;
  boundingbox: [number, number, number, number] | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectPolygon: (polygon: ProjectPolygon) => void;
  onSelectPoint: (lat: number, lng: number, name: string) => void;
}

const TYPE_LABEL: Record<string, string> = {
  hamlet: "Hameau",
  isolated_dwelling: "Habitation isolée",
  farm: "Ferme",
  locality: "Lieu-dit",
  neighbourhood: "Quartier",
  quarter: "Quartier",
  village: "Village",
  suburb: "Faubourg",
  allotments: "Jardins",
  city: "Ville",
  town: "Commune",
  municipality: "Commune",
  administrative: "Commune",
  boundary: "Limite administrative",
};

function bboxToBounds(bbox: [number, number, number, number]): [[number, number], [number, number]] {
  // Nominatim bbox: [south, north, west, east]
  const [s, n, w, e] = bbox;
  return [[s, w], [n, e]];
}

export function LieuxDitsDialog({ open, onOpenChange, onSelectPolygon, onSelectPoint }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LieuDitResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    setResults(null);
    try {
      const res = await fetch(`/api/lieux-dits?q=${encodeURIComponent(query.trim())}`);
      if (!res.ok) throw new Error("Recherche impossible");
      const data = await res.json();
      setResults(data.results || []);
    } catch (err: any) {
      setError(err.message || "Erreur de recherche");
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (lieu: LieuDitResult) => {
    if (lieu.geometry) {
      const polygon: ProjectPolygon = {
        geojson: {
          type: "FeatureCollection",
          features: [{ type: "Feature", geometry: lieu.geometry, properties: { name: lieu.name } }],
        },
        centroid: [lieu.lat, lieu.lng],
        bounds: lieu.boundingbox ? bboxToBounds(lieu.boundingbox) : [[lieu.lat - 0.01, lieu.lng - 0.01], [lieu.lat + 0.01, lieu.lng + 0.01]],
        name: lieu.name,
      };
      onSelectPolygon(polygon);
    } else {
      onSelectPoint(lieu.lat, lieu.lng, lieu.name);
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh]" data-testid="dialog-lieux-dits">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-teal-600" />
            Rechercher un lieu ou une commune
          </DialogTitle>
          <DialogDescription>
            Recherchez un hameau, lieu-dit, quartier ou commune dans le référentiel
            OpenStreetMap. Pour éviter les homonymes, ajoutez la commune ou le département.
            La couverture des petits lieux dépend des contributions disponibles. Si un
            contour est fourni, il sera utilisé ; sinon les aires seront centrées sur le point.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={runSearch} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ex : Les Gondoins, Champoléon"
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500"
              data-testid="input-lieu-dit-query"
              autoFocus
            />
          </div>
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="px-4 py-2 text-sm font-medium bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid="button-search-lieux-dits"
          >
            {loading ? "…" : "Chercher"}
          </button>
        </form>

        <ScrollArea className="max-h-[55vh] pr-4 -mr-4">
          {error && (
            <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
              <AlertCircle className="h-4 w-4" /> {error}
            </div>
          )}
          {results && results.length === 0 && (
            <div className="text-center py-8 text-sm text-gray-500">
              Aucun lieu trouvé. Essayez d’ajouter la commune ou le département.
            </div>
          )}
          <div className="space-y-2">
            {results?.map((lieu) => (
              <button
                key={lieu.id}
                type="button"
                onClick={() => handleSelect(lieu)}
                className="w-full text-left border border-gray-200 rounded-lg p-3 bg-white hover:border-teal-400 hover:bg-teal-50/30 transition-colors"
                data-testid={`lieu-dit-${lieu.id}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-sm text-gray-900">{lieu.name}</h3>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                        {TYPE_LABEL[lieu.type] || lieu.type}
                      </span>
                      {lieu.geometry && (
                        <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 border border-teal-200">
                          <Shapes className="h-3 w-3" /> Contour disponible
                        </span>
                      )}
                    </div>
                    <p className="text-xs font-medium text-gray-600 mt-1">
                      {[lieu.commune, lieu.departement, lieu.region].filter(Boolean).join(" · ")}
                    </p>
                    <p className="text-[11px] text-gray-400 mt-0.5 truncate">{lieu.displayName}</p>
                  </div>
                  <MapPin className="h-4 w-4 text-gray-400 shrink-0 mt-1" />
                </div>
              </button>
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
