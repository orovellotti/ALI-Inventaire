import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Layers3, Leaf, Loader2 } from "lucide-react";

type Effort = 1 | 2 | 3;

interface Step {
  label: string;
  detail: string;
  /** Durée indicative de l'étape en ms (l'appel réseau reste unique). */
  duration: number;
  /** 1 = effort léger, 2 = effort modéré, 3 = effort intense. */
  effort: Effort;
}

const EFFORT_LABEL: Record<Effort, string> = {
  1: "effort léger",
  2: "effort modéré",
  3: "effort intense",
};

/** Vitesse des animations selon l'effort (durée d'un cycle en secondes). */
const EFFORT_SPEED: Record<Effort, number> = {
  1: 2.4,
  2: 1.4,
  3: 0.7,
};

function buildSteps(includeINaturalist: boolean, areaCount: number): Step[] {
  const steps: Step[] = [
    {
      label: "Préparation des aires d'étude",
      detail:
        areaCount > 1
          ? `${areaCount} aires actives, requêtes lancées en parallèle`
          : "1 aire active, requête en préparation",
      duration: 900,
      effort: 1,
    },
    {
      label: "Interrogation des sources en parallèle",
      detail: includeINaturalist
        ? "GBIF, iNaturalist et zonages IGN / PatriNat"
        : "GBIF et zonages IGN / PatriNat",
      duration: 6800,
      effort: 3,
    },
  ];
  steps.push(
    {
      label: "Consolidation des données",
      detail: "Espèces, statuts et zonages territoriaux",
      duration: 2400,
      effort: 2,
    },
    {
      label: "Finalisation des résultats",
      detail: "Mise en forme de l'inventaire",
      duration: 6000,
      effort: 1,
    },
  );
  return steps;
}

/** Barres animées façon égaliseur, dont la vitesse dépend de l'effort. */
function EffortMeter({ effort }: { effort: Effort }) {
  const speed = EFFORT_SPEED[effort];
  return (
    <span className="inline-flex h-3.5 items-end gap-[3px]" aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className="w-[3px] rounded-full bg-teal-600"
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
}: {
  active: boolean;
  includeINaturalist: boolean;
  areaCount: number;
  zonagesLoading: boolean;
  zonagesReady: boolean;
  zonageFeatureCount: number;
}) {
  const steps = useMemo(
    () => buildSteps(includeINaturalist, areaCount),
    [includeINaturalist, areaCount],
  );
  const [visible, setVisible] = useState(false);
  const [done, setDone] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const startRef = useRef(0);

  // Démarrage / fin pilotés par `active`.
  useEffect(() => {
    if (active) {
      setVisible(true);
      setDone(false);
      setStepIndex(0);
      setProgress(0);
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

  return (
    <div className="pointer-events-none absolute inset-0 z-[1200] flex items-end justify-center pb-10 sm:items-center sm:pb-0">
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
      `}</style>
      <div
        className="pointer-events-auto mx-4 w-full max-w-sm rounded-2xl border border-teal-100 bg-white/90 p-5 shadow-xl backdrop-blur"
        role="status"
        aria-live="polite"
        data-testid="analysis-progress"
      >
        <div className="flex items-center gap-4">
          {/* Vignette animée : rythme calé sur l'effort de l'étape en cours */}
          <div className="relative flex h-14 w-14 shrink-0 items-center justify-center">
            {[0, 1].map((i) => (
              <span
                key={i}
                className="absolute inset-0 rounded-full border-2 border-teal-500"
                style={{
                  animation: `ifx-ring ${pulseSpeed * 1.6}s ease-out ${i * (pulseSpeed * 0.8)}s infinite`,
                }}
              />
            ))}
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-teal-600 text-white shadow-sm">
              {done ? (
                <Check className="h-5 w-5" />
              ) : (
                <Leaf
                  className="h-5 w-5"
                  style={{ animation: `ifx-leaf ${pulseSpeed}s ease-in-out infinite` }}
                />
              )}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-sm font-semibold text-gray-900">
                {done ? "Inventaire terminé" : steps[stepIndex].label}
              </p>
              {!done && <EffortMeter effort={currentEffort} />}
            </div>
            <p className="mt-0.5 truncate text-xs text-gray-500">
              {done ? "Ouverture des résultats…" : steps[stepIndex].detail}
            </p>
          </div>
        </div>

        {/* Barre de progression globale */}
        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-teal-100">
          <div
            className="h-full rounded-full bg-teal-600 transition-[width] duration-300 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>

        {!done && (
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-sky-50 px-3 py-2 text-[11px] font-medium text-sky-800">
            {zonagesLoading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                Recherche des zonages IGN / PatriNat…
              </>
            ) : zonagesReady ? (
              <>
                <Check className="h-3.5 w-3.5 shrink-0 text-teal-600" />
                {zonageFeatureCount > 0
                  ? `${zonageFeatureCount} emprise${zonageFeatureCount > 1 ? "s" : ""} affichée${zonageFeatureCount > 1 ? "s" : ""} sur la carte`
                  : "Aucune emprise de zonage trouvée dans l’aire"}
              </>
            ) : (
              <>
                <Layers3 className="h-3.5 w-3.5 shrink-0" />
                Zonages indisponibles, recherche des espèces poursuivie
              </>
            )}
          </div>
        )}

        {/* Étapes : passées, en cours (avec effort), à venir */}
        <ol className="mt-4 space-y-1.5">
          {steps.map((step, i) => {
            const state = done || i < stepIndex ? "done" : i === stepIndex ? "current" : "todo";
            return (
              <li key={step.label} className="flex items-center gap-2 text-xs">
                {state === "done" ? (
                  <Check className="h-3.5 w-3.5 shrink-0 text-teal-600" />
                ) : state === "current" ? (
                  <span
                    className="h-2 w-2 shrink-0 rounded-full bg-teal-600"
                    style={{ animation: `ifx-leaf ${pulseSpeed}s ease-in-out infinite` }}
                  />
                ) : (
                  <span className="h-2 w-2 shrink-0 rounded-full border border-gray-300" />
                )}
                <span
                  className={
                    state === "current"
                      ? "font-semibold text-gray-900"
                      : state === "done"
                        ? "text-gray-500"
                        : "text-gray-400"
                  }
                >
                  {step.label}
                </span>
                {state === "current" && !done && (
                  <span className="ml-auto shrink-0 rounded-full bg-teal-50 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-teal-700">
                    {EFFORT_LABEL[step.effort]}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
