import { useState } from "react";
import { Map } from "@/components/Map";
import { SearchPanel } from "@/components/SearchPanel";
import { ResultsPanel } from "@/components/ResultsPanel";
import { searchGBIF, InventoryResult } from "@/lib/gbif";
import { useToast } from "@/hooks/use-toast";
import { Leaf } from "lucide-react";

export default function Home() {
  const [center, setCenter] = useState<[number, number]>([48.8566, 2.3522]); // Paris default
  const [radius, setRadius] = useState(500);
  const [results, setResults] = useState<InventoryResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const { toast } = useToast();

  const handleSearch = async (r: number, query?: string) => {
    setIsLoading(true);
    setRadius(r);
    
    // In a real app, query would be geocoded here. 
    // For now, we assume the user clicked the map or we use the current center.
    if (query) {
      toast({
        title: "Recherche simulée",
        description: `Recherche pour "${query}" centrée sur la vue actuelle.`,
      });
    }

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
      setIsLoading(false);
    }
  };

  const handleMapClick = (lat: number, lng: number) => {
    setCenter([lat, lng]);
    // Optionally auto-search on click if that's desired, or just move the "cursor"
    // The prompt says: "clic pour définir le centre" -> then "Lancer l'inventaire"
    // So we just update center. 
    // If results are open, we might want to close them or keep them stale? 
    // Let's close them to indicate new analysis needed.
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
        onSearch={handleSearch} 
        isLoading={isLoading} 
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
