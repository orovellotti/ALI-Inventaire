import { Sparkles, AlertTriangle, AlertCircle, Info, Loader2, RefreshCw, ExternalLink, BookOpen } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import type { Occurrence } from "@/lib/gbif";

interface Props {
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
  sources?: string[];
  inInventory?: boolean;
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

export function PrioritySpeciesInline({ toponym, coords, occurrences }: Props) {
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastKeyRef = useRef<string>("");
  const requestIdRef = useRef(0);

  const slim = useMemo(() => {
    const seen = new Set<string>();
    return occurrences
      .filter(o => {
        if (seen.has(o.scientificName)) return false;
        seen.add(o.scientificName);
        return true;
      })
      .map(o => ({
        scientificName: o.scientificName,
        vernacularName: o.vernacularName,
        iucnStatus: o.iucnStatus,
        alertLevel: o.alertLevel,
        class: o.class,
        kingdom: o.kingdom,
      }));
  }, [occurrences]);

  const contentKey = useMemo(() => {
    const sig = slim
      .map(o => `${o.scientificName}|${o.iucnStatus || ""}|${o.alertLevel || ""}`)
      .sort()
      .join("§");
    return `${toponym}|${coords[0].toFixed(5)},${coords[1].toFixed(5)}|${sig}`;
  }, [toponym, coords, slim]);

  const runAnalysis = (force = false) => {
    if (slim.length === 0) return;
    if (!force && contentKey === lastKeyRef.current) return;
    const myId = ++requestIdRef.current;
    lastKeyRef.current = contentKey;
    setLoading(true);
    setError(null);
    setAnalysis(null);

    fetch("/api/llm/priority-species", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toponym, coords, occurrences: slim }),
    })
      .then(async (r) => {
        if (!r.ok) {
          const err = await r.json().catch(() => ({}));
          throw new Error(err.error || "Erreur d'analyse");
        }
        return r.json();
      })
      .then((data: Analysis) => {
        if (myId !== requestIdRef.current) return;
        setAnalysis(data);
      })
      .catch((e) => {
        if (myId !== requestIdRef.current) return;
        setError(e.message);
      })
      .finally(() => {
        if (myId === requestIdRef.current) setLoading(false);
      });
  };


  return (
    <div className="rounded-xl border border-teal-200 bg-gradient-to-br from-teal-50/60 to-emerald-50/40 p-4 space-y-3" data-testid="priority-species-inline">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="bg-teal-600 p-1.5 rounded-lg shrink-0">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-gray-900 truncate">Top 5 — espèces à enjeux (IA)</div>
            <div className="text-[11px] text-amber-700">Production IA — à valider par un écologue</div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => runAnalysis(true)}
          disabled={loading || slim.length === 0}
          className="text-[11px] flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-teal-600 hover:bg-teal-700 text-white disabled:opacity-50 shrink-0"
          data-testid="button-run-priority"
          title={analysis ? "Relancer l'analyse" : "Lancer l'analyse IA"}
        >
          {loading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <RefreshCw className="h-3 w-3" />
          )}
          {analysis ? "Relancer" : "Lancer l'analyse"}
        </button>
      </div>

      {!analysis && !loading && !error && (
        <div className="text-xs text-gray-600 bg-white/60 border border-dashed border-teal-200 rounded-lg p-3">
          Cliquez sur <span className="font-medium">Lancer l'analyse</span> pour identifier les espèces à enjeux par IA (consomme des crédits ; ~10-30 s).
        </div>
      )}

      {loading && (
        <div className="flex items-center gap-2 py-3 px-2 text-xs text-gray-600">
          <Loader2 className="h-4 w-4 animate-spin text-teal-600" />
          Analyse IA en cours… (peut prendre 10-30 s)
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      {analysis && !loading && (
        <div className="space-y-2">
          {analysis.species.length === 0 ? (
            <div className="text-xs text-gray-500 text-center py-3">
              Aucune espèce à enjeux notable identifiée.
            </div>
          ) : (
            analysis.species.map((sp, i) => {
              const style = LEVEL_STYLE[sp.level] || LEVEL_STYLE["modéré"];
              const StyleIcon = style.icon;
              return (
                <div
                  key={i}
                  className="border border-gray-200 rounded-lg p-2.5 bg-white"
                  data-testid={`priority-species-${i}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-base leading-none">{sp.icon}</span>
                        <span className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider">
                          #{i + 1} · {sp.group}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-baseline gap-2 flex-wrap">
                        <span className="italic text-sm font-medium text-gray-900">
                          {sp.scientificName}
                        </span>
                        {sp.vernacularName && (
                          <span className="text-xs text-gray-600">
                            ({sp.vernacularName})
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-gray-600 mt-1 leading-relaxed">{sp.reason}</p>
                      {sp.sources && sp.sources.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {sp.sources.map((src, j) => (
                            <span
                              key={j}
                              className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 border border-gray-200"
                              title="Référentiel cité par l'IA"
                            >
                              <BookOpen className="h-2 w-2" />
                              {src}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="mt-1.5 flex flex-wrap gap-2 text-[10px]">
                        <a
                          href={`https://inpn.mnhn.fr/espece/cd_nom/0?lr=fr&q=${encodeURIComponent(sp.scientificName)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-0.5 text-teal-700 hover:underline"
                        >
                          INPN <ExternalLink className="h-2.5 w-2.5" />
                        </a>
                        <a
                          href={`https://www.gbif.org/species/search?q=${encodeURIComponent(sp.scientificName)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-0.5 text-teal-700 hover:underline"
                        >
                          GBIF <ExternalLink className="h-2.5 w-2.5" />
                        </a>
                        <a
                          href={`https://www.inaturalist.org/search?q=${encodeURIComponent(sp.scientificName)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-0.5 text-teal-700 hover:underline"
                        >
                          iNat <ExternalLink className="h-2.5 w-2.5" />
                        </a>
                        {sp.inInventory === false && (
                          <span className="text-[9px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                            hors inventaire (suggestion IA)
                          </span>
                        )}
                      </div>
                    </div>
                    <span className={`inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-full border shrink-0 ${style.color}`}>
                      <StyleIcon className="h-2.5 w-2.5" />
                      {sp.level}
                    </span>
                  </div>
                </div>
              );
            })
          )}
          <div className="mt-2 pt-2 border-t border-teal-100 text-[10px] text-gray-500 space-y-1">
            <div className="font-semibold text-gray-600">Référentiels mobilisables :</div>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5">
              <a href="https://uicn.fr/listes-rouges-france/" target="_blank" rel="noopener noreferrer" className="hover:text-teal-700 hover:underline">UICN France</a>
              <a href="https://www.iucnredlist.org/" target="_blank" rel="noopener noreferrer" className="hover:text-teal-700 hover:underline">UICN Monde</a>
              <a href="https://www.legifrance.gouv.fr/loda/id/JORFTEXT000021384277/" target="_blank" rel="noopener noreferrer" className="hover:text-teal-700 hover:underline">Arrêté 29 oct. 2009 (oiseaux)</a>
              <a href="https://eur-lex.europa.eu/legal-content/FR/TXT/?uri=CELEX:32009L0147" target="_blank" rel="noopener noreferrer" className="hover:text-teal-700 hover:underline">Directive Oiseaux</a>
              <a href="https://eur-lex.europa.eu/legal-content/FR/TXT/?uri=CELEX:31992L0043" target="_blank" rel="noopener noreferrer" className="hover:text-teal-700 hover:underline">Directive Habitats</a>
              <a href="https://inpn.mnhn.fr/programme/inventaire-znieff/presentation" target="_blank" rel="noopener noreferrer" className="hover:text-teal-700 hover:underline">ZNIEFF (INPN)</a>
            </div>
            <div className="text-right text-[9px] text-gray-400 pt-1">
              Généré le {new Date(analysis.generatedAt).toLocaleString("fr-FR")} · gpt-4o-mini
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
