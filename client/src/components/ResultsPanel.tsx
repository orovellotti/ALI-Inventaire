import { useState, useMemo, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { X, Download, FileText, AlertTriangle, Leaf, Info, ChevronDown, ChevronUp, ImageOff, Copy, Check, ExternalLink, BookOpen, Shield, MapPin, Tag, Calendar, Link, Flag, Layers, Filter, Table, Sparkles, Loader2, Share2, Mail, MoreHorizontal, Settings2 } from "lucide-react";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuCheckboxItem } from "@/components/ui/dropdown-menu";
import { InventoryResult, Occurrence, getIucnLabel, getPatrimonialite, ConfidenceScore, TAXON_GROUPS, getTaxonGroupId, isMarineSpecies } from "@/lib/gbif";
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
  const [showMedium, setShowMedium] = useState(false);
  const [showLow, setShowLow] = useState(false);
  const [showReportPreview, setShowReportPreview] = useState(false);
  const [copied, setCopied] = useState(false);
  const [reformattedReport, setReformattedReport] = useState<string | null>(null);
  const [reformatting, setReformatting] = useState(false);
  const [reformatError, setReformatError] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(true);
  const [aiAnalysis, setAiAnalysis] = useState<{ species: { scientificName: string; vernacularName?: string; group: string; level: string; reason: string; sources?: string[]; inInventory?: boolean; evidenceClass?: string; evidenceLabel?: string; score?: number; scoreLabel?: string }[]; natura2000?: { type: string; name: string; url: string | null; code?: string | null; species?: { name: string; designating: boolean; grade?: string | null }[]; habitats?: { code: string; description: string; cover: number | null }[] }[]; generatedAt: string } | null>(null);
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
    for (const occ of uniqueMap.values()) {
      const groupId = getTaxonGroupId(occ);
      counts.set(groupId, (counts.get(groupId) || 0) + 1);
    }
    return counts;
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
    if (!results) return { high: [], medium: [], low: [] };
    
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
    
    const highList = sortedSpecies.high.length > 0 
      ? sortedSpecies.high.map(o => `- ${o.scientificName} (${o.vernacularName || 'N/A'}) - ${getIucnLabel(o.iucnStatus)}`).join('\n')
      : 'Aucune';
    
    const mediumList = sortedSpecies.medium.length > 0
      ? sortedSpecies.medium.map(o => `- ${o.scientificName} (${o.vernacularName || 'N/A'}) - ${getIucnLabel(o.iucnStatus)}`).join('\n')
      : 'Aucune';
    
    const lowList = sortedSpecies.low.length > 0
      ? sortedSpecies.low.map(o => `- ${o.scientificName} (${o.vernacularName || 'N/A'}) - ${getIucnLabel(o.iucnStatus)}`).join('\n')
      : 'Aucune';

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
      `• ${o.scientificName}${o.vernacularName ? ` — ${o.vernacularName}` : ""} (${getIucnLabel(o.iucnStatus)})`;

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
${totalInReport} espèces recensées (GBIF + iNaturalist)
${highCount + mediumCount} espèces sensibles (enjeux forts ou moyens)
Indice de confiance des données : ${conf.total}/100 — ${confLabel}
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
   ${sp.group}${typeof sp.score === "number" ? ` • Enjeu ${sp.score}/100${sp.scoreLabel ? ` (${sp.scoreLabel})` : ""}` : ` • Niveau : ${sp.level}`}${sp.inInventory === false ? " • hors inventaire (suggestion IA)" : ""}
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
  }, [results, sortedSpecies, activeTaxonFilters, presentGroups, isAllActive, aiAnalysis, toponym, zonages]);

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

  if (!isOpen || !results) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", damping: 25, stiffness: 200 }}
        className="fixed top-0 right-0 h-full max-w-[95vw] z-[2000] bg-white/95 backdrop-blur-xl shadow-2xl border-l border-white/20 flex flex-col"
        style={{ width: panelWidth }}
      >
        <div
          onMouseDown={startResize}
          onDoubleClick={() => { setPanelWidth(600); try { localStorage.setItem("resultsPanelWidth", "600"); window.dispatchEvent(new CustomEvent("if:panel-width-changed")); } catch {} }}
          title="Glisser pour redimensionner — double-clic pour réinitialiser"
          className="absolute top-0 left-0 h-full w-1.5 -ml-0.5 cursor-ew-resize z-10 hover:bg-teal-400/40 active:bg-teal-500/60 transition-colors"
          data-testid="handle-resize-panel"
        />
        <div className="px-5 pt-4 pb-3 border-b border-gray-100 bg-white/50">
          <div className="flex justify-between items-start gap-2">
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-gray-900 tracking-tight truncate">Inventaire Flash</h2>
              <div className="flex items-center gap-3 mt-1 text-xs">
                <span className="flex items-center gap-1 text-teal-700 font-semibold">
                  <Leaf className="h-3.5 w-3.5" />
                  {filteredTotal} <span className="font-normal text-gray-500">espèces</span>
                </span>
                <span className="flex items-center gap-1 text-orange-700 font-semibold">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {sortedSpecies.high.length + sortedSpecies.medium.length} <span className="font-normal text-gray-500">sensibles</span>
                </span>
                <span className="text-[10px] uppercase tracking-wider text-gray-400 font-mono">
                  {includeINaturalist ? "GBIF+iNat" : "GBIF"}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
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

        <ScrollArea className="flex-1 px-5 py-4">
          <div className="space-y-4">
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
                  {showFilters
                    ? <ChevronUp className="h-4 w-4 text-gray-400" />
                    : <ChevronDown className="h-4 w-4 text-gray-400" />
                  }
                </div>
              </button>

              <AnimatePresence>
                {showFilters && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="px-4 pb-3 space-y-2">
                      <button
                        type="button"
                        onClick={() => onToggleAllTaxonFilters(presentGroups.map(g => g.id))}
                        className="text-[10px] font-semibold text-teal-600 hover:text-teal-800 transition-colors uppercase tracking-wider"
                        data-testid="button-toggle-all-taxons"
                      >
                        {isAllActive ? "Tout désélectionner" : "Tout sélectionner"}
                      </button>
                      <div className="flex flex-wrap gap-1.5">
                        {presentGroups.map(group => {
                          const count = taxonCounts.get(group.id) || 0;
                          const isActive = activeTaxonFilters.has(group.id);
                          return (
                            <button
                              key={group.id}
                              type="button"
                              onClick={() => onToggleTaxonFilter(group.id)}
                              className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-all ${
                                isActive
                                  ? 'bg-teal-100 text-teal-800 ring-1 ring-teal-300 shadow-sm'
                                  : 'bg-white text-gray-400 ring-1 ring-gray-200 hover:bg-gray-50'
                              }`}
                              data-testid={`taxon-filter-${group.id}`}
                            >
                              <span>{group.icon}</span>
                              <span>{group.label}</span>
                              <span className={`text-[10px] ml-0.5 ${isActive ? 'text-teal-600' : 'text-gray-300'}`}>
                                {count}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <ConfidencePanel confidence={results.confidence} />

            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-3 h-3 rounded-full bg-red-500"></div>
                <h3 className="text-sm font-bold text-red-700 uppercase tracking-wide">
                  Enjeux Forts ({sortedSpecies.high.length})
                </h3>
              </div>
              {sortedSpecies.high.length > 0 ? (
                <div className="space-y-2 bg-red-50/50 rounded-xl p-3 border border-red-100">
                  {sortedSpecies.high.map((occ, idx) => (
                    <SpeciesCard 
                      key={`high-${occ.scientificName}-${idx}`} 
                      occ={occ} 
                      isSelected={selectedSpecies === occ.scientificName}
                      onSelect={() => onSelectSpecies(selectedSpecies === occ.scientificName ? null : occ.scientificName)}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400 italic pl-5">Aucune espèce à enjeu fort détectée</p>
              )}
            </div>

            <div>
              <button 
                onClick={() => setShowMedium(!showMedium)}
                className="flex items-center justify-between w-full group cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-orange-500"></div>
                  <h3 className="text-sm font-bold text-orange-700 uppercase tracking-wide">
                    Enjeux Moyens ({sortedSpecies.medium.length})
                  </h3>
                </div>
                {showMedium ? (
                  <ChevronUp className="h-4 w-4 text-orange-500" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-orange-500" />
                )}
              </button>
              {showMedium && (
                <div className="mt-3">
                  {sortedSpecies.medium.length > 0 ? (
                    <div className="space-y-2 bg-orange-50/50 rounded-xl p-3 border border-orange-100">
                      {sortedSpecies.medium.map((occ, idx) => (
                        <SpeciesCard 
                          key={`medium-${occ.scientificName}-${idx}`} 
                          occ={occ}
                          isSelected={selectedSpecies === occ.scientificName}
                          onSelect={() => onSelectSpecies(selectedSpecies === occ.scientificName ? null : occ.scientificName)}
                        />
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400 italic pl-5">Aucune espèce à enjeu moyen détectée</p>
                  )}
                </div>
              )}
            </div>

            <div>
              <button 
                onClick={() => setShowLow(!showLow)}
                className="flex items-center justify-between w-full group cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-green-500"></div>
                  <h3 className="text-sm font-bold text-green-700 uppercase tracking-wide">
                    Enjeux Faibles ({sortedSpecies.low.length})
                  </h3>
                </div>
                {showLow ? (
                  <ChevronUp className="h-4 w-4 text-green-500" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-green-500" />
                )}
              </button>
              {showLow && (
                <div className="mt-3">
                  {sortedSpecies.low.length > 0 ? (
                    <div className="space-y-2 bg-green-50/50 rounded-xl p-3 border border-green-100">
                      {sortedSpecies.low.map((occ, idx) => (
                        <SpeciesCard 
                          key={`low-${occ.scientificName}-${idx}`} 
                          occ={occ}
                          isSelected={selectedSpecies === occ.scientificName}
                          onSelect={() => onSelectSpecies(selectedSpecies === occ.scientificName ? null : occ.scientificName)}
                        />
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400 italic pl-5">Aucune espèce à enjeu faible détectée</p>
                  )}
                </div>
              )}
            </div>

            <Natura2000ExpectedPanel
              center={results.center}
              radius={results.radius}
              observedNames={observedNames}
            />

            <PrioritySpeciesInline
              toponym={toponym || `Point ${results.center[0].toFixed(4)}, ${results.center[1].toFixed(4)}`}
              coords={results.center}
              occurrences={allFilteredSpecies}
              onAnalysisChange={setAiAnalysis}
            />

            <ZonagesPanel data={zonages} loading={zonagesLoading} />

            <SINPPanel center={results.center} />

            <p className="px-1 text-[11px] text-gray-400 leading-snug flex gap-1.5 items-start">
              <Info className="h-3 w-3 shrink-0 mt-0.5" />
              Indication rapide basée sur GBIF, iNaturalist et UICN — ne remplace pas un inventaire terrain.
            </p>
          </div>
        </ScrollArea>

        <div className="px-5 py-3 border-t border-gray-100 bg-white/50 flex items-center gap-2">
          <Button
            onClick={() => setShowReportPreview(true)}
            className="flex-1 justify-center gap-2 h-11 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white text-sm font-semibold shadow-md hover:shadow-lg ring-1 ring-indigo-500/30 transition-all"
            data-testid="button-report-text"
          >
            <FileText className="h-4 w-4" />
            Rapport texte
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
              Rapport d'inventaire
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

function SpeciesCard({ occ, isSelected, onSelect }: { occ: Occurrence; isSelected: boolean; onSelect: () => void }) {
  const [imageError, setImageError] = useState(false);
  const gbifUrl = occ.taxonKey ? `https://www.gbif.org/species/${occ.taxonKey}` : null;
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
          <StatusBadge status={occ.iucnStatus} />
          {(() => {
            const patri = getPatrimonialite(occ.iucnStatus, occ.alertLevel);
            return (
              <span
                className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${patri.color}`}
                title="Score de patrimonialité (fondé sur le statut UICN et la priorité française)"
                data-testid={`badge-patrimonialite-${occ.scientificName}`}
              >
                Patrimonialité : {patri.label}
              </span>
            );
          })()}
          {occ.frenchProtected && (
            <span
              className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 border border-orange-200"
              title="Espèce appartenant à un groupe protégé ou patrimonial en France (protection nationale, Directive Habitats/Oiseaux, ZNIEFF déterminante). Signalée comme enjeu même si l'UICN mondiale ne l'a pas évaluée."
              data-testid={`badge-french-protected-${occ.scientificName}`}
            >
              🇫🇷 Protégé en France
            </span>
          )}
          {taxonGroup && (
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
              {taxonGroup.icon} {taxonGroup.label}
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
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${getStatusStyle()}`}>
      {label}
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

function ZonagesPanel({ data, loading }: { data: ZonagesData | null; loading: boolean }) {
  const [expanded, setExpanded] = useState(true);

  if (loading) {
    return (
      <div className="rounded-xl border border-teal-200 bg-teal-50/50 p-4 flex items-center gap-2 text-sm text-teal-700">
        <Loader2 className="h-4 w-4 animate-spin" />
        Recherche des zonages environnementaux…
      </div>
    );
  }

  if (!data || data.count === 0) return null;

  return (
    <div className="rounded-xl border border-teal-200 bg-teal-50/50 p-4" data-testid="panel-zonages">
      <button onClick={() => setExpanded(!expanded)} className="w-full" data-testid="button-toggle-zonages">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-teal-600" />
            <span className="font-bold text-sm text-teal-700">Zonages environnementaux</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-teal-500 bg-teal-100 px-2 py-0.5 rounded-full" data-testid="text-zonages-count">
              {data.count} zonage{data.count > 1 ? "s" : ""}
            </span>
            {expanded ? <ChevronUp className="h-4 w-4 text-teal-500" /> : <ChevronDown className="h-4 w-4 text-teal-500" />}
          </div>
        </div>
      </button>

      {expanded && (
        <div className="mt-3 space-y-3">
          <p className="text-xs text-teal-600/70">
            Zonages officiels intersectant l'aire d'étude (rayon {data.radius} m) — source IGN Géoplateforme / INPN (PatriNat) :
          </p>
          {data.groups.map((group) => {
            const s = ZONAGE_CATEGORY_STYLES[group.category] || ZONAGE_CATEGORY_STYLES.autre;
            return (
              <div key={group.category} className={`bg-white/70 rounded-lg p-3 border ${s.border}`}>
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-xs font-bold ${s.text}`}>{group.label}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${s.badge}`}>{group.count}</span>
                </div>
                <div className="space-y-1.5">
                  {group.zonages.map((z, i) => {
                    const href = safeHttpUrl(z.url);
                    const showSpecies = group.category === "natura2000" && !!z.code;
                    return (
                      <div key={`${z.id || z.code || z.name}-${i}`}>
                        {href ? (
                          <a
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`flex items-start gap-2 text-xs ${s.text} ${s.hover} rounded px-2 py-1.5 transition-colors`}
                            data-testid={`zonage-link-${group.category}-${i}`}
                          >
                            <ExternalLink className="h-3 w-3 flex-shrink-0 mt-0.5" />
                            <span>
                              <span className="font-semibold">{z.type}</span> — {z.name}
                            </span>
                          </a>
                        ) : (
                          <div
                            className={`flex items-start gap-2 text-xs ${s.text} px-2 py-1.5`}
                            data-testid={`zonage-item-${group.category}-${i}`}
                          >
                            <Shield className="h-3 w-3 flex-shrink-0 mt-0.5" />
                            <span>
                              <span className="font-semibold">{z.type}</span> — {z.name}
                            </span>
                          </div>
                        )}
                        {showSpecies && <NaturaSpeciesList code={z.code!} index={i} />}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
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
        Espèces désignatrices (grade A/B/C/D)
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
                Espèces désignatrices des {siteCount} site{siteCount > 1 ? "s" : ""} Natura 2000 proche
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
