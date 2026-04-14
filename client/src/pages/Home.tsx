import { useState, useCallback } from "react";
import { Map } from "@/components/Map";
import { SearchPanel } from "@/components/SearchPanel";
import { ResultsPanel } from "@/components/ResultsPanel";
import { AboutDialog } from "@/components/AboutDialog";
import { searchGBIFMultiCircle, InventoryResult, BufferCircle, STUDY_AREAS, ProjectPreset } from "@/lib/gbif";
import { searchPlace } from "@/lib/geocoding";
import { useToast } from "@/hooks/use-toast";
import { Leaf, HelpCircle } from "lucide-react";

function createDefaultCircles(center: [number, number]): BufferCircle[] {
  return STUDY_AREAS.map(area => ({
    id: area.id,
    center,
    radius: area.radius,
    label: area.label,
    enabled: area.id === "immediate",
  }));
}

export default function Home() {
  const [center, setCenter] = useState<[number, number]>([48.8566, 2.3522]);
  const [circles, setCircles] = useState<BufferCircle[]>(
    createDefaultCircles([48.8566, 2.3522])
  );
  const [results, setResults] = useState<InventoryResult | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [selectedSpecies, setSelectedSpecies] = useState<string | null>(null);
  const [showAbout, setShowAbout] = useState(false);
  const [activePresetId, setActivePresetId] = useState("custom");
  const { toast } = useToast();

  const handleGoToPlace = async (query: string) => {
    setIsSearching(true);
    try {
      const place = await searchPlace(query);
      if (place) {
        const newCenter: [number, number] = [place.lat, place.lon];
        setCenter(newCenter);
        setCircles(prev => prev.map(c => ({ ...c, center: newCenter })));
        if (isPanelOpen) setIsPanelOpen(false);
        toast({
          title: "Lieu trouvé",
          description: place.display_name,
        });
      } else {
        toast({
          title: "Lieu introuvable",
          description: `Nous n'avons pas pu localiser "${query}".`,
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Erreur de géocodage",
        description: "Impossible de contacter le service de localisation.",
        variant: "destructive",
      });
    } finally {
      setIsSearching(false);
    }
  };

  const handleLaunchAnalysis = async () => {
    const enabledCount = circles.filter(c => c.enabled).length;
    if (enabledCount === 0) {
      toast({
        title: "Aucune aire sélectionnée",
        description: "Activez au moins une aire d'étude pour lancer l'analyse.",
        variant: "destructive",
      });
      return;
    }

    setIsAnalyzing(true);
    try {
      const data = await searchGBIFMultiCircle(circles);
      setResults(data);
      setIsPanelOpen(true);
      toast({
        title: "Inventaire terminé",
        description: `${data.stats.speciesCount} espèces trouvées dans ${enabledCount} aire${enabledCount > 1 ? 's' : ''} d'étude.`,
      });
    } catch (error) {
      toast({
        title: "Erreur",
        description: "Impossible de récupérer les données GBIF.",
        variant: "destructive",
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleMapClick = (lat: number, lng: number) => {
    const newCenter: [number, number] = [lat, lng];
    setCenter(newCenter);
    setCircles(prev => prev.map(c => ({ ...c, center: newCenter })));
    if (isPanelOpen) setIsPanelOpen(false);
  };

  const handleRadiusChange = useCallback((id: string, newRadius: number) => {
    setCircles(prev => prev.map(c => 
      c.id === id ? { ...c, radius: newRadius } : c
    ));
    setActivePresetId("custom");
  }, []);

  const handleToggleCircleWithPreset = useCallback((id: string) => {
    setCircles(prev => prev.map(c => 
      c.id === id ? { ...c, enabled: !c.enabled } : c
    ));
    setActivePresetId("custom");
  }, []);

  const handleApplyPreset = useCallback((preset: ProjectPreset) => {
    setActivePresetId(preset.id);
    setCircles(prev => prev.map(c => {
      const zone = preset.zones[c.id as keyof typeof preset.zones];
      if (zone) {
        return { ...c, radius: zone.radius, enabled: zone.enabled };
      }
      return c;
    }));
  }, []);

  return (
    <div className="relative w-full h-screen overflow-hidden bg-gray-100">
      
      <Map 
        center={center} 
        circles={circles}
        results={results} 
        onMapClick={handleMapClick}
        selectedSpecies={selectedSpecies}
      />

      <SearchPanel 
        onGoToPlace={handleGoToPlace}
        onLaunchAnalysis={handleLaunchAnalysis}
        isSearching={isSearching}
        isAnalyzing={isAnalyzing}
        circles={circles}
        onToggleCircle={handleToggleCircleWithPreset}
        onRadiusChange={handleRadiusChange}
        activePresetId={activePresetId}
        onApplyPreset={handleApplyPreset}
      />

      <ResultsPanel 
        isOpen={isPanelOpen} 
        onClose={() => setIsPanelOpen(false)} 
        results={results}
        selectedSpecies={selectedSpecies}
        onSelectSpecies={setSelectedSpecies}
      />

      <AboutDialog open={showAbout} onOpenChange={setShowAbout} />

      <div className="absolute top-6 left-6 z-[1000] flex items-center gap-2">
        <button 
          type="button"
          className="flex items-center gap-2 bg-white/80 backdrop-blur px-3 py-2 rounded-lg cursor-pointer hover:bg-white transition-colors shadow-sm"
          onClick={() => {
            setResults(null);
            setIsPanelOpen(false);
          }}
          aria-label="Réinitialiser la vue"
          data-testid="button-reset"
        >
          <div className="bg-teal-600 p-1.5 rounded-md">
            <Leaf className="h-4 w-4 text-white" />
          </div>
          <span className="font-bold text-gray-900 tracking-tight text-sm">Inventaire Flash</span>
        </button>

        <button
          type="button"
          onClick={() => setShowAbout(true)}
          className="bg-white/80 backdrop-blur p-2 rounded-lg cursor-pointer hover:bg-white transition-colors shadow-sm"
          aria-label="À propos de la méthodologie"
          data-testid="button-about"
        >
          <HelpCircle className="h-4 w-4 text-gray-600" />
        </button>
      </div>

    </div>
  );
}
