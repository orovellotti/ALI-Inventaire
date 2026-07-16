import { Sparkles, AlertTriangle, AlertCircle, Info, Loader2, RefreshCw, ExternalLink, BookOpen, Layers } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import type { Occurrence } from "@/lib/gbif";

interface Props {
  toponym: string;
  coords: [number, number];
  occurrences: Occurrence[];
  onAnalysisChange?: (a: Analysis | null) => void;
}

interface SpeciesStatus {
  category: string;
  value: string;
  label: string;
  tone: "danger" | "warn" | "info" | "neutral";
  scope?: string;
  docUrl?: string;
}

type EvidenceClass = "A" | "B" | "C" | "D" | "E";

interface PrioritySpecies {
  scientificName: string;
  vernacularName?: string;
  group: string;
  icon: string;
  reason: string;
  level: "majeur" | "fort" | "modéré";
  sources?: string[];
  inInventory?: boolean;
  aliUrl?: string;
  statuses?: SpeciesStatus[];
  patrimonialite?: { score: number; level: "majeure" | "forte" | "modérée" | "faible" };
  evidenceClass?: EvidenceClass;
  evidenceLabel?: string;
  score?: number;
  scoreLabel?: string;
}

const EVIDENCE_STYLE: Record<EvidenceClass, { color: string; short: string }> = {
  A: { color: "bg-emerald-100 text-emerald-800 border-emerald-300", short: "A" },
  B: { color: "bg-teal-100 text-teal-800 border-teal-300", short: "B" },
  C: { color: "bg-sky-100 text-sky-800 border-sky-300", short: "C" },
  D: { color: "bg-amber-100 text-amber-800 border-amber-300", short: "D" },
  E: { color: "bg-gray-100 text-gray-600 border-gray-300", short: "E" },
};

const EVIDENCE_GROUP_LABEL: Record<EvidenceClass, string> = {
  A: "Avéré localement",
  B: "Avéré à l'échelle du site",
  C: "Très probable localement",
  D: "Potentielle",
  E: "Peu pertinente localement",
};

// C (très probable localement, habitat favorable dans l'emprise) avant B
// (avéré à l'échelle du site) pour privilégier la pertinence locale.
const EVIDENCE_GROUP_ORDER: EvidenceClass[] = ["A", "C", "B", "D", "E"];

function scoreColor(score: number): string {
  if (score >= 85) return "bg-red-100 text-red-700 border-red-300";
  if (score >= 70) return "bg-orange-100 text-orange-700 border-orange-300";
  if (score >= 50) return "bg-amber-100 text-amber-700 border-amber-300";
  if (score >= 30) return "bg-yellow-50 text-yellow-700 border-yellow-200";
  return "bg-gray-50 text-gray-500 border-gray-200";
}

const PATRIMONIALITE_STYLE: Record<string, string> = {
  majeure: "bg-red-100 text-red-700 border-red-200",
  forte: "bg-orange-100 text-orange-700 border-orange-200",
  modérée: "bg-yellow-100 text-yellow-700 border-yellow-200",
  faible: "bg-green-100 text-green-700 border-green-200",
};

const STATUS_TONE: Record<string, string> = {
  danger: "bg-red-50 text-red-700 border-red-200",
  warn: "bg-orange-50 text-orange-700 border-orange-200",
  info: "bg-sky-50 text-sky-700 border-sky-200",
  neutral: "bg-gray-50 text-gray-600 border-gray-200",
};

interface NaturaZoneSpecies {
  name: string;
  designating: boolean;
  grade?: string | null;
}

interface Natura2000Zone {
  type: string;
  name: string;
  url: string | null;
  code?: string | null;
  species?: NaturaZoneSpecies[];
}

interface Analysis {
  toponym: string;
  species: PrioritySpecies[];
  natura2000?: Natura2000Zone[];
  generatedAt: string;
}

const LEVEL_STYLE: Record<string, { color: string; icon: typeof AlertTriangle }> = {
  majeur: { color: "text-red-700 bg-red-50 border-red-200", icon: AlertTriangle },
  fort: { color: "text-orange-700 bg-orange-50 border-orange-200", icon: AlertCircle },
  modéré: { color: "text-amber-700 bg-amber-50 border-amber-200", icon: Info },
};

export function PrioritySpeciesInline({ toponym, coords, occurrences, onAnalysisChange }: Props) {
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastKeyRef = useRef<string>("");
  const requestIdRef = useRef(0);

  const slim = useMemo(() => {
    const d2 = (o: Occurrence) =>
      typeof o.decimalLatitude === "number" && typeof o.decimalLongitude === "number"
        ? (o.decimalLatitude - coords[0]) ** 2 + (o.decimalLongitude - coords[1]) ** 2
        : Infinity;
    // Une seule entrée par espèce, en gardant l'occurrence la plus proche du
    // centre pour que le serveur distingue correctement preuve locale (A) et
    // proximité (C).
    const nearest = new Map<string, Occurrence>();
    for (const o of occurrences) {
      const prev = nearest.get(o.scientificName);
      if (!prev || d2(o) < d2(prev)) nearest.set(o.scientificName, o);
    }
    return Array.from(nearest.values()).map(o => ({
      scientificName: o.scientificName,
      vernacularName: o.vernacularName,
      iucnStatus: o.iucnStatus,
      alertLevel: o.alertLevel,
      class: o.class,
      kingdom: o.kingdom,
      decimalLatitude: o.decimalLatitude,
      decimalLongitude: o.decimalLongitude,
      source: o.source,
      observationCount: o.observationCount,
      lastObservationYear: o.lastObservationYear,
    }));
  }, [occurrences, coords]);

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
        onAnalysisChange?.(data);
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
    <div className="rounded-lg border border-gray-200 bg-white p-3 space-y-2.5" data-testid="priority-species-inline">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles className="h-3.5 w-3.5 text-teal-600 shrink-0" />
          <div className="min-w-0">
            <div className="text-xs font-semibold text-gray-700 truncate">Analyse IA — espèces à enjeux</div>
            <div className="text-[10px] text-gray-400">À valider par un écologue</div>
          </div>
        </div>
        {analysis && (
          <button
            type="button"
            onClick={() => runAnalysis(true)}
            disabled={loading || slim.length === 0}
            className="text-xs flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-white hover:bg-gray-50 text-teal-700 border border-teal-200 disabled:opacity-50 shrink-0"
            data-testid="button-run-priority"
            title="Relancer l'analyse"
          >
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            Relancer
          </button>
        )}
      </div>

      {!analysis && !loading && !error && (
        <button
          type="button"
          onClick={() => runAnalysis(true)}
          disabled={slim.length === 0}
          data-testid="button-run-priority"
          className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md bg-teal-50 hover:bg-teal-100 text-teal-700 font-medium text-xs border border-teal-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Sparkles className="h-3 w-3" />
          Lancer l'analyse IA <span className="text-[10px] opacity-70">(~5 s)</span>
        </button>
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
          {analysis.natura2000 && analysis.natura2000.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-2.5" data-testid="natura2000-nearby">
              <div className="text-[9px] font-semibold text-amber-700 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                <Layers className="h-3 w-3" /> Zones Natura 2000 à proximité ({analysis.natura2000.length})
              </div>
              <div className="space-y-1">
                {analysis.natura2000.map((z, i) => {
                  const href = z.url && /^https?:\/\//i.test(z.url) ? z.url : null;
                  return (
                    <div key={i} className="text-[11px] text-amber-800 leading-snug" data-testid={`natura2000-zone-${i}`}>
                      <span className="font-semibold">{z.type}</span> — {z.name}
                      {href && (
                        <a
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-0.5 ml-1 text-amber-700 hover:underline"
                        >
                          <ExternalLink className="h-2.5 w-2.5" />
                        </a>
                      )}
                      {(() => {
                        const desig = (z.species ?? []).filter((s) => s.designating).map((s) => s.name);
                        if (desig.length === 0) return null;
                        return (
                          <div className="mt-0.5 text-[10px] text-amber-700/90 leading-snug" data-testid={`natura2000-species-${i}`}>
                            <span className="font-medium">Espèces désignatrices :</span>{" "}
                            <span className="italic">{desig.join(", ")}</span>
                          </div>
                        );
                      })()}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {analysis.species.length === 0 ? (
            <div className="text-xs text-gray-500 text-center py-3">
              Aucune espèce à enjeux notable identifiée.
            </div>
          ) : (
            EVIDENCE_GROUP_ORDER.filter((cls) =>
              analysis.species.some((sp) => (sp.evidenceClass ?? "D") === cls),
            ).map((cls) => (
              <div key={cls} className="space-y-2" data-testid={`evidence-group-${cls}`}>
                <div className="flex items-center gap-1.5 pt-1">
                  <span
                    className={`inline-flex items-center justify-center h-4 w-4 text-[9px] font-bold rounded-full border ${EVIDENCE_STYLE[cls].color}`}
                  >
                    {cls}
                  </span>
                  <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                    {EVIDENCE_GROUP_LABEL[cls]}
                  </span>
                </div>
                {analysis.species
                  .map((sp, i) => ({ sp, i }))
                  .filter(({ sp }) => (sp.evidenceClass ?? "D") === cls)
                  .map(({ sp, i }) => {
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
                        {sp.evidenceClass && (
                          <span
                            className={`inline-flex items-center gap-1 text-[9px] font-semibold px-1.5 py-0.5 rounded-full border ${EVIDENCE_STYLE[sp.evidenceClass].color}`}
                            title="Niveau de preuve (indépendant de l'importance)"
                            data-testid={`evidence-species-${i}`}
                          >
                            Preuve {EVIDENCE_STYLE[sp.evidenceClass].short} · {sp.evidenceLabel}
                          </span>
                        )}
                        {typeof sp.score === "number" && (
                          <span
                            className={`inline-flex items-center gap-1 text-[9px] font-semibold px-1.5 py-0.5 rounded-full border ${scoreColor(sp.score)}`}
                            title="Score d'enjeu 0–100 (statut, importance du site, occurrence, qualité)"
                            data-testid={`score-species-${i}`}
                          >
                            Enjeu {sp.score}/100{sp.scoreLabel ? ` · ${sp.scoreLabel}` : ""}
                          </span>
                        )}
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
                      {sp.patrimonialite && (
                        <div className="mt-1">
                          <span
                            className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${PATRIMONIALITE_STYLE[sp.patrimonialite.level] || PATRIMONIALITE_STYLE.faible}`}
                            title="Score de patrimonialité ALI Species (0,5 × écologique + 0,3 × réglementaire + 0,2 × territorial)"
                            data-testid={`patrimonialite-species-${i}`}
                          >
                            Patrimonialité {sp.patrimonialite.level} · {sp.patrimonialite.score}/100
                          </span>
                        </div>
                      )}
                      <p className="text-[11px] text-gray-600 mt-1 leading-relaxed">{sp.reason}</p>
                      {sp.statuses && sp.statuses.length > 0 && (
                        <div className="mt-1.5">
                          <div className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
                            Statuts réglementaires (ALI / TAXREF)
                          </div>
                          <div className="flex flex-wrap gap-1" data-testid={`statuses-species-${i}`}>
                            {sp.statuses.map((st, j) => (
                              <span
                                key={j}
                                className={`inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded border ${STATUS_TONE[st.tone] || STATUS_TONE.neutral}`}
                                title={`${st.label}${st.scope ? ` — ${st.scope}` : ""}`}
                              >
                                <span className="opacity-70">{st.category}:</span>
                                <span className="font-semibold">{st.value}</span>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
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
                        <a
                          href={sp.aliUrl || `/api/ali/redirect?q=${encodeURIComponent(sp.scientificName)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-0.5 text-teal-700 hover:underline"
                          title="Fiche statuts ALI / TAXREF"
                        >
                          ALI <ExternalLink className="h-2.5 w-2.5" />
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
                  })}
              </div>
            ))
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
