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
    enabled.has("occurrences") && (includeINaturalist ? "GBIF and iNaturalist" : "GBIF"),
    enabled.has("zonages") && "available regional datasets",
    enabled.has("habitats") && "CARHAB",
  ].filter(Boolean).join(", ");
  const steps: Step[] = [
    {
      label: "Preparing the study area and checking settings.",
      detail:
        areaCount > 1
          ? `I will analyze ${areaCount} study areas in parallel.`
          : "I am checking the boundary and search settings.",
      duration: 900,
      effort: 1,
    },
    {
      label: "Querying available sources in parallel.",
      detail: `Agents are querying ${activeSources || "enabled sources"}.`,
      duration: 6800,
      effort: 3,
    },
    ...(enabled.has("habitats") ? [{
      label: "Reviewing documented habitats near the study area.",
      detail: "The habitat agent checks CARHAB; this does not confirm conditions in the field.",
      duration: 3200,
      effort: 2 as Effort,
    }] : []),
    {
      label: "Consolidating the species inventory.",
      detail: "I am merging and deduplicating documented species before taxonomic enrichment.",
      duration: 2400,
      effort: 2,
    },
    ...(enabled.has("taxonomy-status") ? [{
      label: "Enriching the inventory with ALI Species.",
      detail: "ALI Species checks available regional IUCN Red Lists and legal statuses after the inventory is consolidated.",
      duration: 5200,
      effort: 3 as Effort,
    }] : []),
  ];
  steps.push(
    {
      label: "Checking consistency.",
      detail: "The summary will identify sources, limitations and recommended checks.",
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
      name: "Observations agent",
      icon: Database,
      tone: "text-[#2f705a]",
      message: observationsSearching
        ? "I am checking available observations."
        : "I am cross-checking observations against the inventory.",
      detail: `Sources: ${includeINaturalist ? "GBIF and iNaturalist" : "GBIF"}.`,
    },
    {
      id: "zonages" as const,
      name: "Designated areas agent",
      icon: Layers3,
      tone: "text-[#50718a]",
      message: zonagesLoading
        ? "I am checking designated areas near the study site."
        : zonagesReady
          ? zonageFeatureCount > 0
            ? `${zonageFeatureCount} mapped area${zonageFeatureCount !== 1 ? "s" : ""} returned by the source.`
            : "Search complete: no mapped areas returned here."
          : "Designated areas could not be retrieved; the inventory continues.",
      detail: "Sources: IGN / PatriNat (primarily France).",
    },
    {
      id: "habitats" as const,
      name: "Habitat agent",
      icon: Leaf,
      tone: "text-[#527349]",
      message: habitatsSearching
        ? "I am checking documented habitats near the study area."
        : "I am including available habitat information in the summary.",
      detail: "Source: CARHAB (France) — documentary data to verify in the field.",
    },
    {
      id: "taxon-enrichment" as const,
      name: "Taxonomy and status agent",
      icon: Tags,
      tone: "text-[#795f1f]",
      message: taxonEnrichmentActive
        ? "The inventory is consolidated. I am checking available local statuses with ALI Species."
        : "Available regional IUCN Red Lists and legal protections are included.",
      detail: "Source: ALI Species MCP / TAXREF — documentary status, not proof of presence.",
    },
  ].filter((agent) => {
    const agentEnabled = enabled.has(
      agent.id === "taxon-enrichment" ? "taxonomy-status" : agent.id,
    );
    if (!agentEnabled) return false;
    if (agent.id !== "taxon-enrichment") return true;
    return done || (taxonEnrichmentStep >= 0 && stepIndex >= taxonEnrichmentStep);
  });
  const potentialMessage = potentialSpeciesLoading
    ? "Assessing ecological compatibility."
    : potentialSpeciesReady
      ? `Assessment complete: ${potentialSpeciesCount} potential species returned.`
      : "Potential species assessment unavailable; no results inferred.";

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
        aria-atomic="true"
        data-testid="analysis-progress"
      >
        <div className="px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#1e594a] text-[#dcc05b]">
              {done ? <Check className="h-5 w-5" /> : <Bot className="h-5 w-5" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-[#19362d]">
                 {done ? "Analysis complete" : "Ecological analysis in progress…"}
              </p>
              <p className="mt-0.5 text-[#60756d]">
                {done
                   ? `${steps.length} phases complete · ${zonageFeatureCount} designated area${zonageFeatureCount !== 1 ? "s" : ""} checked`
                   : `${Math.min(steps.length - 1, Math.max(0, stepIndex))} of ${steps.length} steps complete`}
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
             {done ? "All source queries are complete." : steps[stepIndex].label}
          </p>
          <button
            type="button"
            onClick={() => setOpenSourceDetail((open) => open === "ally" ? null : "ally")}
            className="mt-3 flex min-h-11 items-center gap-1.5 text-sm font-semibold text-[#315b4e]"
            aria-expanded={openSourceDetail === "ally"}
            aria-controls="analysis-technical-details"
          >
             View details
            {openSourceDetail === "ally" ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
        {openSourceDetail === "ally" && (
          <div id="analysis-technical-details" className="border-t border-[#d9e1d6] px-5 py-4">
            <ol className="space-y-3">
              <li className="flex gap-2">
                <Bot className="mt-0.5 h-4 w-4 shrink-0 text-[#315b4e]" />
                 <div><strong>ALi — coordination</strong><p>{steps[stepIndex].label}</p></div>
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
              <li className="flex gap-2" data-testid="process-potential">
                <Leaf className="mt-0.5 h-4 w-4 shrink-0 text-[#527349]" aria-hidden="true" />
                 <div><strong>Ecological compatibility</strong><p>{potentialMessage} Potential presence is not confirmation in the field.</p></div>
              </li>
            </ol>
          </div>
        )}
      </div>
    </div>
  );
}
