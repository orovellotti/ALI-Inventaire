import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { X, Download, FileText, AlertTriangle, AlertCircle, Leaf, Info, ChevronDown, ChevronUp, ImageOff, Copy, Check, ExternalLink, BookOpen, Shield, ShieldAlert, MapPin, Tag, Calendar, Link, Flag, Layers, Database, Bot, Filter, Table, Sparkles, Loader2, Share2, Mail, MoreHorizontal, Settings2, Search, ChevronLeft, ListChecks, ClipboardList, LayoutGrid, ChevronRight, Gauge, History, Plus, Pencil, Trash2 } from "lucide-react";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuCheckboxItem } from "@/components/ui/dropdown-menu";
import { InventoryResult, Occurrence, getIucnLabel, getIucnFullLabel, getPatrimonialite, ConfidenceScore, TAXON_GROUPS, getTaxonGroupId, isMarineSpecies } from "@/lib/gbif";
import { findSINPPlatforms, SINPPlatform } from "@/lib/sinp";
import { exportCSV, exportExcel } from "@/lib/export";
import { PrioritySpeciesInline, type Analysis as PrioritySpeciesAnalysis } from "./PrioritySpeciesInline";
import { AnalysisProgress } from "./AnalysisProgress";
import html2canvas from "html2canvas";
import type {
  PotentialSpeciesItem,
  PotentialSpeciesResult,
  PotentialSpeciesStatus,
} from "@shared/types";
import type { FeatureCollection } from "geojson";
import { reconcilePotentialSpecies } from "@/lib/potentialSpecies";
import { zonageKey } from "@/lib/zonageMap";
import type { ZonagesData, ZonageItem } from "@/lib/zonages";
import type { AnalysisConversation } from "@/lib/analysisHistory";
import type { HarnessConfig } from "@shared/harness";
import { formatCarhabSummary, parseCarhabOutput } from "@shared/carhab";
import { getPreferredTerritorialRedList, isPlantTaxon } from "@shared/iucn";
import { occurrenceKey, uniqueOccurrences } from "@/lib/resultKeys";
import { buildFinalStudyContext, serializeFinalStudyContext } from "@/lib/finalStudyContext";
import React, { useState, useMemo, useEffect, useRef, type ReactNode } from "react";

interface NaturaSpeciesItem {
  name: string;
  grade: "A" | "B" | "C" | "D" | null;
  sensitive: boolean;
}
/** Sections repliables du diagnostic. */
type SectionKey = "especes" | "potentielles" | "zonages" | "habitats" | "pourquoi";
type ResultView = "detail" | "issues";
type AggregatedIssue = {
  id: string;
  subject: string;
  category: "Espèce" | "Zonage" | "Habitat";
  level: "Critique" | "Fort" | "Modéré" | "À qualifier";
  agents: string[];
  evidence: string;
  interpretation: string;
};

/**
 * Niveau d'enjeu global du site (Faible / Modéré / Fort), dérivé du score de
 * potentiel d'enjeux existant (riskScore). NOTE MÉTIER : les seuils et la
 * pondération devront être validés par un écologue — ne pas présenter comme
 * une évaluation réglementaire définitive.
 */
function computeGlobalIssueLevel(riskTone: "critical" | "high" | "moderate" | "low"): {
  level: "fort" | "modere" | "faible";
  label: string;
} {
  if (riskTone === "critical" || riskTone === "high") return { level: "fort", label: "À approfondir" };
  if (riskTone === "moderate") return { level: "modere", label: "À examiner" };
  return { level: "faible", label: "Peu de signaux documentés" };
}

/** Priorité d'affichage des catégories de zonages (plus petit = plus prioritaire). */
const ZONAGE_CATEGORY_PRIORITY: Record<string, number> = {
  reglementaire: 1,
  natura2000: 2,
  znieff: 3,
  autre: 4,
};

const ZONAGE_CATEGORY_BADGE: Record<string, { label: string; cls: string }> = {
  reglementaire: { label: "Réglementaire", cls: "bg-red-50 text-red-700 border-red-200" },
  natura2000: { label: "Natura 2000", cls: "bg-orange-50 text-orange-700 border-orange-200" },
  znieff: { label: "ZNIEFF", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  autre: { label: "Info", cls: "bg-gray-50 text-gray-600 border-gray-200" },
};

const CURRENT_YEAR = new Date().getFullYear();

function studyMarkdownToWordHtml(markdown: string): string {
  const escapeHtml = (value: string) =>
    value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  const inline = (value: string) =>
    escapeHtml(value)
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([^*]+)\*/g, "<em>$1</em>");
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const html: string[] = [];
  let paragraph: string[] = [];
  let listOpen = false;
  let tableOpen = false;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    html.push(`<p>${inline(paragraph.join(" "))}</p>`);
    paragraph = [];
  };
  const closeList = () => {
    if (listOpen) html.push("</ul>");
    listOpen = false;
  };
  const closeTable = () => {
    if (tableOpen) html.push("</tbody></table>");
    tableOpen = false;
  };

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index].trim();
    const heading = rawLine.match(/^(#{1,3})\s+(.+)$/);
    const bullet = rawLine.match(/^[-*]\s+(.+)$/);
    const cells = rawLine.startsWith("|") && rawLine.endsWith("|")
      ? rawLine.slice(1, -1).split("|").map((cell) => cell.trim())
      : null;
    const nextLine = lines[index + 1]?.trim() ?? "";
    const nextIsSeparator = /^\|?(?:\s*:?-{3,}:?\s*\|)+\s*$/.test(nextLine);
    const isSeparator = /^\|?(?:\s*:?-{3,}:?\s*\|)+\s*$/.test(rawLine);

    if (!rawLine) {
      flushParagraph();
      closeList();
      closeTable();
      continue;
    }
    if (heading) {
      flushParagraph();
      closeList();
      closeTable();
      html.push(`<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`);
      continue;
    }
    if (bullet) {
      flushParagraph();
      closeTable();
      if (!listOpen) {
        html.push("<ul>");
        listOpen = true;
      }
      html.push(`<li>${inline(bullet[1])}</li>`);
      continue;
    }
    if (isSeparator) continue;
    if (cells) {
      flushParagraph();
      closeList();
      if (!tableOpen) {
        html.push("<table>");
        if (nextIsSeparator) {
          html.push(`<thead><tr>${cells.map((cell) => `<th>${inline(cell)}</th>`).join("")}</tr></thead><tbody>`);
          tableOpen = true;
          index += 1;
          continue;
        }
        html.push("<tbody>");
        tableOpen = true;
      }
      html.push(`<tr>${cells.map((cell) => `<td>${inline(cell)}</td>`).join("")}</tr>`);
      continue;
    }
    closeList();
    closeTable();
    paragraph.push(rawLine);
  }
  flushParagraph();
  closeList();
  closeTable();
  return html.join("\n");
}

const GROUP_SEASON: Record<string, string> = {
  oiseaux: "avril à juillet",
  mammiferes: "toute l'année",
  reptiles: "avril à septembre",
  amphibiens: "février à mai",
  poissons: "mai à octobre",
  insectes: "mai à août",
  arachnides: "mai à septembre",
  mollusques: "mai à octobre",
  plantes: "mars à juin",
  champignons: "septembre à novembre",
  autres: "à préciser",
};

const GROUP_ACTION: Record<string, string> = {
  oiseaux: "Prévoir un inventaire avifaune en période de nidification (avril à juillet).",
  mammiferes: "Rechercher les indices de présence et poser des pièges photographiques.",
  reptiles: "Prospecter les reptiles au printemps et en été (avril à septembre).",
  amphibiens: "Inventorier les amphibiens en période de reproduction (février à mai).",
  poissons: "Prospecter les milieux aquatiques (mai à octobre).",
  insectes: "Réaliser un inventaire entomologique en période d'activité (mai à août).",
  arachnides: "Prospection ciblée en période d'activité (mai à septembre).",
  mollusques: "Prospecter les milieux humides et aquatiques (mai à octobre).",
  plantes: "Prévoir un inventaire botanique en période de floraison (mars à juin).",
  champignons: "Prospection mycologique à l'automne (septembre à novembre).",
  autres: "Vérifier la présence sur le terrain par un écologue.",
};

function recommendedAction(groupId: string): string {
  return GROUP_ACTION[groupId] || GROUP_ACTION.autres;
}

function isThreatened(iucn: string | undefined): boolean {
  const s = iucn?.toUpperCase();
  return ["CR", "CRITICALLY_ENDANGERED", "EN", "ENDANGERED", "VU", "VULNERABLE"].includes(s || "");
}

function isNotEvaluated(iucn: string | undefined): boolean {
  const s = iucn?.toUpperCase();
  return !s || ["NE", "NOT_EVALUATED", "NA", "NOT_APPLICABLE"].includes(s);
}

function normalizedTaxonName(name: string): string {
  return name.trim().toLocaleLowerCase("fr").replace(/\s+/g, " ");
}

interface ResultsPanelProps {
  isOpen: boolean;
  isAnalyzing?: boolean;
  areaCount?: number;
  onClose: () => void;
  results: InventoryResult | null;
  selectedSpecies: string | null;
  onSelectSpecies: (species: string | null) => void;
  activeTaxonFilters: Set<string>;
  onToggleTaxonFilter: (groupId: string) => void;
  onToggleAllTaxonFilters: (presentGroupIds?: string[]) => void;
  excludeMarine?: boolean;
  onToggleExcludeMarine?: () => void;
  includeINaturalist?: boolean;
  onToggleIncludeINaturalist?: () => void;
  toponym?: string;
  zonages: ZonagesData | null;
  zonagesLoading: boolean;
  potentialSpecies: PotentialSpeciesResult | null;
  potentialSpeciesLoading: boolean;
  potentialSpeciesError: boolean;
  projectArea?: FeatureCollection;
  selectedZonageId?: string | null;
  onSelectZonage?: (id: string | null) => void;
  composer?: ReactNode;
  conversations?: AnalysisConversation[];
  activeConversationId?: string | null;
  historyError?: string | null;
  requestSummary?: string;
  onSelectConversation?: (id: string) => void;
  onNewConversation?: () => void;
  onRenameConversation?: (id: string, title: string) => void;
  onDeleteConversation?: (id: string) => void;
  harnessConfig?: HarnessConfig;
}

export function ResultsPanel({ isOpen, isAnalyzing = false, areaCount = 1, onClose, results, selectedSpecies, onSelectSpecies, activeTaxonFilters, onToggleTaxonFilter, onToggleAllTaxonFilters, excludeMarine, onToggleExcludeMarine, includeINaturalist, onToggleIncludeINaturalist, toponym, zonages, zonagesLoading, potentialSpecies, potentialSpeciesLoading, potentialSpeciesError, projectArea, selectedZonageId, onSelectZonage, composer, conversations = [], activeConversationId = null, historyError, requestSummary, onSelectConversation, onNewConversation, onRenameConversation, onDeleteConversation, harnessConfig }: ResultsPanelProps) {
  const enabledAgentIds = useMemo(
    () => harnessConfig?.agents.filter((agent) => agent.enabled).map((agent) => agent.id) ?? [],
    [harnessConfig],
  );
  const occurrencesAgentActive = enabledAgentIds.includes("occurrences");
  const zonagesAgentActive = enabledAgentIds.includes("zonages");
  const habitatAgentActive = enabledAgentIds.includes("habitats");
  const taxonomyAgentActive = enabledAgentIds.includes("taxonomy-status");
  const [openSections, setOpenSections] = useState<Set<SectionKey>>(new Set());
  const [showCalcDetail, setShowCalcDetail] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [expandedZonages, setExpandedZonages] = useState<Set<string>>(new Set());
  const [speciesQuery, setSpeciesQuery] = useState("");
  const [speciesScope, setSpeciesScope] = useState<"prioritaires" | "toutes">("prioritaires");
  const [speciesSortMode, setSpeciesSortMode] = useState<"recommended" | "french" | "latin">("recommended");
  const [showReportPreview, setShowReportPreview] = useState(false);
  const [copied, setCopied] = useState(false);
  const [reformattedReport, setReformattedReport] = useState<string | null>(null);
  const [reportPromptTrace, setReportPromptTrace] = useState<{
    systemCharacters: number;
    userCharacters: number;
    totalCharacters: number;
    systemFingerprint: string;
    userFingerprint: string;
  } | null>(null);
  const [reformatting, setReformatting] = useState(false);
  const [reformatError, setReformatError] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [showAnalysisDetails, setShowAnalysisDetails] = useState(false);
  const [resultView, setResultView] = useState<ResultView>("detail");
  const [showAllRecommendations, setShowAllRecommendations] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [editingConversationId, setEditingConversationId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [deleteConversationId, setDeleteConversationId] = useState<string | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState<PrioritySpeciesAnalysis | null>(null);
  const carhabSummary = useMemo(() => {
    const trace = [...(aiAnalysis?.mcpTrace ?? [])].reverse().find(
      (item) =>
        item.mcpId === "ali-habitat" &&
        item.toolId === "get_habitats" &&
        item.status === "success" &&
        item.output,
    );
    return trace?.output ? parseCarhabOutput(trace.output) : null;
  }, [aiAnalysis]);
  const [habitatConsultationState, setHabitatConsultationState] = useState<"idle" | "loading" | "complete" | "error">("idle");
  const shouldRunHabitatAnalysisRef = useRef(false);
  useEffect(() => {
    if (!historyOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setHistoryOpen(false);
        setEditingConversationId(null);
        setDeleteConversationId(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [historyOpen]);

  useEffect(() => {
    // Réinitialise l'état d'interface propre à un résultat lors d'une nouvelle analyse
    setAiAnalysis(null);
    setOpenSections(new Set());
    setShowCalcDetail(false);
    setExpandedZonages(new Set());
    setAssistantOpen(false);
    setSpeciesScope("prioritaires");
    setSpeciesSortMode("recommended");
    setSpeciesQuery("");
    setResultView("detail");
  }, [results]);

  useEffect(() => {
    if (isAnalyzing) {
      shouldRunHabitatAnalysisRef.current = true;
      setHabitatConsultationState("loading");
    }
  }, [isAnalyzing]);

  // Fermeture de l'assistant au clavier (Échap), focus à l'ouverture,
  // piégeage du focus dans le tiroir et restitution au déclencheur à la fermeture.
  const assistantCloseRef = useRef<HTMLButtonElement | null>(null);
  const assistantDrawerRef = useRef<HTMLDivElement | null>(null);
  const explainTriggerRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (!assistantOpen) return;
    assistantCloseRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setAssistantOpen(false);
        return;
      }
      if (e.key === "Tab") {
        const drawer = assistantDrawerRef.current;
        if (!drawer) return;
        const focusables = drawer.querySelectorAll<HTMLElement>(
          'button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])'
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement as HTMLElement | null;
        if (!active || !drawer.contains(active)) {
          e.preventDefault();
          first.focus();
        } else if (e.shiftKey && active === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      // Restitue le focus au bouton « Expliquer ce diagnostic »
      explainTriggerRef.current?.focus();
    };
  }, [assistantOpen]);

  const marineCount = useMemo(() => {
    if (!results) return 0;
    const seen = new Set<string>();
    let n = 0;
    for (const occ of results.occurrences) {
      const key = occurrenceKey(occ);
      if (seen.has(key)) continue;
      seen.add(key);
      if (isMarineSpecies(occ)) n += 1;
    }
    return n;
  }, [results]);

  const taxonCounts = useMemo(() => {
    if (!results) return new Map<string, number>();
    const uniqueMap = new Map<string, Occurrence>();
    results.occurrences.forEach((occ) => {
      if (excludeMarine && isMarineSpecies(occ)) return;
      const key = occurrenceKey(occ);
      const existing = uniqueMap.get(key);
      if (!existing || getAlertPriority(occ.alertLevel) > getAlertPriority(existing.alertLevel)) {
        uniqueMap.set(key, occ);
      }
    });
    const counts = new Map<string, number>();
    for (const occ of Array.from(uniqueMap.values())) {
      const groupId = getTaxonGroupId(occ);
      counts.set(groupId, (counts.get(groupId) || 0) + 1);
    }
    return counts;
  }, [results, excludeMarine]);

  const groupStats = useMemo(() => {
    const m = new Map<string, { total: number; sensitive: number; protected: number }>();
    if (!results) return m;
    const uniqueMap = new Map<string, Occurrence>();
    results.occurrences.forEach((occ) => {
      if (excludeMarine && isMarineSpecies(occ)) return;
      const key = occurrenceKey(occ);
      const existing = uniqueMap.get(key);
      if (!existing || getAlertPriority(occ.alertLevel) > getAlertPriority(existing.alertLevel)) {
        uniqueMap.set(key, occ);
      }
    });
    for (const occ of Array.from(uniqueMap.values())) {
      const g = getTaxonGroupId(occ);
      const s = m.get(g) || { total: 0, sensitive: 0, protected: 0 };
      s.total += 1;
      if (occ.alertLevel === "high" || occ.alertLevel === "medium") s.sensitive += 1;
      if (occ.frenchProtected) s.protected += 1;
      m.set(g, s);
    }
    return m;
  }, [results, excludeMarine]);

  const presentGroups = useMemo(() => {
    return TAXON_GROUPS.filter(g => (taxonCounts.get(g.id) || 0) > 0);
  }, [taxonCounts]);

  const observedNames = useMemo(() => {
    const set = new Set<string>();
    if (results) {
      for (const occ of results.occurrences) {
        set.add(occ.scientificName.trim().toLowerCase());
      }
    }
    return set;
  }, [results]);

  const sortedSpecies = useMemo(() => {
    if (!results) return { high: [] as Occurrence[], medium: [] as Occurrence[], low: [] as Occurrence[] };

    const uniqueMap = new Map<string, Occurrence>();
    results.occurrences.forEach((occ) => {
      if (excludeMarine && isMarineSpecies(occ)) return;
      const key = occurrenceKey(occ);
      const existing = uniqueMap.get(key);
      if (!existing || getAlertPriority(occ.alertLevel) > getAlertPriority(existing.alertLevel)) {
        uniqueMap.set(key, occ);
      }
    });

    const unique = Array.from(uniqueMap.values()).filter(occ =>
      activeTaxonFilters.has(getTaxonGroupId(occ))
    );

    const iucnRank = (status: string | undefined): number => {
      const s = status?.toUpperCase();
      switch (s) {
        case "EX": case "EXTINCT": return 9;
        case "EW": case "EXTINCT_IN_THE_WILD": return 8;
        case "RE": case "REGIONALLY_EXTINCT": return 7;
        case "CR": case "CRITICALLY_ENDANGERED": return 6;
        case "EN": case "ENDANGERED": return 5;
        case "VU": case "VULNERABLE": return 4;
        case "NT": case "NEAR_THREATENED": return 3;
        case "DD": case "DATA_DEFICIENT": return 2;
        case "LC": case "LEAST_CONCERN": return 1;
        default: return 0;
      }
    };

    const sortByEnjeu = (a: Occurrence, b: Occurrence) => {
      const diff = iucnRank(b.iucnStatus) - iucnRank(a.iucnStatus);
      if (diff !== 0) return diff;
      return a.scientificName.localeCompare(b.scientificName);
    };

    const bucketFor = (occurrence: Occurrence): "high" | "medium" | "low" => {
      if (occurrence.enjeuLevel === "critique" || occurrence.enjeuLevel === "fort") return "high";
      if (occurrence.enjeuLevel === "modere" || occurrence.enjeuLevel === "a_confirmer") return "medium";
      if (occurrence.enjeuLevel === "faible") return "low";
      return occurrence.alertLevel;
    };
    return {
      high: unique.filter((occurrence) => bucketFor(occurrence) === "high").sort(sortByEnjeu),
      medium: unique.filter((occurrence) => bucketFor(occurrence) === "medium").sort(sortByEnjeu),
      low: unique.filter((occurrence) => bucketFor(occurrence) === "low").sort(sortByEnjeu),
    };
  }, [results, activeTaxonFilters, excludeMarine]);

  const allFilteredSpecies = useMemo(() => {
    return [...sortedSpecies.high, ...sortedSpecies.medium, ...sortedSpecies.low];
  }, [sortedSpecies]);

  useEffect(() => {
    if (isAnalyzing || !results || !shouldRunHabitatAnalysisRef.current) return;
    shouldRunHabitatAnalysisRef.current = false;

    const distanceToCenter = (occurrence: Occurrence) =>
      typeof occurrence.decimalLatitude === "number" && typeof occurrence.decimalLongitude === "number"
        ? (occurrence.decimalLatitude - results.center[0]) ** 2 +
          (occurrence.decimalLongitude - results.center[1]) ** 2
        : Infinity;
    const nearestBySpecies = new Map<string, Occurrence>();
    for (const occurrence of results.occurrences) {
      const previous = nearestBySpecies.get(occurrence.scientificName);
      if (!previous || distanceToCenter(occurrence) < distanceToCenter(previous)) {
        nearestBySpecies.set(occurrence.scientificName, occurrence);
      }
    }
    const occurrences = Array.from(nearestBySpecies.values())
      .slice(0, 5000)
      .map((occurrence) => ({
        scientificName: occurrence.scientificName,
        vernacularName: occurrence.vernacularName,
        iucnStatus: occurrence.iucnStatus,
        alertLevel: occurrence.alertLevel,
        class: occurrence.class,
        kingdom: occurrence.kingdom,
        decimalLatitude: occurrence.decimalLatitude,
        decimalLongitude: occurrence.decimalLongitude,
        source: occurrence.source,
        observationCount: occurrence.observationCount,
        lastObservationYear: occurrence.lastObservationYear,
      }));

    if (occurrences.length === 0) {
      setHabitatConsultationState("error");
      return;
    }

    const controller = new AbortController();
    setHabitatConsultationState("loading");
    fetch("/api/llm/priority-species", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        toponym: toponym || `Point ${results.center[0].toFixed(4)}, ${results.center[1].toFixed(4)}`,
        coords: results.center,
        occurrences,
        projectArea,
      }),
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.error || "Analyse spécialisée indisponible");
        }
        return response.json() as Promise<PrioritySpeciesAnalysis>;
      })
      .then((analysis) => {
        setAiAnalysis(analysis);
        setHabitatConsultationState("complete");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setHabitatConsultationState("error");
      });

    return () => controller.abort();
  }, [isAnalyzing, results, toponym, projectArea]);

  const enjeuxBuckets = useMemo(() => {
    // Les EEE sont retirées de tous les buckets de conservation.
    const eee: Occurrence[] = [];
    const critique: Occurrence[] = [];
    const fort: Occurrence[] = [];
    const modere: Occurrence[] = [];
    const aConfirmer: Occurrence[] = [];
    const faible: Occurrence[] = [];

    function classify(o: Occurrence, defaultHighBucket: boolean) {
      if (o.isInvasive) { eee.push(o); return; }
      // Priorité : enjeuLevel territorial (si enrichissement ALI disponible)
      if (o.enjeuLevel) {
        switch (o.enjeuLevel) {
          case "critique":    critique.push(o);    return;
          case "fort":        fort.push(o);        return;
          case "modere":      modere.push(o);      return;
          case "a_confirmer": aConfirmer.push(o);  return;
          default:            faible.push(o);      return;
        }
      }
      // Repli : heuristique alertLevel + getPatrimonialite (avant enrichissement ALI)
      if (defaultHighBucket) {
        if (getPatrimonialite(o.iucnStatus, o.alertLevel, o.isInvasive).level >= 4) {
          critique.push(o);
        } else {
          fort.push(o);
        }
      } else {
        modere.push(o);
      }
    }

    sortedSpecies.high.forEach((o) => classify(o, true));
    sortedSpecies.medium.forEach((o) => classify(o, false));
    sortedSpecies.low.forEach((o) => {
      if (o.isInvasive) eee.push(o);
      else faible.push(o);
    });

    return { critique, fort, modere, aConfirmer, faible, eee };
  }, [sortedSpecies]);

  /** Espèces prioritaires, par niveau d'enjeu décroissant (critique → fort → modéré → à confirmer). */
  const prioritySpeciesList = useMemo(
    () => [...enjeuxBuckets.critique, ...enjeuxBuckets.fort, ...enjeuxBuckets.modere, ...enjeuxBuckets.aConfirmer],
    [enjeuxBuckets]
  );

  const especesList = useMemo(() => {
    const q = speciesQuery.trim().toLowerCase();
    const base = speciesScope === "prioritaires" ? prioritySpeciesList : allFilteredSpecies;
    if (!q) return base;
    return base.filter((o) => `${o.scientificName} ${o.vernacularName || ""}`.toLowerCase().includes(q));
  }, [allFilteredSpecies, prioritySpeciesList, speciesScope, speciesQuery]);

  const reconciledPotentialSpecies = useMemo(() => {
    if (!results) return potentialSpecies;
    return reconcilePotentialSpecies(
      potentialSpecies,
      results.occurrences,
      results.center,
      results.radius,
    );
  }, [potentialSpecies, results]);

  const regionalRedListByPotentialName = useMemo(() => {
    const statuses = new Map<string, { value: string; label: string; scope?: string }>();
    for (const species of aiAnalysis?.species ?? []) {
      if (species.inInventory) continue;
      const regional = species.statuses?.find((status) => status.category === "Liste rouge régionale");
      if (regional) statuses.set(normalizedTaxonName(species.scientificName), regional);
    }
    return statuses;
  }, [aiAnalysis]);

  const potentialIssueSignals = useMemo(() => {
    if (
      potentialSpeciesLoading ||
      potentialSpeciesError ||
      !reconciledPotentialSpecies
    ) {
      return { strong: 0, moderate: 0, regionalThreatened: 0, count: 0, points: 0 };
    }

    let strong = 0;
    let moderate = 0;
    let regionalThreatened = 0;
    for (const item of reconciledPotentialSpecies.species) {
      if (item.observed || item.score === null || item.status === "Non évaluée") continue;
      const regionalStatus = regionalRedListByPotentialName.get(normalizedTaxonName(item.scientificName));
      const regionalCode = regionalStatus?.value.toUpperCase();
      const hasElevatedRegionalStatus =
        item.score >= 50 &&
        item.status !== "Peu compatible" &&
        item.confidence !== "Faible" &&
        ["CR", "EN", "VU"].includes(regionalCode ?? "");
      if (hasElevatedRegionalStatus) {
        regionalThreatened += 1;
        strong += 1;
        continue;
      }
      if (
        item.score >= 70 &&
        item.status === "Très probable localement" &&
        item.confidence !== "Faible"
      ) {
        strong += 1;
      } else if (
        item.score >= 50 &&
        item.status !== "Peu compatible"
      ) {
        moderate += 1;
      }
    }

    return {
      strong,
      moderate,
      regionalThreatened,
      count: strong + moderate,
      // Une compatibilité n'est pas une occurrence : contribution prudente,
      // plafonnée à 15 % de l'indice global.
      points: Math.min(15, regionalThreatened * 3 + (strong - regionalThreatened) * 2 + moderate),
    };
  }, [
    potentialSpeciesLoading,
    potentialSpeciesError,
    reconciledPotentialSpecies,
    regionalRedListByPotentialName,
  ]);

  const riskScore = useMemo(() => {
    const hi = sortedSpecies.high.length;
    const med = sortedSpecies.medium.length;
    const zc = zonages?.count || 0;
    const hasMarine = marineCount > 0;
    const hasTerrestrial = (results?.stats.speciesCount || 0) - marineCount > 0;

    let recent = 0;
    let tot = 0;
    if (results) {
      const seen = new Set<string>();
      for (const occ of results.occurrences) {
        const key = occurrenceKey(occ);
        if (seen.has(key)) continue;
        seen.add(key);
        tot += 1;
        if (occ.lastObservationYear && occ.lastObservationYear >= CURRENT_YEAR - 5) recent += 1;
      }
    }
    const recentRatio = tot > 0 ? recent / tot : 0;
    const aiForts = aiAnalysis ? aiAnalysis.species.filter((s) => s.level === "majeur" || s.level === "fort").length : 0;

    const raw =
      Math.min(40, hi * 8) +
      Math.min(15, med * 2) +
      Math.min(24, zc * 4) +
      (hasMarine && hasTerrestrial ? 8 : 0) +
      Math.round(recentRatio * 8) +
      Math.min(10, aiForts * 5) +
      potentialIssueSignals.points;
    const score = Math.min(100, raw);

    let label: string;
    let tone: "critical" | "high" | "moderate" | "low";
    if (score >= 75) { label = "Nombreux signaux documentaires"; tone = "critical"; }
    else if (score >= 55) { label = "Signaux significatifs"; tone = "high"; }
    else if (score >= 35) { label = "Signaux à examiner"; tone = "moderate"; }
    else { label = "Peu de signaux documentés"; tone = "low"; }

    const factors: string[] = [];
    if (hi > 0) factors.push(`${hi} espèce${hi > 1 ? "s" : ""} à enjeu fort`);
    if (aiForts > 0) factors.push(`${aiForts} espèce${aiForts > 1 ? "s" : ""} à patrimonialité forte ou majeure (IA)`);
    if (potentialIssueSignals.count > 0) {
      factors.push(
        `${potentialIssueSignals.count} espèce${potentialIssueSignals.count > 1 ? "s" : ""} potentielle${potentialIssueSignals.count > 1 ? "s" : ""} retenue${potentialIssueSignals.count > 1 ? "s" : ""} comme signal d’enjeu à confirmer`,
      );
    }
    if (potentialIssueSignals.regionalThreatened > 0) {
      factors.push(
        `${potentialIssueSignals.regionalThreatened} espèce${potentialIssueSignals.regionalThreatened > 1 ? "s" : ""} potentielle${potentialIssueSignals.regionalThreatened > 1 ? "s" : ""} avec statut UICN régional CR, EN ou VU`,
      );
    }
    if (zc > 0) factors.push(`${zc} zonage${zc > 1 ? "s" : ""} environnemental${zc > 1 ? "aux" : ""}`);
    if (hasMarine && hasTerrestrial) factors.push("Sensibilité marine et terrestre");
    if (recentRatio >= 0.4) factors.push("Occurrences publiques récentes à proximité");
    if (factors.length === 0) factors.push("Peu de signaux d'enjeu détectés localement");

    return { score, label, tone, factors };
  }, [sortedSpecies, zonages, marineCount, results, aiAnalysis, potentialIssueSignals]);

  const autoSummary = useMemo(() => {
    if (!results) return "";
    const sp = results.stats.speciesCount;
    const sens = results.stats.sensitiveCount;
    const zc = zonages?.count || 0;
    const parts = [`Les sources consultées documentent ${sp} taxon${sp > 1 ? "s" : ""} dans l’aire étudiée, dont ${sens} présentant un signal de sensibilité${sens > 1 ? "s" : ""}`];
    if (potentialIssueSignals.count > 0) {
      parts.push(
        `et retient ${potentialIssueSignals.count} espèce${potentialIssueSignals.count > 1 ? "s" : ""} potentielle${potentialIssueSignals.count > 1 ? "s" : ""} comme signal d’enjeu à confirmer`,
      );
    }
    if (zc > 0) parts.push(`et retournent ${zc} zonage${zc > 1 ? "s" : ""} environnemental${zc > 1 ? "aux" : ""} à qualifier selon leur portée`);
    let text = parts.join(" ") + ".";
    text += ` L’indice documentaire fait ressortir : « ${riskScore.label} ».`;
    text += " Il ne constitue ni un niveau d’enjeu réglementaire ni une conclusion d’impact ; ces éléments dépendent du projet, de ses pressions et des vérifications de terrain.";
    if (riskScore.tone === "critical" || riskScore.tone === "high") {
      text += " Selon la nature du projet, des investigations ciblées sont à examiner avec un écologue avant de décider des suites.";
    } else {
      text += " Une vérification de terrain reste utile pour confirmer ou nuancer cette lecture documentaire.";
    }
    return text;
  }, [results, zonages, riskScore, potentialIssueSignals]);

  const globalLevel = useMemo(() => computeGlobalIssueLevel(riskScore.tone), [riskScore.tone]);

  const prefersReducedMotionRef = useRef(
    typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
  const conversationFeedRef = useRef<HTMLDivElement | null>(null);
  const resultsFeedRef = useRef<HTMLDivElement | null>(null);
  const resultsSummaryRef = useRef<HTMLElement | null>(null);
  const positionedResultsRef = useRef<InventoryResult | null>(null);

  useEffect(() => {
    if (!isOpen || results) return;
    const feed = conversationFeedRef.current;
    if (!feed) return;

    let frame = 0;
    const scrollToLatestAgentMessage = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        feed.scrollTo({
          top: feed.scrollHeight,
          behavior: prefersReducedMotionRef.current ? "auto" : "smooth",
        });
      });
    };

    scrollToLatestAgentMessage();
    const observer = new MutationObserver(scrollToLatestAgentMessage);
    observer.observe(feed, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(frame);
    };
  }, [isOpen, isAnalyzing, results]);

  useEffect(() => {
    if (!isOpen || isAnalyzing || !results || positionedResultsRef.current === results) return;
    const feed = resultsFeedRef.current;
    const summary = resultsSummaryRef.current;
    if (!feed || !summary) return;

    positionedResultsRef.current = results;
    const frame = window.requestAnimationFrame(() => {
      const feedTop = feed.getBoundingClientRect().top;
      const summaryTop = summary.getBoundingClientRect().top;
      feed.scrollTo({
        top: Math.max(0, feed.scrollTop + summaryTop - feedTop - 16),
        behavior: prefersReducedMotionRef.current ? "auto" : "smooth",
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [isOpen, isAnalyzing, results]);

  // Sélection d'une espèce depuis la carte : ouvre la pièce jointe Espèces
  // et fait défiler jusqu'à la fiche correspondante.
  useEffect(() => {
    if (!selectedSpecies || !isOpen) return;
    const currentScope = speciesScope === "prioritaires" ? prioritySpeciesList : allFilteredSpecies;
    const isAlreadyVisible = currentScope.some((o) => occurrenceKey(o) === selectedSpecies);
    const isPriority = prioritySpeciesList.some((o) => occurrenceKey(o) === selectedSpecies);
    if (!isAlreadyVisible) setSpeciesScope(isPriority ? "prioritaires" : "toutes");
    setSpeciesQuery("");
    setOpenSections((prev) => new Set(prev).add("especes"));
    // Attendre le rendu de la vue détaillée avant de faire défiler
    const t = window.setTimeout(() => {
      document
        .querySelector(`[data-species-item="${CSS.escape(selectedSpecies)}"]`)
        ?.scrollIntoView({ behavior: prefersReducedMotionRef.current ? "auto" : "smooth", block: "center" });
    }, 100);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSpecies, isOpen, speciesScope, prioritySpeciesList, allFilteredSpecies]);

  const toggleSection = (key: SectionKey) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Liste plate des zonages, triée par priorité de vigilance (réglementaire → Natura 2000 → ZNIEFF → info)
  const flatZonages = useMemo(() => {
    if (!zonages) return [] as (ZonageItem & { groupCategory: string; categoryLabel: string; priority: number })[];
    const list: (ZonageItem & { groupCategory: string; categoryLabel: string; priority: number })[] = [];
    const seen = new Set<string>();
    for (const g of zonages.groups) {
      for (const z of g.zonages) {
        const key = zonageKey(z);
        if (seen.has(key)) continue;
        seen.add(key);
        list.push({ ...z, groupCategory: g.category, categoryLabel: g.label, priority: ZONAGE_CATEGORY_PRIORITY[g.category] ?? 9 });
      }
    }
    list.sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name));
    return list;
  }, [zonages]);

  const aggregatedIssues = useMemo(() => {
    const rows = new Map<string, AggregatedIssue>();
    const rank: Record<AggregatedIssue["level"], number> = { "À qualifier": 0, "Modéré": 1, "Fort": 2, "Critique": 3 };
    const upsert = (key: string, issue: AggregatedIssue) => {
      const existing = rows.get(key);
      if (!existing) return void rows.set(key, issue);
      rows.set(key, {
        ...existing,
        level: rank[issue.level] > rank[existing.level] ? issue.level : existing.level,
        agents: Array.from(new Set([...existing.agents, ...issue.agents])),
        evidence: Array.from(new Set([existing.evidence, issue.evidence])).join(" · "),
        interpretation: Array.from(new Set([existing.interpretation, issue.interpretation])).join(" "),
      });
    };
    const speciesKey = (name: string) => `species::${normalizedTaxonName(name)}`;

    for (const occurrence of [...sortedSpecies.high, ...sortedSpecies.medium]) {
      const level: AggregatedIssue["level"] = occurrence.enjeuLevel === "critique"
        ? "Critique"
        : occurrence.enjeuLevel === "fort" || occurrence.alertLevel === "high" ? "Fort" : "Modéré";
      upsert(speciesKey(occurrence.scientificName), {
        id: speciesKey(occurrence.scientificName),
        subject: occurrence.scientificName,
        category: "Espèce",
        level,
        agents: ["Occurrences", ...(occurrence.aliStatuses?.length ? ["Taxonomie et statuts"] : [])],
        evidence: "Occurrence publique documentée dans l’aire d’étude",
        interpretation: occurrence.enjeuWarnings?.join(" ") || "Signal territorial à examiner et à confirmer dans l’emprise par des investigations de terrain.",
      });
    }

    for (const species of aiAnalysis?.species ?? []) {
      const level: AggregatedIssue["level"] = species.level === "majeur" ? "Critique" : species.level === "fort" ? "Fort" : "Modéré";
      upsert(speciesKey(species.scientificName), {
        id: speciesKey(species.scientificName),
        subject: species.scientificName,
        category: "Espèce",
        level,
        agents: ["Taxonomie et statuts"],
        evidence: species.inInventory ? "Taxon rapproché d’une occurrence documentaire" : "Signal documentaire sans occurrence dans l’inventaire",
        interpretation: species.reason || "Statut territorial ou patrimonial à prendre en compte.",
      });
    }

    for (const species of reconciledPotentialSpecies?.species ?? []) {
      if (species.observed || species.score === null || species.score < 50 || species.status === "Peu compatible" || species.status === "Non évaluée") continue;
      const regional = regionalRedListByPotentialName.get(normalizedTaxonName(species.scientificName));
      const elevated = ["CR", "EN", "VU"].includes(regional?.value.toUpperCase() ?? "");
      upsert(speciesKey(species.scientificName), {
        id: speciesKey(species.scientificName),
        subject: species.scientificName,
        category: "Espèce",
        level: elevated ? "Fort" : "Modéré",
        agents: ["Habitats", ...(regional ? ["Taxonomie et statuts"] : [])],
        evidence: `${species.status} · compatibilité ${species.score}/100${regional ? ` · liste rouge régionale ${regional.value}` : ""}`,
        interpretation: elevated
          ? "Enjeu documentaire potentiel élevé à confirmer sur le terrain ; aucune présence dans l’emprise n’est affirmée."
          : "Présence potentielle fondée sur la compatibilité écologique, à vérifier sur le terrain.",
      });
    }

    for (const zonage of flatZonages) {
      const level: AggregatedIssue["level"] = zonage.priority <= 1 ? "Fort" : zonage.priority === 2 ? "Modéré" : "À qualifier";
      const id = `zonage::${zonageKey(zonage)}`;
      upsert(id, {
        id,
        subject: zonage.name,
        category: "Zonage",
        level,
        agents: ["Zonages"],
        evidence: `${zonage.type} · ${zonage.categoryLabel}`,
        interpretation: "Contexte réglementaire ou d’inventaire à intégrer à la conception du projet ; la portée exacte dépend du zonage.",
      });
    }

    for (const habitat of carhabSummary?.habitats ?? []) {
      const id = `habitat::${habitat.code || normalizedTaxonName(habitat.label)}`;
      upsert(id, {
        id,
        subject: habitat.label,
        category: "Habitat",
        level: "À qualifier",
        agents: ["Habitats"],
        evidence: `CARHAB${habitat.percentage !== null ? ` · ${habitat.percentage.toLocaleString("fr-FR")} % de la surface documentée` : ""}`,
        interpretation: "Habitat cartographié à caractériser sur le terrain avant de conclure sur son enjeu écologique.",
      });
    }

    return Array.from(rows.values()).sort((a, b) =>
      rank[b.level] - rank[a.level] || a.category.localeCompare(b.category, "fr") || a.subject.localeCompare(b.subject, "fr"),
    );
  }, [aiAnalysis, carhabSummary, flatZonages, reconciledPotentialSpecies, regionalRedListByPotentialName, sortedSpecies]);

  // Un clic sur la carte ouvre et centre la ligne correspondante dans la liste.
  useEffect(() => {
    if (!selectedZonageId) return;
    if (!flatZonages.some((z) => zonageKey(z) === selectedZonageId)) return;
    setOpenSections((prev) => new Set(prev).add("zonages"));
    setExpandedZonages((prev) => {
      if (prev.has(selectedZonageId)) return prev;
      const next = new Set(prev);
      next.add(selectedZonageId);
      return next;
    });
    const timer = window.setTimeout(() => {
      document
        .querySelector(`[data-zonage-key="${CSS.escape(selectedZonageId)}"]`)
        ?.scrollIntoView({
          behavior: prefersReducedMotionRef.current ? "auto" : "smooth",
          block: "center",
        });
    }, 100);
    return () => window.clearTimeout(timer);
  }, [selectedZonageId, flatZonages]);

  const reglementaireCount = useMemo(
    () => zonages?.groups.find((g) => g.category === "reglementaire")?.count || 0,
    [zonages]
  );

  const aVerifierCount = useMemo(
    () => allFilteredSpecies.filter((o) => o.enjeuLevel === "a_confirmer" || (!o.enjeuLevel && isNotEvaluated(o.iucnStatus))).length,
    [allFilteredSpecies]
  );

  // « À retenir » : au maximum 3 informations prioritaires dérivées des données réelles
  const keyFindings = useMemo(() => {
    const items: { icon: "shield" | "alert" | "check" | "info"; text: string }[] = [];
    if (reglementaireCount > 0) {
      items.push({ icon: "shield", text: `Site concerné par ${reglementaireCount} protection${reglementaireCount > 1 ? "s" : ""} réglementaire${reglementaireCount > 1 ? "s" : ""}.` });
    } else if ((zonages?.groups.find((g) => g.category === "natura2000")?.count || 0) > 0) {
      const n = zonages!.groups.find((g) => g.category === "natura2000")!.count;
      items.push({ icon: "shield", text: `Site concerné par ${n} zonage${n > 1 ? "s" : ""} Natura 2000.` });
    }
    const sens = sortedSpecies.high.length + sortedSpecies.medium.length;
    if (sens > 0) {
      items.push({ icon: "alert", text: `Présence potentielle de ${sens} espèce${sens > 1 ? "s" : ""} sensible${sens > 1 ? "s" : ""} d'après les données publiques.` });
    }
    if (items.length < 3 && aVerifierCount > 0) {
      items.push({ icon: "info", text: `${aVerifierCount} espèce${aVerifierCount > 1 ? "s" : ""} au statut à vérifier.` });
    }
    if (items.length < 3 && potentialIssueSignals.count > 0) {
      items.push({
        icon: "info",
        text: potentialIssueSignals.regionalThreatened > 0
          ? `${potentialIssueSignals.regionalThreatened} espèce${potentialIssueSignals.regionalThreatened > 1 ? "s" : ""} potentielle${potentialIssueSignals.regionalThreatened > 1 ? "s" : ""}, écologiquement compatible${potentialIssueSignals.regionalThreatened > 1 ? "s" : ""}, présente${potentialIssueSignals.regionalThreatened > 1 ? "nt" : ""} un statut UICN régional élevé à vérifier sur le terrain.`
          : `${potentialIssueSignals.count} espèce${potentialIssueSignals.count > 1 ? "s" : ""} potentielle${potentialIssueSignals.count > 1 ? "s" : ""} contribue${potentialIssueSignals.count > 1 ? "nt" : ""} prudemment au niveau d’enjeu.`,
      });
    }
    if (items.length < 3) {
      items.push({ icon: "check", text: "Vérification terrain recommandée pour confirmer ce pré-diagnostic." });
    }
    return items.slice(0, 3);
  }, [reglementaireCount, zonages, sortedSpecies, aVerifierCount, potentialIssueSignals]);

  const recommendations = useMemo(() => {
    const items = ["Réaliser un prédiagnostic écologique de terrain pour confirmer les sensibilités du site."];
    items.push(
      reglementaireCount > 0
        ? "Vérifier les obligations réglementaires associées aux protections et zonages identifiés."
        : "Vérifier la portée des zonages environnementaux recensés avant de définir le projet.",
    );
    items.push("Adapter le calendrier du projet aux périodes sensibles des groupes d’espèces concernés.");
    items.push("Faire valider les conclusions et les mesures d’évitement par un écologue.");
    return items;
  }, [reglementaireCount]);

  const toggleZonageDetails = (key: string) => {
    setExpandedZonages((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const filteredTotal = allFilteredSpecies.length;
  const allGroupCount = presentGroups.length;
  const activeFilterCount = presentGroups.filter(g => activeTaxonFilters.has(g.id)).length;
  const isAllActive = activeFilterCount === allGroupCount;

  const handleExportCSV = () => {
    if (!results) return;
    exportCSV({ results, filteredSpecies: allFilteredSpecies, activeTaxonFilters });
  };

  const handleExportExcel = () => {
    if (!results) return;
    void exportExcel({ results, filteredSpecies: allFilteredSpecies, activeTaxonFilters });
  };

  const handleExportImage = async () => {
    const mapElement = document.getElementById("map-container");
    if (mapElement) {
      const canvas = await html2canvas(mapElement, {
        useCORS: true,
        allowTaint: true,
        ignoreElements: (element) => element.classList.contains("no-export")
      });
      const link = document.createElement("a");
      link.download = `pre-etude-documentaire-biodiversite-${Date.now()}.jpg`;
      link.href = canvas.toDataURL("image/jpeg", 0.9);
      link.click();
    }
  };

  const reportText = useMemo(() => {
    if (!results) return "";

    const highCount = sortedSpecies.high.length;
    const mediumCount = sortedSpecies.medium.length;
    const lowCount = sortedSpecies.low.length;
    const totalInReport = highCount + mediumCount + lowCount;

    const conf = results.confidence;
    const confLabel = conf.interpretation === "excellent" ? "Excellent"
      : conf.interpretation === "good" ? "Bon"
      : conf.interpretation === "moderate" ? "Modéré"
      : "Faible";

    const activeGroupLabels = presentGroups
      .filter(g => activeTaxonFilters.has(g.id))
      .map(g => g.label)
      .join(', ');

    const lat = results.center[0].toFixed(5);
    const lng = results.center[1].toFixed(5);
    const mapsLink = `https://www.google.com/maps/@${lat},${lng},14z`;
    const shareUrl = typeof window !== "undefined"
      ? `${window.location.origin}/?lat=${lat}&lng=${lng}&radius=${results.radius}`
      : "";

    const fmtSpecies = (o: Occurrence) => {
      const territorial = getPreferredTerritorialRedList(o.aliStatuses);
      const status = territorial
        ? `${territorial.category}${territorial.scope ? ` — ${territorial.scope}` : ""} : ${territorial.value}`
        : isPlantTaxon(o)
          ? "statut régional/national/européen non renseigné"
          : getIucnFullLabel(o.iucnStatus);
      return `• ${o.scientificName}${o.vernacularName ? ` — ${o.vernacularName}` : ""} (${status})`;
    };

    const sectionList = (label: string, list: Occurrence[]) =>
      list.length > 0 ? `${label} (${list.length})\n${list.map(fmtSpecies).join("\n")}\n` : "";

    const zonagesSection = zonages && zonages.count > 0 ? `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🗺 ZONAGES ENVIRONNEMENTAUX (${zonages.count})
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${zonages.groups.map(g => `${g.label} (${g.count})\n${g.zonages.map(z => `• ${z.type} — ${z.name}${z.url ? `\n  ${z.url}` : ""}`).join("\n")}`).join("\n\n")}

↳ Zonages intersectant l'aire d'étude — source IGN Géoplateforme / INPN (PatriNat).
` : "";
    const enabledAgents = harnessConfig?.agents.filter((agent) => agent.enabled) ?? [];
    const configuredAgents = enabledAgents.length
      ? enabledAgents.map((agent) => {
          const mcpLabel = agent.mcpId === "ali-internal"
            ? "interne ALi"
            : agent.mcpId === "ali-species"
              ? "ALI Species / TAXREF Explorer"
              : "CARHAB";
          return `- ${agent.name} : ${agent.description || "consigne spécialisée configurée"}${agent.mcpId === "none" ? "" : ` — MCP ${mcpLabel} (${agent.mcpToolIds.length} outil${agent.mcpToolIds.length > 1 ? "s" : ""} approuvé${agent.mcpToolIds.length > 1 ? "s" : ""})`}`;
        }).join("\n")
      : "- Aucun agent configuré n’a été mobilisé.";
    const mcpTrace = aiAnalysis?.mcpTrace ?? [];
    const mcpTraceSection = mcpTrace.length
      ? `\n- Journal d’exécution MCP :\n${mcpTrace.map((trace) => `  - ${trace.agentId}/${trace.toolId} — ${trace.status === "success" ? "succès" : trace.status === "denied" ? "refusé" : "échec"} (${trace.durationMs} ms) : ${trace.summary}`).join("\n")}`
      : "\n- Journal d’exécution MCP : aucun outil MCP exécuté.";
    const aliHabitatReportSection = carhabSummary
      ? `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🌿 HABITATS DOCUMENTÉS PAR ALI HABITAT / CARHAB
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${formatCarhabSummary(carhabSummary)}

↳ Surfaces et proportions fournies par CARHAB pour l’aire demandée, classées par surface décroissante. Elles ne constituent ni une cartographie de terrain, ni une confirmation de présence dans l’emprise des travaux.
`
      : "";
    const mobilizedSources = [
      "GBIF",
      includeINaturalist && "iNaturalist",
      "UICN",
      results.aliSpeciesEnrichment ? "ALI Species / TAXREF" : "TAXREF",
      zonagesAgentActive && zonages ? "IGN Géoplateforme" : false,
      zonagesAgentActive && zonages ? "PatriNat / INPN" : false,
      carhabSummary ? "CARHAB" : false,
      aiAnalysis?.natura2000?.length ? "données Natura 2000" : false,
    ].filter(Boolean).join(", ");

    return `ALi INVENTAIRE
PRÉ-ÉTUDE DOCUMENTAIRE BIODIVERSITÉ À COMPLÉTER PAR DES INVESTIGATIONS DE TERRAIN
Version 1 — ${new Date().toLocaleDateString("fr-FR")}

LOCALISATION ET PÉRIMÈTRE
${toponym ? `Site : ${toponym}\n` : ""}Coordonnées : ${lat}, ${lng}
Aire bibliographique interrogée : rayon de ${results.radius} m autour du point
Carte : ${mapsLink}
${!isAllActive ? `Filtres taxonomiques actifs : ${activeGroupLabels}\n` : ""}

HARNAIS D'ALi — ORCHESTRATION RÉELLEMENT MOBILISÉE
- Coordination : ALi comprend la demande, vérifie le périmètre, répartit l'analyse et consolide les réponses.
${configuredAgents}
${mcpTraceSection}
- Sources effectivement mobilisées par cette analyse : ${mobilizedSources}.
${results.aliSpeciesEnrichment ? `- Enrichissement territorial ALI Species MCP : ${results.aliSpeciesEnrichment.enriched}/${results.aliSpeciesEnrichment.attempted} taxons enrichis${results.aliSpeciesEnrichment.region ? ` pour ${results.aliSpeciesEnrichment.region}` : results.aliSpeciesEnrichment.territorialScope === "multiple" ? " — plusieurs régions concernées, aucune liste rouge régionale unique attribuée" : " — territoire régional non résolu"}${results.aliSpeciesEnrichment.partial ? " — résultat partiel, les taxons non enrichis restent signalés sans extrapolation." : "."}` : ""}
- Garde-fou 1 : une donnée connue dans l'aire bibliographique n'est pas une présence confirmée dans l'emprise.
- Garde-fou 2 : une présence potentielle issue d'une compatibilité écologique doit être vérifiée sur le terrain.
- Garde-fou 3 : seule une prospection adaptée peut confirmer une présence sur le terrain.
- Garde-fou 4 : l'absence de donnée publique ne permet pas de conclure à l'absence d'une espèce.
- Garde-fou 5 : les espèces exotiques envahissantes relèvent d'un enjeu de gestion et non automatiquement d'un enjeu patrimonial.
- Limite d'orchestration : aucun MCP, document utilisateur ou référentiel non cité ci-dessus ne doit être présenté comme mobilisé.

DONNÉES MANQUANTES À SIGNALER DANS LA PRÉ-ÉTUDE DOCUMENTAIRE BIODIVERSITÉ
- Emprise parcellaire et emprise exacte des travaux : non documentées si seule l'aire circulaire est fournie.
- Description détaillée, dimensions et méthodes des travaux : non documentées.
- Calendrier de chantier et phase d'exploitation : non documentés.
- Pressions du projet et variantes d'implantation : non documentées.
- Inventaires naturalistes saisonniers et cartographie de terrain des habitats : non disponibles.

SYNTHÈSE DES DONNÉES DISPONIBLES
${results.stats.rawNameCount != null ? `${results.stats.rawNameCount} noms taxonomiques collectés — ${results.stats.speciesCount} taxons valides après consolidation${results.stats.duplicatesRemoved ? ` (${results.stats.duplicatesRemoved} doublon${results.stats.duplicatesRemoved > 1 ? "s" : ""} fusionné${results.stats.duplicatesRemoved > 1 ? "s" : ""})` : ""}` : `${totalInReport} taxons recensés (GBIF + iNaturalist)`}
${highCount + mediumCount} espèces sensibles (enjeux forts ou moyens)
Indice de confiance des données : ${conf.total}/100 — ${confLabel}
Potentiel d'enjeux écologiques : ${riskScore.label}
↳ Le risque biodiversité ne peut être calculé qu'en croisant ces enjeux avec les caractéristiques et les pressions d'un projet.
${conf.message ? `↳ ${conf.message}\n` : ""}
${aliHabitatReportSection}
${sectionList("🔴 ENJEUX FORTS", sortedSpecies.high)}
${sectionList("🟠 ENJEUX MOYENS", sortedSpecies.medium)}
${sectionList("🟢 ENJEUX FAIBLES", sortedSpecies.low)}${aiAnalysis && aiAnalysis.species.length > 0 ? `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✨ ANALYSE IA — ESPÈCES À ENJEUX
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${(["A", "C", "B", "D", "E"] as const)
  .map((cls) => {
    const label: Record<string, string> = { A: "Occurrence publique documentée dans l’aire", B: "Espèce documentée à l’échelle d’un site de référence", C: "Très probable localement", D: "Potentielle", E: "Peu pertinente localement" };
    const group = aiAnalysis.species.filter((sp) => (sp.evidenceClass ?? "D") === cls);
    if (group.length === 0) return "";
    return `\n[${cls}] ${label[cls]}\n${group
      .map((sp) => `• ${sp.scientificName}${sp.vernacularName ? ` (${sp.vernacularName})` : ""}
   ${sp.group}${sp.isInvasive ? " • EXOTIQUE ENVAHISSANTE (EEE) — sans valeur patrimoniale" : typeof sp.score === "number" ? ` • Enjeu ${sp.score}/100${sp.scoreLabel ? ` (${sp.scoreLabel})` : ""}` : ` • Niveau : ${sp.level}`}${sp.inInventory === false ? " • hors inventaire (suggestion IA)" : ""}
   ${sp.reason}${sp.sources && sp.sources.length > 0 ? `
   Sources : ${sp.sources.join(" • ")}` : ""}`)
      .join("\n")}`;
  })
  .filter(Boolean)
  .join("\n")}
${aiAnalysis.natura2000 && aiAnalysis.natura2000.length > 0 ? `
🇪🇺 Zones Natura 2000 à proximité (${aiAnalysis.natura2000.length})
${aiAnalysis.natura2000.map(z => { const desig = (z.species ?? []).filter(s => s.designating).map(s => s.name); const hab = (z.habitats ?? []).slice(0, 5).map(h => `    - ${h.code}${h.description ? ` — ${h.description}` : ""}${h.cover != null ? ` (${h.cover.toFixed(h.cover < 10 ? 1 : 0)} %)` : ""}`); return `• ${z.type} — ${z.name}${z.url ? `\n  ${z.url}` : ""}${desig.length > 0 ? `\n  Espèces désignatrices : ${desig.join(", ")}` : ""}${hab.length > 0 ? `\n  Habitats d'intérêt communautaire :\n${hab.join("\n")}` : ""}`; }).join("\n")}
` : ""}
⚠ Synthèse IA — à valider par un écologue.
` : ""}${zonagesSection}
SOURCES SYNTHÉTIQUES
${mobilizedSources.split(", ").join(" • ")}

STATUT ET LIMITES
Pré-étude documentaire biodiversité produite par le harnais d'ALi à partir des seules sources indiquées.
Ce document constitue un état initial bibliographique et une analyse de sensibilités. Il ne remplace ni des inventaires de terrain, ni un volet naturel d'étude d'impact réglementaire, ni la validation d'un écologue.
${shareUrl ? `\nReproduire cette analyse : ${shareUrl}` : ""}`;
  }, [results, sortedSpecies, activeTaxonFilters, presentGroups, isAllActive, aiAnalysis, carhabSummary, toponym, zonages, riskScore, includeINaturalist, harnessConfig, zonagesAgentActive]);

  const reportSubject = useMemo(() => {
    if (!results) return "ALi Inventaire";
    const place = toponym || `${results.center[0].toFixed(3)}, ${results.center[1].toFixed(3)}`;
    return `Pré-étude documentaire biodiversité — ${place} (${sortedSpecies.high.length + sortedSpecies.medium.length} espèces sensibles)`;
  }, [results, toponym, sortedSpecies]);

  const activeReportText = reformattedReport || reportText;
  const reportPreviewText = useMemo(() => {
    const sectionOneIndex = activeReportText.search(/\n## 1\./);
    const openingSections = sectionOneIndex > 0
      ? activeReportText.slice(0, sectionOneIndex)
      : activeReportText;
    const maxPreviewCharacters = 4_000;
    if (openingSections.length <= maxPreviewCharacters) return openingSections;
    const lastLineBreak = openingSections.lastIndexOf("\n", maxPreviewCharacters);
    const cutAt = lastLineBreak > 2_500 ? lastLineBreak : maxPreviewCharacters;
    return `${openingSections.slice(0, cutAt).trimEnd()}\n\n[… Aperçu abrégé — téléchargez l’étude complète pour consulter tous les résultats.]`;
  }, [activeReportText]);
  const aliHabitatTraces = aiAnalysis?.mcpTrace?.filter((trace) => trace.mcpId === "ali-habitat") ?? [];
  const aliHabitatSucceeded = aliHabitatTraces.some((trace) => trace.status === "success");
  const aliHabitatStatus = aliHabitatSucceeded
    ? `CARHAB consulté avec succès (${aliHabitatTraces.filter((trace) => trace.status === "success").length} outil${aliHabitatTraces.filter((trace) => trace.status === "success").length > 1 ? "s" : ""} mobilisé${aliHabitatTraces.filter((trace) => trace.status === "success").length > 1 ? "s" : ""}).`
    : aliHabitatTraces.length > 0
      ? "CARHAB a été sollicité, mais n’a pas pu fournir de résultat exploitable."
      : habitatConsultationState === "loading"
        ? "Consultation de CARHAB en cours."
        : habitatConsultationState === "error"
          ? "La consultation de CARHAB n’a pas pu être finalisée."
          : null;

  useEffect(() => {
    setReformattedReport(null);
    setReformatError(null);
  }, [reportText]);

  const handleCopyReport = () => {
    navigator.clipboard.writeText(activeReportText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShareReport = async () => {
    if (typeof navigator !== "undefined" && (navigator as any).share) {
      try {
        await (navigator as any).share({ title: reportSubject, text: activeReportText });
        return;
      } catch {
        // user cancelled or share failed → fall back
      }
    }
    handleCopyReport();
  };

  const handleEmailReport = () => {
    const body = encodeURIComponent(reformattedReport || reportText);
    const subject = encodeURIComponent(reportSubject);
    window.open(`mailto:?subject=${subject}&body=${body}`, "_blank");
  };

  const handleDownloadWordReport = () => {
    if (!reformattedReport) return;
    const escapeHtml = (value: string) =>
      value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;");
    const documentHtml = `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(reportSubject)}</title>
  <style>
    @page { size: A4; margin: 2.2cm 2cm; }
    body { font-family: Aptos, Calibri, Arial, sans-serif; color: #243b34; font-size: 11pt; line-height: 1.55; }
    h1 { color: #174c3f; font-size: 24pt; line-height: 1.15; margin: 0 0 22pt; padding-bottom: 10pt; border-bottom: 2pt solid #b88945; }
    h2 { color: #1e594a; font-size: 17pt; line-height: 1.25; margin: 24pt 0 9pt; page-break-after: avoid; }
    h3 { color: #46675d; font-size: 13pt; line-height: 1.3; margin: 16pt 0 7pt; page-break-after: avoid; }
    p { margin: 0 0 9pt; text-align: justify; }
    ul { margin: 4pt 0 10pt 18pt; padding: 0; }
    li { margin-bottom: 4pt; }
    table { width: 100%; border-collapse: collapse; margin: 10pt 0 16pt; font-size: 9.5pt; }
    th { color: #fff; background: #1e594a; font-weight: 700; text-align: left; }
    th, td { border: 1px solid #aebdb7; padding: 6pt; vertical-align: top; }
    tr:nth-child(even) td { background: #f4f3ec; }
    .status { padding: 10pt 12pt; border-left: 4pt solid #b88945; background: #f5f2e8; margin: 0 0 22pt; color: #3d524b; font-size: 9.5pt; }
  </style>
</head>
<body>
  <div class="status"><strong>Statut du document.</strong> Pré-étude biodiversité fondée sur les informations documentaires disponibles. Elle doit être complétée par des investigations de terrain et validée par un écologue avant tout usage réglementaire.</div>
  ${studyMarkdownToWordHtml(reformattedReport)}
</body>
</html>`;
    const blob = new Blob(["\ufeff", documentHtml], {
      type: "application/msword;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const safePlace = (toponym || "site")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase();
    link.href = url;
    link.download = `pre-etude-biodiversite-ali-${safePlace || "site"}.doc`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const handleReformatReport = async () => {
    setReformatting(true);
    setReformatError(null);
    try {
      const finalStudyContext = buildFinalStudyContext({
        requestSummary,
        toponym,
        inventory: results!,
        zonages,
        potentialSpecies,
        priorityAnalysis: aiAnalysis,
        carhabSummary,
        harnessConfig,
        filters: {
          activeTaxonGroups: Array.from(activeTaxonFilters),
          excludeMarine: !!excludeMarine,
          includeINaturalist: !!includeINaturalist,
        },
        states: {
          zonagesLoading,
          potentialSpeciesLoading,
          potentialSpeciesError,
          habitatConsultation: habitatConsultationState,
        },
      });
      const r = await fetch("/api/llm/reformat-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          report: reportText,
          context: serializeFinalStudyContext(finalStudyContext),
        }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || `Erreur ${r.status}`);
      }
      const data = await r.json();
      setReformattedReport(data.reformatted);
      setReportPromptTrace(data.promptTrace ?? null);
    } catch (e: any) {
      setReformatError(e.message || "Erreur reformulation IA");
    } finally {
      setReformatting(false);
    }
  };

  if (!isOpen) return null;

  const sourcesLabel = `GBIF${includeINaturalist ? " · iNaturalist" : ""} · UICN · ALI/TAXREF · IGN/INPN`;

  const assistantSuggestions: string[] = [
    "Résume ce diagnostic pour un non-spécialiste.",
    "Quels sont les trois principaux risques ?",
    "Quelles espèces nécessitent une vérification terrain ?",
    "Quelles conséquences des zonages pour mon projet ?",
  ];

  const fortSpeciesCount = enjeuxBuckets.critique.length + enjeuxBuckets.fort.length;
  const prefersReducedMotion =
    typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const statusLabels: Record<AnalysisConversation["status"], string> = {
    draft: "Brouillon", running: "En cours", partial: "Partiel", complete: "Terminé", failed: "Échec",
  };
  const activeConversation = conversations.find((conversation) => conversation.id === activeConversationId);
  const activeConversationFailed = activeConversation?.status === "failed";
  const historyDrawer = historyOpen && (
    <motion.div
      id="analysis-history-drawer"
      initial={{ opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }}
      className="absolute inset-y-0 right-0 z-30 flex h-full max-h-full w-full max-w-[360px] flex-col overflow-hidden border-l border-slate-200 bg-[#fbfcfa] shadow-2xl"
      role="dialog" aria-modal="true" aria-label="Historique des analyses" data-testid="history-drawer"
      onWheel={(event) => event.stopPropagation()}
    >
      <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-4 py-3">
        <div><h3 className="text-sm font-bold text-slate-800">Historique</h3><p className="text-[10px] text-slate-500">20 dernières analyses, enregistrées uniquement sur cet appareil</p></div>
        <Button variant="ghost" size="icon" onClick={() => setHistoryOpen(false)} aria-label="Fermer l'historique" className="h-8 w-8 rounded-full"><X className="h-4 w-4" /></Button>
      </div>
      <div className="h-0 min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain p-3" data-testid="history-scroll-area">
        <Button onClick={() => { onNewConversation?.(); setHistoryOpen(false); }} className="mb-3 h-9 w-full justify-center gap-2 bg-teal-700 text-xs text-white hover:bg-teal-800" data-testid="button-new-conversation"><Plus className="h-3.5 w-3.5" />Nouvelle conversation</Button>
        {historyError && <p className="mb-2 rounded-lg bg-amber-50 px-2.5 py-2 text-[10px] text-amber-700" role="alert">{historyError}</p>}
        {[...conversations].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 20).map((conversation) => {
          const active = conversation.id === activeConversationId;
          const date = new Date(conversation.updatedAt).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
          return (
            <div key={conversation.id} className={`mb-2 rounded-xl border p-2.5 ${active ? "border-teal-400 bg-teal-50/70" : "border-slate-200 bg-white"}`} aria-current={active ? "page" : undefined}>
              {editingConversationId === conversation.id ? (
                <input autoFocus value={editingTitle} onChange={(e) => setEditingTitle(e.target.value)}
                  onBlur={() => { const title = editingTitle.trim(); if (title) onRenameConversation?.(conversation.id, title); setEditingConversationId(null); }}
                  onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") setEditingConversationId(null); }}
                  className="mb-1 h-7 w-full rounded-md border border-teal-300 px-2 text-xs outline-none" aria-label="Renommer la conversation" />
              ) : (
                <button type="button" onClick={() => { onSelectConversation?.(conversation.id); setHistoryOpen(false); }} className="w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400" aria-label={`Sélectionner ${conversation.title}`}>
                  <p className="truncate text-xs font-bold text-slate-800">{conversation.title || "Analyse sans titre"}</p>
                  <p className="mt-1 flex items-center gap-1 truncate text-[10px] text-slate-500"><MapPin className="h-3 w-3" />{conversation.parameters.toponym || "Lieu non renseigné"} <span>·</span> {date}</p>
                  <span className={`mt-1 inline-flex rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${conversation.status === "complete" ? "bg-emerald-100 text-emerald-700" : conversation.status === "failed" ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-600"}`}>{statusLabels[conversation.status]}</span>
                </button>
              )}
              <div className="mt-1 flex justify-end gap-1">
                <button type="button" onClick={() => { setEditingConversationId(conversation.id); setEditingTitle(conversation.title); }} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-teal-700" aria-label={`Renommer ${conversation.title}`}><Pencil className="h-3 w-3" /></button>
                {deleteConversationId === conversation.id ? (
                  <button type="button" onClick={() => { onDeleteConversation?.(conversation.id); setDeleteConversationId(null); }} className="rounded px-1.5 text-[10px] font-bold text-red-700 hover:bg-red-50" aria-label="Confirmer la suppression">Confirmer</button>
                ) : <button type="button" onClick={() => setDeleteConversationId(conversation.id)} className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-700" aria-label={`Supprimer ${conversation.title}`}><Trash2 className="h-3 w-3" /></button>}
              </div>
            </div>
          );
        })}
        {!conversations.length && <p className="py-8 text-center text-xs text-slate-400">Aucune analyse enregistrée.</p>}
      </div>
    </motion.div>
  );

  if (!results) {
    return (
        <aside
          className="conversation-panel fixed right-0 z-[2000] flex flex-col bg-white inset-x-0 bottom-0 h-[80vh] rounded-t-2xl border-t md:inset-x-auto md:top-0 md:bottom-auto md:h-full md:w-[680px] md:max-w-[95vw] md:rounded-none md:border-l md:border-t-0"
          data-phase="location"
          aria-label="Conversation ALi Inventaire"
        >
          <header className="conversation-header flex items-center justify-between gap-3 border-b border-gray-100 bg-white px-5 py-2">
            <div className="min-w-0">
              {toponym && (
                 <p className="flex items-center gap-1 truncate text-xs font-semibold text-teal-700">
                  <MapPin className="h-3 w-3 shrink-0" />
                  <span className="truncate">{toponym}</span>
                </p>
              )}
              {historyError && <p className="mt-1 text-[10px] text-amber-700" role="alert">{historyError}</p>}
            </div>
             <div className="flex items-center gap-1">
             <Button variant="outline" size="sm" onClick={() => onNewConversation?.()} className="h-8 gap-1 px-2 text-xs" aria-label="Nouvelle conversation" data-testid="button-new-conversation"><Plus className="h-3.5 w-3.5" /> Nouvelle</Button>
             <Button variant="outline" size="sm" onClick={() => setHistoryOpen(true)} className="h-8 gap-1 px-2 text-xs" aria-label="Ouvrir l'historique local des 20 dernières analyses" aria-expanded={historyOpen} aria-controls="analysis-history-drawer" data-testid="button-history"><History className="h-3.5 w-3.5" /> Historique</Button>
             <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 rounded-full" aria-label="Réduire le panneau">
              <X className="h-4 w-4" />
            </Button>
             </div>
          </header>
          <div ref={conversationFeedRef} className="min-h-0 flex-1 overflow-y-auto px-5 py-4" data-testid="conversation-feed">
             {requestSummary && (isAnalyzing || activeConversationFailed) && <div className="conversation-message mb-5" data-testid="message-user-request"><Search className="mt-1 h-5 w-5" aria-hidden="true" /><div><p><strong>Votre demande</strong></p><p>{requestSummary}</p></div></div>}
             {activeConversationFailed && !isAnalyzing && (
               <div className="conversation-message mb-5" role="alert">
                 <Bot className="mt-1 h-5 w-5" aria-hidden="true" />
                 <div><p><strong>ALi</strong> <span>coordinateur</span></p>
                 <p>Cette analyse n’a pas pu être finalisée. Vous pouvez la relancer avec les mêmes paramètres ci-dessous.</p></div>
               </div>
             )}
             {isAnalyzing && <AnalysisProgress
              active={isAnalyzing}
              embedded
              includeINaturalist={!!includeINaturalist}
              areaCount={areaCount}
              zonagesLoading={zonagesLoading}
              zonagesReady={zonages !== null}
              zonageFeatureCount={zonages?.count ?? 0}
              potentialSpeciesLoading={potentialSpeciesLoading}
              potentialSpeciesReady={potentialSpecies !== null}
              potentialSpeciesCount={potentialSpecies?.potentialCount ?? 0}
              enabledAgentIds={enabledAgentIds}
             />}
             {!isAnalyzing && composer && <div className="conversation-composer">{composer}</div>}
          </div>
           {historyDrawer}
        </aside>
    );
  }

  return (
    <AnimatePresence>
      <aside
        className="conversation-panel results-text-mode fixed right-0 z-[2000] flex flex-col bg-white inset-x-0 bottom-0 h-[80vh] rounded-t-2xl border-t border-gray-300 md:inset-x-auto md:top-0 md:bottom-auto md:h-full md:w-[680px] md:max-w-[95vw] md:rounded-none md:border-t-0 md:border-l"
        aria-label="Conversation ALi Inventaire"
      >
        <div className="conversation-header border-b border-gray-100 bg-white/50 px-5 py-2">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              {toponym && (
                <p className="flex items-center gap-1 truncate text-xs font-semibold text-teal-700" data-testid="text-site-name">
                  <MapPin className="h-3 w-3 shrink-0" /> <span className="truncate">{toponym}</span>
                </p>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
                 <Button
                variant="outline"
                size="sm"
                 onClick={() => { onNewConversation?.(); }}
                className="h-8 px-2.5 text-xs border-gray-200 text-gray-600 gap-1"
                 data-testid="button-new-conversation"
              >
                  <Plus className="h-3 w-3" /> Nouvelle
              </Button>
               <Button variant="outline" size="sm" onClick={() => setHistoryOpen(true)} className="h-8 gap-1 px-2 text-xs border-gray-200" aria-label="Ouvrir l'historique local des 20 dernières analyses" aria-expanded={historyOpen} aria-controls="analysis-history-drawer" data-testid="button-history"><History className="h-3 w-3" /> Historique</Button>
               <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="hover:bg-gray-100 rounded-full h-8 w-8" data-testid="button-panel-settings" title="Sources & options" aria-label="Sources et options">
                    <Settings2 className="h-4 w-4 text-gray-500" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel className="text-xs">Sources de données</DropdownMenuLabel>
                   <div className="px-2 pb-1 text-[11px] leading-snug text-muted-foreground">Paramètres utilisés pour ce résultat. Relancez l’analyse pour modifier une source.</div>
                   {onToggleIncludeINaturalist && (
                    <DropdownMenuCheckboxItem
                      checked={!!includeINaturalist}
                       disabled
                      data-testid="checkbox-include-inaturalist"
                    >
                       iNaturalist {includeINaturalist ? "inclus" : "non inclus"} — relancer pour modifier
                    </DropdownMenuCheckboxItem>
                  )}
                  {onToggleExcludeMarine && marineCount > 0 && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuLabel className="text-xs">Filtres avancés</DropdownMenuLabel>
                      <DropdownMenuCheckboxItem
                        checked={!!excludeMarine}
                        onCheckedChange={() => onToggleExcludeMarine()}
                        data-testid="checkbox-exclude-marine"
                      >
                        Exclure marines ({marineCount})
                      </DropdownMenuCheckboxItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="hover:bg-gray-100 rounded-full h-8 w-8" data-testid="button-more-exports" title="Exports et partage" aria-label="Exports et partage">
                    <MoreHorizontal className="h-4 w-4 text-gray-500" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuLabel className="text-xs">Exporter les données</DropdownMenuLabel>
                  <DropdownMenuItem onClick={handleExportExcel} data-testid="button-export-excel" className="gap-2 text-xs">
                    <Table className="h-3.5 w-3.5" /> Excel (.xlsx)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleExportCSV} data-testid="button-export-csv" className="gap-2 text-xs">
                    <FileText className="h-3.5 w-3.5" /> CSV
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleExportImage} data-testid="button-export-image" className="gap-2 text-xs">
                    <Download className="h-3.5 w-3.5" /> Image de la carte
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-xs">Partager</DropdownMenuLabel>
                  <DropdownMenuItem onClick={handleShareReport} data-testid="button-share-report-menu" className="gap-2 text-xs">
                    <Share2 className="h-3.5 w-3.5" /> Partager la note
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleEmailReport} data-testid="button-email-report-menu" className="gap-2 text-xs">
                    <Mail className="h-3.5 w-3.5" /> Envoyer par e-mail
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
               <Button variant="ghost" size="icon" onClick={onClose} className="hover:bg-gray-100 rounded-full h-8 w-8" data-testid="button-close-panel" aria-label="Fermer le panneau de résultats">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

         <div
           ref={resultsFeedRef}
           className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain px-5 py-4"
           data-testid="results-scroll-area"
           onWheel={(event) => event.stopPropagation()}
         >
           <div className="mb-4 grid grid-cols-2 rounded-xl border border-[#d9e1d6] bg-[#edf2e9] p-1" role="tablist" aria-label="Vues des résultats">
             <button type="button" role="tab" aria-selected={resultView === "detail"} onClick={() => setResultView("detail")} className={`rounded-lg px-3 py-2 text-xs font-bold transition-colors ${resultView === "detail" ? "bg-white text-[#1e594a] shadow-sm" : "text-[#60756d] hover:text-[#1e594a]"}`} data-testid="tab-detailed-results">
               Résultats détaillés
             </button>
             <button type="button" role="tab" aria-selected={resultView === "issues"} onClick={() => setResultView("issues")} className={`rounded-lg px-3 py-2 text-xs font-bold transition-colors ${resultView === "issues" ? "bg-white text-[#1e594a] shadow-sm" : "text-[#60756d] hover:text-[#1e594a]"}`} data-testid="tab-aggregated-issues">
               Tableau des enjeux ({aggregatedIssues.length})
             </button>
           </div>
          {/* ══════════ VUE DIAGNOSTIC (page unique à divulgation progressive) ══════════ */}
           {resultView === "detail" ? (<>
           <div className="space-y-4" role="tabpanel" data-testid="panel-overview">
             {requestSummary && <div className="conversation-message" data-testid="message-user-request"><Search className="mt-1 h-5 w-5" aria-hidden="true" /><div><p><strong>Votre demande</strong></p><p>{requestSummary}</p></div></div>}
             {historyError && <p className="text-[10px] text-amber-700" role="alert">{historyError}</p>}
              {isAnalyzing && (
                <AnalysisProgress
                  active
                  embedded
                  includeINaturalist={!!includeINaturalist}
                  areaCount={areaCount}
                  zonagesLoading={zonagesLoading}
                  zonagesReady={zonages !== null}
                  zonageFeatureCount={zonages?.count ?? 0}
                  potentialSpeciesLoading={potentialSpeciesLoading}
                  potentialSpeciesReady={potentialSpecies !== null}
                  potentialSpeciesCount={potentialSpecies?.potentialCount ?? 0}
                  enabledAgentIds={enabledAgentIds}
                />
              )}
             {!isAnalyzing && (
               <section className="analysis-complete-summary" data-testid="analysis-complete-summary">
                 <div className="flex items-center gap-3">
                   <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#1e594a] text-[#dcc05b]"><Check className="h-5 w-5" /></span>
                   <div className="min-w-0 flex-1">
                     <p className="font-semibold text-[#234f43]">Analyse terminée</p>
                       <p className="text-[#60756d]">{harnessConfig?.agents.filter((agent) => agent.enabled).length ?? 0} agents mobilisés · occurrences terminées · {zonagesLoading ? "zonages en cours" : zonages ? `zonages terminés (${zonages.count} retourné${zonages.count > 1 ? "s" : ""})` : "zonages indisponibles"}</p>
                   </div>
                 </div>
                 <button type="button" className="mt-2 flex min-h-11 items-center gap-1.5 text-sm font-semibold" onClick={() => setShowAnalysisDetails((value) => !value)} aria-expanded={showAnalysisDetails} aria-controls="analysis-transcript">
                   Voir les détails {showAnalysisDetails ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                 </button>
                 {showAnalysisDetails && (
                   <div className="pt-2" id="analysis-transcript" data-testid="analysis-transcript">
                     <ol className="space-y-3">
                        <li><strong>ALi — coordination</strong><p>Demande comprise, périmètre vérifié et analyse répartie entre les agents spécialisés.</p></li>
                        {occurrencesAgentActive && <li><strong>Agent Occurrences</strong><p>{results.stats.speciesCount} espèces consolidées à partir de {results.stats.total} données retenues.</p></li>}
                         {zonagesAgentActive && <li><strong>Agent Zonages</strong><p>{zonagesLoading ? "Consultation des référentiels en cours." : zonages ? `Consultation terminée : ${zonages.count} zonage${zonages.count > 1 ? "s" : ""} retourné${zonages.count > 1 ? "s" : ""}.` : "Consultation indisponible : aucun résultat de zonage n’est présenté."}</p></li>}
                         {habitatAgentActive && <li data-testid="analysis-transcript-ali-habitat"><strong>Agent Habitat — CARHAB</strong><p>{aliHabitatStatus ?? "Aucun bilan CARHAB enregistré pour cette analyse."}</p></li>}
                         {taxonomyAgentActive && <li><strong>Agent Taxonomie et statuts — ALI Species</strong><p>{results.aliSpeciesEnrichment ? results.aliSpeciesEnrichment.attempted > 0 ? `${results.aliSpeciesEnrichment.enriched}/${results.aliSpeciesEnrichment.attempted} taxons enrichis via ALI Species${results.aliSpeciesEnrichment.nameResolutionAttempted ? `, après résolution de ${results.aliSpeciesEnrichment.nameResolved ?? 0}/${results.aliSpeciesEnrichment.nameResolutionAttempted} noms dans TAXREF` : ""}.` : "Aucun taxon n’a pu être relié à TAXREF pour lancer l’enrichissement ALI Species." : "Aucun bilan ALI Species enregistré pour cette analyse."}</p></li>}
                     </ol>
                   </div>
                 )}
               </section>
             )}
             <section ref={resultsSummaryRef} className="conversation-message" data-testid="message-ally-summary" aria-live="polite">
               <Bot className="mt-1 h-5 w-5" aria-hidden="true" />
               <div>
                  <p><strong>Synthèse de la Pré-étude documentaire biodiversité</strong></p>
                  <p><strong>Éléments documentés :</strong> {results.stats.speciesCount} taxon{results.stats.speciesCount > 1 ? "s" : ""} avec occurrence publique dans l’aire documentaire. <strong>Éléments potentiels :</strong> {potentialSpeciesLoading ? "évaluation en cours" : potentialSpeciesError || !reconciledPotentialSpecies ? "évaluation indisponible" : `${reconciledPotentialSpecies.potentialCount} espèce${reconciledPotentialSpecies.potentialCount > 1 ? "s" : ""} retournée${reconciledPotentialSpecies.potentialCount > 1 ? "s" : ""}`}. Une occurrence publique n’est pas une confirmation dans l’emprise : celle-ci exige des relevés de terrain.</p>
                 <div className="mt-3 flex flex-wrap gap-2" aria-label="Chiffres clés de la Pré-étude documentaire biodiversité">
                   <span className="rounded-full border border-[#d9e1d6] bg-[#edf2e9] px-2.5 py-1 text-[11px] font-semibold text-[#315b4e]">
                      {results.stats.speciesCount} taxon{results.stats.speciesCount > 1 ? "s" : ""} documenté{results.stats.speciesCount > 1 ? "s" : ""}
                   </span>
                   <span className="rounded-full border border-[#d9e1d6] bg-[#edf2e9] px-2.5 py-1 text-[11px] font-semibold text-[#315b4e]">
                     {results.stats.sensitiveCount} sensibilité{results.stats.sensitiveCount > 1 ? "s" : ""}
                   </span>
                   <span className="rounded-full border border-[#d9e1d6] bg-[#edf2e9] px-2.5 py-1 text-[11px] font-semibold text-[#315b4e]">
                      {zonagesLoading ? "Zonages en cours" : zonages ? `${zonages.count} zonage${zonages.count > 1 ? "s" : ""} retourné${zonages.count > 1 ? "s" : ""}` : "Zonages indisponibles"}
                   </span>
                   <span className="rounded-full border border-[#d9e1d6] bg-[#edf2e9] px-2.5 py-1 text-[11px] font-semibold text-[#315b4e]">
                     {recommendations.length} recommandations
                   </span>
                 </div>
               </div>
             </section>
            {/* Niveau d'enjeu global */}
            <div
              className={`rounded-xl border p-4 ${
                globalLevel.level === "fort"
                  ? "border-red-200 bg-red-50/70"
                  : globalLevel.level === "modere"
                  ? "border-orange-200 bg-orange-50/70"
                  : "border-green-200 bg-green-50/70"
              }`}
              data-testid="card-issue-level"
               data-level={globalLevel.level}
            >
              <div className="flex items-center justify-between gap-2">
                   <div className="font-bold text-gray-700">Indice synthétique secondaire</div>
                {zonagesLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" aria-label="Chargement des zonages" />}
              </div>
              <div
                className={`mt-1 text-2xl font-extrabold tracking-tight ${
                  globalLevel.level === "fort" ? "text-red-700" : globalLevel.level === "modere" ? "text-orange-700" : "text-green-700"
                }`}
                data-testid="text-issue-level"
              >
                 {globalLevel.label} <span className="text-sm font-semibold">(score automatisé)</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-700">
                <span className="flex items-center gap-1">
                  <Shield className="h-3.5 w-3.5 text-red-600" />
                  {reglementaireCount} protection{reglementaireCount > 1 ? "s" : ""} réglementaire{reglementaireCount > 1 ? "s" : ""}
                </span>
                <span className="flex items-center gap-1">
                  <AlertTriangle className="h-3.5 w-3.5 text-orange-600" />
                  {sortedSpecies.high.length + sortedSpecies.medium.length} taxon{sortedSpecies.high.length + sortedSpecies.medium.length > 1 ? "s" : ""} à examiner
                </span>
                <span className="flex items-center gap-1">
                  <Layers className="h-3.5 w-3.5 text-teal-600" />
                   {zonagesLoading ? "consultation en cours" : zonages ? `${zonages.count} zonage${zonages.count > 1 ? "s" : ""} retourné${zonages.count > 1 ? "s" : ""}` : "zonages indisponibles"}
                </span>
              </div>
              <p className="mt-2 text-[10px] text-gray-400 leading-snug">
                 Indice automatisé fondé sur les données publiques consultées. Il guide les vérifications, sans conclure à un impact ni remplacer l’expertise de terrain.
              </p>
            </div>

            {/* Recommandations prioritaires */}
            <div className="rounded-xl border border-gray-200 bg-white p-4" data-testid="card-key-findings">
              <div className="mb-3 font-bold text-[#234f43]">Recommandations prioritaires</div>
              <ol className="space-y-2">
                {recommendations.slice(0, 3).map((recommendation, index) => (
                  <li key={`${recommendation}::${index}`} className="flex items-start gap-3 text-gray-700">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#edf2e9] text-xs font-bold text-[#315b4e]">{index + 1}</span>
                    <span>{recommendation}</span>
                  </li>
                ))}
              </ol>
               <button type="button" className="mt-3 flex min-h-11 items-center gap-1.5 text-sm font-semibold" onClick={() => setShowAllRecommendations((value) => !value)} aria-expanded={showAllRecommendations} aria-controls="recommendations-complementaires">
                {showAllRecommendations ? "Masquer les recommandations complémentaires" : "Voir toutes les recommandations"}
                {showAllRecommendations ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
               {showAllRecommendations && <p id="recommendations-complementaires" className="border-t border-[#d9e1d6] pt-3">{recommendations[3]}</p>}
            </div>

            {/* Section 5 — Niveau d'enjeu, qualité et limites (repliable) */}
            <section className="rounded-xl border border-gray-200 bg-white overflow-hidden" data-testid="section-pourquoi">
              <button
                type="button"
                onClick={() => toggleSection("pourquoi")}
                aria-expanded={openSections.has("pourquoi")}
                aria-controls="section-body-pourquoi"
                className="w-full flex items-center justify-between gap-2 px-4 py-3 hover:bg-gray-50 transition-colors focus-visible:ring-2 focus-visible:ring-teal-400 focus-visible:outline-none"
                data-testid="button-section-pourquoi"
              >
                <span className="flex items-center gap-2 text-sm font-bold text-gray-800">
                   <Gauge className="h-4 w-4 text-indigo-600" /> Méthode, qualité et sources
                </span>
                <span className="flex items-center gap-2 text-[11px] text-gray-500 min-w-0">
                  <span className="truncate">{riskScore.factors.length} facteur{riskScore.factors.length > 1 ? "s" : ""} · sources publiques</span>
                  {openSections.has("pourquoi") ? <ChevronUp className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
                </span>
              </button>
              {openSections.has("pourquoi") && (
                <div id="section-body-pourquoi" className="px-4 pb-3 space-y-3 border-t border-gray-100 pt-3">
                  <ul className="space-y-1.5">
                     {riskScore.factors.slice(0, 3).map((f, i) => (
                       <li key={`${f}::${i}`} className="flex items-start gap-2 text-xs text-gray-700">
                        <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-indigo-500 shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>
                   {results.aliSpeciesEnrichment && (
                     <div className="rounded-xl border border-teal-200 bg-teal-50/60 p-3" data-testid="method-source-ali-species">
                       <div className="flex items-start gap-2">
                         <Database className="mt-0.5 h-4 w-4 shrink-0 text-teal-700" aria-hidden="true" />
                         <div>
                           <p className="text-xs font-bold text-teal-900">Enrichissement taxonomique — ALI Species MCP</p>
                           <p className="mt-1 text-xs leading-relaxed text-teal-900/80">
                             {results.aliSpeciesEnrichment.enriched} taxon{results.aliSpeciesEnrichment.enriched > 1 ? "s" : ""} enrichi{results.aliSpeciesEnrichment.enriched > 1 ? "s" : ""} sur {results.aliSpeciesEnrichment.attempted}
                             {results.aliSpeciesEnrichment.region ? ` pour ${results.aliSpeciesEnrichment.region}` : ""}.
                           </p>
                           <p className="mt-1 text-[11px] leading-relaxed text-teal-800/75">
                             {results.aliSpeciesEnrichment.territorialScope === "single"
                               ? "Les listes rouges UICN régionales du territoire étudié priment sur les statuts nationaux. "
                               : results.aliSpeciesEnrichment.territorialScope === "multiple"
                                 ? "Plusieurs régions sont concernées : aucune liste rouge régionale unique n’est attribuée aux taxons. "
                                 : "Le territoire régional n’a pas pu être résolu : seuls les statuts non régionaux sont retenus. "}
                             {results.aliSpeciesEnrichment.partial ? "La consultation est partielle : aucun statut absent n’est extrapolé." : "La consultation MCP est complète pour les taxons éligibles."}
                           </p>
                         </div>
                       </div>
                     </div>
                   )}
                   {habitatAgentActive && <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3" data-testid="method-source-carhab">
                    <div className="flex items-start gap-2">
                      <Leaf className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" aria-hidden="true" />
                      <div>
                        <p className="text-xs font-bold text-emerald-900">Agent Habitat — CARHAB</p>
                        <p className="mt-1 text-xs leading-relaxed text-emerald-900/80">
                          {aliHabitatStatus ?? "CARHAB est consulté automatiquement lors des nouvelles analyses."}
                        </p>
                        <p className="mt-1 text-[11px] leading-relaxed text-emerald-800/75">
                          Source documentaire sur les habitats autour de l’aire d’étude ; elle ne remplace ni une cartographie d’habitats ni une confirmation sur le terrain.
                        </p>
                       </div>
                     </div>
                   </div>}
                  <Button
                    ref={explainTriggerRef}
                    variant="outline"
                    size="sm"
                    onClick={() => setAssistantOpen(true)}
                    className="w-full h-9 text-xs gap-1.5 border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                    data-testid="button-open-assistant"
                    aria-haspopup="dialog"
                  >
                    <Sparkles className="h-3.5 w-3.5" /> Expliquer ce diagnostic
                  </Button>
                  <button
                    type="button"
                    onClick={() => setShowCalcDetail((v) => !v)}
                    aria-expanded={showCalcDetail}
                     aria-controls="calculation-detail"
                    className="text-[11px] text-teal-700 font-semibold hover:underline px-1"
                    data-testid="button-toggle-calc-detail"
                  >
                    {showCalcDetail ? "Masquer le calcul détaillé" : "Afficher le calcul détaillé"}
                  </button>
                  {showCalcDetail && (
                    <div id="calculation-detail" className="space-y-3">
                      <div className="rounded-xl border border-gray-200 bg-white p-4">
                        <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-5">
                          <div>
                            <div className="text-xl font-bold text-gray-900" data-testid="text-species-detected">{results.stats.speciesCount}</div>
                            <div className="text-[10px] text-gray-500 leading-tight">taxons</div>
                            {results.stats.rawNameCount != null && results.stats.rawNameCount !== results.stats.speciesCount && (
                              <div className="text-[9px] text-gray-400 leading-tight mt-0.5" data-testid="text-raw-names">/{results.stats.rawNameCount}</div>
                            )}
                          </div>
                          <div>
                            <div className="text-xl font-bold text-orange-600" data-testid="text-species-sensitive">{results.stats.sensitiveCount}</div>
                            <div className="text-[10px] text-gray-500 leading-tight">sensibles</div>
                          </div>
                          <div>
                            <div className="text-xl font-bold text-teal-600" data-testid="text-zonages-total">{zonages?.count ?? "—"}</div>
                            <div className="text-[10px] text-gray-500 leading-tight">zonages</div>
                          </div>
                          <div>
                            <div className="text-xl font-bold text-indigo-600">{includeINaturalist ? 2 : 1}</div>
                            <div className="text-[10px] text-gray-500 leading-tight">source{(includeINaturalist ? 2 : 1) > 1 ? "s" : ""} d’observations</div>
                            <div className="text-[9px] text-gray-400 mt-0.5" title="Sources des observations">{includeINaturalist ? "GBIF+iNat" : "GBIF"}</div>
                          </div>
                          <div>
                            <Leaf className="mx-auto h-5 w-5 text-emerald-700" aria-hidden="true" />
                            <div className="text-[10px] text-gray-500 leading-tight">source habitats</div>
                            <div className="mt-0.5 text-[9px] text-gray-400">CARHAB</div>
                          </div>
                        </div>
                      </div>
                      <RiskScoreCard score={riskScore.score} label={riskScore.label} tone={riskScore.tone} factors={riskScore.factors} />
                      <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <Sparkles className="h-4 w-4 text-blue-600" />
                          <span className="font-bold text-sm text-blue-700">Synthèse automatique</span>
                        </div>
                        <p className="text-xs text-gray-700 leading-relaxed" data-testid="text-auto-summary">{autoSummary}</p>
                      </div>
                    </div>
                  )}
                  <div className="border-t border-gray-100 pt-3 space-y-3">
                    <div className="flex items-center gap-2">
                      <Info className="h-4 w-4 text-sky-600" />
                      <span className="text-xs font-bold text-gray-700">Qualité et limites des données</span>
                    </div>
                    <ConfidencePanel confidence={results.confidence} />
                    <div className="text-[11px] text-gray-600 space-y-1.5">
                      <p><span className="font-semibold">Sources :</span> {sourcesLabel}</p>
                      <p className="flex items-start gap-1.5">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-600" />
                        Absence de donnée ≠ absence d'espèce : les données publiques ne couvrent pas tout le territoire.
                      </p>
                      <p className="flex items-start gap-1.5">
                        <ClipboardList className="h-3.5 w-3.5 shrink-0 mt-0.5 text-teal-600" />
                        Pré-diagnostic indicatif — à valider par un écologue lors d'un inventaire terrain.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </section>
          </div>

          {/* Message Agent Occurrences — pièce jointe dépliable */}
          <section className="w-full self-stretch overflow-hidden rounded-xl border border-teal-200 bg-teal-50/30" data-testid="message-agent-occurrences">
            <button type="button" onClick={() => toggleSection("especes")} aria-expanded={openSections.has("especes")} aria-controls="attachment-especes" className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-teal-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400">
              <span className="flex items-center gap-2"><Database className="h-5 w-5 shrink-0" aria-hidden="true" /><span><span className="block text-xs font-bold text-teal-900">Agent Occurrences</span><span className="block text-[11px] text-teal-700">{filteredTotal} espèces consolidées · données géolocalisées</span></span></span>
              {openSections.has("especes") ? <ChevronUp className="h-4 w-4 text-teal-700" /> : <ChevronDown className="h-4 w-4 text-teal-700" />}
            </button>
            {openSections.has("especes") && <div id="attachment-especes" className="space-y-4 border-t border-teal-200 bg-white p-4 sm:p-5" data-testid="panel-especes">
            <p className="rounded-lg border border-teal-100 bg-teal-50/60 px-3 py-2 text-[11px] leading-relaxed text-teal-900">
              <strong>Sources :</strong> {includeINaturalist ? "GBIF et iNaturalist" : "GBIF"}. Une occurrence publique confirme un signal dans l’aire étudiée, mais ne remplace ni une prospection exhaustive ni une validation terrain.
            </p>
            <div className="rounded-lg border border-gray-200 bg-gray-50/60 px-3 py-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600" data-testid="species-summary">
              <span><strong className="text-gray-900">{filteredTotal}</strong> espèce{filteredTotal > 1 ? "s" : ""} documentée{filteredTotal > 1 ? "s" : ""} dans les sources</span>
              <span><strong className="text-orange-700">{prioritySpeciesList.length}</strong> avec signal d’enjeu</span>
              <span><strong className="text-sky-700">{aVerifierCount}</strong> à vérifier</span>
            </div>
            <div className="flex flex-wrap gap-1.5" data-testid="species-attr-filters">
              {([
                { key: "prioritaires", label: `Avec signal d’enjeu (${prioritySpeciesList.length})` },
                { key: "toutes", label: `Toutes documentées (${filteredTotal})` },
              ] as { key: "prioritaires" | "toutes"; label: string }[]).map((chip) => {
                const active = speciesScope === chip.key;
                return (
                  <button
                    key={chip.key}
                    type="button"
                    onClick={() => setSpeciesScope(chip.key)}
                    aria-pressed={active}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                      active ? "bg-teal-100 text-teal-800 ring-1 ring-teal-300" : "bg-white text-gray-500 ring-1 ring-gray-200 hover:bg-gray-50"
                    }`}
                    data-testid={`chip-${chip.key}`}
                  >
                    {chip.label}
                  </button>
                );
              })}
            </div>
            <p className="text-xs leading-relaxed text-gray-600">
              Les espèces potentielles sont présentées séparément : elles reposent sur une compatibilité écologique documentaire et ne sont jamais comptées comme occurrences publiques documentées. Une confirmation de présence exige des relevés de terrain.
            </p>

            <div className="relative">
              <label htmlFor="species-search" className="sr-only">Rechercher une espèce dans les résultats</label>
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                id="species-search"
                type="text"
                value={speciesQuery}
                onChange={(e) => setSpeciesQuery(e.target.value)}
                placeholder="Rechercher une espèce"
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-300"
                data-testid="input-species-search"
              />
            </div>

            <div className="rounded-xl border border-gray-200 bg-gray-50/50 overflow-hidden">
              <button
                type="button"
                onClick={() => setShowFilters(!showFilters)}
                aria-expanded={showFilters}
                aria-controls="taxon-filter-options"
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-100/50 transition-colors"
                data-testid="button-toggle-taxon-filters"
              >
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-gray-600" />
                  <span className="font-bold text-sm text-gray-700">Groupes taxonomiques</span>
                </div>
                <div className="flex items-center gap-2">
                  {!isAllActive && (
                    <span className="text-[10px] bg-teal-100 text-teal-700 px-1.5 py-0.5 rounded font-semibold">
                      {activeFilterCount}/{allGroupCount}
                    </span>
                  )}
                  {showFilters ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                </div>
              </button>

              {showFilters && (
                <div id="taxon-filter-options" className="px-4 pb-3 space-y-2">
                  <p className="text-[10px] text-gray-500">Ces filtres s’appliquent au tableau, à la carte et aux exports.</p>
                  <button
                    type="button"
                    onClick={() => onToggleAllTaxonFilters(presentGroups.map(g => g.id))}
                    className="text-[10px] font-semibold text-teal-600 hover:text-teal-800 transition-colors uppercase tracking-wider"
                    data-testid="button-toggle-all-taxons"
                  >
                    {isAllActive ? "Tout désélectionner" : "Tout sélectionner"}
                  </button>
                  <div className="grid grid-cols-2 gap-2" data-testid="group-cards">
                    {TAXON_GROUPS.map(group => {
                      const count = taxonCounts.get(group.id) || 0;
                      const stats = groupStats.get(group.id);
                      const isActive = activeTaxonFilters.has(group.id);
                      return (
                        <button
                          key={group.id}
                          type="button"
                          onClick={() => count > 0 && onToggleTaxonFilter(group.id)}
                          disabled={count === 0}
                          className={`text-left p-2.5 rounded-lg border transition-all ${
                            count === 0
                              ? "bg-white/40 border-gray-200 opacity-60"
                              : isActive ? "bg-white border-teal-300 ring-1 ring-teal-200" : "bg-white/60 border-gray-200 opacity-60 hover:opacity-100"
                          }`}
                          data-testid={`taxon-filter-${group.id}`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-gray-800 flex items-center gap-1">
                              <span>{group.icon}</span>
                              <span>{group.label}</span>
                            </span>
                            <span className="text-sm font-bold text-teal-700">{count}</span>
                          </div>
                          {stats && (
                            <div className="mt-1 text-[10px] text-gray-500 leading-tight">
                              {stats.sensitive} sensible{stats.sensitive > 1 ? "s" : ""} · {stats.protected} protégée{stats.protected > 1 ? "s" : ""}
                            </div>
                          )}
                          {!stats && <div className="mt-1 text-[10px] text-gray-500">Aucune donnée publique retenue</div>}
                          <div className="mt-0.5 text-[10px] text-gray-400 leading-tight">Période : {GROUP_SEASON[group.id] || "à préciser"}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-1.5" data-testid="species-list-compact">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-600 px-1">
                <span>{especesList.length} espèce{especesList.length > 1 ? "s" : ""}</span>
                <label className="flex items-center gap-2">
                  <span>Trier par</span>
                  <select
                    value={speciesSortMode}
                    onChange={(event) => setSpeciesSortMode(event.target.value as typeof speciesSortMode)}
                    className="h-9 rounded-md border border-gray-300 bg-white px-2 text-xs text-gray-800"
                    data-testid="select-species-sort"
                  >
                    <option value="recommended">Usage métier</option>
                    <option value="french">Nom français</option>
                    <option value="latin">Nom scientifique</option>
                  </select>
                </label>
              </div>
              {especesList.length === 0 ? (
                <div className="flex flex-col items-center gap-2 px-1 py-5 text-center">
                  <p className="text-sm text-gray-500">Aucune espèce ne correspond à la recherche et aux filtres actifs.</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSpeciesQuery("");
                      if (!isAllActive) onToggleAllTaxonFilters(presentGroups.map(g => g.id));
                    }}
                    className="h-8 text-xs"
                  >
                    Réinitialiser les filtres
                  </Button>
                </div>
              ) : (
                <SpeciesInventoryTable
                  species={especesList}
                  selectedSpecies={selectedSpecies}
                  onSelectSpecies={onSelectSpecies}
                  centerCoords={results.center}
                  sortMode={speciesSortMode}
                />
              )}
            </div>
                </div>}
          </section>

          {/* Message Agent Habitat — pièce jointe dépliable */}
          {habitatAgentActive && <section className="w-full self-stretch overflow-hidden rounded-xl border border-emerald-200 bg-emerald-50/30" data-testid="message-agent-habitat">
            <button
              type="button"
              onClick={() => toggleSection("habitats")}
              aria-expanded={openSections.has("habitats")}
              aria-controls="attachment-habitats"
              className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
            >
              <span className="flex items-center gap-2">
                <Leaf className="h-5 w-5 shrink-0 text-emerald-800" aria-hidden="true" />
                <span>
                  <span className="block text-xs font-bold text-emerald-900">Agent Habitat</span>
                  <span className="block text-[11px] text-emerald-700">
                    {aliHabitatStatus ?? "Habitats documentaires · CARHAB"}
                  </span>
                </span>
              </span>
              {openSections.has("habitats") ? <ChevronUp className="h-4 w-4 text-emerald-700" /> : <ChevronDown className="h-4 w-4 text-emerald-700" />}
            </button>
            {openSections.has("habitats") && (
              <div id="attachment-habitats" className="space-y-3 border-t border-emerald-200 bg-white p-4 sm:p-5" data-testid="panel-habitats">
                <p className="rounded-lg border border-emerald-100 bg-emerald-50/60 px-3 py-2 text-xs leading-relaxed text-emerald-950">
                  <strong>Source : CARHAB.</strong> L’Agent Habitat documente les habitats disponibles autour de l’aire d’étude et les transmet à la synthèse.
                </p>
                {carhabSummary ? (
                  <div className="space-y-2" data-testid="carhab-habitat-list">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-emerald-950">
                      <strong>{carhabSummary.habitats.length} habitat{carhabSummary.habitats.length > 1 ? "s" : ""} documenté{carhabSummary.habitats.length > 1 ? "s" : ""}</strong>
                      {carhabSummary.totalAreaHa !== null && <span>Surface analysée : {carhabSummary.totalAreaHa.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} ha</span>}
                    </div>
                    <ol className="space-y-2">
                      {carhabSummary.habitats.map((habitat, index) => (
                        <li key={`${habitat.code || habitat.label}::${index}`} className="rounded-lg border border-emerald-100 bg-[#fbfdf8] p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <span className="text-[11px] font-bold text-emerald-700">CARHAB {habitat.code}</span>
                              <p className="mt-0.5 text-sm font-semibold leading-snug text-[#24483e]">{habitat.label}</p>
                            </div>
                            <div className="shrink-0 text-right">
                              {habitat.areaHa !== null && <strong className="block text-sm text-emerald-900">{habitat.areaHa.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} ha</strong>}
                              {habitat.percentage !== null && <span className="text-xs text-emerald-700">{habitat.percentage.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %</span>}
                            </div>
                          </div>
                        </li>
                      ))}
                    </ol>
                    <p className="text-[11px] leading-relaxed text-gray-600">
                      Surfaces et proportions fournies par CARHAB pour l’aire demandée ; ALi ne les présente pas comme une cartographie de terrain.
                    </p>
                  </div>
                ) : aliHabitatSucceeded ? (
                  <p className="text-xs text-amber-800">CARHAB a répondu, mais aucun habitat structuré n’a pu être extrait de cette réponse.</p>
                ) : null}
                <p className="flex items-start gap-2 text-[11px] leading-relaxed text-gray-600">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" aria-hidden="true" />
                  Ces informations sont documentaires : elles ne constituent ni une cartographie des habitats dans l’emprise des travaux, ni une confirmation de terrain.
                </p>
              </div>
            )}
          </section>}

          {/* Message Agent Zonages — pièce jointe dépliable */}
          {zonagesAgentActive && <section className="w-full self-stretch overflow-hidden rounded-xl border border-sky-200 bg-sky-50/30" data-testid="message-agent-zonages">
            <button type="button" onClick={() => toggleSection("zonages")} aria-expanded={openSections.has("zonages")} aria-controls="attachment-zonages" className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-sky-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400">
              <span className="flex items-center gap-2"><Layers className="h-5 w-5 shrink-0" aria-hidden="true" /><span><span className="block text-xs font-bold text-sky-900">Agent Zonages</span><span className="block text-[11px] text-sky-700">{zonagesLoading ? "Recherche en cours…" : zonages ? `Consultation terminée · ${flatZonages.length} retourné${flatZonages.length > 1 ? "s" : ""} · IGN / PatriNat` : "Consultation indisponible · IGN / PatriNat"}</span></span></span>
              {openSections.has("zonages") ? <ChevronUp className="h-4 w-4 text-sky-700" /> : <ChevronDown className="h-4 w-4 text-sky-700" />}
            </button>
            {openSections.has("zonages") && <div id="attachment-zonages" className="space-y-4 border-t border-sky-200 bg-white p-4 sm:p-5" data-testid="panel-zonages-tab">
            {zonages && zonages.count > 0 && (
              <div className="rounded-lg border border-gray-200 bg-gray-50/60 px-3 py-2 text-xs text-gray-600 leading-relaxed" data-testid="text-zonages-summary">
                {zonages.count} zonage{zonages.count > 1 ? "s" : ""} dans l'aire d'étude (rayon {zonages.radius} m) — les plus importants d'abord.
              </div>
            )}

            {zonagesLoading && (
               <div className="flex items-center gap-2 text-xs text-gray-600 py-4 justify-center" role="status" aria-live="polite">
                <Loader2 className="h-4 w-4 animate-spin" /> Chargement des zonages…
              </div>
            )}

            {/* Liste compacte hiérarchisée */}
            <div className="space-y-1.5" data-testid="zoning-list">
              {flatZonages.map((z, idx) => {
                const key = zonageKey(z);
                const expanded = expandedZonages.has(key);
                const badge = ZONAGE_CATEGORY_BADGE[z.groupCategory] || ZONAGE_CATEGORY_BADGE.autre;
                const isNatura = z.groupCategory === "natura2000";
                const hasGeometry = !!(
                  z.geometry &&
                  ((z.geometry.polygons?.length ?? 0) > 0 || z.geometry.rings.length > 0)
                );
                const isSelectedOnMap = selectedZonageId === key;
                return (
                  <div
                    key={key}
                    data-zonage-key={key}
                    className={`rounded-lg border bg-white overflow-hidden ${
                      isSelectedOnMap ? "border-teal-400 ring-1 ring-teal-300" : "border-gray-200"
                    }`}
                  >
                    <div className="flex items-stretch">
                      <button
                        type="button"
                        onClick={() => toggleZonageDetails(key)}
                        aria-expanded={expanded}
                        aria-controls={`zonage-details-${idx}`}
                        className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2.5 text-left hover:bg-gray-50 transition-colors focus-visible:ring-2 focus-visible:ring-teal-400 focus-visible:outline-none"
                        data-testid={`zoning-row-${idx}`}
                      >
                      <span className={`shrink-0 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border ${badge.cls}`}>
                        {badge.label}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs font-semibold text-gray-800 truncate">{z.name}</span>
                        <span className="block text-[10px] text-gray-500 truncate">{z.type} · ouvrir pour consulter les détails</span>
                      </span>
                      {expanded ? <ChevronUp className="h-3.5 w-3.5 text-gray-400 shrink-0" /> : <ChevronDown className="h-3.5 w-3.5 text-gray-400 shrink-0" />}
                      </button>
                      {hasGeometry && onSelectZonage && (
                        <button
                          type="button"
                          onClick={() => onSelectZonage(isSelectedOnMap ? null : key)}
                          aria-pressed={isSelectedOnMap}
                          className={`flex shrink-0 items-center gap-1 border-l px-3 text-[11px] font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-teal-400 focus-visible:outline-none ${
                            isSelectedOnMap ? "bg-teal-50 text-teal-700" : "text-gray-600 hover:bg-gray-50"
                          }`}
                          aria-label={`${isSelectedOnMap ? "Masquer" : "Afficher"} ${z.name} sur la carte`}
                        >
                          <MapPin className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">{isSelectedOnMap ? "Affiché" : "Voir sur la carte"}</span>
                        </button>
                      )}
                    </div>
                    {expanded && (
                      <div id={`zonage-details-${idx}`} className="px-3 pb-3 pt-1 border-t border-gray-100 space-y-1.5 text-[11px] text-gray-600">
                        <div><span className="font-semibold">Type :</span> {z.type}</div>
                        <div><span className="font-semibold">Catégorie :</span> {z.categoryLabel}</div>
                        {!hasGeometry && (
                          <div className="text-[10px] text-gray-400 italic">
                            Emprise non disponible sur la carte (géométrie non fournie par le service).
                          </div>
                        )}
                        {z.id && <div><span className="font-semibold">Identifiant :</span> <span className="font-mono">{z.id}</span></div>}
                        {z.code && <div><span className="font-semibold">Code :</span> <span className="font-mono">{z.code}</span></div>}
                        {isNatura && z.code && (
                          <NaturaSpeciesList code={z.code} index={idx} />
                        )}
                        {z.url && (
                          <a href={z.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-teal-700 font-semibold hover:underline">
                            <ExternalLink className="h-3 w-3" /> Fiche officielle (INPN)
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <Natura2000ExpectedPanel
              center={results.center}
              radius={results.radius}
              observedNames={observedNames}
            />
            <SINPPanel center={results.center} />
            {!zonagesLoading && zonages?.count === 0 && (
              <p className="text-sm text-gray-600 italic">Consultation terminée : aucun zonage environnemental retourné dans l'aire d'étude. Vous pouvez élargir le rayon d'analyse.</p>
            )}
            {!zonagesLoading && !zonages && <p className="text-sm text-red-700" role="alert">La source de zonages est indisponible ; aucun résultat n’est présenté.</p>}
                </div>}
          </section>}

          <section className="conversation-message" data-testid="message-ally-report-action">
            <Bot className="mt-1 h-5 w-5" aria-hidden="true" />
            <div>
              <p><strong>ALi — suite de la Pré-étude documentaire biodiversité</strong></p>
               <p>Les résultats sont prêts. Je peux maintenant les organiser dans une Pré-étude documentaire biodiversité structurée et copiable.</p>
              <Button
                onClick={() => {
                  setShowReportPreview(true);
                }}
                className="mt-3 w-full justify-center gap-2 h-11 bg-[#1e594a] hover:bg-[#17483d] text-[#fffdf5] text-sm font-semibold shadow-md hover:shadow-lg ring-1 ring-[#c4a642]/40 transition-all"
                data-testid="button-report-text"
              >
                <FileText className="h-4 w-4 text-[#dcc05b]" />
                 Préparer la Pré-étude documentaire biodiversité
                {aiAnalysis && (
                  <span className="ml-0.5 inline-flex items-center gap-0.5 rounded border border-[#dcc05b]/50 bg-[#dcc05b]/15 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[#f2dc84]">
                    <Sparkles className="h-2.5 w-2.5" /> IA
                  </span>
                )}
              </Button>
            </div>
          </section>

          <p className="mt-4 px-1 text-[11px] text-gray-400 leading-snug flex gap-1.5 items-start">
            <Info className="h-3 w-3 shrink-0 mt-0.5" />
            Lecture documentaire basée sur les seules sources indiquées — la confirmation d’une présence exige des relevés de terrain.
          </p>
        </> ) : (
          <section role="tabpanel" className="space-y-4" data-testid="panel-aggregated-issues">
            <div className="rounded-xl border border-[#d9e1d6] bg-[#f7f8f3] p-4">
              <div className="flex items-start gap-3">
                <ListChecks className="mt-0.5 h-5 w-5 shrink-0 text-[#1e594a]" />
                <div>
                  <h2 className="font-bold text-[#234f43]">Tableau transversal des enjeux</h2>
                  <p className="mt-1 text-xs leading-relaxed text-[#60756d]">
                    Les signaux produits par les agents sont regroupés par objet. Une même espèce n’apparaît qu’une fois, avec tous les agents contributeurs et la nature de chaque preuve.
                  </p>
                </div>
              </div>
            </div>
            {aggregatedIssues.length === 0 ? (
              <p className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">Aucun enjeu consolidé n’est encore disponible.</p>
            ) : (
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] border-collapse text-left text-xs">
                    <caption className="sr-only">Enjeux agrégés issus des différents agents d’ALi</caption>
                    <thead className="bg-[#eef3eb] text-[#315b4e]">
                      <tr>
                        <th className="px-3 py-3 font-bold">Niveau</th>
                        <th className="px-3 py-3 font-bold">Objet</th>
                        <th className="px-3 py-3 font-bold">Agents</th>
                        <th className="px-3 py-3 font-bold">Preuve documentaire</th>
                        <th className="px-3 py-3 font-bold">Interprétation</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {aggregatedIssues.map((issue) => (
                        <tr key={issue.id} className="align-top">
                          <td className="px-3 py-3">
                            <span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-bold ${
                              issue.level === "Critique" ? "border-red-300 bg-red-50 text-red-800"
                                : issue.level === "Fort" ? "border-orange-300 bg-orange-50 text-orange-800"
                                  : issue.level === "Modéré" ? "border-amber-200 bg-amber-50 text-amber-800"
                                    : "border-slate-200 bg-slate-50 text-slate-600"
                            }`}>{issue.level}</span>
                          </td>
                          <td className="px-3 py-3">
                            <div className="font-semibold text-slate-800">{issue.subject}</div>
                            <div className="mt-0.5 text-[10px] uppercase tracking-wide text-slate-400">{issue.category}</div>
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex max-w-[190px] flex-wrap gap-1">
                              {issue.agents.map((agent) => <span key={agent} className="rounded border border-teal-100 bg-teal-50 px-1.5 py-0.5 text-[10px] font-semibold text-teal-800">{agent}</span>)}
                            </div>
                          </td>
                          <td className="max-w-[260px] px-3 py-3 leading-relaxed text-slate-600">{issue.evidence}</td>
                          <td className="max-w-[300px] px-3 py-3 leading-relaxed text-slate-700">{issue.interpretation}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="border-t border-slate-100 bg-slate-50 px-3 py-2 text-[10px] leading-relaxed text-slate-500">
                  Ce tableau consolide des informations documentaires. Les présences potentielles et habitats cartographiés ne constituent pas des confirmations de terrain.
                </p>
              </div>
            )}
          </section>
        )}
        </div>
         {historyDrawer}

        {/* Assistant IA contextuel */}
        <AnimatePresence>
          {assistantOpen && (
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={prefersReducedMotion ? { duration: 0 } : { type: "spring", damping: 28, stiffness: 260 }}
              ref={assistantDrawerRef}
              className="absolute inset-0 z-20 bg-white flex flex-col"
              role="dialog"
              aria-modal="true"
              aria-label="Assistant IA"
              data-testid="assistant-drawer"
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-indigo-600" />
                  <span className="text-sm font-bold text-gray-800">Assistant IA</span>
                  <span className="text-[10px] text-gray-400">— analyse indicative à valider par un écologue</span>
                </div>
                <Button ref={assistantCloseRef} variant="ghost" size="icon" onClick={() => setAssistantOpen(false)} className="h-8 w-8 rounded-full" data-testid="button-close-assistant" aria-label="Fermer l'assistant">
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <ScrollArea className="flex-1 px-4 py-3">
                <div className="space-y-3">
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wide text-gray-500 mb-1.5">
                      Questions utiles pour cette vue
                    </div>
                    <ul className="space-y-1">
                      {assistantSuggestions.map((q, index) => (
                        <li key={`${q}::${index}`} className="text-xs text-gray-600 flex items-start gap-1.5">
                          <ChevronRight className="h-3 w-3 shrink-0 mt-0.5 text-indigo-400" /> {q}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-1.5 text-[10px] text-gray-400 leading-snug">
                       L'analyse ci-dessous répond à ces questions à partir des données documentaires disponibles. Pour une note rédigée, utilisez « Générer la Pré-étude documentaire biodiversité » puis « Reformuler ».
                    </p>
                  </div>
                  <PrioritySpeciesInline
                    toponym={toponym || `Point ${results.center[0].toFixed(4)}, ${results.center[1].toFixed(4)}`}
                    coords={results.center}
                    occurrences={allFilteredSpecies}
                    projectArea={projectArea}
                    onAnalysisChange={setAiAnalysis}
                    initialAnalysis={aiAnalysis}
                    autoStart={assistantOpen && habitatConsultationState !== "loading"}
                  />
                </div>
              </ScrollArea>
            </motion.div>
          )}
        </AnimatePresence>

      </aside>

      <Dialog open={showReportPreview} onOpenChange={setShowReportPreview}>
        <DialogContent className="max-w-4xl w-[90vw] max-h-[85vh] flex flex-col z-[3000]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              {reformattedReport ? "Pré-étude biodiversité rédigée" : "Préparer la pré-étude biodiversité"}
            </DialogTitle>
            <DialogDescription>
              {reformattedReport
                ? "Document complet rédigé par l’IA à partir des résultats et des consignes enregistrées dans le Harnais."
                : "Les résultats sources sont prêts. Confirmez la génération IA pour obtenir une étude structurée et rédigée."}
            </DialogDescription>
          </DialogHeader>
          {reformattedReport && (
            <div className="mt-3 flex items-center gap-2 text-xs text-teal-700 bg-teal-50 border border-teal-200 px-3 py-1.5 rounded-md">
              <Sparkles className="h-3.5 w-3.5" />
              <span className="font-medium">Pré-étude documentaire biodiversité structurée par le harnais d’ALi</span>
              <button
                type="button"
                onClick={() => {
                  setReformattedReport(null);
                  setReportPromptTrace(null);
                }}
                className="ml-auto text-[11px] text-teal-700 hover:underline"
                data-testid="button-revert-report"
              >
                Revenir au brut
              </button>
            </div>
          )}
          {reformattedReport && reportPromptTrace && (
            <p className="mt-1 text-[11px] text-[#557067]" data-testid="report-prompt-trace">
              Généré avec le prompt système enregistré ({reportPromptTrace.systemCharacters.toLocaleString("fr-FR")} caractères,
              empreinte {reportPromptTrace.systemFingerprint}) et le contexte de cette étude
              ({reportPromptTrace.userCharacters.toLocaleString("fr-FR")} caractères).
            </p>
          )}
          {reformatError && (
            <div className="mt-3 flex items-center gap-2 text-xs text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded-md" role="alert">
              <span className="flex-1">{reformatError}</span>
              <button type="button" onClick={() => void handleReformatReport()} className="rounded border border-red-300 px-2 py-1 font-semibold">Réessayer</button>
            </div>
          )}
          {reformatting && <p className="mt-3 text-xs text-teal-700" role="status" aria-live="polite">Génération de la Pré-étude documentaire biodiversité en cours…</p>}
          <div className="mt-3 rounded-lg border border-[#d9e1d6] bg-[#f4f6f1] px-4 py-3 text-xs text-[#52675f]">
            {reformattedReport
              ? "L’aperçu est abrégé pour faciliter la lecture. Le téléchargement contient l’intégralité de la pré-étude rédigée, ses résultats détaillés, ses sources et ses limites."
              : "Aperçu des résultats sources : ce contenu n’est pas encore la pré-étude rédigée. Aucun document présenté comme étude complète ne peut être téléchargé avant la génération IA."}
          </div>
          <ScrollArea className="flex-1 mt-3 h-[42vh] overflow-auto">
            {reformattedReport ? (
              <pre className="whitespace-pre-wrap rounded-lg border border-teal-100 bg-teal-50/30 p-4 font-sans text-sm leading-relaxed text-gray-700">
                {reportPreviewText}
              </pre>
            ) : aggregatedIssues.length > 0 ? (
              <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white" data-testid="study-source-issues-table">
                <table className="w-full min-w-[700px] border-collapse text-left text-xs">
                  <caption className="sr-only">Tableau des enjeux utilisé comme base de la pré-étude</caption>
                  <thead className="bg-[#eef3eb] text-[#315b4e]">
                    <tr>
                      <th className="px-3 py-2.5 font-bold">Niveau</th>
                      <th className="px-3 py-2.5 font-bold">Objet</th>
                      <th className="px-3 py-2.5 font-bold">Agents</th>
                      <th className="px-3 py-2.5 font-bold">Preuve et interprétation</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {aggregatedIssues.map((issue) => (
                      <tr key={`study-source::${issue.id}`} className="align-top">
                        <td className="px-3 py-3">
                          <span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-bold ${
                            issue.level === "Critique" ? "border-red-300 bg-red-50 text-red-800"
                              : issue.level === "Fort" ? "border-orange-300 bg-orange-50 text-orange-800"
                                : issue.level === "Modéré" ? "border-amber-200 bg-amber-50 text-amber-800"
                                  : "border-slate-200 bg-slate-50 text-slate-600"
                          }`}>{issue.level}</span>
                        </td>
                        <td className="px-3 py-3">
                          <div className="font-semibold text-slate-800">{issue.subject}</div>
                          <div className="mt-0.5 text-[10px] uppercase tracking-wide text-slate-400">{issue.category}</div>
                        </td>
                        <td className="px-3 py-3 text-slate-600">{issue.agents.join(" · ")}</td>
                        <td className="max-w-[360px] px-3 py-3 leading-relaxed text-slate-600">
                          <div>{issue.evidence}</div>
                          <div className="mt-1 text-slate-700">{issue.interpretation}</div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                Aucun enjeu consolidé n’est disponible pour préparer la pré-étude.
              </p>
            )}
          </ScrollArea>
          <div className="flex flex-wrap justify-between items-center gap-2 mt-4 pt-4 border-t">
            <Button variant="ghost" onClick={() => setShowReportPreview(false)} className="text-gray-500">
              Fermer
            </Button>
            <div className="flex flex-wrap gap-2">
              {!reformattedReport && (
                <div className="flex flex-col items-end gap-1">
                  <p className="max-w-md text-right text-[11px] leading-relaxed text-amber-700">
                    Cette génération appelle le modèle d’IA et consomme des jetons. Elle ne démarre qu’après votre confirmation.
                  </p>
                  <Button
                    variant="outline"
                    onClick={handleReformatReport}
                    disabled={reformatting}
                    className="gap-2 border-teal-300 text-teal-700 hover:bg-teal-50 hover:text-teal-800"
                    data-testid="button-reformat-report"
                  >
                    {reformatting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    {reformatting ? "Génération de la Pré-étude documentaire biodiversité…" : "Confirmer et générer avec l’IA"}
                  </Button>
                </div>
              )}
              {reformattedReport && (
                <>
                  <Button
                    onClick={handleDownloadWordReport}
                    className="gap-2 bg-[#1e594a] text-white shadow-md hover:bg-[#17483d]"
                    data-testid="button-download-word-report"
                  >
                    <Download className="h-4 w-4" />
                    Télécharger la pré-étude rédigée (.doc)
                  </Button>
                  <Button variant="outline" onClick={handleEmailReport} className="gap-2" data-testid="button-email-report">
                    <Mail className="h-4 w-4" />
                    Email
                  </Button>
                  <Button variant="outline" onClick={handleCopyReport} className="gap-2" data-testid="button-copy-report">
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    {copied ? "Copié !" : "Copier"}
                  </Button>
                  <Button
                    onClick={handleShareReport}
                    variant="outline"
                    className="gap-2"
                    data-testid="button-share-report"
                  >
                    <Share2 className="h-4 w-4" />
                    Partager
                  </Button>
                </>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AnimatePresence>
  );
}

const RISK_TONE: Record<string, { ring: string; text: string; bg: string; border: string; Icon: typeof ShieldAlert; badge: string }> = {
  critical: { ring: "#dc2626", text: "text-red-700", bg: "bg-red-50", border: "border-red-200", Icon: ShieldAlert, badge: "bg-red-100 text-red-700" },
  high: { ring: "#ea580c", text: "text-orange-700", bg: "bg-orange-50", border: "border-orange-200", Icon: AlertTriangle, badge: "bg-orange-100 text-orange-700" },
  moderate: { ring: "#d97706", text: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200", Icon: AlertCircle, badge: "bg-amber-100 text-amber-700" },
  low: { ring: "#16a34a", text: "text-green-700", bg: "bg-green-50", border: "border-green-200", Icon: Shield, badge: "bg-green-100 text-green-700" },
};

function RiskScoreCard({ score, label, tone, factors }: { score: number; label: string; tone: string; factors: string[] }) {
  const s = RISK_TONE[tone] || RISK_TONE.low;
  const Icon = s.Icon;
  const r = 30;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - score / 100);
  return (
    <div className={`rounded-xl border p-4 ${s.bg} ${s.border}`} data-testid="panel-risk-score">
      <div className="flex items-center gap-2 mb-3">
        <Gauge className={`h-5 w-5 ${s.text}`} />
        <span className={`font-bold text-sm ${s.text}`}>Potentiel d'enjeux écologiques</span>
      </div>
      <div className="flex items-center gap-4">
        <div className="relative shrink-0" style={{ width: 76, height: 76 }}>
          <svg width="76" height="76" viewBox="0 0 76 76" className="-rotate-90">
            <circle cx="38" cy="38" r={r} fill="none" stroke="#e5e7eb" strokeWidth="7" />
            <circle cx="38" cy="38" r={r} fill="none" stroke={s.ring} strokeWidth="7" strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset} />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <Icon className={`h-6 w-6 ${s.text}`} />
          </div>
        </div>
        <div className="min-w-0">
          <span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full ${s.badge}`} data-testid="text-risk-label">
            <Icon className="h-3.5 w-3.5" /> {label}
          </span>
          <p className="text-[10px] text-gray-500 mt-1.5 leading-snug">
             Indice synthétique automatisé, présenté en complément des preuves documentées et des indisponibilités.
          </p>
        </div>
      </div>
      <p className="mt-3 text-[10px] text-gray-500 leading-snug border-t border-gray-200/60 pt-2" data-testid="text-risk-disclaimer">
        Le risque biodiversité ne peut être calculé qu'en croisant les enjeux écologiques avec les caractéristiques et les pressions du projet.
      </p>
      {factors.length > 0 && (
        <ul className="mt-3 space-y-1" data-testid="list-risk-factors">
          {factors.map((f, i) => (
            <li key={`${f}::${i}`} className="flex items-start gap-1.5 text-[11px] text-gray-600">
              <span className="mt-1 h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: s.ring }} />
              {f}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const ENJEU_LEVEL_BADGE: Record<string, { label: string; color: string }> = {
  critique:    { label: "Critique",    color: "bg-red-100 text-red-700 border-red-200" },
  fort:        { label: "Fort",        color: "bg-orange-100 text-orange-700 border-orange-200" },
  modere:      { label: "Modéré",      color: "bg-amber-100 text-amber-700 border-amber-200" },
  a_confirmer: { label: "À confirmer", color: "bg-sky-100 text-sky-700 border-sky-200" },
  faible:      { label: "Faible",      color: "bg-green-100 text-green-700 border-green-200" },
};

const SPECIES_TABLE_FRAME =
  "overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(38,63,58,0.06)]";
const SPECIES_TABLE =
  "w-full min-w-[620px] border-collapse text-left";
const SPECIES_TABLE_HEAD =
  "border-b border-slate-200 bg-slate-50 text-[9px] font-bold uppercase tracking-[0.11em] text-slate-500";

export function SpeciesInventoryTable({ species, selectedSpecies, onSelectSpecies, centerCoords, sortMode = "recommended" }: {
  species: Occurrence[];
  selectedSpecies: string | null;
  onSelectSpecies: (name: string | null) => void;
  centerCoords: [number, number];
  sortMode?: "recommended" | "french" | "latin";
}) {
  const uniqueSpecies = useMemo(() => uniqueOccurrences(species), [species]);
  const groupedSpecies = useMemo(() => {
    const vertebrates = new Set(["oiseaux", "mammiferes", "reptiles", "amphibiens", "poissons"]);
    return TAXON_GROUPS.map((group) => {
      const rows = uniqueSpecies
        .filter((occ) => getTaxonGroupId(occ) === group.id)
        .sort((a, b) => {
          const useFrench = sortMode === "french" || (sortMode === "recommended" && vertebrates.has(group.id));
          const aName = useFrench ? (a.vernacularName || a.scientificName) : a.scientificName;
          const bName = useFrench ? (b.vernacularName || b.scientificName) : b.scientificName;
          return aName.localeCompare(bName, "fr", { sensitivity: "base" });
        });
      return { group, rows };
    }).filter(({ rows }) => rows.length > 0);
  }, [uniqueSpecies, sortMode]);

  return (
    <div className={SPECIES_TABLE_FRAME}>
      <div className="divide-y divide-slate-100 md:hidden" data-testid="species-inventory-list">
        {groupedSpecies.map(({ group, rows }) => (
          <React.Fragment key={group.id}>
            <div className="bg-[#eef3eb] px-3 py-2 text-xs font-bold text-[#315b4e]">
              {group.label} <span className="font-normal">({rows.length})</span>
            </div>
            {rows.map((occ) => {
              const key = occurrenceKey(occ);
              const selected = selectedSpecies === key;
              return <SpeciesInventoryCard key={key} occ={occ} selected={selected} onSelect={() => onSelectSpecies(selected ? null : key)} centerCoords={centerCoords} />;
            })}
          </React.Fragment>
        ))}
      </div>
      <div className="hidden overflow-x-auto md:block">
        <table className={SPECIES_TABLE} data-testid="species-inventory-table">
          <caption className="sr-only">Inventaire des espèces : taxon, groupe, enjeu, statuts et dernière observation</caption>
          <thead className={SPECIES_TABLE_HEAD}>
            <tr>
              <th scope="col" className="w-[36%] px-3 py-2.5">Taxon</th>
              <th scope="col" className="px-2 py-2.5">Groupe</th>
              <th scope="col" className="px-2 py-2.5">Enjeu</th>
              <th scope="col" className="px-2 py-2.5">Statut</th>
              <th scope="col" className="px-2 py-2.5 text-right">Données</th>
              <th scope="col" className="w-8 px-2 py-2.5"><span className="sr-only">Détails</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {groupedSpecies.map(({ group, rows }) => (
              <React.Fragment key={group.id}>
                <tr className="bg-[#eef3eb]">
                  <th colSpan={6} scope="rowgroup" className="px-3 py-2 text-xs font-bold text-[#315b4e]">
                    {group.label} <span className="font-normal">({rows.length})</span>
                  </th>
                </tr>
                {rows.map((occ) => {
                  const key = occurrenceKey(occ);
                  const selected = selectedSpecies === key;
                  return <SpeciesTableRow key={key} occ={occ} selected={selected} onSelect={() => onSelectSpecies(selected ? null : key)} centerCoords={centerCoords} />;
                })}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SpeciesInventoryCard({ occ, selected, onSelect, centerCoords }: { occ: Occurrence; selected: boolean; onSelect: () => void; centerCoords: [number, number] }) {
  const patri = getPatrimonialite(occ.iucnStatus, occ.alertLevel, occ.isInvasive);
  const group = TAXON_GROUPS.find((g) => g.id === getTaxonGroupId(occ));
  const enjeuBadge = occ.enjeuLevel
    ? ENJEU_LEVEL_BADGE[occ.enjeuLevel]
    : isPlantTaxon(occ)
      ? ENJEU_LEVEL_BADGE.a_confirmer
      : null;
  const key = occurrenceKey(occ);
  return (
    <article data-species-item={key} className={selected ? "bg-teal-50/80" : "bg-white"}>
      <button
        type="button"
        onClick={onSelect}
        aria-expanded={selected}
        className="w-full px-3 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal-500"
        data-testid={`species-row-${key}`}
      >
        <span className="flex items-start justify-between gap-2">
          <span className="min-w-0">
            <span className="block break-words text-xs font-semibold text-slate-800">{occ.vernacularName || occ.scientificName}</span>
            {occ.vernacularName && <span className="block break-words text-[10px] italic text-slate-500">{occ.scientificName}</span>}
            {occ.englishName && <span className="block break-words text-[10px] text-slate-500">EN · {occ.englishName}</span>}
          </span>
          {selected ? <ChevronUp className="h-4 w-4 shrink-0 text-teal-700" /> : <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />}
        </span>
        <span className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2">
          <span><span className="block text-[9px] font-bold uppercase tracking-wide text-slate-400">Groupe</span><span className="text-[10px] font-medium text-slate-600">{group?.label || "Autres"}</span></span>
          <span><span className="block text-[9px] font-bold uppercase tracking-wide text-slate-400">Enjeu</span><span className={`inline-flex rounded border px-1.5 py-0.5 text-[9px] font-bold ${enjeuBadge?.color || patri.color}`}>{enjeuBadge?.label || `~${patri.label}`}</span></span>
          <span><span className="block text-[9px] font-bold uppercase tracking-wide text-slate-400">Statut</span><span className="text-[10px] font-semibold text-slate-600">{getPreferredTerritorialRedList(occ.aliStatuses)?.value || (isPlantTaxon(occ) ? "À confirmer" : getIucnLabel(occ.iucnStatus))}{occ.frenchProtected && <Shield className="ml-1 inline h-3 w-3 text-amber-600" aria-label="Groupe protégé en France" />}</span></span>
          <span><span className="block text-[9px] font-bold uppercase tracking-wide text-slate-400">Données</span><span className="text-[10px] tabular-nums text-slate-500">{occ.lastObservationYear || "—"}<span className="ml-1 text-slate-300">{occ.observationCount ? `×${occ.observationCount}` : ""}</span></span></span>
        </span>
      </button>
      {selected && <div className="px-3 pb-3"><div className="border-l-2 border-teal-500 pl-2"><SpeciesCard occ={occ} isSelected onSelect={onSelect} centerCoords={centerCoords} /><div className="mt-2 flex gap-1.5 text-[11px] text-slate-600" data-testid={`action-${occ.scientificName}`}><ClipboardList className="mt-0.5 h-3 w-3 shrink-0 text-teal-700" /><span><strong>Action recommandée :</strong> {occ.isInvasive ? "Espèce exotique envahissante : prévoir une gestion/limitation, sans valeur patrimoniale de conservation." : occ.enjeuLevel === "a_confirmer" ? `Groupe protégé — statut national non vérifié : ${recommendedAction(getTaxonGroupId(occ))} Comparer avec les listes TAXREF régionales.` : recommendedAction(getTaxonGroupId(occ))}</span></div></div></div>}
    </article>
  );
}
function SpeciesTableRow({ occ, selected, onSelect, centerCoords }: { occ: Occurrence; selected: boolean; onSelect: () => void; centerCoords: [number, number] }) {
  const patri = getPatrimonialite(occ.iucnStatus, occ.alertLevel, occ.isInvasive);
  const group = TAXON_GROUPS.find((g) => g.id === getTaxonGroupId(occ));
  const enjeuBadge = occ.enjeuLevel
    ? ENJEU_LEVEL_BADGE[occ.enjeuLevel]
    : isPlantTaxon(occ)
      ? ENJEU_LEVEL_BADGE.a_confirmer
      : null;
  const key = occurrenceKey(occ);
  return (
    <>
      <tr data-species-item={key} className={`group transition-colors ${selected ? "bg-teal-50/80" : "hover:bg-teal-50/40"}`}>
        <td className="px-3 py-2.5">
          <button type="button" onClick={onSelect} className="block max-w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 rounded" data-testid={`species-row-${key}`}>
            <span className="block truncate text-xs font-semibold text-slate-800">{occ.vernacularName || occ.scientificName}</span>
            {occ.vernacularName && <span className="block truncate text-[10px] italic text-slate-500">{occ.scientificName}</span>}
            {occ.englishName && <span className="block truncate text-[10px] text-slate-500">EN · {occ.englishName}</span>}
          </button>
        </td>
        <td className="px-2 py-2.5 text-[10px] font-medium text-slate-600">{group?.label || "Autres"}</td>
        <td className="px-2 py-2.5"><span className={`inline-flex rounded border px-1.5 py-0.5 text-[9px] font-bold ${enjeuBadge?.color || patri.color}`} title={enjeuBadge ? "Enjeu fondé sur les statuts territoriaux (ALI/TAXREF)" : "Patrimonialité estimée (heuristique)"}>{enjeuBadge?.label || `~${patri.label}`}</span></td>
        <td className="px-2 py-2.5"><span className="text-[10px] font-semibold text-slate-600" title={getPreferredTerritorialRedList(occ.aliStatuses)?.label || (isPlantTaxon(occ) ? "Statut régional, national ou européen à confirmer" : getIucnFullLabel(occ.iucnStatus))}>{getPreferredTerritorialRedList(occ.aliStatuses)?.value || (isPlantTaxon(occ) ? "À confirmer" : getIucnLabel(occ.iucnStatus))}</span>{occ.frenchProtected && <Shield className="ml-1 inline h-3 w-3 text-amber-600" aria-label="Groupe protégé en France" />}</td>
        <td className="px-2 py-2.5 text-right text-[10px] tabular-nums text-slate-500">{occ.lastObservationYear || "—"}<span className="ml-1 text-slate-300">{occ.observationCount ? `×${occ.observationCount}` : ""}</span></td>
        <td className="px-2 py-2.5"><button type="button" onClick={onSelect} aria-expanded={selected} aria-label={`${selected ? "Masquer" : "Afficher"} les détails de ${occ.scientificName}`} className="rounded p-1 text-slate-400 transition-colors hover:bg-teal-100 hover:text-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500">{selected ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}</button></td>
      </tr>
      {selected && <tr className="bg-teal-50/50"><td colSpan={6} className="px-3 pb-3"><div className="border-l-2 border-teal-500 pl-3"><SpeciesCard occ={occ} isSelected onSelect={onSelect} centerCoords={centerCoords} /><div className="mt-2 flex gap-1.5 text-[11px] text-slate-600" data-testid={`action-${occ.scientificName}`}><ClipboardList className="mt-0.5 h-3 w-3 shrink-0 text-teal-700" /><span><strong>Action recommandée :</strong> {occ.isInvasive ? "Espèce exotique envahissante : prévoir une gestion/limitation, sans valeur patrimoniale de conservation." : occ.enjeuLevel === "a_confirmer" ? `Groupe protégé — statut national non vérifié : ${recommendedAction(getTaxonGroupId(occ))} Comparer avec les listes TAXREF régionales.` : recommendedAction(getTaxonGroupId(occ))}</span></div></div></td></tr>}
    </>
  );
}

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

function fmtDist(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

function SpeciesCard({ occ, isSelected, onSelect, centerCoords }: { occ: Occurrence; isSelected: boolean; onSelect: () => void; centerCoords?: [number, number] }) {
  const [imageError, setImageError] = useState(false);
  const gbifUrl = occ.taxonKey ? `https://www.gbif.org/species/${occ.taxonKey}` : null;
  const distKm = centerCoords
    ? haversineKm(centerCoords[0], centerCoords[1], occ.decimalLatitude, occ.decimalLongitude)
    : undefined;
  const wikiUrl = `https://fr.wikipedia.org/wiki/${encodeURIComponent(occ.scientificName.split(' ').slice(0, 2).join('_'))}`;
  const aliUrl = occ.cdNom
    ? `https://alispecies.io/taxon/${occ.cdNom}`
    : `/api/ali/redirect?q=${encodeURIComponent(occ.scientificName.split(' ').slice(0, 2).join(' '))}`;
  const inatUrl = `https://www.inaturalist.org/search?q=${encodeURIComponent(occ.scientificName.split(' ').slice(0, 2).join(' '))}&source%5B%5D=taxa`;
  const taxonGroup = TAXON_GROUPS.find(g => g.id === getTaxonGroupId(occ));

  return (
    <div 
      className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
        isSelected 
          ? 'bg-teal-50 border-teal-300 ring-2 ring-teal-500' 
          : 'bg-white/80 border-gray-100 hover:bg-gray-50'
      }`}
      onClick={onSelect}
    >
      <div className="w-14 h-14 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0 flex items-center justify-center">
        {occ.imageUrl && !imageError ? (
          <img 
            src={occ.imageUrl} 
            alt={occ.scientificName}
            className="w-full h-full object-cover"
            onError={() => setImageError(true)}
          />
        ) : (
          <ImageOff className="h-5 w-5 text-gray-300" />
        )}
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm text-gray-900 truncate">{occ.scientificName}</span>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <a
              href={aliUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded text-teal-700 hover:bg-teal-50 hover:text-teal-800 transition-colors"
              title="Ouvrir la fiche sur ALI Species (référentiel français)"
              data-testid={`link-ali-${occ.scientificName}`}
            >
              <span>ALI Species</span>
              <ExternalLink className="h-3 w-3" />
            </a>
            <a
              href={wikiUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center text-xs w-6 h-6 rounded text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
              title="Voir sur Wikipédia"
               aria-label={`Ouvrir la page Wikipédia de ${occ.scientificName}`}
              onClick={(e) => e.stopPropagation()}
            >
              <BookOpen className="h-3.5 w-3.5" />
            </a>
            {gbifUrl && (
              <a
                href={gbifUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center text-xs w-6 h-6 rounded text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
                title="Voir sur GBIF"
                 aria-label={`Ouvrir la fiche GBIF de ${occ.scientificName}`}
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
            <a
              href={inatUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center text-xs w-6 h-6 rounded text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
              title="Voir sur iNaturalist"
               aria-label={`Ouvrir la recherche iNaturalist pour ${occ.scientificName}`}
              onClick={(e) => e.stopPropagation()}
              data-testid={`link-inat-${occ.scientificName}`}
            >
              <Leaf className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
        <div className="text-xs text-muted-foreground italic truncate">
          {occ.vernacularName || "Nom vernaculaire N/A"}
        </div>
        <div className="mt-1.5 flex flex-wrap gap-1">
          {/* Statuts territoriaux ALI (liste rouge régionale/nationale, protection…) */}
          {occ.aliStatuses && occ.aliStatuses.length > 0 && occ.aliStatuses
            .filter((st) => !isPlantTaxon(occ) || st.category !== "Liste rouge mondiale" || !!getPreferredTerritorialRedList(occ.aliStatuses))
            .slice(0, 4).map((st, i) => {
            const toneClass =
              st.tone === "danger" ? "bg-red-100 text-red-700 border-red-200" :
              st.tone === "warn"   ? "bg-amber-100 text-amber-700 border-amber-200" :
              st.tone === "info"   ? "bg-blue-100 text-blue-700 border-blue-200" :
                                     "bg-gray-100 text-gray-600 border-gray-200";
            return (
              <span
                key={`${st.category}::${st.value}::${st.scope ?? ""}`}
                className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${toneClass}`}
                title={`${st.category}${st.scope ? ` — ${st.scope}` : ""} : ${st.label}`}
              >
                {st.value}{st.scope ? ` · ${st.scope}` : ""}
              </span>
            );
          })}
          {/* Le mondial reste un contexte secondaire et n'est jamais montré seul pour la flore. */}
          {(!isPlantTaxon(occ) || !!getPreferredTerritorialRedList(occ.aliStatuses)) && <StatusBadge status={occ.iucnStatus} />}
          {isPlantTaxon(occ) && !getPreferredTerritorialRedList(occ.aliStatuses) && (
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-600">
              Statut territorial à confirmer
            </span>
          )}
          {/* Badge patrimonialité (heuristique, si pas de données ALI ou tableau vide) */}
          {(!occ.aliStatuses || occ.aliStatuses.length === 0) && !isPlantTaxon(occ) && (() => {
            const patri = getPatrimonialite(occ.iucnStatus, occ.alertLevel, occ.isInvasive);
            return (
              <span
                className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${patri.color}`}
                title={occ.isInvasive
                  ? "Espèce exotique envahissante (EEE) : sans valeur patrimoniale de conservation."
                  : "Patrimonialité estimée (heuristique — statut national non vérifié)"}
                data-testid={`badge-patrimonialite-${occ.scientificName}`}
              >
                {occ.isInvasive ? patri.label : `~Patri. ${patri.label}`}
              </span>
            );
          })()}
          {occ.frenchProtected && (!occ.aliStatuses || occ.aliStatuses.length === 0) && (
            <span
              className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 border border-orange-200"
              title="Groupe protégé en France (heuristique — statut national à vérifier par inventaire)"
              data-testid={`badge-french-protected-${occ.scientificName}`}
            >
                Groupe protégé
            </span>
          )}
          {/* Habitat */}
          {occ.habitatType === "marine" && (
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-200">
              Marin
            </span>
          )}
          {taxonGroup && (
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
              {taxonGroup.label}
            </span>
          )}
        </div>
        {/* Avertissements de cohérence */}
        {occ.enjeuWarnings && occ.enjeuWarnings.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {occ.enjeuWarnings.map((w, i) => (
              <span
                key={`${w}::${i}`}
                className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded bg-yellow-50 text-yellow-700 border border-yellow-200"
                title={w}
              >
                <AlertTriangle className="h-2.5 w-2.5 shrink-0" />
                {w}
              </span>
            ))}
          </div>
        )}
        {/* Métadonnées d'observation */}
        <div className="mt-2 pt-2 border-t border-gray-100/80 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-gray-400">
          {distKm !== undefined && (
            <span className="flex items-center gap-0.5" title="Distance approximative depuis le centre de l'aire d'étude">
              <MapPin className="h-2.5 w-2.5 shrink-0" /> {fmtDist(distKm)}
            </span>
          )}
          {occ.lastObservationYear && (
            <span className="flex items-center gap-0.5" title="Année de la dernière observation">
              <Calendar className="h-2.5 w-2.5 shrink-0" /> {occ.lastObservationYear}
            </span>
          )}
          {occ.observationCount != null && occ.observationCount > 0 && (
            <span title={`${occ.observationCount} occurrence${occ.observationCount > 1 ? "s" : ""} dans l'aire`}>
              ×{occ.observationCount} obs.
            </span>
          )}
          {occ.source && (
            <span className="uppercase tracking-wide font-mono text-[9px]" title={occ.source === "inaturalist" ? "iNaturalist — science participative" : "GBIF — agrégateur institutionnel"}>
              {occ.source === "inaturalist" ? "iNat" : "GBIF"}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string | undefined }) {
  const label = getIucnLabel(status);
  const s = status?.toUpperCase();
  
  const getStatusStyle = () => {
    switch (s) {
      case "CR":
      case "CRITICALLY_ENDANGERED":
        return "bg-red-600 text-white";
      case "EN":
      case "ENDANGERED":
        return "bg-red-500 text-white";
      case "VU":
      case "VULNERABLE":
        return "bg-orange-500 text-white";
      case "NT":
      case "NEAR_THREATENED":
        return "bg-yellow-500 text-white";
      case "LC":
      case "LEAST_CONCERN":
        return "bg-green-500 text-white";
      case "DD":
      case "DATA_DEFICIENT":
        return "bg-gray-400 text-white";
      default:
        return "bg-gray-200 text-gray-600";
    }
  };

  return (
    <span
      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${getStatusStyle()}`}
      title={getIucnFullLabel(status)}
    >
      {label}{status ? " · mondiale" : ""}
    </span>
  );
}

const ZONAGE_CATEGORY_STYLES: Record<string, { border: string; bg: string; text: string; badge: string; hover: string }> = {
  reglementaire: { border: "border-rose-200", bg: "bg-rose-50/50", text: "text-rose-700", badge: "text-rose-500 bg-rose-100", hover: "hover:text-rose-800 hover:bg-rose-50" },
  natura2000: { border: "border-amber-200", bg: "bg-amber-50/50", text: "text-amber-700", badge: "text-amber-600 bg-amber-100", hover: "hover:text-amber-800 hover:bg-amber-50" },
  znieff: { border: "border-emerald-200", bg: "bg-emerald-50/50", text: "text-emerald-700", badge: "text-emerald-600 bg-emerald-100", hover: "hover:text-emerald-800 hover:bg-emerald-50" },
  autre: { border: "border-slate-200", bg: "bg-slate-50/50", text: "text-slate-700", badge: "text-slate-500 bg-slate-100", hover: "hover:text-slate-800 hover:bg-slate-50" },
};

function safeHttpUrl(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw, typeof window !== "undefined" ? window.location.origin : undefined);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
  } catch {
    return null;
  }
}


const GRADE_STYLES: Record<string, { badge: string; label: string }> = {
  A: { badge: "bg-red-100 text-red-700", label: "Population majeure (grade A)" },
  B: { badge: "bg-orange-100 text-orange-700", label: "Population importante (grade B)" },
  C: { badge: "bg-amber-100 text-amber-700", label: "Population significative (grade C)" },
  D: { badge: "bg-gray-100 text-gray-500", label: "Présence non significative (grade D)" },
};

function NaturaSpeciesList({ code, index }: { code: string; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [species, setSpecies] = useState<NaturaSpeciesItem[]>([]);
  const [error, setError] = useState(false);

  const toggle = () => {
    const next = !expanded;
    setExpanded(next);
    if (next && !loaded && !loading) {
      setLoading(true);
      setError(false);
      fetch(`/api/natura-species?code=${encodeURIComponent(code)}`)
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((d) => {
          setSpecies(Array.isArray(d.species) ? d.species : []);
          setLoaded(true);
        })
        .catch(() => setError(true))
        .finally(() => setLoading(false));
    }
  };

  return (
    <div className="ml-5 mt-0.5 mb-1">
      <button
        onClick={toggle}
        className="flex items-center gap-1 text-[11px] text-emerald-700 hover:text-emerald-900 transition-colors"
        data-testid={`button-natura-species-${index}`}
      >
        {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        Espèces justifiant le classement (grade A/B/C/D)
      </button>
      {expanded && (
        <div className="mt-1 pl-4 border-l border-emerald-200" data-testid={`list-natura-species-${index}`}>
          {loading && (
            <div className="flex items-center gap-1.5 text-[11px] text-emerald-600 py-1">
              <Loader2 className="h-3 w-3 animate-spin" /> Chargement des espèces…
            </div>
          )}
          {error && <p className="text-[11px] text-red-600 py-1" role="alert">Espèces indisponibles pour ce site.</p>}
          {loaded && !error && species.length === 0 && (
            <p className="text-[11px] text-gray-400 py-1">Aucune espèce désignatrice (grade A/B/C/D) référencée.</p>
          )}
          {loaded && species.length > 0 && (
            <ul className="space-y-0.5 py-1">
              {species.map((sp, si) => {
                const g = sp.grade ? GRADE_STYLES[sp.grade] : null;
                return (
                  <li key={`${sp.name}-${si}`} className="flex items-center gap-1.5 text-[11px] text-gray-700" data-testid={`natura-species-${index}-${si}`}>
                    {g && (
                      <span className={`text-[9px] font-bold px-1 py-0.5 rounded ${g.badge}`} title={g.label}>
                        {sp.grade}
                      </span>
                    )}
                    <span className="italic">{sp.name}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

interface ExpectedSpeciesItem {
  scientificName: string;
  speciesGroup: string;
  directive: string;
  annexes: string;
  sites: { code: string; name: string }[];
}

const POTENTIAL_STATUS_STYLE: Record<
  PotentialSpeciesStatus,
  { badge: string; bar: string }
> = {
  "Très probable localement": {
    badge: "bg-emerald-100 text-emerald-800 border-emerald-200",
    bar: "bg-emerald-500",
  },
  Potentielle: {
    badge: "bg-sky-100 text-sky-800 border-sky-200",
    bar: "bg-sky-500",
  },
  "Peu compatible": {
    badge: "bg-amber-100 text-amber-800 border-amber-200",
    bar: "bg-amber-500",
  },
  "Non évaluée": {
    badge: "bg-gray-100 text-gray-600 border-gray-200",
    bar: "bg-gray-300",
  },
};

function PotentialSpeciesRow({
  item,
  expanded,
  onToggle,
}: {
  item: PotentialSpeciesItem;
  expanded: boolean;
  onToggle: () => void;
}) {
  const style = POTENTIAL_STATUS_STYLE[item.status];
  return (
    <>
      <tr className={`align-middle transition-colors ${expanded ? "bg-teal-50/80" : "hover:bg-teal-50/40"}`} data-testid={`potential-species-${item.scientificName}`}>
        <td className="px-3 py-2.5">
          <button type="button" onClick={onToggle} className="block max-w-full rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2">
            <span className="block truncate text-xs font-semibold italic text-slate-800">{item.scientificName}</span>
          </button>
        </td>
        <td className="px-2 py-2.5 text-[10px] font-medium text-slate-600">{SPECIES_GROUP_FR[item.speciesGroup] ?? item.speciesGroup}</td>
        <td className="px-2 py-2.5"><span className={`inline-flex rounded border px-1.5 py-0.5 text-[9px] font-bold ${style.badge}`}>{item.status}</span></td>
        <td className="px-2 py-2.5">{item.observed ? <span className="inline-flex rounded border border-teal-200 bg-teal-50 px-1.5 py-0.5 text-[9px] font-bold text-teal-800">Occurrence publique documentée</span> : <span className="text-[10px] font-semibold text-slate-600">Potentielle</span>}</td>
        <td className="px-2 py-2.5">
          <div className="flex items-center justify-end gap-1.5">
            <div className="h-1.5 w-12 overflow-hidden rounded-full bg-slate-100" role="meter" aria-label={`Score de compatibilité de ${item.scientificName}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={item.score ?? undefined} aria-valuetext={item.score === null ? "Non évalué" : `${item.score} sur 100`}>
              <div className={`h-full rounded-full ${style.bar}`} style={{ width: `${item.score ?? 0}%` }} />
            </div>
            <span className="text-[10px] font-bold tabular-nums text-slate-700">{item.score === null ? "—" : item.score}</span>
            <span className="text-[9px] text-slate-400" title={`Confiance ${item.confidence}`}>{item.confidence.slice(0, 1)}</span>
          </div>
        </td>
        <td className="px-2 py-2.5">
          <button type="button" onClick={onToggle} aria-expanded={expanded} aria-label={`${expanded ? "Masquer" : "Afficher"} les éléments de compatibilité de ${item.scientificName}`} className="rounded p-1 text-slate-400 transition-colors hover:bg-teal-100 hover:text-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500">
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
        </td>
      </tr>
      {expanded && (
        <tr className="bg-teal-50/50">
          <td colSpan={6} className="px-3 pb-3">
            <div className="grid gap-3 border-l-2 border-teal-500 pl-3 text-[10px] text-slate-600 sm:grid-cols-2">
              <div>
                <div className="mb-1 font-bold uppercase tracking-wide text-slate-500">Éléments de compatibilité</div>
                <ul className="space-y-1">
                  {item.reasons.length > 0 ? item.reasons.map((reason, index) => <li key={`${reason}-${index}`}>• {reason}</li>) : <li>Aucun élément détaillé disponible.</li>}
                </ul>
              </div>
              <div className="space-y-1">
                <div><strong>Sites :</strong> {item.sites.length > 0 ? item.sites.map((site) => site.name).join(", ") : "—"}</div>
                <div><strong>Habitats :</strong> {item.habitats.length > 0 ? item.habitats.map((habitat) => habitat.code).join(", ") : "—"}</div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function PotentialSpeciesTable({ items, testId }: { items: PotentialSpeciesItem[]; testId: string }) {
  const [expandedSpecies, setExpandedSpecies] = useState<string | null>(null);
  const uniqueItems = useMemo(() => {
    const byTaxon = new Map<string, PotentialSpeciesItem>();
    for (const item of items) {
      const key = `${item.scientificName.normalize("NFKC").trim().toLowerCase()}::${item.speciesGroup}`;
      if (!byTaxon.has(key)) byTaxon.set(key, item);
    }
    return Array.from(byTaxon.values());
  }, [items]);

  const itemKey = (item: PotentialSpeciesItem) =>
    `${item.scientificName.normalize("NFKC").trim().toLowerCase()}::${item.speciesGroup}`;

  return (
    <div className={SPECIES_TABLE_FRAME}>
      <div className="divide-y divide-slate-100 md:hidden" data-testid={`${testId}-list`}>
        {uniqueItems.map((item) => {
          const key = itemKey(item);
          const expanded = expandedSpecies === key;
          const style = POTENTIAL_STATUS_STYLE[item.status];
          const onToggle = () => setExpandedSpecies((current) => current === key ? null : key);
          return (
            <article key={key} className={expanded ? "bg-emerald-50/70" : "bg-white"} data-testid={`potential-species-${item.scientificName}`}>
              <button type="button" onClick={onToggle} aria-expanded={expanded} className="w-full px-3 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500">
                <span className="flex items-start justify-between gap-2">
                  <span className="min-w-0"><span className="block break-words text-[11px] font-semibold italic text-slate-800">{item.scientificName}</span><span className="mt-0.5 block text-[9px] text-slate-500">{SPECIES_GROUP_FR[item.speciesGroup] ?? item.speciesGroup}</span></span>
                  {expanded ? <ChevronUp className="h-4 w-4 shrink-0 text-emerald-700" /> : <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />}
                </span>
                <span className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2">
                  <span><span className="block text-[9px] font-bold uppercase tracking-wide text-slate-400">Signal</span>{item.observed ? <span className="inline-flex rounded border border-teal-200 bg-teal-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-teal-800">Occurrence publique documentée</span> : <span className="text-[10px] font-medium text-slate-500">Potentielle</span>}</span>
                  <span><span className="block text-[9px] font-bold uppercase tracking-wide text-slate-400">Compatibilité</span><span className={`inline-flex rounded border px-1.5 py-0.5 text-[9px] font-bold ${style.badge}`}>{item.status}</span></span>
                  <span><span className="block text-[9px] font-bold uppercase tracking-wide text-slate-400">Indice</span><span className="flex items-center gap-1.5"><span className="h-1.5 w-12 overflow-hidden rounded-full bg-slate-100" role="meter" aria-label={`Score de compatibilité de ${item.scientificName}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={item.score ?? undefined} aria-valuetext={item.score === null ? "Non évalué" : `${item.score} sur 100`}><span className={`block h-full rounded-full ${style.bar}`} style={{ width: `${item.score ?? 0}%` }} /></span><span className="text-[10px] font-bold tabular-nums text-slate-700">{item.score === null ? "—" : item.score}</span></span></span>
                  <span><span className="block text-[9px] font-bold uppercase tracking-wide text-slate-400">Confiance</span><span className="text-[10px] font-medium text-slate-600">{item.confidence}</span></span>
                </span>
              </button>
              {expanded && <div className="grid gap-3 border-l-2 border-emerald-400 px-3 pb-3 pl-3 text-[10px] text-slate-600"><div><div className="mb-1 font-bold uppercase tracking-wide text-slate-500">Éléments de compatibilité</div><ul className="space-y-1">{item.reasons.length > 0 ? item.reasons.map((reason, index) => <li key={`${reason}-${index}`}>• {reason}</li>) : <li>Aucun élément détaillé disponible.</li>}</ul></div><div className="space-y-1"><div><strong>Sites :</strong> {item.sites.length > 0 ? item.sites.map((site) => site.name).join(", ") : "—"}</div><div><strong>Habitats :</strong> {item.habitats.length > 0 ? item.habitats.map((habitat) => habitat.code).join(", ") : "—"}</div></div></div>}
            </article>
          );
        })}
      </div>
      <div className="hidden overflow-x-auto md:block">
        <table className={SPECIES_TABLE} data-testid={testId}>
          <caption className="sr-only">Tableau des espèces attendues et de leur indice de compatibilité</caption>
          <thead className={SPECIES_TABLE_HEAD}><tr><th className="px-3 py-2">Taxon</th><th className="px-2 py-2">Signal</th><th className="px-2 py-2">Compatibilité</th><th className="px-2 py-2">Indice</th><th className="px-2 py-2">Confiance</th><th className="w-8 px-2 py-2"><span className="sr-only">Détails</span></th></tr></thead>
          <tbody className="divide-y divide-slate-100">{uniqueItems.map((item) => {
            const key = itemKey(item);
            return <PotentialSpeciesRow key={key} item={item} expanded={expandedSpecies === key} onToggle={() => setExpandedSpecies((current) => current === key ? null : key)} />;
          })}</tbody>
        </table>
      </div>
    </div>
  );
}

const ZNIEFF_STATUS_STYLE: Record<
  "D" | "E" | "A",
  { label: string; badge: string; description: string }
> = {
  D: {
    label: "D · Déterminante",
    badge: "border-rose-200 bg-rose-50 text-rose-700",
    description: "Espèce déterminante pour la désignation de la ZNIEFF",
  },
  E: {
    label: "E · À enjeux",
    badge: "border-orange-200 bg-orange-50 text-orange-700",
    description: "Autre espèce à enjeux",
  },
  A: {
    label: "A · Documentée",
    badge: "border-slate-200 bg-slate-50 text-slate-600",
    description: "Autre espèce documentée dans la ZNIEFF",
  },
};

function ZnieffSpeciesRow({
  item,
  index,
}: {
  item: PotentialSpeciesResult["znieff"]["species"][number];
  index: number;
}) {
  return (
    <li
      className="rounded-lg border border-slate-200 bg-white px-3 py-2.5"
      data-testid={`znieff-species-${index}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={`shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-bold ${ZNIEFF_STATUS_STYLE[item.determinationStatus].badge}`}
              title={ZNIEFF_STATUS_STYLE[item.determinationStatus].description}
            >
              {item.determinationStatus}
            </span>
            <span className="truncate text-xs font-semibold italic text-slate-800">
              {item.scientificName}
            </span>
            {item.alsoObserved && (
              <span
                className="rounded border border-teal-200 bg-teal-50 px-1.5 py-0.5 text-[9px] font-semibold text-teal-700"
                title="Une occurrence géolocalisée indépendante est également présente dans l’inventaire"
              >
                Occurrence indépendante
              </span>
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[10px] text-slate-500">
            <span>{item.citedName}</span>
            {item.speciesGroup && (
              <>
                <span className="text-slate-300">·</span>
                <span>{SPECIES_GROUP_FR[item.speciesGroup] ?? item.speciesGroup}</span>
              </>
            )}
            {item.cdRef && <span className="font-mono text-[9px] text-slate-400">{item.cdRef}</span>}
          </div>
        </div>
        <span className="shrink-0 text-[9px] font-semibold text-slate-400">
          {item.zones.length} zone{item.zones.length > 1 ? "s" : ""}
        </span>
      </div>

      <div className="mt-2 space-y-1 border-l-2 border-slate-100 pl-2.5">
        {item.zones.map((zone, zoneIndex) => {
          const url = safeHttpUrl(zone.url);
          const zoneStyle = ZNIEFF_STATUS_STYLE[zone.determinationStatus];
          return (
            <div
              key={`${zone.code}-${zoneIndex}`}
              className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px]"
            >
              <span className="font-mono text-[9px] text-slate-400">{zone.code}</span>
              <span className="font-medium text-slate-700">{zone.name}</span>
              <span className={`rounded px-1 py-0.5 text-[9px] font-semibold ${zoneStyle.badge}`}>
                {zone.determinationStatus}
              </span>
              <span className="text-slate-400">{zone.type}</span>
              {url && (
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-auto inline-flex items-center gap-1 font-semibold text-slate-600 underline decoration-slate-300 underline-offset-2 hover:text-slate-900"
                  aria-label={`Voir la fiche officielle de ${zone.name}`}
                >
                  Fiche officielle
                  <ExternalLink className="h-2.5 w-2.5" />
                </a>
              )}
            </div>
          );
        })}
      </div>
    </li>
  );
}

function ZnieffDocumentaryBlock({
  result,
}: {
  result: PotentialSpeciesResult;
}) {
  const znieff = result.znieff;
  const referenceUrl = safeHttpUrl(znieff.reference.sourceUrl);
  const [visibleCount, setVisibleCount] = useState(250);
  useEffect(() => setVisibleCount(250), [result.generatedAt]);
  const visibleSpecies = znieff.species.slice(0, visibleCount);
  return (
    <div
      className="rounded-xl border border-slate-200 bg-slate-50/70 p-3"
      data-testid="block-znieff-documentary"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 shrink-0 text-slate-600" />
            <h4 className="text-xs font-bold text-slate-800">Preuves documentaires ZNIEFF</h4>
          </div>
          <p className="mt-1 max-w-2xl text-[10px] leading-relaxed text-slate-500">
            Présence documentée à l’échelle des zones, pas une observation dans l’emprise
            et aucun bonus de score. La mention « occurrence indépendante » signale seulement
            un recoupement avec une occurrence géolocalisée de l’inventaire.
          </p>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-sm font-bold tabular-nums text-slate-800">{znieff.speciesCount}</div>
          <div className="text-[9px] uppercase tracking-wide text-slate-400">espèces</div>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px]">
        <span className="rounded border border-slate-200 bg-white px-2 py-1 font-semibold text-slate-600">
          Échelle : {znieff.siteCount} zone{znieff.siteCount > 1 ? "s" : ""} ZNIEFF
        </span>
        {znieff.partial ? (
          <span className="inline-flex items-center gap-1 rounded border border-amber-200 bg-amber-50 px-2 py-1 font-semibold text-amber-800">
            <Info className="h-3 w-3" />
            Résultat partiel : certaines zones ou espèces peuvent manquer
          </span>
        ) : (
          <span className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1 font-semibold text-emerald-700">
            Données disponibles pour les zones retournées
          </span>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 border-y border-slate-200 py-2 text-[9px] text-slate-500">
        <span className="font-semibold text-slate-600">Statuts :</span>
        {(Object.keys(ZNIEFF_STATUS_STYLE) as Array<"D" | "E" | "A">).map((status) => (
          <span key={status} className="inline-flex items-center gap-1" title={ZNIEFF_STATUS_STYLE[status].description}>
            <strong className={`rounded border px-1 py-0.5 ${ZNIEFF_STATUS_STYLE[status].badge}`}>
              {status}
            </strong>
            {ZNIEFF_STATUS_STYLE[status].label.split(" · ")[1]}
          </span>
        ))}
      </div>

      {znieff.species.length > 0 ? (
        <ul className="mt-2 space-y-1.5" data-testid="list-znieff-species">
          {visibleSpecies.map((item, index) => (
            <ZnieffSpeciesRow
              key={item.cdRef?.trim() || `${item.scientificName.normalize("NFKC").trim().toLowerCase()}::${item.speciesGroup}`}
              item={item}
              index={index}
            />
          ))}
        </ul>
      ) : (
        <p className="mt-2 rounded border border-dashed border-slate-200 bg-white px-3 py-3 text-[11px] italic text-slate-500">
          Aucune espèce documentée dans les zones ZNIEFF retournées.
        </p>
      )}
      {visibleSpecies.length < znieff.species.length && (
        <button
          type="button"
          onClick={() => setVisibleCount((count) => count + 250)}
          className="mt-2 w-full rounded border border-slate-200 bg-white px-3 py-2 text-[10px] font-semibold text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
        >
          Afficher 250 espèces supplémentaires
        </button>
      )}

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[9px] text-slate-400">
        <span>{visibleSpecies.length} ligne{visibleSpecies.length > 1 ? "s" : ""} affichée{visibleSpecies.length > 1 ? "s" : ""} sur {znieff.speciesCount} espèce{znieff.speciesCount > 1 ? "s" : ""} documentée{znieff.speciesCount > 1 ? "s" : ""}</span>
        <span className="inline-flex flex-wrap items-center justify-end gap-x-2 gap-y-1">
          <span>
            Source mise à jour : {znieff.reference.sourceUpdated}
            {znieff.reference.sourceVersion ? ` · version ${znieff.reference.sourceVersion}` : ""}
          </span>
          {referenceUrl && (
            <a
              href={referenceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-semibold text-slate-600 underline decoration-slate-300 underline-offset-2 hover:text-slate-900"
            >
              {znieff.reference.publisher} · Référentiel officiel
              <ExternalLink className="h-2.5 w-2.5" />
            </a>
          )}
        </span>
      </div>
    </div>
  );
}

function PotentialSpeciesSection({
  center,
  radius,
  occurrences,
  result,
  loading,
  error,
  open,
  onToggle,
}: {
  center: [number, number];
  radius: number;
  occurrences: Occurrence[];
  result: PotentialSpeciesResult | null;
  loading: boolean;
  error: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const currentResult = useMemo(
    () => reconcilePotentialSpecies(result, occurrences, center, radius),
    [result, occurrences, center, radius],
  );

  const potential = currentResult?.species.filter((item) => !item.observed) ?? [];
  const observed = currentResult?.species.filter((item) => item.observed) ?? [];
  const summary = loading
    ? "Calcul en cours…"
    : error
      ? "Évaluation indisponible"
      : !currentResult
        ? "Calcul lancé avec l’inventaire"
        : currentResult.species.length === 0
          ? `${currentResult.znieff?.speciesCount ?? 0} espèce${(currentResult.znieff?.speciesCount ?? 0) > 1 ? "s" : ""} documentée${(currentResult.znieff?.speciesCount ?? 0) > 1 ? "s" : ""} en ZNIEFF`
          : `${currentResult.potentialCount} espèce${currentResult.potentialCount > 1 ? "s" : ""} potentielle${currentResult.potentialCount > 1 ? "s" : ""}, ${currentResult.observedCount} avec occurrence publique documentée${currentResult.znieff?.speciesCount ? ` · ${currentResult.znieff.speciesCount} documentée${currentResult.znieff.speciesCount > 1 ? "s" : ""} en ZNIEFF` : ""}`;

  return (
    <section
      className="overflow-hidden rounded-xl border border-emerald-200 bg-white"
      data-testid="section-potential-species"
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls="section-body-potential-species"
        className="flex w-full items-center justify-between gap-2 px-4 py-3 transition-colors hover:bg-emerald-50/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
        data-testid="button-section-potential-species"
      >
        <span className="flex items-center gap-2 text-left text-sm font-bold text-gray-800">
          <ListChecks className="h-4 w-4 shrink-0 text-emerald-600" />
          Espèces potentielles
        </span>
        <span className="flex min-w-0 items-center gap-2 text-[11px] text-gray-500">
          <span className="truncate">{summary}</span>
          {loading ? (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-emerald-600" />
          ) : open ? (
            <ChevronUp className="h-4 w-4 shrink-0" />
          ) : (
            <ChevronDown className="h-4 w-4 shrink-0" />
          )}
        </span>
      </button>

      {open && (
        <div
          id="section-body-potential-species"
          className="space-y-3 border-t border-emerald-100 px-4 pb-4 pt-3"
        >
          <div className="rounded-lg border border-sky-100 bg-sky-50 p-2.5 text-[10px] leading-relaxed text-sky-800">
            <strong>Indice de compatibilité, pas probabilité de présence.</strong>{" "}
            Le calcul croise les liens Natura 2000 et les correspondances
            écologiques explicites entre l’espèce et les habitats décrits sur
            les sites proches. La localisation précise de chaque habitat dans
            l’emprise n’est pas connue. Les occurrences servent uniquement à
            distinguer les occurrences publiques documentées des espèces potentielles. La confirmation sur le site exige des relevés de terrain. Ce pré-diagnostic doit être validé
            par un écologue.
            {currentResult?.reference && (
              <>
                {" "}
                <a
                  href={currentResult.reference.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold underline"
                >
                  Référentiel {currentResult.reference.publisher} {currentResult.reference.id}
                </a>
                .
              </>
            )}
          </div>

          {loading && (
            <div
              className="flex items-center justify-center gap-2 py-4 text-xs text-gray-500"
              role="status"
            >
              <Loader2 className="h-4 w-4 animate-spin text-emerald-600" />
              Calcul des compatibilités…
            </div>
          )}
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-100 bg-red-50 p-2.5 text-[11px] text-red-700" role="alert">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Les données nécessaires sont temporairement indisponibles. Aucun
              score n’a été inventé.
            </div>
          )}
          {!loading && !error && currentResult && currentResult.species.length === 0 && (
            <p className="py-2 text-xs italic text-gray-500">
              Consultation terminée : aucune espèce potentielle n’a été retournée
              pour les sites Natura 2000 concernés.
            </p>
          )}
          {!loading && !error && currentResult && currentResult.partial && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-100 bg-amber-50 p-2.5 text-[10px] text-amber-800">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Certaines données d’habitat n’ont pas pu être chargées ; les
              espèces concernées restent « Non évaluée ».
            </div>
          )}

          {!loading && !error && currentResult && (
            currentResult.znieff ? (
              <ZnieffDocumentaryBlock result={currentResult} />
            ) : (
              <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-[10px] text-slate-600">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Les données documentaires ZNIEFF sont indisponibles pour cette
                requête. Elles ne sont pas déduites des observations ni du score.
              </div>
            )
          )}

          {!loading && !error && currentResult && currentResult.species.length > 0 && (
            <>
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <h4 className="text-[11px] font-bold uppercase tracking-wide text-emerald-800">
                    Espèces potentielles
                  </h4>
                  <span className="text-[10px] text-gray-400">
                    {potential.length}
                  </span>
                </div>
                {potential.length > 0 ? (
                  <PotentialSpeciesTable items={potential} testId="list-potential-species" />
                ) : (
                  <p className="text-[11px] italic text-gray-500">
                    Aucune espèce potentielle dans le référentiel
                    disponible.
                  </p>
                )}
              </div>

              <div className="border-t border-gray-100 pt-3">
                <div className="mb-1.5 flex items-center justify-between">
                  <h4 className="text-[11px] font-bold uppercase tracking-wide text-teal-800">
                    Espèces avec occurrence publique parmi les espèces attendues
                  </h4>
                  <span className="text-[10px] text-gray-400">
                    {observed.length}
                  </span>
                </div>
                <p className="mb-2 text-[10px] leading-snug text-gray-500">
                  Ce statut est réservé aux espèces disposant d’une occurrence
                  dans l’inventaire GBIF ou d’un signal iNaturalist dans l’aire.
                </p>
                {observed.length > 0 ? (
                  <PotentialSpeciesTable items={observed} testId="list-observed-potential-species" />
                ) : (
                  <p className="text-[11px] italic text-gray-500">
                    Aucune occurrence réelle ne correspond aux espèces
                    attendues.
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}

const SPECIES_GROUP_FR: Record<string, string> = {
  Birds: "Oiseaux",
  Mammals: "Mammifères",
  Amphibians: "Amphibiens",
  Reptiles: "Reptiles",
  Fish: "Poissons",
  Invertebrates: "Invertébrés",
  Plants: "Plantes",
};

function Natura2000ExpectedPanel({
  center,
  radius,
  observedNames,
}: {
  center: [number, number];
  radius: number;
  observedNames: Set<string>;
}) {
  const [expanded, setExpanded] = useState(true);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [species, setSpecies] = useState<ExpectedSpeciesItem[]>([]);
  const [siteCount, setSiteCount] = useState(0);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    setSpecies([]);
    setError(false);
    setLoading(true);
    fetch(`/api/natura2000/expected?lat=${center[0]}&lng=${center[1]}&radius=${radius}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        if (cancelled) return;
        setSpecies(Array.isArray(d.species) ? d.species : []);
        setSiteCount(Number(d.siteCount) || 0);
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [center[0], center[1], radius]);

  const notObserved = species.filter(
    (s) => !observedNames.has(s.scientificName.trim().toLowerCase()),
  );

  if (loaded && !error && species.length === 0) return null;

  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full"
        data-testid="button-natura-expected-toggle"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-emerald-600" />
            <span className="font-bold text-sm text-emerald-700 text-left">
              Espèces potentielles Natura 2000
            </span>
          </div>
          <div className="flex items-center gap-2">
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-600" />}
            {loaded && (
              <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-100 rounded-full px-2 py-0.5">
                {notObserved.length} potentielle{notObserved.length > 1 ? "s" : ""}
              </span>
            )}
            {expanded ? (
              <ChevronUp className="h-4 w-4 text-emerald-500" />
            ) : (
              <ChevronDown className="h-4 w-4 text-emerald-500" />
            )}
          </div>
        </div>
      </button>

      {expanded && (
        <div className="mt-3">
          {error && (
            <p className="text-[11px] text-red-600" role="alert">Espèces potentielles indisponibles.</p>
          )}
          {loaded && !error && (
            <>
              <p className="text-[11px] text-gray-500 mb-2 leading-snug">
                Espèces justifiant le classement des {siteCount} site{siteCount > 1 ? "s" : ""} Natura 2000 proche
                {siteCount > 1 ? "s" : ""} (base EEA, France). Les espèces potentielles ne figurent
                pas parmi les espèces avec occurrence publique documentée mais sont documentées pour ces sites proches.
              </p>
              <ul className="space-y-1" data-testid="list-natura-expected">
                {species.map((sp, i) => {
                  const observed = observedNames.has(sp.scientificName.trim().toLowerCase());
                  return (
                    <li
                      key={`${sp.scientificName}-${i}`}
                      className="flex items-start gap-2 text-[11px] text-gray-700 bg-white/60 rounded px-2 py-1.5"
                      data-testid={`natura-expected-${i}`}
                    >
                      <span
                        className={`text-[9px] font-bold px-1 py-0.5 rounded shrink-0 mt-0.5 ${
                          observed
                            ? "bg-gray-100 text-gray-500"
                            : "bg-emerald-100 text-emerald-700"
                        }`}
                        title={observed ? "Occurrence publique documentée dans l’aire" : "Espèce potentielle documentée par Natura 2000"}
                      >
                        {observed ? "occurrence publique" : "potentielle"}
                      </span>
                      <span className="flex-1">
                        <span className="italic font-medium">{sp.scientificName}</span>
                        {sp.speciesGroup && (
                          <span className="text-gray-400">
                            {" "}
                            · {SPECIES_GROUP_FR[sp.speciesGroup] ?? sp.speciesGroup}
                          </span>
                        )}
                        {sp.annexes && (
                          <span className="block text-[10px] text-emerald-600">{sp.annexes}</span>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function SINPPanel({ center }: { center: [number, number] }) {
  const [platforms, setPlatforms] = useState<SINPPlatform[]>([]);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    findSINPPlatforms(center[0], center[1]).then(setPlatforms);
  }, [center]);

  if (platforms.length === 0) return null;

  return (
    <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-4">
      <button onClick={() => setExpanded(!expanded)} className="w-full">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-indigo-600" />
            <span className="font-bold text-sm text-indigo-700">Plateformes SINP régionales</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-indigo-500 bg-indigo-100 px-2 py-0.5 rounded-full">
              {platforms.length} région{platforms.length > 1 ? 's' : ''}
            </span>
            {expanded ? <ChevronUp className="h-4 w-4 text-indigo-500" /> : <ChevronDown className="h-4 w-4 text-indigo-500" />}
          </div>
        </div>
      </button>

      {expanded && (
        <div className="mt-3 space-y-3">
          <p className="text-xs text-indigo-600/70">
            Complétez votre inventaire avec les données du SINP de votre région :
          </p>
          {platforms.map((platform) => (
            <div key={platform.code} className="bg-white/70 rounded-lg p-3">
              <span className="text-xs font-bold text-indigo-800 block mb-2">{platform.region}</span>
              <div className="space-y-1.5">
                {platform.links.map((link, linkIndex) => (
                  <a
                    key={`${platform.code}::${link.url || link.label}::${linkIndex}`}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-xs text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded px-2 py-1.5 transition-colors"
                    data-testid={`sinp-link-${platform.code}`}
                  >
                    <ExternalLink className="h-3 w-3 flex-shrink-0" />
                    <span className="truncate">{link.label}</span>
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ConfidencePanel({ confidence }: { confidence: ConfidenceScore }) {
  const [expanded, setExpanded] = useState(false);
  
  const getConfidenceColor = () => {
    if (confidence.total >= 80) return "text-green-600 bg-green-50 border-green-200";
    if (confidence.total >= 60) return "text-blue-600 bg-blue-50 border-blue-200";
    if (confidence.total >= 40) return "text-orange-600 bg-orange-50 border-orange-200";
    return "text-red-600 bg-red-50 border-red-200";
  };

  const getConfidenceLabel = () => {
    if (confidence.interpretation === "excellent") return "Excellent";
    if (confidence.interpretation === "good") return "Bon";
    if (confidence.interpretation === "moderate") return "Modéré";
    return "Faible";
  };

  const getProgressColor = (value: number) => {
    if (value >= 70) return "bg-green-500";
    if (value >= 50) return "bg-blue-500";
    if (value >= 30) return "bg-orange-500";
    return "bg-red-500";
  };

  const subScores = [
    { label: "Géographie", value: confidence.geo, icon: MapPin },
    { label: "Taxonomie", value: confidence.tax, icon: Tag },
    { label: "Fraîcheur", value: confidence.time, icon: Calendar },
    { label: "Traçabilité", value: confidence.trace, icon: Link },
    { label: "Qualité GBIF", value: confidence.issues, icon: Flag },
    { label: "Unicité", value: confidence.dup, icon: Layers },
  ];

  return (
    <div className={`rounded-xl border p-4 ${getConfidenceColor()}`}>
      <button 
        onClick={() => setExpanded(!expanded)}
        className="w-full"
      >
        <div className="flex items-center justify-between gap-2 min-w-0">
          <div className="flex items-center gap-2 min-w-0 flex-shrink">
            <Shield className="h-5 w-5 shrink-0" />
            <span className="font-bold text-sm truncate">Indice de Confiance</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-xl font-bold leading-none">{confidence.total}</span>
            <span className="text-xs leading-none">/100</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/50 font-medium whitespace-nowrap">
              {getConfidenceLabel()}
            </span>
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </div>
        </div>
      </button>

      {expanded && (
        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {subScores.map(({ label, value, icon: Icon }) => (
              <div key={label} className="bg-white/60 rounded-lg p-2">
                <div className="flex items-center gap-1.5 mb-1">
                  <Icon className="h-3 w-3" />
                  <span className="text-xs font-medium">{label}</span>
                  <span className="text-xs ml-auto font-bold">{value}%</span>
                </div>
                <div className="h-1.5 bg-white/80 rounded-full overflow-hidden">
                  <div 
                    className={`h-full rounded-full transition-all ${getProgressColor(value)}`}
                    style={{ width: `${value}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
          
          <div className="text-xs bg-white/60 rounded-lg p-2">
            <p className="font-medium">{confidence.message}</p>
            <p className="mt-1 text-gray-500">
              {confidence.rawCount} occurrences analysées, {confidence.dedupCount} uniques
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function getAlertPriority(level: "high" | "medium" | "low"): number {
  if (level === "high") return 3;
  if (level === "medium") return 2;
  return 1;
}
