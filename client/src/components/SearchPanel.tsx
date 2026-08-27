import { useState, useRef } from "react";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Search, Loader2, Zap, ChevronDown, ChevronUp, Upload, X,
  FileArchive, Landmark, Plus, Settings2, MapPin, Target,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { BufferCircle, STUDY_AREAS, PROJECT_PRESETS, ProjectPreset } from "@/lib/gbif";
import type { ProjectPolygon } from "@/lib/shapefile";

interface SearchPanelProps {
  embedded?: boolean;
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
  isCollapsed?: boolean;
  onExpand?: () => void;
}

export function SearchPanel({
  embedded = false,
  onGoToPlace, onLaunchAnalysis, isSearching, isAnalyzing,
  circles, onToggleCircle, onRadiusChange,
  activePresetId, onApplyPreset,
  onShapefileLoad, onShapefileClear, projectPolygon, isLoadingShapefile,
  onOpenLieuxDits,
  isCollapsed = false,
  onExpand,
}: SearchPanelProps) {
  const [query, setQuery] = useState("");
  const [expandedCircle, setExpandedCircle] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (isCollapsed) {
    return (
      <motion.div
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className={embedded ? "w-full" : "absolute top-6 left-1/2 -translate-x-1/2 z-[1000]"}
      >
        <button
          type="button"
          onClick={onExpand}
          className={embedded
            ? "w-full flex items-center gap-2 px-4 py-2 rounded-xl border border-black/5 bg-white/80 shadow-sm text-sm font-medium text-gray-700 hover:text-teal-700 transition-all"
            : "glass-panel flex items-center gap-2 px-4 py-2 rounded-full shadow-md text-sm font-medium text-gray-700 hover:text-teal-700 hover:shadow-lg transition-all"}
          data-testid="button-expand-search"
        >
          <Search className="h-4 w-4" />
          Modifier la recherche
          <ChevronDown className="h-4 w-4" />
        </button>
      </motion.div>
    );
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onShapefileLoad(file);
      e.target.value = "";
    }
  };

  const handleGoTo = () => {
    if (query.trim()) onGoToPlace(query.trim());
  };

  const enabledCount = circles.filter(c => c.enabled).length;
  const activePreset = PROJECT_PRESETS.find(p => p.id === activePresetId);
  const enabledCircles = circles.filter(c => c.enabled);

  const formatRadius = (r: number) =>
    r >= 1000 ? `${(r / 1000).toFixed(r % 1000 === 0 ? 0 : 1)} km` : `${r} m`;

  return (
    <motion.div
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className={embedded ? "w-full" : "absolute top-6 left-1/2 -translate-x-1/2 z-[1000] w-[92%] max-w-md"}
    >
      <div className={embedded
        ? "search-text-mode w-full bg-white py-2 flex flex-col gap-4"
        : "glass-panel p-3 rounded-2xl flex flex-col gap-2.5"}>
        {embedded && (
          <div className="flex items-center gap-2 text-sm font-bold">
            <Search className="h-4 w-4" aria-hidden="true" />
            Votre demande
          </div>
        )}

        {/* === Étape 1 : Localisation === */}
        <div className="relative flex items-center gap-1.5 bg-white/70 rounded-xl ring-1 ring-black/5 focus-within:ring-2 focus-within:ring-teal-400 transition-all pl-3 pr-1.5 py-1">
          <Search className="h-4 w-4 text-gray-400 shrink-0" />
          <Input
            placeholder="Lieu, commune, adresse…"
            className="border-0 bg-transparent shadow-none focus-visible:ring-0 px-1 h-9 text-sm"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleGoTo()}
            data-testid="input-search"
          />

          <Popover open={moreOpen} onOpenChange={setMoreOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="p-1.5 rounded-lg text-gray-500 hover:text-teal-700 hover:bg-teal-50 transition-colors shrink-0"
                aria-label="Autres méthodes de localisation"
                data-testid="button-more-location"
              >
                <Plus className="h-4 w-4" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-60 p-1.5 z-[2100]">
              <button
                type="button"
                onClick={() => { setMoreOpen(false); onOpenLieuxDits(); }}
                className="w-full flex items-start gap-2.5 px-2.5 py-2 rounded-lg hover:bg-teal-50 text-left transition-colors"
                data-testid="popover-lieu-dit"
              >
                <Landmark className="h-4 w-4 text-teal-600 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-gray-900">Lieu-dit / commune</div>
                  <div className="text-[10px] text-gray-500 leading-tight">Utiliser un contour OSM comme emprise</div>
                </div>
              </button>
              <button
                type="button"
                onClick={() => { setMoreOpen(false); fileInputRef.current?.click(); }}
                disabled={isLoadingShapefile}
                className="w-full flex items-start gap-2.5 px-2.5 py-2 rounded-lg hover:bg-teal-50 text-left transition-colors disabled:opacity-50"
                data-testid="popover-shapefile"
              >
                {isLoadingShapefile
                  ? <Loader2 className="h-4 w-4 text-teal-600 shrink-0 mt-0.5 animate-spin" />
                  : <Upload className="h-4 w-4 text-teal-600 shrink-0 mt-0.5" />}
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-gray-900">Importer un shapefile</div>
                  <div className="text-[10px] text-gray-500 leading-tight">Fichier .zip — emprise réelle du projet</div>
                </div>
              </button>
            </PopoverContent>
          </Popover>

          <Button
            size="sm"
            onClick={handleGoTo}
            disabled={isSearching || !query.trim()}
            className="h-9 px-3 bg-teal-600 hover:bg-teal-700 text-white shrink-0"
            data-testid="button-goto"
            aria-label="Localiser"
          >
            {isSearching
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <MapPin className="h-4 w-4" />}
          </Button>

          <input
            ref={fileInputRef}
            type="file"
            accept=".zip"
            onChange={handleFileChange}
            className="hidden"
            data-testid="input-shapefile"
          />
        </div>

        {/* Pastille emprise active (shapefile / lieu-dit) */}
        {projectPolygon && (
          <div className="flex items-center gap-2 bg-teal-50 rounded-lg px-2.5 py-1.5 ring-1 ring-teal-200">
            <FileArchive className="h-3.5 w-3.5 text-teal-600 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-semibold text-teal-800 truncate" data-testid="text-polygon-name">
                {projectPolygon.name}
              </div>
              <div className="text-[10px] text-teal-600">
                {projectPolygon.geojson.features.length} entité(s) • centroïde utilisé
              </div>
            </div>
            <button
              type="button"
              onClick={onShapefileClear}
              className="p-1 hover:bg-teal-100 rounded transition-colors shrink-0"
              aria-label="Supprimer l'emprise"
              data-testid="button-clear-shapefile"
            >
              <X className="h-3 w-3 text-teal-600" />
            </button>
          </div>
        )}

        {/* === Étape 2 : Configuration de l'étude (un seul bloc) === */}
        <div className="bg-white/40 rounded-xl ring-1 ring-black/5 overflow-hidden">
          <button
            type="button"
            onClick={() => setShowSettings(!showSettings)}
            className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/60 transition-colors"
            data-testid="button-toggle-settings"
          >
            <Settings2 className="h-3.5 w-3.5 text-gray-500 shrink-0" />
            <div className="flex-1 min-w-0 text-left">
              <div className="text-[11px] font-semibold text-gray-700 leading-tight">
                Paramètres de l'étude
              </div>
              <div className="text-[10px] text-gray-500 truncate flex items-center gap-1.5">
                {activePreset && activePreset.id !== "custom" && (
                  <span>{activePreset.label}</span>
                )}
                {activePreset?.id === "custom" && <span>Personnalisé</span>}
                <span className="text-gray-300">•</span>
                <span>{enabledCount}/{circles.length} aire{enabledCount > 1 ? 's' : ''}</span>
              </div>
            </div>
            {showSettings
              ? <ChevronUp className="h-3.5 w-3.5 text-gray-400" />
              : <ChevronDown className="h-3.5 w-3.5 text-gray-400" />}
          </button>

          <AnimatePresence>
            {showSettings && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="px-3 pb-3 pt-1 space-y-3 border-t border-black/5">

                  {/* Presets — chips horizontales */}
                  <div>
                    <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                      Type de projet
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {PROJECT_PRESETS.filter(p => p.id !== "custom").map((preset) => (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => onApplyPreset(preset)}
                          title={preset.description}
                          className={`text-[11px] px-2 py-1 rounded-full transition-all flex items-center gap-1 ${
                            activePresetId === preset.id
                              ? 'bg-teal-600 text-white shadow-sm'
                              : 'bg-white/70 text-gray-700 ring-1 ring-black/5 hover:bg-white hover:ring-teal-300'
                          }`}
                          data-testid={`preset-${preset.id}`}
                        >
                          <span className="font-medium">{preset.label}</span>
                        </button>
                      ))}
                      {activePresetId === "custom" && (
                        <span className="text-[11px] px-2 py-1 rounded-full bg-gray-100 text-gray-500 italic">
                          Personnalisé
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Zones — liste compacte avec slider */}
                  <div>
                    <div className="flex items-center justify-between text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                      <span className="flex items-center gap-1">
                        <Target className="h-3 w-3" />
                        Aires d'étude
                      </span>
                      <span className="font-mono text-gray-400 normal-case">
                        {enabledCount}/{circles.length}
                      </span>
                    </div>
                    <div className="space-y-1">
                      {circles.map((circle) => {
                        const studyArea = STUDY_AREAS.find(a => a.id === circle.id);
                        const color = studyArea?.color || "#0d9488";
                        const isExpanded = expandedCircle === circle.id;

                        return (
                          <div key={circle.id} className="rounded-lg overflow-hidden">
                            <div
                              className={`flex items-center gap-2 px-2 py-1.5 transition-all ${
                                circle.enabled ? 'bg-white/80 ring-1 ring-black/5' : 'bg-white/30 opacity-60'
                              }`}
                              data-testid={`circle-item-${circle.id}`}
                            >
                              <button
                                onClick={() => onToggleCircle(circle.id)}
                                className="shrink-0"
                                aria-label={`${circle.enabled ? 'Désactiver' : 'Activer'} ${circle.label}`}
                                data-testid={`toggle-circle-${circle.id}`}
                              >
                                <div
                                  className="w-4 h-4 rounded border-2 flex items-center justify-center transition-all"
                                  style={{
                                    borderColor: color,
                                    backgroundColor: circle.enabled ? color : 'transparent',
                                  }}
                                >
                                  {circle.enabled && (
                                    <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                  )}
                                </div>
                              </button>

                              <button
                                type="button"
                                onClick={() => circle.enabled && setExpandedCircle(isExpanded ? null : circle.id)}
                                disabled={!circle.enabled}
                                className="flex-1 min-w-0 flex items-center gap-2 text-left disabled:cursor-default"
                              >
                                <div
                                  className="w-4 h-0 shrink-0"
                                  style={{ borderTop: `2px ${studyArea?.dashArray ? 'dashed' : 'solid'} ${color}` }}
                                />
                                <span className="text-[11px] font-medium flex-1 truncate">
                                  {circle.label}
                                </span>
                                <span className="text-[10px] text-gray-500 font-mono shrink-0">
                                  {formatRadius(circle.radius)}
                                </span>
                                {circle.enabled && (
                                  isExpanded
                                    ? <ChevronUp className="h-3 w-3 text-gray-400 shrink-0" />
                                    : <ChevronDown className="h-3 w-3 text-gray-400 shrink-0" />
                                )}
                              </button>
                            </div>

                            <AnimatePresence>
                              {isExpanded && circle.enabled && (
                                <motion.div
                                  initial={{ opacity: 0, height: 0 }}
                                  animate={{ opacity: 1, height: "auto" }}
                                  exit={{ opacity: 0, height: 0 }}
                                  className="overflow-hidden"
                                >
                                  <div className="px-3 py-2">
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
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* === Étape 3 : Lancer === */}
        <Button
          onClick={() => onLaunchAnalysis()}
          disabled={isAnalyzing || enabledCount === 0}
          className="w-full bg-primary hover:bg-primary/90 text-white font-bold h-11 shadow-md transition-all flex items-center justify-center gap-2 text-base rounded-xl"
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
    </motion.div>
  );
}
