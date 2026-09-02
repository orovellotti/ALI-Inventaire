import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, Check, ChevronDown, ChevronUp, Database, Layers3, Leaf, Tags } from "lucide-react";

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

function buildSteps(
  includeINaturalist: boolean,
  areaCount: number,
  enabledAgentIds: string[],
): Step[] {
  const enabled = new Set(enabledAgentIds);
  const activeSources = [
    enabled.has("occurrences") && (includeINaturalist ? "GBIF et iNaturalist" : "GBIF"),
    enabled.has("zonages") && "les référentiels territoriaux",
    enabled.has("habitats") && "CARHAB",
  ].filter(Boolean).join(", ");
  const steps: Step[] = [
    {
      label: "Préparation de l’aire d’étude et contrôle des paramètres.",
      detail:
        areaCount > 1
          ? `Je vais analyser ${areaCount} aires en parallèle.`
          : "Je vérifie le périmètre et les paramètres de recherche.",
      duration: 900,
      effort: 1,
    },
    {
      label: "Consultation des sources disponibles en parallèle.",
      detail: `Mes agents interrogent ${activeSources || "les sources activées"}.`,
      duration: 6800,
      effort: 3,
    },
    ...(enabled.has("habitats") ? [{
      label: "Lecture documentaire des habitats autour de l’aire d’étude.",
      detail: "L’Agent Habitat consulte CARHAB, sans confirmer une présence sur le terrain.",
      duration: 3200,
      effort: 2 as Effort,
    }] : []),
    {
      label: "Consolidation de l’inventaire naturaliste.",
      detail: "Je fusionne et déduplique les espèces documentées avant tout enrichissement taxonomique.",
      duration: 2400,
      effort: 2,
    },
    ...(enabled.has("taxonomy-status") ? [{
      label: "Enrichissement final de l’inventaire avec ALI Species.",
      detail: "Une fois l’inventaire consolidé, ALI Species vérifie les listes rouges UICN régionales et les statuts réglementaires de chaque taxon.",
      duration: 5200,
      effort: 3 as Effort,
    }] : []),
  ];
  steps.push(
    {
      label: "Contrôle automatisé de cohérence.",
      detail: "La synthèse précisera ses sources, ses limites et les vérifications à prévoir.",
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
  embedded = false,
  includeINaturalist,
  areaCount,
  zonagesLoading,
  zonagesReady,
  zonageFeatureCount,
  potentialSpeciesLoading,
  potentialSpeciesReady,
  potentialSpeciesCount,
  enabledAgentIds,
}: {
  active: boolean;
  /** Affiche le fil dans son panneau parent plutôt que dans une surcouche plein écran. */
  embedded?: boolean;
  includeINaturalist: boolean;
  areaCount: number;
  zonagesLoading: boolean;
  zonagesReady: boolean;
  zonageFeatureCount: number;
  potentialSpeciesLoading: boolean;
  potentialSpeciesReady: boolean;
  potentialSpeciesCount: number;
  enabledAgentIds: string[];
}) {
  const steps = useMemo(
    () => buildSteps(includeINaturalist, areaCount, enabledAgentIds),
    [includeINaturalist, areaCount, enabledAgentIds],
  );
  const [visible, setVisible] = useState(false);
  const [done, setDone] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [openSourceDetail, setOpenSourceDetail] = useState<"ally" | "occurrences" | "zonages" | "potential" | null>(null);
  const startRef = useRef(0);

  // Démarrage / fin pilotés par `active`.
  useEffect(() => {
    if (active) {
      setVisible(true);
      setDone(false);
      setStepIndex(0);
      setProgress(0);
      setElapsedSeconds(0);
      setOpenSourceDetail(null);
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
      setElapsedSeconds(Math.floor(elapsed / 1000));
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
  const currentStepLabel = steps[stepIndex].label;
  const observationsSearching = !done && currentStepLabel.includes("sources");
  const habitatsSearching = !done && currentStepLabel.includes("habitats");
  const taxonEnrichmentActive = !done && currentStepLabel.includes("ALI Species");
  const taxonEnrichmentStep = steps.findIndex((step) => step.label.includes("ALI Species"));
  const enabled = new Set(enabledAgentIds);
  const sourceMessages = [
    {
      id: "occurrences" as const,
      name: "Agent Occurrences",
      icon: Database,
      tone: "text-[#2f705a]",
      message: observationsSearching
        ? "Je consulte les occurrences disponibles."
        : "Je recoupe les occurrences avec l’inventaire.",
      detail: `Sources : ${includeINaturalist ? "GBIF et iNaturalist" : "GBIF"}.`,
    },
    {
      id: "zonages" as const,
      name: "Agent Zonages",
      icon: Layers3,
      tone: "text-[#50718a]",
      message: zonagesLoading
        ? "Je recherche les zonages autour de l’aire d’étude."
        : zonagesReady
          ? zonageFeatureCount > 0
            ? `${zonageFeatureCount} emprise${zonageFeatureCount > 1 ? "s ont" : " a"} été retournée${zonageFeatureCount > 1 ? "s" : ""} par la source.`
            : "Je n’ai trouvé aucune emprise dans l’aire."
          : "Je ne peux pas récupérer les zonages ; l’inventaire continue.",
      detail: "Sources : IGN / PatriNat.",
    },
    {
      id: "habitats" as const,
      name: "Agent Habitat",
      icon: Leaf,
      tone: "text-[#527349]",
      message: habitatsSearching
        ? "Je consulte les habitats documentés autour de l’aire d’étude."
        : "J’intègre les informations d’habitats disponibles à la synthèse.",
      detail: "Source : CARHAB — donnée documentaire à vérifier sur le terrain.",
    },
    {
      id: "taxon-enrichment" as const,
      name: "Agent Taxonomie et statuts",
      icon: Tags,
      tone: "text-[#795f1f]",
      message: taxonEnrichmentActive
        ? "L’inventaire est consolidé. J’interroge maintenant ALI Species pour qualifier les statuts locaux."
        : "J’ai intégré les listes rouges UICN régionales et les protections disponibles à l’inventaire.",
      detail: "Source : ALI Species MCP / TAXREF — statut documentaire, non preuve de présence.",
    },
  ].filter((agent) => {
    const agentEnabled = enabled.has(
      agent.id === "taxon-enrichment" ? "taxonomy-status" : agent.id,
    );
    if (!agentEnabled) return false;
    if (agent.id !== "taxon-enrichment") return true;
    return done || (taxonEnrichmentStep >= 0 && stepIndex >= taxonEnrichmentStep);
  });

  return (
    <div
      className={
        embedded
          ? "w-full"
          : "pointer-events-none absolute inset-0 z-[1200] flex items-end justify-center pb-5 sm:items-center sm:pb-0"
      }
    >
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
        className={
          embedded
            ? "w-full overflow-hidden rounded-2xl border border-[#d9e1d6] bg-[#fffefb]"
            : "pointer-events-auto mx-4 w-full max-w-md overflow-hidden rounded-[20px] border border-[#d9e1d6] bg-[#fffefb]/95 shadow-[0_18px_50px_rgba(28,54,45,0.18)] backdrop-blur"
        }
        role="status"
        aria-live="polite"
        data-testid="analysis-progress"
      >
        <div className="px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#1e594a] text-[#dcc05b]">
              {done ? <Check className="h-5 w-5" /> : <Bot className="h-5 w-5" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-[#19362d]">
                {done ? "Analyse terminée" : "Analyse écologique en cours…"}
              </p>
              <p className="mt-0.5 text-[#60756d]">
                {done
                  ? `${steps.length} phases terminées · ${zonageFeatureCount} zonage${zonageFeatureCount > 1 ? "s" : ""} vérifié${zonageFeatureCount > 1 ? "s" : ""}`
                  : `${Math.min(steps.length - 1, Math.max(0, stepIndex))} étapes sur ${steps.length} terminées`}
              </p>
            </div>
            {!done && <span className="tabular-nums text-[#60756d]">{progress}%</span>}
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#e5eee4]">
            <div
              className="h-full rounded-full bg-[#28705a] transition-[width] duration-300"
              data-ifx-motion
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="mt-3 text-sm text-[#315b4e]" data-testid="analysis-current-step">
            {done ? "Toutes les consultations sont terminées." : steps[stepIndex].label}
          </p>
          <button
            type="button"
            onClick={() => setOpenSourceDetail((open) => open === "ally" ? null : "ally")}
            className="mt-3 flex min-h-11 items-center gap-1.5 text-sm font-semibold text-[#315b4e]"
            aria-expanded={openSourceDetail === "ally"}
            aria-controls="analysis-technical-details"
          >
            Voir les détails
            {openSourceDetail === "ally" ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
        {openSourceDetail === "ally" && (
          <div id="analysis-technical-details" className="border-t border-[#d9e1d6] px-5 py-4">
            <ol className="space-y-3">
              <li className="flex gap-2">
                <Bot className="mt-0.5 h-4 w-4 shrink-0 text-[#315b4e]" />
                <div><strong>Ali — coordination</strong><p>{steps[stepIndex].label}</p></div>
              </li>
              {sourceMessages.map((agent) => {
                const Icon = agent.icon;
                return (
                  <li key={agent.id} className="flex gap-2" data-testid={`process-${agent.id}`}>
                    <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${agent.tone}`} />
                    <div><strong>{agent.name}</strong><p>{agent.message} {agent.detail}</p></div>
                  </li>
                );
              })}
            </ol>
          </div>
        )}
      </div>
    </div>
  );
}
