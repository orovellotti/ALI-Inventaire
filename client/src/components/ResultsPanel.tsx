import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { X, Download, FileText, AlertTriangle, Leaf, Info } from "lucide-react";
import { InventoryResult, Occurrence } from "@/lib/gbif";
import html2canvas from "html2canvas";

interface ResultsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  results: InventoryResult | null;
}

export function ResultsPanel({ isOpen, onClose, results }: ResultsPanelProps) {
  
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

  const handleExportText = () => {
    if (!results) return;
    const text = `INVENTAIRE FLASH
Date: ${new Date().toLocaleDateString()}
Centre: ${results.center[0].toFixed(5)}, ${results.center[1].toFixed(5)}
Rayon: ${results.radius}m

RÉSULTATS
Total occurrences: ${results.stats.total}
Espèces uniques: ${results.stats.speciesCount}
Espèces sensibles: ${results.stats.sensitiveCount}

ESPÈCES DOMINANTES
${results.occurrences.slice(0, 10).map(o => `- ${o.scientificName} (${o.vernacularName || 'N/A'}) [${o.alertLevel}]`).join('\n')}

Note: Cet inventaire flash repose sur les données GBIF. Il fournit une indication rapide et ne constitue pas une preuve d’absence ni un inventaire terrain.`;
    
    navigator.clipboard.writeText(text);
    alert("Rapport copié dans le presse-papier !");
  };

  return (
    <AnimatePresence>
      {isOpen && results && (
        <motion.div
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={{ type: "spring", damping: 25, stiffness: 200 }}
          className="fixed top-0 right-0 h-full w-[400px] z-[2000] bg-white/95 backdrop-blur-xl shadow-2xl border-l border-white/20 flex flex-col"
        >
          {/* Header */}
          <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-white/50">
            <div>
              <h2 className="text-xl font-bold text-gray-900 tracking-tight">Inventaire Flash</h2>
              <p className="text-xs text-muted-foreground mt-1 font-mono">
                GBIF DATA • {results.stats.total} OCCURRENCES
              </p>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose} className="hover:bg-gray-100 rounded-full h-8 w-8">
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Content */}
          <ScrollArea className="flex-1 p-6">
            <div className="space-y-8">
              {/* Stats Grid */}
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

              {/* Species List */}
              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-4 uppercase tracking-wide">Espèces détectées</h3>
                <div className="space-y-3">
                  {results.occurrences.slice(0, 15).map((occ) => (
                    <div key={occ.key} className="flex items-start justify-between group p-2 hover:bg-gray-50 rounded-lg transition-colors border border-transparent hover:border-gray-100">
                      <div>
                        <div className="font-medium text-sm text-gray-900">{occ.scientificName}</div>
                        <div className="text-xs text-muted-foreground italic">{occ.vernacularName || "Nom vernaculaire N/A"}</div>
                      </div>
                      <Badge level={occ.alertLevel} />
                    </div>
                  ))}
                  {results.occurrences.length > 15 && (
                    <p className="text-xs text-center text-muted-foreground mt-4 italic">
                      + {results.occurrences.length - 15} autres occurrences...
                    </p>
                  )}
                </div>
              </div>

              {/* Disclaimer */}
              <div className="p-4 bg-gray-50 rounded-xl text-xs text-gray-500 leading-relaxed border border-gray-100 flex gap-3">
                <Info className="h-4 w-4 shrink-0 mt-0.5 text-gray-400" />
                <p>
                  Cet inventaire flash repose sur les données GBIF. 
                  Il fournit une indication rapide et ne constitue pas une preuve d’absence ni un inventaire terrain complet.
                </p>
              </div>
            </div>
          </ScrollArea>

          {/* Footer Actions */}
          <div className="p-6 border-t border-gray-100 bg-white/50 space-y-3">
            <Button onClick={handleExportText} variant="outline" className="w-full justify-start gap-2 h-11 border-gray-200 hover:bg-gray-50 hover:text-gray-900 text-gray-600">
              <FileText className="h-4 w-4" />
              Copier le rapport texte
            </Button>
            <Button onClick={handleExportImage} className="w-full justify-start gap-2 h-11 bg-gray-900 hover:bg-black text-white">
              <Download className="h-4 w-4" />
              Exporter la carte (JPG)
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Badge({ level }: { level: "high" | "medium" | "low" }) {
  const styles = {
    high: "bg-red-100 text-red-700 border-red-200",
    medium: "bg-orange-100 text-orange-700 border-orange-200",
    low: "bg-green-100 text-green-700 border-green-200"
  };

  const labels = {
    high: "Fort",
    medium: "Moyen",
    low: "Faible"
  };

  return (
    <span className={`text-[10px] font-bold px-2 py-1 rounded-full border ${styles[level]}`}>
      {labels[level]}
    </span>
  );
}
