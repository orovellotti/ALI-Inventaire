import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sparkles, AlertTriangle, AlertCircle, Info, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { Occurrence } from "@/lib/gbif";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  toponym: string;
  coords: [number, number];
  occurrences: Occurrence[];
}

interface PrioritySpecies {
  scientificName: string;
  vernacularName?: string;
  group: string;
  icon: string;
  reason: string;
  level: "majeur" | "fort" | "modéré";
}

interface Analysis {
  toponym: string;
  species: PrioritySpecies[];
  generatedAt: string;
}

const LEVEL_STYLE: Record<string, { color: string; icon: typeof AlertTriangle }> = {
  majeur: { color: "text-red-700 bg-red-50 border-red-200", icon: AlertTriangle },
  fort: { color: "text-orange-700 bg-orange-50 border-orange-200", icon: AlertCircle },
  modéré: { color: "text-amber-700 bg-amber-50 border-amber-200", icon: Info },
};

export function PrioritySpeciesDialog({ open, onOpenChange, toponym, coords, occurrences }: Props) {
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastKey, setLastKey] = useState<string>("");

  useEffect(() => {
    if (!open) return;
    const key = `${toponym}|${coords.join(",")}|${occurrences.length}`;
    if (key === lastKey && analysis) return;

    setLoading(true);
    setError(null);
    setAnalysis(null);

    fetch("/api/llm/priority-species", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toponym, coords, occurrences }),
    })
      .then(async (r) => {
        if (!r.ok) {
          const err = await r.json().catch(() => ({}));
          throw new Error(err.error || "Erreur d'analyse");
        }
        return r.json();
      })
      .then((data: Analysis) => {
        setAnalysis(data);
        setLastKey(key);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [open, toponym, coords, occurrences, lastKey, analysis]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh]" data-testid="dialog-priority-species">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-teal-600" />
            Top 5 — espèces à enjeux
          </DialogTitle>
          <DialogDescription>
            Sélection IA des 5 espèces les plus sensibles sur "{toponym}".
            <span className="block mt-1 text-amber-700 text-[11px]">
              Production IA — à valider par un écologue.
            </span>
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[65vh] pr-4 -mr-4">
          {loading && (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-sm text-gray-500">
              <Loader2 className="h-6 w-6 animate-spin text-teal-600" />
              Analyse en cours…
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
              <AlertCircle className="h-4 w-4" /> {error}
            </div>
          )}

          {analysis && !loading && (
            <div className="space-y-2">
              {analysis.species.length === 0 ? (
                <div className="text-sm text-gray-500 text-center py-6">
                  Aucune espèce à enjeux notable identifiée.
                </div>
              ) : (
                analysis.species.map((sp, i) => {
                  const style = LEVEL_STYLE[sp.level] || LEVEL_STYLE["modéré"];
                  const StyleIcon = style.icon;
                  return (
                    <div
                      key={i}
                      className="border border-gray-200 rounded-lg p-3 bg-white hover:bg-gray-50 transition-colors"
                      data-testid={`priority-species-${i}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-lg leading-none">{sp.icon}</span>
                            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                              #{i + 1} · {sp.group}
                            </span>
                          </div>
                          <div className="mt-1 flex items-baseline gap-2 flex-wrap">
                            <span className="italic font-medium text-gray-900">
                              {sp.scientificName}
                            </span>
                            {sp.vernacularName && (
                              <span className="text-sm text-gray-600">
                                ({sp.vernacularName})
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-600 mt-1.5 leading-relaxed">{sp.reason}</p>
                        </div>
                        <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border shrink-0 ${style.color}`}>
                          <StyleIcon className="h-3 w-3" />
                          {sp.level}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}

              <div className="text-[10px] text-gray-400 text-right pt-2">
                Généré le {new Date(analysis.generatedAt).toLocaleString("fr-FR")}
              </div>
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
