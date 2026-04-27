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
  reason: string;
  level: "majeur" | "fort" | "modéré";
}

interface PriorityGroup {
  group: string;
  icon: string;
  species: PrioritySpecies[];
}

interface Analysis {
  toponym: string;
  summary: string;
  priorityGroups: PriorityGroup[];
  recommendations: string[];
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
      <DialogContent className="max-w-3xl max-h-[85vh]" data-testid="dialog-priority-species">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-teal-600" />
            Espèces à enjeux — analyse IA
          </DialogTitle>
          <DialogDescription>
            Lecture experte de l'inventaire GBIF par un modèle de langage : statuts UICN,
            espèces protégées, ZNIEFF déterminantes, directives Habitats/Oiseaux.
            <span className="block mt-1 text-amber-700 text-[11px]">
              Production assistée par IA — à valider par un écologue avant utilisation en EIE.
            </span>
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[65vh] pr-4 -mr-4">
          {loading && (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-sm text-gray-500">
              <Loader2 className="h-6 w-6 animate-spin text-teal-600" />
              Analyse de {occurrences.length} occurrences sur "{toponym}"…
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
              <AlertCircle className="h-4 w-4" /> {error}
            </div>
          )}

          {analysis && !loading && (
            <div className="space-y-4">
              <div className="bg-teal-50 border border-teal-200 rounded-lg p-3">
                <div className="text-xs font-semibold text-teal-800 uppercase tracking-wider mb-1">
                  Synthèse — {analysis.toponym}
                </div>
                <p className="text-sm text-gray-800 leading-relaxed">{analysis.summary}</p>
              </div>

              {analysis.priorityGroups.length === 0 ? (
                <div className="text-sm text-gray-500 text-center py-6">
                  Aucune espèce à enjeux notable identifiée sur ce site.
                </div>
              ) : (
                analysis.priorityGroups.map((group) => (
                  <div key={group.group} className="border border-gray-200 rounded-lg overflow-hidden">
                    <div className="bg-gray-50 px-3 py-2 border-b border-gray-200 flex items-center gap-2">
                      <span className="text-base">{group.icon}</span>
                      <h3 className="font-semibold text-sm text-gray-900">{group.group}</h3>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white border border-gray-200 text-gray-600">
                        {group.species.length}
                      </span>
                    </div>
                    <div className="divide-y divide-gray-100">
                      {group.species.map((sp, i) => {
                        const style = LEVEL_STYLE[sp.level] || LEVEL_STYLE["modéré"];
                        const StyleIcon = style.icon;
                        return (
                          <div key={i} className="p-3" data-testid={`priority-species-${i}`}>
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="italic text-sm font-medium text-gray-900">
                                    {sp.scientificName}
                                  </span>
                                  {sp.vernacularName && (
                                    <span className="text-xs text-gray-600">
                                      ({sp.vernacularName})
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-gray-600 mt-1 leading-relaxed">{sp.reason}</p>
                              </div>
                              <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border shrink-0 ${style.color}`}>
                                <StyleIcon className="h-3 w-3" />
                                {sp.level}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}

              {analysis.recommendations.length > 0 && (
                <div className="border border-teal-200 bg-teal-50/50 rounded-lg p-3">
                  <h3 className="text-xs font-semibold text-teal-800 uppercase tracking-wider mb-2">
                    Recommandations pour l'étude
                  </h3>
                  <ul className="space-y-1.5">
                    {analysis.recommendations.map((r, i) => (
                      <li key={i} className="text-sm text-gray-800 flex gap-2">
                        <span className="text-teal-600 shrink-0">→</span>
                        <span className="leading-relaxed">{r}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="text-[10px] text-gray-400 text-right">
                Généré le {new Date(analysis.generatedAt).toLocaleString("fr-FR")}
              </div>
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
