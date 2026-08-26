import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, ChevronUp, Database, Layers3, Leaf, Loader2 } from "lucide-react";

type Effort = 1 | 2 | 3;

interface Step {
  label: string;
  detail: string;
  /** Durée indicative de l'étape en ms (l'appel réseau reste unique). */
  duration: number;
  /** 1 = effort léger, 2 = effort modéré, 3 = effort intense. */
  effort: Effort;
}

/** Vitesse des animations selon l'effort (durée d'un cycle en secondes). */
const EFFORT_SPEED: Record<Effort, number> = {
  1: 2.4,
  2: 1.4,
  3: 0.7,
};

function buildSteps(includeINaturalist: boolean, areaCount: number): Step[] {
  const steps: Step[] = [
    {
      label: "Je lance le croisement de vos données",
      detail:
        areaCount > 1
          ? `${areaCount} aires d’étude seront analysées en parallèle`
          : "Votre aire d’étude est prête à être interrogée",
      duration: 900,
      effort: 1,
    },
    {
      label: "J’interroge les occurrences observées",
      detail: includeINaturalist
        ? "GBIF et iNaturalist sont consultés en parallèle"
        : "GBIF est consulté pour les occurrences disponibles",
      duration: 6800,
      effort: 3,
    },
  ];
  steps.push(
    {
      label: "Je recoupe les données reçues",
      detail: "Les résultats sont consolidés avant l’affichage",
      duration: 2400,
      effort: 2,
    },
    {
      label: "Je prépare votre inventaire",
      detail: "Les résultats vont s’ouvrir dès que le croisement est prêt",
      duration: 6000,
      effort: 1,
    },
  );
  return steps;
}

/** Indicateur discret du travail en cours, dont la vitesse dépend de l'effort. */
function EffortMeter({ effort }: { effort: Effort }) {
  const speed = EFFORT_SPEED[effort];
  return (
    <span className="inline-flex h-3.5 items-end gap-[3px]" aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className="w-[3px] rounded-full bg-teal-600"
          data-ifx-motion
          style={{
            animation: `ifx-eq ${speed}s ease-in-out ${i * (speed / 5)}s infinite`,
            height: "30%",
          }}
        />
      ))}
    </span>
  );
}

export function AnalysisProgress({
  active,
  includeINaturalist,
  areaCount,
  zonagesLoading,
  zonagesReady,
  zonageFeatureCount,
  potentialSpeciesLoading,
  potentialSpeciesReady,
  potentialSpeciesCount,
}: {
  active: boolean;
  includeINaturalist: boolean;
  areaCount: number;
  zonagesLoading: boolean;
  zonagesReady: boolean;
  zonageFeatureCount: number;
  potentialSpeciesLoading: boolean;
  potentialSpeciesReady: boolean;
  potentialSpeciesCount: number;
}) {
  const steps = useMemo(
    () => buildSteps(includeINaturalist, areaCount),
    [includeINaturalist, areaCount],
  );
  const [visible, setVisible] = useState(false);
  const [done, setDone] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [openAgentDetail, setOpenAgentDetail] = useState<"occurrences" | "zonages" | "potential" | null>(null);
  const startRef = useRef(0);

  // Démarrage / fin pilotés par `active`.
  useEffect(() => {
    if (active) {
      setVisible(true);
      setDone(false);
      setStepIndex(0);
      setProgress(0);
      setOpenAgentDetail(null);
      startRef.current = Date.now();
      return;
    }
    if (!visible) return;
    // La réponse est arrivée : on termine visuellement, puis on disparaît.
    setDone(true);
    setProgress(100);
    setStepIndex(steps.length - 1);
    const t = setTimeout(() => setVisible(false), 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // Progression pilotée par le temps : chaque étape avance à son rythme,
  // et l'ensemble plafonne tant que la réponse n'est pas arrivée.
  useEffect(() => {
    if (!active || !visible) return;
    const totalPlanned = steps.reduce((sum, s) => sum + s.duration, 0);
    const interval = setInterval(() => {
      const elapsed = Date.now() - startRef.current;
      let acc = 0;
      let idx = steps.length - 1;
      for (let i = 0; i < steps.length; i++) {
        if (elapsed < acc + steps[i].duration) {
          idx = i;
          break;
        }
        acc += steps[i].duration;
      }
      setStepIndex(idx);
      // Progression asymptotique : ne dépasse jamais 94 % avant la réponse.
      const linear = Math.min(1, elapsed / totalPlanned);
      const eased = 1 - Math.pow(1 - linear, 1.6);
      setProgress(Math.min(94, Math.round(eased * 94)));
    }, 120);
    return () => clearInterval(interval);
  }, [active, visible, steps]);

  if (!visible) return null;

  const currentEffort: Effort = done ? 1 : steps[stepIndex].effort;
  const pulseSpeed = EFFORT_SPEED[currentEffort];
  const observationsSearching = !done && stepIndex < 2;
  const zonageLabel = zonagesLoading
    ? "Recherche des zonages en cours"
    : zonagesReady
      ? zonageFeatureCount > 0
        ? `${zonageFeatureCount} emprise${zonageFeatureCount > 1 ? "s" : ""} trouvée${zonageFeatureCount > 1 ? "s" : ""}`
        : "Aucune emprise trouvée"
      : "Zonages indisponibles";
  const potentialLabel = potentialSpeciesLoading
    ? "Calcul des espèces potentielles en cours"
    : potentialSpeciesReady
      ? `${potentialSpeciesCount} espèce${potentialSpeciesCount > 1 ? "s" : ""} potentielle${potentialSpeciesCount > 1 ? "s" : ""}`
      : "Espèces potentielles indisponibles";
  const agents = [
    {
      id: "occurrences" as const,
      marker: "AO",
      name: "Agent Occurrences",
      icon: Database,
      tone: "text-[#2f705a]",
      markerTone: "bg-[#dceee1] text-[#27614d]",
      status: observationsSearching ? "En recherche" : "Croisement en cours",
      activity: observationsSearching ? "Interroge les occurrences disponibles" : "Prépare les données pour l’inventaire",
      detail: `Sources : ${includeINaturalist ? "GBIF et iNaturalist" : "GBIF"}.`,
      working: true,
      ready: false,
    },
    {
      id: "zonages" as const,
      marker: "AZ",
      name: "Agent Zonages",
      icon: Layers3,
      tone: "text-[#50718a]",
      markerTone: "bg-[#e1edf2] text-[#466d85]",
      status: zonagesLoading ? "En recherche" : zonagesReady ? "Terminé" : "Indisponible",
      activity: zonageLabel,
      detail: "Sources : IGN / PatriNat.",
      working: zonagesLoading,
      ready: zonagesReady,
    },
    {
      id: "potential" as const,
      marker: "AP",
      name: "Agent Potentiel écologique",
      icon: Leaf,
      tone: "text-[#6f7650]",
      markerTone: "bg-[#eff0dc] text-[#696f45]",
      status: potentialSpeciesLoading ? "En calcul" : potentialSpeciesReady ? "Terminé" : "Indisponible",
      activity: potentialLabel,
      detail: "Calcul lancé pour l’aire d’étude.",
      working: potentialSpeciesLoading,
      ready: potentialSpeciesReady,
    },
  ];

  return (
    <div className="pointer-events-none absolute inset-0 z-[1200] flex items-end justify-center pb-5 sm:items-center sm:pb-0">
      <style>{`
        @keyframes ifx-eq {
          0%, 100% { height: 25%; }
          50% { height: 100%; }
        }
        @keyframes ifx-ring {
          0% { transform: scale(0.55); opacity: 0.9; }
          100% { transform: scale(1.6); opacity: 0; }
        }
        @keyframes ifx-leaf {
          0%, 100% { transform: rotate(-6deg) scale(1); }
          50% { transform: rotate(6deg) scale(1.08); }
        }
        @keyframes ifx-arrive {
          from { transform: translateY(8px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @media (prefers-reduced-motion: reduce) {
          [data-ifx-motion] {
            animation: none !important;
            transition: none !important;
          }
        }
      `}</style>
      <div
        className="pointer-events-auto mx-4 w-full max-w-md overflow-hidden rounded-[20px] border border-teal-950/10 bg-[#f8faf5]/95 shadow-[0_18px_50px_rgba(28,54,45,0.18)] backdrop-blur"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        data-testid="analysis-progress"
      >
        <div className="border-b border-[#d8e2d5] px-5 pb-4 pt-5">
          <div className="flex items-start gap-3.5">
            <div className="relative mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center">
            {[0, 1].map((i) => (
              <span
                key={i}
                className="absolute inset-0 rounded-full border border-[#5c8877]"
                data-ifx-motion
                style={{
                  animation: `ifx-ring ${pulseSpeed * 1.6}s ease-out ${i * (pulseSpeed * 0.8)}s infinite`,
                }}
              />
            ))}
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#245746] text-[#f4f7ee] shadow-sm">
              {done ? (
                <Check className="h-5 w-5" />
              ) : (
                <Leaf
                  className="h-5 w-5"
                  data-ifx-motion
                  style={{ animation: `ifx-leaf ${pulseSpeed}s ease-in-out infinite` }}
                />
              )}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold tracking-tight text-[#19362d]">
                Ally
              </p>
              {!done && <EffortMeter effort={currentEffort} />}
            </div>
            <p className="mt-1 text-[13px] leading-5 text-[#36584b]" data-ifx-motion style={{ animation: "ifx-arrive 260ms ease-out both" }}>
              {done ? "J’ai terminé le croisement. Ouverture des résultats…" : "Je coordonne trois analyses en parallèle."}
            </p>
            {!done && <p className="mt-0.5 text-xs leading-4 text-[#6b7d73]">{steps[stepIndex].label}</p>}
          </div>
        </div>

          <div className="mt-4 flex items-center gap-3">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#dce8dc]">
          <div
                className="h-full rounded-full bg-[#2f7660] transition-[width] duration-300 ease-out"
            data-ifx-motion
            style={{ width: `${progress}%` }}
          />
            </div>
            <span className="w-8 text-right font-mono text-[10px] font-semibold tabular-nums text-[#587166]">
              {progress}%
            </span>
          </div>
        </div>

        {!done && (
          <div className="px-5 py-3.5">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-[#789084]">Analyses coordonnées en parallèle</p>
            <ul className="space-y-1.5">
              {agents.map((agent) => {
                const Icon = agent.icon;
                const detailOpen = openAgentDetail === agent.id;
                return (
                  <li key={agent.id} className="rounded-xl border border-[#dfe8de] bg-[#fbfcf8] px-3 py-2.5">
                    <div className="flex items-start gap-2.5">
                      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg font-mono text-[10px] font-bold ${agent.markerTone}`} aria-hidden="true">
                        {agent.marker}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex min-w-0 items-center gap-1.5">
                            <Icon className={`h-3.5 w-3.5 shrink-0 ${agent.tone}`} aria-hidden="true" />
                            <span className="truncate text-xs font-semibold text-[#36584b]">{agent.name}</span>
                          </div>
                          <span className="flex shrink-0 items-center gap-1 text-[10px] font-medium text-[#72847b]">
                            {agent.working ? (
                              <Loader2 className={`h-3 w-3 animate-spin ${agent.tone}`} data-ifx-motion aria-hidden="true" />
                            ) : agent.ready ? (
                              <Check className={`h-3 w-3 ${agent.tone}`} aria-hidden="true" />
                            ) : (
                              <span className="h-1.5 w-1.5 rounded-full bg-[#9aa89f]" aria-hidden="true" />
                            )}
                            {agent.status}
                          </span>
                        </div>
                        <p className="mt-0.5 text-[11px] leading-4 text-[#66796e]">{agent.activity}</p>
                        <button
                          type="button"
                          onClick={() => setOpenAgentDetail((open) => open === agent.id ? null : agent.id)}
                          className="mt-1 flex items-center gap-1 text-[10px] font-medium text-[#62766b] transition-colors hover:text-[#245746] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4e8a73] focus-visible:ring-offset-1"
                          aria-expanded={detailOpen}
                          aria-controls={`agent-detail-${agent.id}`}
                        >
                          Détail de la source
                          {detailOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                        </button>
                        {detailOpen && (
                          <p id={`agent-detail-${agent.id}`} className="mt-1 rounded-md bg-[#f2f6ef] px-2 py-1 text-[10px] leading-4 text-[#5d7166]">
                            {agent.detail}
                          </p>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
