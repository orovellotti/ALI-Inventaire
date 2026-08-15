import { useState, useMemo, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { X, Download, FileText, AlertTriangle, AlertCircle, Leaf, Info, ChevronDown, ChevronUp, ImageOff, Copy, Check, ExternalLink, BookOpen, Shield, ShieldAlert, MapPin, Tag, Calendar, Link, Flag, Layers, Filter, Table, Sparkles, Loader2, Share2, Mail, MoreHorizontal, Settings2, Search, Activity, ListChecks, ClipboardList, LayoutGrid, ChevronRight, Gauge } from "lucide-react";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuCheckboxItem } from "@/components/ui/dropdown-menu";
import { InventoryResult, Occurrence, getIucnLabel, getIucnFullLabel, getPatrimonialite, ConfidenceScore, TAXON_GROUPS, getTaxonGroupId, isMarineSpecies } from "@/lib/gbif";
import { findSINPPlatforms, SINPPlatform } from "@/lib/sinp";
import { exportCSV, exportExcel } from "@/lib/export";
import { PrioritySpeciesInline } from "./PrioritySpeciesInline";
import html2canvas from "html2canvas";

interface ZonageItem {
  category: string;
  type: string;
  name: string;
  url: string | null;
  id: string | null;
  code?: string | null;
}
interface NaturaSpeciesItem {
  name: string;
  grade: "A" | "B" | "C" | "D" | null;
  sensitive: boolean;
}
interface ZonageGroupData {
  category: string;
  label: string;
  count: number;
  zonages: ZonageItem[];
}
interface ZonagesData {
  lat: number;
  lng: number;
  radius: number;
  count: number;
  groups: ZonageGroupData[];
  errors: string[];
}

type TabKey = "overview" | "especes" | "zonages";
type DisplayMode = "essentiel" | "expert";

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
  if (riskTone === "critical" || riskTone === "high") return { level: "fort", label: "Fort" };
  if (riskTone === "moderate") return { level: "modere", label: "Modéré" };
  return { level: "faible", label: "Faible" };
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

interface ResultsPanelProps {
  isOpen: boolean;
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
}

export function ResultsPanel({ isOpen, onClose, results, selectedSpecies, onSelectSpecies, activeTaxonFilters, onToggleTaxonFilter, onToggleAllTaxonFilters, excludeMarine, onToggleExcludeMarine, includeINaturalist, onToggleIncludeINaturalist, toponym }: ResultsPanelProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [displayMode, setDisplayMode] = useState<DisplayMode>(() => {
    if (typeof window === "undefined") return "essentiel";
    const saved = localStorage.getItem("if.displayMode");
    return saved === "expert" ? "expert" : "essentiel";
  });
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [expandedZonages, setExpandedZonages] = useState<Set<string>>(new Set());
  const [showAllZonages, setShowAllZonages] = useState(false);
  const [speciesQuery, setSpeciesQuery] = useState("");
  const [attrFilters, setAttrFilters] = useState<Set<string>>(new Set());
  const [openEnjeux, setOpenEnjeux] = useState<Set<string>>(new Set(["critique", "fort"]));
  const [showReportPreview, setShowReportPreview] = useState(false);
  const [copied, setCopied] = useState(false);
  const [reformattedReport, setReformattedReport] = useState<string | null>(null);
  const [reformatting, setReformatting] = useState(false);
  const [reformatError, setReformatError] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(true);
  const [aiAnalysis, setAiAnalysis] = useState<{ species: { scientificName: string; vernacularName?: string; group: string; level: string; reason: string; sources?: string[]; inInventory?: boolean; evidenceClass?: string; evidenceLabel?: string; score?: number; scoreLabel?: string; isInvasive?: boolean }[]; natura2000?: { type: string; name: string; url: string | null; code?: string | null; species?: { name: string; designating: boolean; grade?: string | null }[]; habitats?: { code: string; description: string; cover: number | null }[] }[]; generatedAt: string } | null>(null);
  const [zonages, setZonages] = useState<ZonagesData | null>(null);
  const [zonagesLoading, setZonagesLoading] = useState(false);
  const [panelWidth, setPanelWidth] = useState<number>(() => {
    if (typeof window === "undefined") return 600;
    const saved = Number(localStorage.getItem("resultsPanelWidth"));
    return Number.isFinite(saved) && saved >= 360 ? saved : 600;
  });
  const isResizingRef = useRef(false);

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!isResizingRef.current) return;
      const newWidth = Math.max(360, Math.min(window.innerWidth - 80, window.innerWidth - e.clientX));
      setPanelWidth(newWidth);
    }
    function onUp() {
      if (!isResizingRef.current) return;
      isResizingRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      try {
        localStorage.setItem("resultsPanelWidth", String(panelWidth));
        window.dispatchEvent(new CustomEvent("if:panel-width-changed"));
      } catch {}
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [panelWidth]);

  useEffect(() => {
    // Réinitialise l'état d'interface propre à un résultat lors d'une nouvelle analyse
    setAiAnalysis(null);
    setActiveTab("overview");
    setShowAllZonages(false);
    setExpandedZonages(new Set());
    setAssistantOpen(false);
  }, [results]);

  // Fermeture de l'assistant au clavier (Échap) + focus à l'ouverture
  const assistantCloseRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (!assistantOpen) return;
    assistantCloseRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAssistantOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [assistantOpen]);

  useEffect(() => {
    if (!results) {
      setZonages(null);
      return;
    }
    const [lat, lng] = results.center;
    const radius = results.radius;
    let cancelled = false;
    setZonages(null);
    setZonagesLoading(true);
    fetch(`/api/zonages?lat=${lat}&lng=${lng}&radius=${radius}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled) setZonages(d);
      })
      .catch(() => {
        if (!cancelled) setZonages(null);
      })
      .finally(() => {
        if (!cancelled) setZonagesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [results]);

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    isResizingRef.current = true;
    document.body.style.cursor = "ew-resize";
    document.body.style.userSelect = "none";
  };

  const marineCount = useMemo(() => {
    if (!results) return 0;
    const seen = new Set<string>();
    let n = 0;
    for (const occ of results.occurrences) {
      if (seen.has(occ.scientificName)) continue;
      seen.add(occ.scientificName);
      if (isMarineSpecies(occ)) n += 1;
    }
    return n;
  }, [results]);

  const taxonCounts = useMemo(() => {
    if (!results) return new Map<string, number>();
    const uniqueMap = new Map<string, Occurrence>();
    results.occurrences.forEach((occ) => {
      if (excludeMarine && isMarineSpecies(occ)) return;
      const existing = uniqueMap.get(occ.scientificName);
      if (!existing || getAlertPriority(occ.alertLevel) > getAlertPriority(existing.alertLevel)) {
        uniqueMap.set(occ.scientificName, occ);
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
      const existing = uniqueMap.get(occ.scientificName);
      if (!existing || getAlertPriority(occ.alertLevel) > getAlertPriority(existing.alertLevel)) {
        uniqueMap.set(occ.scientificName, occ);
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
      const existing = uniqueMap.get(occ.scientificName);
      if (!existing || getAlertPriority(occ.alertLevel) > getAlertPriority(existing.alertLevel)) {
        uniqueMap.set(occ.scientificName, occ);
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

    return {
      high: unique.filter(o => o.alertLevel === "high").sort(sortByEnjeu),
      medium: unique.filter(o => o.alertLevel === "medium").sort(sortByEnjeu),
      low: unique.filter(o => o.alertLevel === "low").sort(sortByEnjeu),
    };
  }, [results, activeTaxonFilters, excludeMarine]);

  const allFilteredSpecies = useMemo(() => {
    return [...sortedSpecies.high, ...sortedSpecies.medium, ...sortedSpecies.low];
  }, [sortedSpecies]);

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

  const especesList = useMemo(() => {
    const q = speciesQuery.trim().toLowerCase();
    return allFilteredSpecies.filter((o) => {
      if (attrFilters.has("sensibles") && !(o.alertLevel === "high" || o.alertLevel === "medium")) return false;
      if (attrFilters.has("averifier") && !(o.enjeuLevel === "a_confirmer" || (!o.enjeuLevel && isNotEvaluated(o.iucnStatus)))) return false;
      if (attrFilters.has("protegees") && !o.frenchProtected) return false;
      if (attrFilters.has("menacees") && !isThreatened(o.iucnStatus)) return false;
      if (attrFilters.has("patrimoniales") && getPatrimonialite(o.iucnStatus, o.alertLevel, o.isInvasive).level < 4) return false;
      if (attrFilters.has("recentes") && !(o.lastObservationYear && o.lastObservationYear >= CURRENT_YEAR - 5)) return false;
      if (attrFilters.has("marine") && !isMarineSpecies(o)) return false;
      if (attrFilters.has("terrestre") && isMarineSpecies(o)) return false;
      if (q && !`${o.scientificName} ${o.vernacularName || ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [allFilteredSpecies, attrFilters, speciesQuery]);

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
        if (seen.has(occ.scientificName)) continue;
        seen.add(occ.scientificName);
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
      Math.min(10, aiForts * 5);
    const score = Math.min(100, raw);

    let label: string;
    let tone: "critical" | "high" | "moderate" | "low";
    if (score >= 75) { label = "Très élevé"; tone = "critical"; }
    else if (score >= 55) { label = "Élevé"; tone = "high"; }
    else if (score >= 35) { label = "Modéré"; tone = "moderate"; }
    else { label = "Faible"; tone = "low"; }

    const factors: string[] = [];
    if (hi > 0) factors.push(`${hi} espèce${hi > 1 ? "s" : ""} à enjeu fort`);
    if (aiForts > 0) factors.push(`${aiForts} espèce${aiForts > 1 ? "s" : ""} à patrimonialité forte ou majeure (IA)`);
    if (zc > 0) factors.push(`${zc} zonage${zc > 1 ? "s" : ""} environnemental${zc > 1 ? "aux" : ""}`);
    if (hasMarine && hasTerrestrial) factors.push("Sensibilité marine et terrestre");
    if (recentRatio >= 0.4) factors.push("Observations récentes à proximité");
    if (factors.length === 0) factors.push("Peu de signaux d'enjeu détectés localement");

    return { score, label, tone, factors };
  }, [sortedSpecies, zonages, marineCount, results, aiAnalysis]);

  const autoSummary = useMemo(() => {
    if (!results) return "";
    const sp = results.stats.speciesCount;
    const sens = results.stats.sensitiveCount;
    const zc = zonages?.count || 0;
    const parts = [`Le secteur recense ${sp} espèce${sp > 1 ? "s" : ""}, dont ${sens} sensible${sens > 1 ? "s" : ""}`];
    if (zc > 0) parts.push(`et intersecte ${zc} zonage${zc > 1 ? "s" : ""} environnemental${zc > 1 ? "aux" : ""}`);
    let text = parts.join(" ") + ".";
    text += ` Le potentiel d'enjeux écologiques est estimé « ${riskScore.label} ».`;
    text += " Le risque biodiversité proprement dit ne pourra être calculé qu'en croisant ces enjeux avec les caractéristiques et les pressions d'un projet.";
    if (riskScore.tone === "critical" || riskScore.tone === "high") {
      text += " Des inventaires complémentaires sont recommandés avant toute intervention.";
    } else {
      text += " Une vérification de terrain reste conseillée pour confirmer ce pré-diagnostic.";
    }
    return text;
  }, [results, zonages, riskScore]);

  const setMode = (m: DisplayMode) => {
    setDisplayMode(m);
    try { localStorage.setItem("if.displayMode", m); } catch {}
  };
  const isExpert = displayMode === "expert";

  const globalLevel = useMemo(() => computeGlobalIssueLevel(riskScore.tone), [riskScore.tone]);

  // Liste plate des zonages, triée par priorité de vigilance (réglementaire → Natura 2000 → ZNIEFF → info)
  const flatZonages = useMemo(() => {
    if (!zonages) return [] as (ZonageItem & { groupCategory: string; categoryLabel: string; priority: number })[];
    const list: (ZonageItem & { groupCategory: string; categoryLabel: string; priority: number })[] = [];
    for (const g of zonages.groups) {
      for (const z of g.zonages) {
        list.push({ ...z, groupCategory: g.category, categoryLabel: g.label, priority: ZONAGE_CATEGORY_PRIORITY[g.category] ?? 9 });
      }
    }
    list.sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name));
    return list;
  }, [zonages]);

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
    if (items.length < 3) {
      items.push({ icon: "check", text: "Vérification terrain recommandée pour confirmer ce pré-diagnostic." });
    }
    return items.slice(0, 3);
  }, [reglementaireCount, zonages, sortedSpecies, aVerifierCount]);

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
    exportExcel({ results, filteredSpecies: allFilteredSpecies, activeTaxonFilters });
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
      link.download = `inventaire-flash-${Date.now()}.jpg`;
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

    const fmtSpecies = (o: Occurrence) =>
      `• ${o.scientificName}${o.vernacularName ? ` — ${o.vernacularName}` : ""} (${getIucnFullLabel(o.iucnStatus)})`;

    const sectionList = (label: string, list: Occurrence[]) =>
      list.length > 0 ? `${label} (${list.length})\n${list.map(fmtSpecies).join("\n")}\n` : "";

    const zonagesSection = zonages && zonages.count > 0 ? `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🗺 ZONAGES ENVIRONNEMENTAUX (${zonages.count})
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${zonages.groups.map(g => `${g.label} (${g.count})\n${g.zonages.map(z => `• ${z.type} — ${z.name}${z.url ? `\n  ${z.url}` : ""}`).join("\n")}`).join("\n\n")}

↳ Zonages intersectant l'aire d'étude — source IGN Géoplateforme / INPN (PatriNat).
` : "";

    return `🌿 INVENTAIRE FLASH — Pré-diagnostic écologique
${toponym ? `📍 ${toponym}\n` : ""}🗓 ${new Date().toLocaleDateString("fr-FR")}
📌 ${lat}, ${lng} — rayon ${results.radius} m
🗺 ${mapsLink}
${!isAllActive ? `🔎 Filtres : ${activeGroupLabels}\n` : ""}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SYNTHÈSE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${results.stats.rawNameCount != null ? `${results.stats.rawNameCount} noms taxonomiques collectés — ${results.stats.speciesCount} taxons valides après consolidation${results.stats.duplicatesRemoved ? ` (${results.stats.duplicatesRemoved} doublon${results.stats.duplicatesRemoved > 1 ? "s" : ""} fusionné${results.stats.duplicatesRemoved > 1 ? "s" : ""})` : ""}` : `${totalInReport} taxons recensés (GBIF + iNaturalist)`}
${highCount + mediumCount} espèces sensibles (enjeux forts ou moyens)
Indice de confiance des données : ${conf.total}/100 — ${confLabel}
Potentiel d'enjeux écologiques : ${riskScore.label}
↳ Le risque biodiversité ne peut être calculé qu'en croisant ces enjeux avec les caractéristiques et les pressions d'un projet.
${conf.message ? `↳ ${conf.message}\n` : ""}
${sectionList("🔴 ENJEUX FORTS", sortedSpecies.high)}
${sectionList("🟠 ENJEUX MOYENS", sortedSpecies.medium)}
${sectionList("🟢 ENJEUX FAIBLES", sortedSpecies.low)}${aiAnalysis && aiAnalysis.species.length > 0 ? `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✨ ANALYSE IA — ESPÈCES À ENJEUX
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${(["A", "C", "B", "D", "E"] as const)
  .map((cls) => {
    const label: Record<string, string> = { A: "Espèce observée", B: "Avérée à l'échelle du site", C: "Très probable localement", D: "Potentielle", E: "Peu pertinente localement" };
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
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Données : GBIF • iNaturalist • UICN • IGN/INPN
Inventaire flash — indication rapide, ne remplace pas un inventaire terrain.
${shareUrl ? `\n🔗 Reproduire cette analyse : ${shareUrl}` : ""}`;
  }, [results, sortedSpecies, activeTaxonFilters, presentGroups, isAllActive, aiAnalysis, toponym, zonages, riskScore]);

  const reportSubject = useMemo(() => {
    if (!results) return "Inventaire Flash";
    const place = toponym || `${results.center[0].toFixed(3)}, ${results.center[1].toFixed(3)}`;
    return `Inventaire Flash — ${place} (${sortedSpecies.high.length + sortedSpecies.medium.length} espèces sensibles)`;
  }, [results, toponym, sortedSpecies]);

  const activeReportText = reformattedReport || reportText;

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

  const handleReformatReport = async () => {
    setReformatting(true);
    setReformatError(null);
    try {
      const r = await fetch("/api/llm/reformat-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report: reportText }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || `Erreur ${r.status}`);
      }
      const data = await r.json();
      setReformattedReport(data.reformatted);
    } catch (e: any) {
      setReformatError(e.message || "Erreur reformulation IA");
    } finally {
      setReformatting(false);
    }
  };

  const toggleAttr = (key: string) => {
    setAttrFilters((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleEnjeu = (key: string) => {
    setOpenEnjeux((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (!isOpen || !results) return null;

  const sourcesLabel = `GBIF${includeINaturalist ? " · iNaturalist" : ""} · UICN · ALI/TAXREF · IGN/INPN`;

  const tabs: { key: TabKey; label: string; icon: typeof Activity; badge?: number }[] = [
    { key: "overview", label: "Vue d'ensemble", icon: Activity },
    { key: "especes", label: "Espèces", icon: Leaf, badge: filteredTotal },
    { key: "zonages", label: "Zonages", icon: Layers, badge: zonages?.count || 0 },
  ];

  const assistantSuggestions: Record<TabKey, string[]> = {
    overview: [
      "Résume ce diagnostic pour un non-spécialiste.",
      "Quels sont les trois principaux risques ?",
      "Quelles vérifications faut-il effectuer ?",
    ],
    especes: [
      "Quelles espèces nécessitent une vérification terrain ?",
      "Quelles sont les périodes sensibles ?",
      "Résume les espèces protégées.",
    ],
    zonages: [
      "Pourquoi ces zonages sont-ils importants ?",
      "Quelles conséquences pour mon projet ?",
      "Résume les contraintes réglementaires.",
    ],
  };

  const enjeuxSections: { key: string; label: string; tone: string; items: Occurrence[]; defaultTip: string }[] = [
    { key: "critique", label: "Critique", tone: "bg-red-50 border-red-200 text-red-700", items: enjeuxBuckets.critique, defaultTip: "CR/EX au niveau national ou régional — enjeu patrimonial majeur" },
    { key: "fort", label: "Fort", tone: "bg-orange-50 border-orange-200 text-orange-700", items: enjeuxBuckets.fort, defaultTip: "EN/VU au niveau national ou régional, ou NT + protection forte" },
    { key: "modere", label: "Modéré", tone: "bg-amber-50 border-amber-200 text-amber-700", items: enjeuxBuckets.modere, defaultTip: "NT sans protection forte, ou protection nationale/directive/ZNIEFF sans menace" },
    { key: "a_confirmer", label: "À confirmer", tone: "bg-sky-50 border-sky-200 text-sky-700", items: enjeuxBuckets.aConfirmer, defaultTip: "Groupe protégé en France, statut national non vérifié — à confirmer par inventaire terrain" },
    { key: "faible", label: "Faible", tone: "bg-green-50 border-green-200 text-green-700", items: enjeuxBuckets.faible, defaultTip: "LC ou NE au niveau national/régional — enjeu conservation faible" },
    { key: "eee", label: "Exotique envahissante (EEE)", tone: "bg-fuchsia-50 border-fuchsia-200 text-fuchsia-700", items: enjeuxBuckets.eee, defaultTip: "Espèce exotique envahissante : enjeu de gestion, sans valeur patrimoniale de conservation" },
  ];

  return (
    <AnimatePresence>
      <motion.div
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", damping: 25, stiffness: 200 }}
        className="fixed right-0 z-[2000] bg-white/95 backdrop-blur-xl shadow-2xl border-white/20 flex flex-col inset-x-0 bottom-0 h-[80vh] rounded-t-2xl border-t md:inset-x-auto md:top-0 md:bottom-auto md:h-full md:max-w-[95vw] md:rounded-none md:border-t-0 md:border-l"
        style={typeof window !== "undefined" && window.innerWidth >= 768 ? { width: panelWidth } : undefined}
      >
        <div
          onMouseDown={startResize}
          onDoubleClick={() => { setPanelWidth(600); try { localStorage.setItem("resultsPanelWidth", "600"); window.dispatchEvent(new CustomEvent("if:panel-width-changed")); } catch {} }}
          title="Glisser pour redimensionner — double-clic pour réinitialiser"
          className="hidden md:block absolute top-0 left-0 h-full w-1.5 -ml-0.5 cursor-ew-resize z-10 hover:bg-teal-400/40 active:bg-teal-500/60 transition-colors"
          data-testid="handle-resize-panel"
        />
        <div className="px-5 pt-4 pb-3 border-b border-gray-100 bg-white/50">
          <div className="flex justify-between items-start gap-2">
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-gray-900 tracking-tight truncate">Inventaire Flash</h2>
              <p className="text-[11px] text-gray-500 leading-tight">Diagnostic biodiversité d'un site</p>
              {toponym && (
                <p className="mt-1 text-xs font-semibold text-teal-700 flex items-center gap-1 truncate" data-testid="text-site-name">
                  <MapPin className="h-3 w-3 shrink-0" /> <span className="truncate">{toponym}</span>
                </p>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <div className="flex rounded-lg border border-gray-200 overflow-hidden mr-1" role="group" aria-label="Niveau de détail">
                {(["essentiel", "expert"] as DisplayMode[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    aria-pressed={displayMode === m}
                    className={`px-2 py-1 text-[10px] font-semibold capitalize transition-colors ${
                      displayMode === m ? "bg-teal-600 text-white" : "bg-white text-gray-500 hover:bg-gray-50"
                    }`}
                    data-testid={`button-mode-${m}`}
                  >
                    {m === "essentiel" ? "Essentiel" : "Expert"}
                  </button>
                ))}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={onClose}
                className="h-8 px-2.5 text-xs border-gray-200 text-gray-600 gap-1"
                data-testid="button-change-site"
              >
                <MapPin className="h-3 w-3" /> Changer le site
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="hover:bg-gray-100 rounded-full h-8 w-8" data-testid="button-panel-settings" title="Sources & options" aria-label="Sources et options">
                    <Settings2 className="h-4 w-4 text-gray-500" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel className="text-xs">Sources de données</DropdownMenuLabel>
                  {onToggleIncludeINaturalist && (
                    <DropdownMenuCheckboxItem
                      checked={!!includeINaturalist}
                      onCheckedChange={() => onToggleIncludeINaturalist()}
                      data-testid="checkbox-include-inaturalist"
                    >
                      Inclure iNaturalist
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
              <Button variant="ghost" size="icon" onClick={onClose} className="hover:bg-gray-100 rounded-full h-8 w-8" data-testid="button-close-panel" aria-label="Fermer le panneau">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        <div className="flex gap-1 px-3 pt-2 pb-1 border-b border-gray-100 bg-white/40 overflow-x-auto" role="tablist" aria-label="Sections du diagnostic">
          {tabs.map((t) => {
            const Icon = t.icon;
            const active = activeTab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                id={`tab-btn-${t.key}`}
                aria-selected={active}
                aria-controls={`tabpanel-${t.key}`}
                onClick={() => setActiveTab(t.key)}
                onKeyDown={(e) => {
                  let next: (typeof tabs)[number] | undefined;
                  if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                    const idx = tabs.findIndex((x) => x.key === activeTab);
                    next = tabs[(idx + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
                  } else if (e.key === "Home") next = tabs[0];
                  else if (e.key === "End") next = tabs[tabs.length - 1];
                  if (!next) return;
                  e.preventDefault();
                  setActiveTab(next.key);
                  document.getElementById(`tab-btn-${next.key}`)?.focus();
                }}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-teal-400 focus-visible:outline-none ${
                  active ? "bg-teal-100 text-teal-800 ring-1 ring-teal-300" : "text-gray-500 hover:bg-gray-100"
                }`}
                data-testid={`tab-${t.key}`}
              >
                <Icon className="h-3.5 w-3.5" />
                {t.label}
                {typeof t.badge === "number" && t.badge > 0 && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${active ? "bg-white/70 text-teal-700" : "bg-gray-200 text-gray-500"}`} aria-label={`${t.badge} éléments`}>
                    {t.badge}
                  </span>
                )}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setAssistantOpen(true)}
            className="ml-auto flex items-center gap-1 px-2.5 py-2 rounded-lg text-xs font-semibold whitespace-nowrap text-indigo-600 hover:bg-indigo-50 transition-colors focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:outline-none"
            data-testid="button-open-assistant"
            aria-haspopup="dialog"
          >
            <Sparkles className="h-3.5 w-3.5" /> Assistant
          </button>
        </div>

        <ScrollArea className="flex-1 px-5 py-4">
          {/* VUE D'ENSEMBLE */}
          <div
            className={activeTab === "overview" ? "space-y-4" : "hidden"}
            role="tabpanel"
            id="tabpanel-overview"
            aria-labelledby="tab-btn-overview"
            data-testid="panel-overview"
          >
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
            >
              <div className="flex items-center justify-between gap-2">
                <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Niveau d'enjeu du site</div>
                {zonagesLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" aria-label="Chargement des zonages" />}
              </div>
              <div
                className={`mt-1 text-2xl font-extrabold tracking-tight ${
                  globalLevel.level === "fort" ? "text-red-700" : globalLevel.level === "modere" ? "text-orange-700" : "text-green-700"
                }`}
                data-testid="text-issue-level"
              >
                {globalLevel.label}
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-700">
                <span className="flex items-center gap-1">
                  <Shield className="h-3.5 w-3.5 text-red-600" />
                  {reglementaireCount} protection{reglementaireCount > 1 ? "s" : ""} réglementaire{reglementaireCount > 1 ? "s" : ""}
                </span>
                <span className="flex items-center gap-1">
                  <AlertTriangle className="h-3.5 w-3.5 text-orange-600" />
                  {sortedSpecies.high.length + sortedSpecies.medium.length} espèce{sortedSpecies.high.length + sortedSpecies.medium.length > 1 ? "s" : ""} sensible{sortedSpecies.high.length + sortedSpecies.medium.length > 1 ? "s" : ""}
                </span>
                <span className="flex items-center gap-1">
                  <Layers className="h-3.5 w-3.5 text-teal-600" />
                  {zonages?.count ?? "—"} zonage{(zonages?.count || 0) > 1 ? "s" : ""} identifié{(zonages?.count || 0) > 1 ? "s" : ""}
                </span>
              </div>
              <p className="mt-2 text-[10px] text-gray-400 leading-snug">
                Estimation indicative issue des données publiques — à valider par un écologue.
              </p>
            </div>

            {/* À retenir */}
            <div className="rounded-xl border border-gray-200 bg-white p-4" data-testid="card-key-findings">
              <div className="text-xs font-bold text-gray-700 uppercase tracking-wide mb-2">À retenir</div>
              <ul className="space-y-1.5">
                {keyFindings.map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-gray-700">
                    {f.icon === "shield" && <Shield className="h-3.5 w-3.5 shrink-0 mt-0.5 text-red-600" />}
                    {f.icon === "alert" && <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-orange-600" />}
                    {f.icon === "info" && <Info className="h-3.5 w-3.5 shrink-0 mt-0.5 text-sky-600" />}
                    {f.icon === "check" && <Check className="h-3.5 w-3.5 shrink-0 mt-0.5 text-teal-600" />}
                    <span>{f.text}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Actions recommandées */}
            <div className="rounded-xl border border-gray-200 bg-white p-4" data-testid="card-recommended-actions">
              <div className="text-xs font-bold text-gray-700 uppercase tracking-wide mb-2">Actions recommandées</div>
              <div className="grid grid-cols-1 gap-1.5">
                <Button onClick={() => { setActiveTab("especes"); setAttrFilters(new Set(["sensibles"])); }} variant="outline" size="sm" className="justify-start gap-2 h-9 text-xs border-gray-200" data-testid="button-action-species">
                  <Leaf className="h-3.5 w-3.5 text-orange-600" /> Consulter les espèces prioritaires
                </Button>
                <Button onClick={() => setActiveTab("zonages")} variant="outline" size="sm" className="justify-start gap-2 h-9 text-xs border-gray-200" data-testid="button-action-zonages">
                  <Layers className="h-3.5 w-3.5 text-red-600" /> Contrôler les contraintes réglementaires
                </Button>
                <Button onClick={() => setAssistantOpen(true)} variant="outline" size="sm" className="justify-start gap-2 h-9 text-xs border-gray-200" data-testid="button-action-assistant">
                  <ClipboardList className="h-3.5 w-3.5 text-teal-600" /> Vérifier les périodes sensibles d'inventaire
                </Button>
              </div>
            </div>

            {/* Mode expert : indicateurs détaillés */}
            {isExpert && (
              <>
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                  <div className="grid grid-cols-4 gap-2 text-center">
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
                      <div className="text-[10px] text-gray-500 leading-tight">source{(includeINaturalist ? 2 : 1) > 1 ? "s" : ""}</div>
                      <div className="text-[9px] text-gray-400 mt-0.5" title="Sources des observations">{includeINaturalist ? "GBIF+iNat" : "GBIF"}</div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <RiskScoreCard score={riskScore.score} label={riskScore.label} tone={riskScore.tone} factors={riskScore.factors} />
                  <ConfidencePanel confidence={results.confidence} />
                </div>

                <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles className="h-4 w-4 text-blue-600" />
                    <span className="font-bold text-sm text-blue-700">Synthèse automatique</span>
                  </div>
                  <p className="text-xs text-gray-700 leading-relaxed" data-testid="text-auto-summary">{autoSummary}</p>
                </div>
              </>
            )}

            {/* Points de vigilance (ex-onglet Enjeux) */}
            <div className="pt-1">
              <div className="text-xs font-bold text-gray-700 uppercase tracking-wide mb-2">
                Points de vigilance ({enjeuxBuckets.critique.length + enjeuxBuckets.fort.length + enjeuxBuckets.modere.length + enjeuxBuckets.aConfirmer.length})
              </div>
            </div>

            {enjeuxSections.map((section) => {
              if (section.items.length === 0) return null;
              const open = openEnjeux.has(section.key);
              return (
                <div key={section.key} className={`rounded-xl border ${section.tone.split(" ").filter(c => c.startsWith("border")).join(" ")} overflow-hidden`}>
                  <button
                    type="button"
                    onClick={() => toggleEnjeu(section.key)}
                    className={`w-full flex items-center justify-between px-4 py-3 ${section.tone}`}
                    data-testid={`button-enjeu-${section.key}`}
                  >
                    <div className="flex items-center gap-2">
                      <ShieldAlert className="h-4 w-4" />
                      <span className="font-bold text-sm uppercase tracking-wide">{(section.key === "eee" || section.key === "a_confirmer") ? section.label : `Enjeu ${section.label}`} ({section.items.length})</span>
                    </div>
                    {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>
                  {open && (
                    <div className="p-3 space-y-3 bg-white/60">
                      {section.items.map((occ, idx) => (
                        <div key={`${section.key}-${occ.scientificName}-${idx}`}>
                          <SpeciesCard
                            occ={occ}
                            isSelected={selectedSpecies === occ.scientificName}
                            onSelect={() => onSelectSpecies(selectedSpecies === occ.scientificName ? null : occ.scientificName)}
                            centerCoords={results.center}
                          />
                          <div className="mt-1 ml-1 flex items-start gap-1.5 text-[11px] text-gray-600" data-testid={`action-${occ.scientificName}`}>
                            <ClipboardList className="h-3 w-3 shrink-0 mt-0.5 text-teal-600" />
                            <span><span className="font-semibold">Action recommandée :</span> {occ.isInvasive ? "Espèce exotique envahissante : prévoir une gestion/limitation, sans valeur patrimoniale de conservation." : occ.enjeuLevel === "a_confirmer" ? `Groupe protégé — statut national non vérifié : ${recommendedAction(getTaxonGroupId(occ))} Comparer avec les listes TAXREF régionales.` : recommendedAction(getTaxonGroupId(occ))}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {sortedSpecies.high.length + sortedSpecies.medium.length + sortedSpecies.low.length === 0 && (
              <p className="text-sm text-gray-400 italic">Aucune espèce à enjeu détectée avec les filtres actuels.</p>
            )}
          </div>

          {/* ESPÈCES */}
          <div
            className={activeTab === "especes" ? "space-y-4" : "hidden"}
            role="tabpanel"
            id="tabpanel-especes"
            aria-labelledby="tab-btn-especes"
            data-testid="panel-especes"
          >
            <div className="rounded-lg border border-gray-200 bg-gray-50/60 px-3 py-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600" data-testid="species-summary">
              <span><strong className="text-gray-900">{filteredTotal}</strong> espèce{filteredTotal > 1 ? "s" : ""}</span>
              <span><strong className="text-orange-700">{sortedSpecies.high.length + sortedSpecies.medium.length}</strong> sensible{sortedSpecies.high.length + sortedSpecies.medium.length > 1 ? "s" : ""}</span>
              <span><strong className="text-sky-700">{aVerifierCount}</strong> à vérifier</span>
            </div>
            <div className="flex flex-wrap gap-1.5" data-testid="species-attr-filters">
              {[
                { key: "all", label: "Toutes" },
                { key: "sensibles", label: "Sensibles" },
                { key: "protegees", label: "Protégées" },
                { key: "averifier", label: "À vérifier" },
                { key: "recentes", label: "Observations récentes" },
                ...(isExpert
                  ? [
                      { key: "menacees", label: "Menacées" },
                      { key: "patrimoniales", label: "Patrimoniales" },
                      { key: "marine", label: "Marine" },
                      { key: "terrestre", label: "Terrestre" },
                    ]
                  : []),
              ].map((chip) => {
                const active = chip.key === "all" ? attrFilters.size === 0 : attrFilters.has(chip.key);
                return (
                  <button
                    key={chip.key}
                    type="button"
                    onClick={() => chip.key === "all" ? setAttrFilters(new Set()) : toggleAttr(chip.key)}
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

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
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
                <div className="px-4 pb-3 space-y-2">
                  <button
                    type="button"
                    onClick={() => onToggleAllTaxonFilters(presentGroups.map(g => g.id))}
                    className="text-[10px] font-semibold text-teal-600 hover:text-teal-800 transition-colors uppercase tracking-wider"
                    data-testid="button-toggle-all-taxons"
                  >
                    {isAllActive ? "Tout désélectionner" : "Tout sélectionner"}
                  </button>
                  <div className="grid grid-cols-2 gap-2" data-testid="group-cards">
                    {presentGroups.map(group => {
                      const count = taxonCounts.get(group.id) || 0;
                      const stats = groupStats.get(group.id);
                      const isActive = activeTaxonFilters.has(group.id);
                      return (
                        <button
                          key={group.id}
                          type="button"
                          onClick={() => onToggleTaxonFilter(group.id)}
                          className={`text-left p-2.5 rounded-lg border transition-all ${
                            isActive ? "bg-white border-teal-300 ring-1 ring-teal-200" : "bg-white/60 border-gray-200 opacity-60 hover:opacity-100"
                          }`}
                          data-testid={`taxon-filter-${group.id}`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-gray-800 flex items-center gap-1">
                              <span>{group.icon}</span> {group.label}
                            </span>
                            <span className="text-sm font-bold text-teal-700">{count}</span>
                          </div>
                          {stats && (
                            <div className="mt-1 text-[10px] text-gray-500 leading-tight">
                              {stats.sensitive} sensible{stats.sensitive > 1 ? "s" : ""} · {stats.protected} protégée{stats.protected > 1 ? "s" : ""}
                            </div>
                          )}
                          <div className="mt-0.5 text-[10px] text-gray-400 leading-tight">Période : {GROUP_SEASON[group.id] || "à préciser"}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-1.5" data-testid="species-list-compact">
              <div className="flex items-center justify-between text-xs text-gray-500 px-1">
                <span>{especesList.length} espèce{especesList.length > 1 ? "s" : ""}</span>
              </div>
              {especesList.length === 0 ? (
                <p className="text-sm text-gray-400 italic px-1 py-4 text-center">Aucune espèce ne correspond aux filtres.</p>
              ) : (
                especesList.map((occ, idx) => (
                  <CompactSpeciesRow
                    key={`${occ.scientificName}-${idx}`}
                    occ={occ}
                    isSelected={selectedSpecies === occ.scientificName}
                    onSelect={() => onSelectSpecies(selectedSpecies === occ.scientificName ? null : occ.scientificName)}
                  />
                ))
              )}
            </div>
          </div>

          {/* ZONAGES */}
          <div
            className={activeTab === "zonages" ? "space-y-4" : "hidden"}
            role="tabpanel"
            id="tabpanel-zonages"
            aria-labelledby="tab-btn-zonages"
            data-testid="panel-zonages-tab"
          >
            {zonages && zonages.count > 0 && (
              <div className="rounded-lg border border-gray-200 bg-gray-50/60 px-3 py-2 text-xs text-gray-600 leading-relaxed" data-testid="text-zonages-summary">
                {zonages.count} zonage{zonages.count > 1 ? "s" : ""} dans l'aire d'étude (rayon {zonages.radius} m) — les plus importants d'abord.
              </div>
            )}

            {zonagesLoading && (
              <div className="flex items-center gap-2 text-xs text-gray-400 py-4 justify-center">
                <Loader2 className="h-4 w-4 animate-spin" /> Chargement des zonages…
              </div>
            )}

            {/* Liste compacte hiérarchisée */}
            <div className="space-y-1.5" data-testid="zoning-list">
              {(showAllZonages ? flatZonages : flatZonages.slice(0, 3)).map((z, idx) => {
                const key = `${z.type}-${z.name}-${idx}`;
                const expanded = expandedZonages.has(key);
                const badge = ZONAGE_CATEGORY_BADGE[z.groupCategory] || ZONAGE_CATEGORY_BADGE.autre;
                const isNatura = z.groupCategory === "natura2000";
                return (
                  <div key={key} className="rounded-lg border border-gray-200 bg-white overflow-hidden">
                    <button
                      type="button"
                      onClick={() => toggleZonageDetails(key)}
                      aria-expanded={expanded}
                      className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-gray-50 transition-colors focus-visible:ring-2 focus-visible:ring-teal-400 focus-visible:outline-none"
                      data-testid={`zoning-row-${idx}`}
                    >
                      <span className={`shrink-0 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border ${badge.cls}`}>
                        {badge.label}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs font-semibold text-gray-800 truncate">{z.name}</span>
                        <span className="block text-[10px] text-gray-500 truncate">
                          {z.type} · Dans l'aire d'étude
                        </span>
                      </span>
                      {expanded ? <ChevronUp className="h-3.5 w-3.5 text-gray-400 shrink-0" /> : <ChevronDown className="h-3.5 w-3.5 text-gray-400 shrink-0" />}
                    </button>
                    {expanded && (
                      <div className="px-3 pb-3 pt-1 border-t border-gray-100 space-y-1.5 text-[11px] text-gray-600">
                        <div><span className="font-semibold">Type :</span> {z.type}</div>
                        <div><span className="font-semibold">Catégorie :</span> {z.categoryLabel}</div>
                        {isExpert && z.id && <div><span className="font-semibold">Identifiant :</span> <span className="font-mono">{z.id}</span></div>}
                        {isExpert && z.code && <div><span className="font-semibold">Code :</span> <span className="font-mono">{z.code}</span></div>}
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

            {!showAllZonages && flatZonages.length > 3 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAllZonages(true)}
                className="w-full h-9 text-xs border-gray-200 text-gray-600"
                data-testid="button-show-all-zonages"
              >
                Voir les {flatZonages.length - 3} autres zonages <ChevronDown className="h-3.5 w-3.5 ml-1" />
              </Button>
            )}

            <Natura2000ExpectedPanel
              center={results.center}
              radius={results.radius}
              observedNames={observedNames}
            />
            <SINPPanel center={results.center} />
            {!zonagesLoading && (!zonages || zonages.count === 0) && (
              <p className="text-sm text-gray-400 italic">Aucun zonage environnemental recensé dans l'aire d'étude. Vous pouvez élargir le rayon d'analyse.</p>
            )}
          </div>

          <p className="mt-4 px-1 text-[11px] text-gray-400 leading-snug flex gap-1.5 items-start">
            <Info className="h-3 w-3 shrink-0 mt-0.5" />
            Indication rapide basée sur GBIF, iNaturalist et UICN — ne remplace pas un inventaire terrain.
          </p>
        </ScrollArea>

        {/* Assistant IA contextuel */}
        <AnimatePresence>
          {assistantOpen && (
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 260 }}
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
                      {assistantSuggestions[activeTab].map((q, i) => (
                        <li key={i} className="text-xs text-gray-600 flex items-start gap-1.5">
                          <ChevronRight className="h-3 w-3 shrink-0 mt-0.5 text-indigo-400" /> {q}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-1.5 text-[10px] text-gray-400 leading-snug">
                      L'analyse ci-dessous répond à ces questions à partir des données réelles de l'inventaire. Pour une note rédigée, utilisez « Générer la note écologique » puis « Reformuler ».
                    </p>
                  </div>
                  <PrioritySpeciesInline
                    toponym={toponym || `Point ${results.center[0].toFixed(4)}, ${results.center[1].toFixed(4)}`}
                    coords={results.center}
                    occurrences={allFilteredSpecies}
                    onAnalysisChange={setAiAnalysis}
                  />
                </div>
              </ScrollArea>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="px-5 py-3 border-t border-gray-100 bg-white/50 flex items-center gap-2">
          <Button
            onClick={() => setShowReportPreview(true)}
            className="flex-1 justify-center gap-2 h-11 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white text-sm font-semibold shadow-md hover:shadow-lg ring-1 ring-indigo-500/30 transition-all"
            data-testid="button-report-text"
          >
            <FileText className="h-4 w-4" />
            Générer la note écologique
            {aiAnalysis && (
              <span className="ml-0.5 inline-flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wider px-1 py-0.5 rounded bg-white/20 border border-white/30">
                <Sparkles className="h-2.5 w-2.5" /> IA
              </span>
            )}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="h-11 w-11 border-gray-200 hover:bg-gray-50" data-testid="button-more-exports" title="Autres exports" aria-label="Autres exports">
                <MoreHorizontal className="h-4 w-4 text-gray-600" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel className="text-xs">Exporter les données</DropdownMenuLabel>
              <DropdownMenuItem onClick={handleExportExcel} data-testid="button-export-excel" className="gap-2 text-xs">
                <Table className="h-3.5 w-3.5" /> Excel (.xlsx)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportCSV} data-testid="button-export-csv" className="gap-2 text-xs">
                <FileText className="h-3.5 w-3.5" /> CSV
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleExportImage} data-testid="button-export-image" className="gap-2 text-xs">
                <Download className="h-3.5 w-3.5" /> Image de la carte
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </motion.div>

      <Dialog open={showReportPreview} onOpenChange={setShowReportPreview}>
        <DialogContent className="max-w-4xl w-[90vw] max-h-[85vh] flex flex-col z-[3000]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Note écologique
            </DialogTitle>
          </DialogHeader>
          {reformattedReport && (
            <div className="mt-3 flex items-center gap-2 text-xs text-teal-700 bg-teal-50 border border-teal-200 px-3 py-1.5 rounded-md">
              <Sparkles className="h-3.5 w-3.5" />
              <span className="font-medium">Note de synthèse reformulée par IA</span>
              <button
                type="button"
                onClick={() => setReformattedReport(null)}
                className="ml-auto text-[11px] text-teal-700 hover:underline"
                data-testid="button-revert-report"
              >
                Revenir au brut
              </button>
            </div>
          )}
          {reformatError && (
            <div className="mt-3 text-xs text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded-md">
              {reformatError}
            </div>
          )}
          <ScrollArea className="flex-1 mt-3 h-[50vh] overflow-auto">
            <pre className={`text-sm whitespace-pre-wrap p-4 rounded-lg border text-gray-700 ${reformattedReport ? "bg-teal-50/30 border-teal-100 font-sans leading-relaxed" : "bg-gray-50 border-gray-200 font-mono"}`}>
              {activeReportText}
            </pre>
          </ScrollArea>
          <div className="flex flex-wrap justify-between items-center gap-2 mt-4 pt-4 border-t">
            <Button variant="ghost" onClick={() => setShowReportPreview(false)} className="text-gray-500">
              Fermer
            </Button>
            <div className="flex flex-wrap gap-2">
              {!reformattedReport && (
                <Button
                  variant="outline"
                  onClick={handleReformatReport}
                  disabled={reformatting}
                  className="gap-2 border-teal-300 text-teal-700 hover:bg-teal-50 hover:text-teal-800"
                  data-testid="button-reformat-report"
                >
                  {reformatting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  {reformatting ? "Reformulation…" : "Reformuler avec IA"}
                </Button>
              )}
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
                className="gap-2 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white shadow-md"
                data-testid="button-share-report"
              >
                <Share2 className="h-4 w-4" />
                Partager
              </Button>
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
            Estimé selon les espèces à enjeux, les zonages, la patrimonialité et la récence des données.
          </p>
        </div>
      </div>
      <p className="mt-3 text-[10px] text-gray-500 leading-snug border-t border-gray-200/60 pt-2" data-testid="text-risk-disclaimer">
        Le risque biodiversité ne peut être calculé qu'en croisant les enjeux écologiques avec les caractéristiques et les pressions du projet.
      </p>
      {factors.length > 0 && (
        <ul className="mt-3 space-y-1" data-testid="list-risk-factors">
          {factors.map((f, i) => (
            <li key={i} className="flex items-start gap-1.5 text-[11px] text-gray-600">
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

function CompactSpeciesRow({ occ, isSelected, onSelect }: { occ: Occurrence; isSelected: boolean; onSelect: () => void }) {
  const patri = getPatrimonialite(occ.iucnStatus, occ.alertLevel, occ.isInvasive);
  const group = TAXON_GROUPS.find((g) => g.id === getTaxonGroupId(occ));
  const hasVern = !!occ.vernacularName;
  const notEval = isNotEvaluated(occ.iucnStatus);
  const enjeuBadge = occ.enjeuLevel ? ENJEU_LEVEL_BADGE[occ.enjeuLevel] : null;
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg border transition-all ${
        isSelected ? "bg-teal-50 border-teal-300 ring-1 ring-teal-300" : "bg-white border-gray-100 hover:bg-gray-50"
      }`}
      data-testid={`species-row-${occ.scientificName}`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium text-gray-900 truncate">{hasVern ? occ.vernacularName : occ.scientificName}</span>
          {notEval && (!occ.aliStatuses || occ.aliStatuses.length === 0) && (
            <Info className="h-3 w-3 text-gray-400 shrink-0" aria-label="Statut UICN non évalué mondialement" />
          )}
          {occ.enjeuWarnings && occ.enjeuWarnings.length > 0 && (
            <span title={occ.enjeuWarnings.join(" · ")}>
              <AlertTriangle className="h-3 w-3 text-yellow-500 shrink-0" />
            </span>
          )}
        </div>
        {hasVern && <div className="text-[11px] text-gray-500 italic truncate">{occ.scientificName}</div>}
        <div className="mt-1 flex flex-wrap items-center gap-1">
          {group && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600">{group.icon} {group.label}</span>}
          {/* Niveau d'enjeu territorial si enrichi, sinon patrimonialité heuristique */}
          {enjeuBadge ? (
            <span className={`text-[9px] px-1.5 py-0.5 rounded-full border ${enjeuBadge.color}`} title="Enjeu fondé sur les statuts territoriaux (ALI/TAXREF)">
              {enjeuBadge.label}
            </span>
          ) : (
            <span className={`text-[9px] px-1.5 py-0.5 rounded-full border ${patri.color}`} title="Patrimonialité estimée (heuristique)">
              ~{patri.label}
            </span>
          )}
          {/* Top statut territorial */}
          {occ.aliStatuses && occ.aliStatuses.length > 0 && occ.aliStatuses[0] && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-gray-50 text-gray-600 border border-gray-200 truncate max-w-[100px]" title={`${occ.aliStatuses[0].category}${occ.aliStatuses[0].scope ? ` — ${occ.aliStatuses[0].scope}` : ""}`}>
              {occ.aliStatuses[0].value}{occ.aliStatuses[0].scope ? ` · ${occ.aliStatuses[0].scope}` : ""}
            </span>
          )}
          {!occ.aliStatuses && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-gray-50 text-gray-500 border border-gray-200" title={getIucnFullLabel(occ.iucnStatus)}>
              {getIucnLabel(occ.iucnStatus)}{occ.iucnStatus ? " · mondiale" : ""}
            </span>
          )}
          {occ.lastObservationYear && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-gray-50 text-gray-500 border border-gray-200">{occ.lastObservationYear}</span>}
          {occ.source && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-gray-50 text-gray-400 border border-gray-200">{occ.source === "inaturalist" ? "iNat" : "GBIF"}</span>}
        </div>
      </div>
      <ChevronRight className="h-4 w-4 text-gray-300 shrink-0" />
    </button>
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
          {/* Statut UICN mondial — toujours annoté "mondiale" */}
          <StatusBadge status={occ.iucnStatus} />
          {/* Statuts territoriaux ALI (liste rouge régionale/nationale, protection…) */}
          {occ.aliStatuses && occ.aliStatuses.length > 0 && occ.aliStatuses.slice(0, 4).map((st, i) => {
            const toneClass =
              st.tone === "danger" ? "bg-red-100 text-red-700 border-red-200" :
              st.tone === "warn"   ? "bg-amber-100 text-amber-700 border-amber-200" :
              st.tone === "info"   ? "bg-blue-100 text-blue-700 border-blue-200" :
                                     "bg-gray-100 text-gray-600 border-gray-200";
            return (
              <span
                key={i}
                className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${toneClass}`}
                title={`${st.category}${st.scope ? ` — ${st.scope}` : ""} : ${st.label}`}
              >
                {st.value}{st.scope ? ` · ${st.scope}` : ""}
              </span>
            );
          })}
          {/* Badge patrimonialité (heuristique, si pas de données ALI ou tableau vide) */}
          {(!occ.aliStatuses || occ.aliStatuses.length === 0) && (() => {
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
              🇫🇷 Groupe protégé
            </span>
          )}
          {/* Habitat */}
          {occ.habitatType === "marine" && (
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-200">
              🌊 Marin
            </span>
          )}
          {taxonGroup && (
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
              {taxonGroup.icon} {taxonGroup.label}
            </span>
          )}
        </div>
        {/* Avertissements de cohérence */}
        {occ.enjeuWarnings && occ.enjeuWarnings.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {occ.enjeuWarnings.map((w, i) => (
              <span
                key={i}
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
          {error && <p className="text-[11px] text-red-500 py-1">Espèces indisponibles pour ce site.</p>}
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
              Espèces Natura 2000 attendues
            </span>
          </div>
          <div className="flex items-center gap-2">
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-600" />}
            {loaded && (
              <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-100 rounded-full px-2 py-0.5">
                {notObserved.length} non observée{notObserved.length > 1 ? "s" : ""}
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
            <p className="text-[11px] text-red-500">Espèces attendues indisponibles.</p>
          )}
          {loaded && !error && (
            <>
              <p className="text-[11px] text-gray-500 mb-2 leading-snug">
                Espèces justifiant le classement des {siteCount} site{siteCount > 1 ? "s" : ""} Natura 2000 proche
                {siteCount > 1 ? "s" : ""} (base EEA, France). Les espèces « non observées » ne figurent
                pas dans les résultats GBIF/iNaturalist mais sont attendues localement.
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
                        title={observed ? "Déjà observée dans l'inventaire" : "Attendue, non observée dans GBIF"}
                      >
                        {observed ? "observée" : "attendue"}
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
                {platform.links.map((link) => (
                  <a
                    key={link.url}
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
