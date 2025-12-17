import { useState } from "react";
import { Map } from "@/components/Map";
import { SearchPanel } from "@/components/SearchPanel";
import { ResultsPanel } from "@/components/ResultsPanel";
import { searchGBIF, InventoryResult } from "@/lib/gbif";
import { searchPlace } from "@/lib/geocoding";
import { useToast } from "@/hooks/use-toast";
import { Leaf } from "lucide-react";

export default function Home() {
  const [center, setCenter] = useState<[number, number]>([48.8566, 2.3522]); // Paris default
  const [radius, setRadius] = useState(500);
  const [results, setResults] = useState<InventoryResult | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const { toast } = useToast();

  const handleGoToPlace = async (query: string) => {
    setIsSearching(true);
    try {
      const place = await searchPlace(query);
      if (place) {
        setCenter([place.lat, place.lon]);
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

  const handleLaunchAnalysis = async (r: number) => {
    setIsAnalyzing(true);
    setRadius(r);

    try {
      const data = await searchGBIF(center[0], center[1], r);
      setResults(data);
      setIsPanelOpen(true);
      toast({
        title: "Inventaire terminé",
        description: `${data.stats.total} occurrences trouvées dans un rayon de ${r}m.`,
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
    setCenter([lat, lng]);
    if (isPanelOpen) setIsPanelOpen(false);
  };

  return (
    <div className="relative w-full h-screen overflow-hidden bg-gray-100">
      
      {/* Map Layer */}
      <Map 
        center={center} 
        radius={radius} 
        results={results} 
        onMapClick={handleMapClick} 
      />

      {/* Floating UI */}
      <SearchPanel 
        onGoToPlace={handleGoToPlace}
        onLaunchAnalysis={handleLaunchAnalysis}
        isSearching={isSearching}
        isAnalyzing={isAnalyzing}
        radius={radius}
        setRadius={setRadius}
      />

      <ResultsPanel 
        isOpen={isPanelOpen} 
        onClose={() => setIsPanelOpen(false)} 
        results={results} 
      />

      {/* Logo / Brand */}
      <div 
        className="absolute top-6 left-6 z-[1000] flex items-center gap-2 bg-white/80 backdrop-blur px-3 py-2 rounded-lg cursor-pointer hover:bg-white transition-colors shadow-sm"
        onClick={() => {
          setResults(null);
          setIsPanelOpen(false);
        }}
      >
        <div className="bg-teal-600 p-1.5 rounded-md">
          <Leaf className="h-4 w-4 text-white" />
        </div>
        <span className="font-bold text-gray-900 tracking-tight text-sm">Inventaire Flash</span>
      </div>

    </div>
  );
}
