import { useState, useRef } from "react";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Loader2, Zap, MapPin, ChevronDown, ChevronUp, Upload, X, FileArchive, Landmark } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { BufferCircle, STUDY_AREAS, PROJECT_PRESETS, ProjectPreset } from "@/lib/gbif";
import type { ProjectPolygon } from "@/lib/shapefile";

interface SearchPanelProps {
  onGoToPlace: (query: string) => void;
  onLaunchAnalysis: () => void;
  isSearching: boolean;
  isAnalyzing: boolean;
  circles: BufferCircle[];
  onToggleCircle: (id: string) => void;
  onRadiusChange: (id: string, radius: number) => void;
  activePresetId: string;
  onApplyPreset: (preset: ProjectPreset) => void;
  onShapefileLoad: (file: File) => void;
  onShapefileClear: () => void;
  projectPolygon: ProjectPolygon | null;
  isLoadingShapefile: boolean;
  onOpenLieuxDits: () => void;
}

export function SearchPanel({ 
  onGoToPlace, onLaunchAnalysis, isSearching, isAnalyzing, 
  circles, onToggleCircle, onRadiusChange,
  activePresetId, onApplyPreset,
  onShapefileLoad, onShapefileClear, projectPolygon, isLoadingShapefile,
  onOpenLieuxDits,
}: SearchPanelProps) {
  const [query, setQuery] = useState("");
  const [expandedCircle, setExpandedCircle] = useState<string | null>(null);
  const [showPresets, setShowPresets] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onShapefileLoad(file);
      e.target.value = "";
    }
  };

  const handleGoTo = () => {
    if (query.trim()) {
      onGoToPlace(query.trim());
    }
  };

  const enabledCount = circles.filter(c => c.enabled).length;
  const activePreset = PROJECT_PRESETS.find(p => p.id === activePresetId);

  return (
    <motion.div 
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="absolute top-6 left-1/2 -translate-x-1/2 z-[1000] w-[90%] max-w-md"
    >
      <div className="glass-panel p-4 rounded-xl flex flex-col gap-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Lieu, commune, adresse..." 
              className="pl-9 bg-white/50 border-0 focus-visible:ring-1 focus-visible:ring-primary/50"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleGoTo()}
              data-testid="input-search"
            />
          </div>
          <Button 
            variant="secondary"
            onClick={handleGoTo}
            disabled={isSearching || !query.trim()}
            className="font-medium shadow-sm transition-all gap-2"
            data-testid="button-goto"
          >
            {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
            Aller à
          </Button>
        </div>

        <button
          type="button"
          onClick={onOpenLieuxDits}
          className="flex items-center justify-center gap-2 text-xs text-gray-700 hover:text-teal-700 bg-white/50 hover:bg-white border border-dashed border-gray-300 hover:border-teal-400 rounded-lg py-2 transition-colors"
          data-testid="button-open-lieux-dits"
        >
          <Landmark className="h-3.5 w-3.5" />
          Rechercher un lieu-dit ou une commune comme emprise
        </button>

        <div className="space-y-1">
          <input
            ref={fileInputRef}
            type="file"
            accept=".zip"
            onChange={handleFileChange}
            className="hidden"
            data-testid="input-shapefile"
          />
          {projectPolygon ? (
            <div className="flex items-center gap-2 bg-teal-50 rounded-lg px-2.5 py-2 ring-1 ring-teal-200">
              <FileArchive className="h-4 w-4 text-teal-600 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-teal-800 truncate">{projectPolygon.name}</div>
                <div className="text-[10px] text-teal-600">{projectPolygon.geojson.features.length} entité(s) — centroïde utilisé</div>
              </div>
              <button
                type="button"
                onClick={onShapefileClear}
                className="p-1 hover:bg-teal-100 rounded transition-colors flex-shrink-0"
                aria-label="Supprimer le shapefile"
                data-testid="button-clear-shapefile"
              >
                <X className="h-3.5 w-3.5 text-teal-600" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoadingShapefile}
              className="w-full flex items-center justify-center gap-2 text-xs py-2 rounded-lg border border-dashed border-gray-300 text-muted-foreground hover:border-teal-400 hover:text-teal-700 hover:bg-teal-50/50 transition-all"
              data-testid="button-upload-shapefile"
            >
              {isLoadingShapefile ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Upload className="h-3.5 w-3.5" />
              )}
              {isLoadingShapefile ? "Chargement…" : "Charger un shapefile (.zip)"}
            </button>
          )}
        </div>

        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setShowPresets(!showPresets)}
            className="w-full flex items-center justify-between text-xs font-medium text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors"
            data-testid="button-toggle-presets"
          >
            <div className="flex items-center gap-1.5">
              <span>Type de projet</span>
              {activePreset && (
                <span className={`normal-case tracking-normal px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                  activePreset.id === "custom" 
                    ? 'bg-gray-100 text-gray-500' 
                    : 'bg-teal-100 text-teal-700'
                }`}>
                  {activePreset.icon} {activePreset.label}
                </span>
              )}
            </div>
            {showPresets 
              ? <ChevronUp className="h-3 w-3" /> 
              : <ChevronDown className="h-3 w-3" />
            }
          </button>

          <AnimatePresence>
            {showPresets && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="grid grid-cols-2 gap-1.5 pb-2">
                  {PROJECT_PRESETS.filter(p => p.id !== "custom").map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => {
                        onApplyPreset(preset);
                        setShowPresets(false);
                      }}
                      className={`text-left px-2.5 py-2 rounded-lg transition-all text-xs ${
                        activePresetId === preset.id
                          ? 'bg-teal-50 ring-1 ring-teal-300 shadow-sm'
                          : 'bg-white/50 hover:bg-white/80 ring-1 ring-black/5'
                      }`}
                      data-testid={`preset-${preset.id}`}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm">{preset.icon}</span>
                        <span className={`font-semibold ${activePresetId === preset.id ? 'text-teal-800' : 'text-gray-800'}`}>
                          {preset.label}
                        </span>
                      </div>
                      <p className={`text-[10px] mt-0.5 leading-tight ${activePresetId === preset.id ? 'text-teal-600' : 'text-gray-400'}`}>
                        {preset.description}
                      </p>
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Aires d'étude ({enabledCount}/{circles.length} actives)
          </div>

          <div className="space-y-1.5">
            {circles.map((circle) => {
              const studyArea = STUDY_AREAS.find(a => a.id === circle.id);
              const color = studyArea?.color || "#0d9488";
              const isExpanded = expandedCircle === circle.id;

              return (
                <div key={circle.id}>
                  <div
                    className={`flex items-center gap-2 rounded-lg px-2.5 py-2 cursor-pointer transition-all ${
                      circle.enabled 
                        ? 'bg-white/80 shadow-sm ring-1 ring-black/5' 
                        : 'bg-white/30 hover:bg-white/40 opacity-60'
                    }`}
                    data-testid={`circle-item-${circle.id}`}
                  >
                    <button
                      onClick={() => onToggleCircle(circle.id)}
                      className="flex-shrink-0"
                      data-testid={`toggle-circle-${circle.id}`}
                    >
                      <div 
                        className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-all`}
                        style={{ 
                          borderColor: color,
                          backgroundColor: circle.enabled ? color : 'transparent' 
                        }}
                      >
                        {circle.enabled && (
                          <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                    </button>

                    <div 
                      className="flex-1 min-w-0 flex items-center gap-2"
                      onClick={() => setExpandedCircle(isExpanded ? null : circle.id)}
                    >
                      <div
                        className="w-5 h-0 flex-shrink-0"
                        style={{ 
                          borderTop: `2px ${studyArea?.dashArray ? 'dashed' : 'solid'} ${color}`,
                        }}
                      />
                      <span className="text-xs font-medium flex-1 truncate">
                        {circle.label}
                      </span>
                      <span className="text-[10px] text-muted-foreground font-mono flex-shrink-0">
                        {circle.radius >= 1000 
                          ? `${(circle.radius/1000).toFixed(1)} km` 
                          : `${circle.radius} m`
                        }
                      </span>
                      {circle.enabled && (
                        isExpanded 
                          ? <ChevronUp className="h-3 w-3 text-muted-foreground flex-shrink-0" /> 
                          : <ChevronDown className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                      )}
                    </div>
                  </div>

                  <AnimatePresence>
                    {isExpanded && circle.enabled && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="px-3 py-2 ml-6">
                          <div className="flex justify-between text-[10px] text-muted-foreground mb-1.5">
                            <span>Rayon</span>
                            <span className="font-mono font-bold">
                              {circle.radius >= 1000 
                                ? `${(circle.radius/1000).toFixed(1)} km` 
                                : `${circle.radius} m`
                              }
                            </span>
                          </div>
                          <Slider 
                            value={[circle.radius]} 
                            onValueChange={(vals) => onRadiusChange(circle.id, vals[0])} 
                            max={circle.id === "eloignee" ? 15000 : circle.id === "rapprochee" ? 5000 : 2000} 
                            min={100} 
                            step={100}
                            className="cursor-pointer"
                            data-testid={`slider-radius-${circle.id}`}
                          />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        </div>

        <div className="pt-1">
          <Button 
            onClick={() => onLaunchAnalysis()}
            disabled={isAnalyzing || enabledCount === 0}
            className="w-full bg-primary hover:bg-primary/90 text-white font-bold h-11 shadow-md transition-all flex items-center justify-center gap-2 text-base"
            data-testid="button-launch-analysis"
          >
            {isAnalyzing ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <>
                <Zap className="h-4 w-4 fill-current" />
                Lancer l'inventaire flash
              </>
            )}
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
