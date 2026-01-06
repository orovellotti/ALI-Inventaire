import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { X, Download, FileText, AlertTriangle, Leaf, Info, ChevronDown, ChevronUp, ImageOff, Copy, Check, ExternalLink, BookOpen, Shield, MapPin, Tag, Calendar, Link, Flag, Layers } from "lucide-react";
import { InventoryResult, Occurrence, getIucnLabel, ConfidenceScore } from "@/lib/gbif";
import html2canvas from "html2canvas";

interface ResultsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  results: InventoryResult | null;
  selectedSpecies: string | null;
  onSelectSpecies: (species: string | null) => void;
}

export function ResultsPanel({ isOpen, onClose, results, selectedSpecies, onSelectSpecies }: ResultsPanelProps) {
  const [showMedium, setShowMedium] = useState(false);
  const [showLow, setShowLow] = useState(false);
  const [showReportPreview, setShowReportPreview] = useState(false);
  const [copied, setCopied] = useState(false);

  const sortedSpecies = useMemo(() => {
    if (!results) return { high: [], medium: [], low: [] };
    
    const uniqueMap = new Map<string, Occurrence>();
    results.occurrences.forEach((occ) => {
      const existing = uniqueMap.get(occ.scientificName);
      if (!existing || getAlertPriority(occ.alertLevel) > getAlertPriority(existing.alertLevel)) {
        uniqueMap.set(occ.scientificName, occ);
      }
    });

    const unique = Array.from(uniqueMap.values());
    
    return {
      high: unique.filter(o => o.alertLevel === "high"),
      medium: unique.filter(o => o.alertLevel === "medium"),
      low: unique.filter(o => o.alertLevel === "low"),
    };
  }, [results]);

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

    return `INVENTAIRE FLASH
Date: ${new Date().toLocaleDateString()}
Centre: ${results.center[0].toFixed(5)}, ${results.center[1].toFixed(5)}
Rayon: ${results.radius}m

INDICE DE CONFIANCE GBIF: ${conf.total}/100 (${confLabel})
- Qualité géographique: ${conf.geo}%
- Qualité taxonomique: ${conf.tax}%
- Fraîcheur temporelle: ${conf.time}%
- Traçabilité: ${conf.trace}%
- Flags GBIF: ${conf.issues}%
- Redondance: ${conf.dup}%
${conf.message}

RÉSULTATS
Total espèces dans le rapport: ${totalInReport}
Espèces sensibles (forts + moyens): ${highCount + mediumCount}

ENJEUX FORTS (${highCount} espèces)
${highList}

ENJEUX MOYENS (${mediumCount} espèces)
${mediumList}

ENJEUX FAIBLES (${lowCount} espèces)
${lowList}

Note: Cet inventaire flash repose sur les données GBIF et les statuts IUCN. Il fournit une indication rapide et ne constitue pas une preuve d'absence ni un inventaire terrain.`;
  }, [results, sortedSpecies]);

  const handleCopyReport = () => {
    navigator.clipboard.writeText(reportText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isOpen || !results) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", damping: 25, stiffness: 200 }}
        className="fixed top-0 right-0 h-full w-[420px] z-[2000] bg-white/95 backdrop-blur-xl shadow-2xl border-l border-white/20 flex flex-col"
      >
        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-white/50">
          <div>
            <h2 className="text-xl font-bold text-gray-900 tracking-tight">Inventaire Flash</h2>
            <p className="text-xs text-muted-foreground mt-1 font-mono">
              GBIF DATA • {results.stats.speciesCount} ESPÈCES
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="hover:bg-gray-100 rounded-full h-8 w-8">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <ScrollArea className="flex-1 p-6">
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-teal-50/50 rounded-xl border border-teal-100">
                <div className="flex items-center gap-2 text-teal-700 mb-1">
                  <Leaf className="h-4 w-4" />
                  <span className="text-xs font-bold uppercase">Espèces</span>
                </div>
                <span className="text-2xl font-bold text-gray-900">{results.stats.speciesCount}</span>
              </div>
              <div className="p-4 bg-orange-50/50 rounded-xl border border-orange-100">
                <div className="flex items-center gap-2 text-orange-700 mb-1">
                  <AlertTriangle className="h-4 w-4" />
                  <span className="text-xs font-bold uppercase">Sensibles</span>
                </div>
                <span className="text-2xl font-bold text-gray-900">{results.stats.sensitiveCount}</span>
              </div>
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

            <div className="p-4 bg-gray-50 rounded-xl text-xs text-gray-500 leading-relaxed border border-gray-100 flex gap-3">
              <Info className="h-4 w-4 shrink-0 mt-0.5 text-gray-400" />
              <p>
                Cet inventaire flash repose sur les données GBIF et les statuts IUCN. 
                Il fournit une indication rapide et ne constitue pas une preuve d'absence ni un inventaire terrain complet.
              </p>
            </div>
          </div>
        </ScrollArea>

        <div className="p-6 border-t border-gray-100 bg-white/50 space-y-3">
          <Button onClick={() => setShowReportPreview(true)} variant="outline" className="w-full justify-start gap-2 h-11 border-gray-200 hover:bg-gray-50 hover:text-gray-900 text-gray-600">
            <FileText className="h-4 w-4" />
            Voir le rapport texte
          </Button>
          <Button onClick={handleExportImage} className="w-full justify-start gap-2 h-11 bg-gray-900 hover:bg-black text-white">
            <Download className="h-4 w-4" />
            Exporter la carte (JPG)
          </Button>
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
          <ScrollArea className="flex-1 mt-4 h-[50vh] overflow-auto">
            <pre className="text-sm font-mono whitespace-pre-wrap bg-gray-50 p-4 rounded-lg border border-gray-200 text-gray-700">
              {reportText}
            </pre>
          </ScrollArea>
          <div className="flex justify-end gap-2 mt-4 pt-4 border-t">
            <Button variant="outline" onClick={() => setShowReportPreview(false)}>
              Fermer
            </Button>
            <Button onClick={handleCopyReport} className="gap-2">
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copié !" : "Copier"}
            </Button>
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
              href={wikiUrl} 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 hover:bg-blue-200 transition-colors"
              title="Voir sur Wikipédia"
              onClick={(e) => e.stopPropagation()}
            >
              <BookOpen className="h-3.5 w-3.5" />
              <span>Wiki</span>
            </a>
            {gbifUrl && (
              <a 
                href={gbifUrl} 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-teal-100 text-teal-700 hover:bg-teal-200 transition-colors"
                title="Voir sur GBIF"
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLink className="h-3.5 w-3.5" />
                <span>GBIF</span>
              </a>
            )}
          </div>
        </div>
        <div className="text-xs text-muted-foreground italic truncate">
          {occ.vernacularName || "Nom vernaculaire N/A"}
        </div>
        <div className="mt-1.5 flex flex-wrap gap-1">
          <StatusBadge status={occ.iucnStatus} />
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
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            <span className="font-bold text-sm">Indice de Confiance</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold">{confidence.total}</span>
            <span className="text-sm">/100</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-white/50 font-medium">
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
