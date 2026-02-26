import { useState, useCallback } from "react";
import { Map } from "@/components/Map";
import { SearchPanel } from "@/components/SearchPanel";
import { ResultsPanel } from "@/components/ResultsPanel";
import { searchGBIFMultiCircle, InventoryResult, BufferCircle } from "@/lib/gbif";
import { searchPlace } from "@/lib/geocoding";
import { useToast } from "@/hooks/use-toast";
import { Leaf } from "lucide-react";

let circleIdCounter = 1;

export default function Home() {
  const [center, setCenter] = useState<[number, number]>([48.8566, 2.3522]);
  const [radius, setRadius] = useState(500);
  const [circles, setCircles] = useState<BufferCircle[]>([
    { id: "circle-0", center: [48.8566, 2.3522], radius: 500 }
  ]);
  const [activeCircleId, setActiveCircleId] = useState("circle-0");
  const [results, setResults] = useState<InventoryResult | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [selectedSpecies, setSelectedSpecies] = useState<string | null>(null);
  const [isPlacingCircle, setIsPlacingCircle] = useState(false);
  const { toast } = useToast();

  const handleGoToPlace = async (query: string) => {
    setIsSearching(true);
    try {
      const place = await searchPlace(query);
      if (place) {
        const newCenter: [number, number] = [place.lat, place.lon];
        setCenter(newCenter);
        setCircles(prev => prev.map(c => 
          c.id === activeCircleId ? { ...c, center: newCenter } : c
        ));
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
    setIsAnalyzing(true);

    try {
      const data = await searchGBIFMultiCircle(circles);
      setResults(data);
      setIsPanelOpen(true);
      const totalCircles = circles.length;
      toast({
        title: "Inventaire terminé",
        description: `${data.stats.speciesCount} espèces trouvées dans ${totalCircles} zone${totalCircles > 1 ? 's' : ''}.`,
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
    
    if (isPlacingCircle) {
      const newId = `circle-${circleIdCounter++}`;
      const newCircle: BufferCircle = { id: newId, center: newCenter, radius };
      setCircles(prev => [...prev, newCircle]);
      setActiveCircleId(newId);
      setCenter(newCenter);
      setIsPlacingCircle(false);
      toast({
        title: "Cercle ajouté",
        description: `Zone d'analyse #${circles.length + 1} placée.`,
      });
    } else {
      setCenter(newCenter);
      setCircles(prev => prev.map(c => 
        c.id === activeCircleId ? { ...c, center: newCenter } : c
      ));
    }
    if (isPanelOpen) setIsPanelOpen(false);
  };

  const handleAddCircle = useCallback(() => {
    setIsPlacingCircle(true);
    toast({
      title: "Placez le nouveau cercle",
      description: "Cliquez sur la carte pour positionner la nouvelle zone d'analyse.",
    });
  }, [toast]);

  const handleRemoveCircle = useCallback((id: string) => {
    setCircles(prev => {
      const updated = prev.filter(c => c.id !== id);
      if (updated.length === 0) return prev;
      if (activeCircleId === id) {
        const next = updated[0];
        setActiveCircleId(next.id);
        setCenter(next.center);
        setRadius(next.radius);
      }
      return updated;
    });
  }, [activeCircleId]);

  const handleSelectCircle = useCallback((id: string) => {
    setActiveCircleId(id);
    const circle = circles.find(c => c.id === id);
    if (circle) {
      setCenter(circle.center);
      setRadius(circle.radius);
    }
  }, [circles]);

  const handleRadiusChange = useCallback((newRadius: number) => {
    setRadius(newRadius);
    setCircles(prev => prev.map(c => 
      c.id === activeCircleId ? { ...c, radius: newRadius } : c
    ));
  }, [activeCircleId]);

  return (
    <div className="relative w-full h-screen overflow-hidden bg-gray-100">
      
      <Map 
        center={center} 
        radius={radius} 
        circles={circles}
        activeCircleId={activeCircleId}
        results={results} 
        onMapClick={handleMapClick}
        selectedSpecies={selectedSpecies}
        isPlacingCircle={isPlacingCircle}
      />

      <SearchPanel 
        onGoToPlace={handleGoToPlace}
        onLaunchAnalysis={handleLaunchAnalysis}
        isSearching={isSearching}
        isAnalyzing={isAnalyzing}
        radius={radius}
        setRadius={handleRadiusChange}
        circles={circles}
        activeCircleId={activeCircleId}
        onAddCircle={handleAddCircle}
        onRemoveCircle={handleRemoveCircle}
        onSelectCircle={handleSelectCircle}
        isPlacingCircle={isPlacingCircle}
        onCancelPlacing={() => setIsPlacingCircle(false)}
      />

      <ResultsPanel 
        isOpen={isPanelOpen} 
        onClose={() => setIsPanelOpen(false)} 
        results={results}
        selectedSpecies={selectedSpecies}
        onSelectSpecies={setSelectedSpecies}
      />

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
