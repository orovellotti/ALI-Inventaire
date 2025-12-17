import { useState } from "react";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Loader2, Zap, MapPin } from "lucide-react";
import { motion } from "framer-motion";

interface SearchPanelProps {
  onGoToPlace: (query: string) => void;
  onLaunchAnalysis: (radius: number) => void;
  isSearching: boolean;
  isAnalyzing: boolean;
  radius: number;
  setRadius: (v: number) => void;
}

export function SearchPanel({ onGoToPlace, onLaunchAnalysis, isSearching, isAnalyzing, radius, setRadius }: SearchPanelProps) {
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
        {/* Search Bar */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Lieu, commune, adresse..." 
              className="pl-9 bg-white/50 border-0 focus-visible:ring-1 focus-visible:ring-primary/50"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleGoTo()}
            />
          </div>
          <Button 
            variant="secondary"
            onClick={handleGoTo}
            disabled={isSearching || !query.trim()}
            className="font-medium shadow-sm transition-all gap-2"
          >
            {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
            Aller à
          </Button>
        </div>

        {/* Radius Slider */}
        <div className="space-y-3 px-1">
          <div className="flex justify-between text-xs font-medium text-muted-foreground uppercase tracking-wider">
            <span>Rayon d'analyse</span>
            <span>{radius >= 1000 ? `${(radius/1000).toFixed(1)} km` : `${radius} m`}</span>
          </div>
          <Slider 
            value={[radius]} 
            onValueChange={(vals) => setRadius(vals[0])} 
            max={5000} 
            min={100} 
            step={100}
            className="cursor-pointer"
          />
        </div>

        {/* Main Action Button */}
        <div className="pt-1">
          <Button 
            onClick={() => onLaunchAnalysis(radius)}
            disabled={isAnalyzing}
            className="w-full bg-primary hover:bg-primary/90 text-white font-bold h-11 shadow-md transition-all flex items-center justify-center gap-2 text-base"
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
