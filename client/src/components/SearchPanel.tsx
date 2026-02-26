import { useState } from "react";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Loader2, Zap, MapPin, Plus, Trash2, Target, MousePointer } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { BufferCircle } from "@/lib/gbif";

const CIRCLE_COLORS = [
  "#0d9488",
  "#6366f1",
  "#e11d48",
  "#ea580c",
  "#8b5cf6",
  "#0284c7",
];

function getCircleColor(index: number) {
  return CIRCLE_COLORS[index % CIRCLE_COLORS.length];
}

interface SearchPanelProps {
  onGoToPlace: (query: string) => void;
  onLaunchAnalysis: () => void;
  isSearching: boolean;
  isAnalyzing: boolean;
  radius: number;
  setRadius: (v: number) => void;
  circles: BufferCircle[];
  activeCircleId: string;
  onAddCircle: () => void;
  onRemoveCircle: (id: string) => void;
  onSelectCircle: (id: string) => void;
  isPlacingCircle: boolean;
  onCancelPlacing: () => void;
}

export function SearchPanel({ 
  onGoToPlace, onLaunchAnalysis, isSearching, isAnalyzing, 
  radius, setRadius, circles, activeCircleId, 
  onAddCircle, onRemoveCircle, onSelectCircle,
  isPlacingCircle, onCancelPlacing
}: SearchPanelProps) {
  const [query, setQuery] = useState("");

  const handleGoTo = () => {
    if (query.trim()) {
      onGoToPlace(query.trim());
    }
  };

  return (
    <motion.div 
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="absolute top-6 left-1/2 -translate-x-1/2 z-[1000] w-[90%] max-w-md"
    >
      <div className="glass-panel p-4 rounded-xl flex flex-col gap-4">
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

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Zones d'analyse ({circles.length})
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={onAddCircle}
              disabled={isPlacingCircle || circles.length >= 6}
              className="h-7 px-2 text-xs gap-1"
              data-testid="button-add-circle"
            >
              <Plus className="h-3 w-3" />
              Ajouter
            </Button>
          </div>

          <AnimatePresence>
            {isPlacingCircle && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="flex items-center gap-2 bg-teal-50 border border-teal-200 rounded-lg px-3 py-2"
              >
                <MousePointer className="h-4 w-4 text-teal-600 animate-pulse" />
                <span className="text-xs text-teal-700 font-medium flex-1">
                  Cliquez sur la carte...
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onCancelPlacing}
                  className="h-6 px-2 text-xs text-teal-600 hover:text-teal-800"
                  data-testid="button-cancel-placing"
                >
                  Annuler
                </Button>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="space-y-1.5 max-h-[140px] overflow-y-auto">
            {circles.map((circle, index) => {
              const isActive = circle.id === activeCircleId;
              const color = getCircleColor(index);
              return (
                <motion.div
                  key={circle.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 cursor-pointer transition-all ${
                    isActive 
                      ? 'bg-white/80 shadow-sm ring-1 ring-black/5' 
                      : 'bg-white/30 hover:bg-white/50'
                  }`}
                  onClick={() => onSelectCircle(circle.id)}
                  data-testid={`circle-item-${circle.id}`}
                >
                  <div 
                    className="w-3 h-3 rounded-full flex-shrink-0 border-2"
                    style={{ backgroundColor: color, borderColor: isActive ? 'white' : color }}
                  />
                  <span className="text-xs font-medium flex-1 truncate">
                    Zone {index + 1}
                  </span>
                  <span className="text-[10px] text-muted-foreground font-mono">
                    {circle.radius >= 1000 
                      ? `${(circle.radius/1000).toFixed(1)}km` 
                      : `${circle.radius}m`
                    }
                  </span>
                  {isActive && (
                    <Target className="h-3 w-3 text-teal-600" />
                  )}
                  {circles.length > 1 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveCircle(circle.id);
                      }}
                      className="text-muted-foreground hover:text-red-500 transition-colors p-0.5"
                      data-testid={`button-remove-circle-${circle.id}`}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </motion.div>
              );
            })}
          </div>
        </div>

        <div className="space-y-3 px-1">
          <div className="flex justify-between text-xs font-medium text-muted-foreground uppercase tracking-wider">
            <span>Rayon (zone active)</span>
            <span>{radius >= 1000 ? `${(radius/1000).toFixed(1)} km` : `${radius} m`}</span>
          </div>
          <Slider 
            value={[radius]} 
            onValueChange={(vals) => setRadius(vals[0])} 
            max={5000} 
            min={100} 
            step={100}
            className="cursor-pointer"
            data-testid="slider-radius"
          />
        </div>

        <div className="pt-1">
          <Button 
            onClick={() => onLaunchAnalysis()}
            disabled={isAnalyzing || isPlacingCircle}
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

export { getCircleColor };
