import { useState, useCallback, useEffect, useRef } from "react";
import { Map } from "@/components/Map";
import { SearchPanel } from "@/components/SearchPanel";
import { ResultsPanel } from "@/components/ResultsPanel";
import { AboutDialog } from "@/components/AboutDialog";
import { ApiDialog } from "@/components/ApiDialog";
import { LieuxDitsDialog } from "@/components/LieuxDitsDialog";
import { searchGBIFMultiCircle, InventoryResult, BufferCircle, STUDY_AREAS, ProjectPreset, TAXON_GROUPS, getTaxonGroupId } from "@/lib/gbif";
import { searchPlace, reverseGeocode } from "@/lib/geocoding";
import { parseShapefile, ProjectPolygon } from "@/lib/shapefile";
import { useToast } from "@/hooks/use-toast";
import { Leaf, HelpCircle, Bot, ExternalLink } from "lucide-react";

function createDefaultCircles(center: [number, number]): BufferCircle[] {
  return STUDY_AREAS.map(area => ({
    id: area.id,
    center,
    radius: area.radius,
    label: area.label,
    enabled: area.id === "immediate",
  }));
}

const RANDOM_PLACES: { name: string; coords: [number, number] }[] = [
  { name: "Pointe du Raz, Finistère", coords: [48.0386, -4.7361] },
  { name: "Camargue, Bouches-du-Rhône", coords: [43.5396, 4.4697] },
  { name: "Mont-Saint-Michel, Manche", coords: [48.6361, -1.5115] },
  { name: "Calanques de Cassis, Bouches-du-Rhône", coords: [43.2089, 5.5394] },
  { name: "Forêt de Brocéliande, Ille-et-Vilaine", coords: [48.0167, -2.1833] },
  { name: "Gorges du Verdon, Alpes-de-Haute-Provence", coords: [43.7472, 6.3789] },
  { name: "Puy de Sancy, Puy-de-Dôme", coords: [45.5278, 2.8133] },
  { name: "Lac d'Annecy, Haute-Savoie", coords: [45.8467, 6.1681] },
  { name: "Dune du Pilat, Gironde", coords: [44.5908, -1.2128] },
  { name: "Massif de la Vanoise, Savoie", coords: [45.3833, 6.7833] },
  { name: "Marais Poitevin, Vendée", coords: [46.3167, -0.7] },
  { name: "Cirque de Gavarnie, Hautes-Pyrénées", coords: [42.7028, -0.0086] },
  { name: "Baie de Somme, Somme", coords: [50.2167, 1.6167] },
  { name: "Gorges de l'Ardèche, Ardèche", coords: [44.3, 4.5] },
  { name: "Forêt de Fontainebleau, Seine-et-Marne", coords: [48.4042, 2.6981] },
  { name: "Lac du Der, Marne", coords: [48.5667, 4.7333] },
  { name: "Étang de Berre, Bouches-du-Rhône", coords: [43.4667, 5.1] },
  { name: "Massif des Vosges, Vosges", coords: [48.0, 7.0] },
  { name: "Plateau de Millevaches, Corrèze", coords: [45.6833, 2.0333] },
  { name: "Cap Fréhel, Côtes-d'Armor", coords: [48.6839, -2.3175] },
  { name: "Île de Porquerolles, Var", coords: [43.0089, 6.2058] },
  { name: "Marais de l'Estuaire de la Seine, Seine-Maritime", coords: [49.4333, 0.2667] },
  { name: "Lac de Grand-Lieu, Loire-Atlantique", coords: [47.0833, -1.6667] },
  { name: "Plateau de l'Aubrac, Aveyron", coords: [44.6167, 3.0] },
  { name: "Cirque de Mafate, La Réunion", coords: [-21.0667, 55.4333] },
];

function pickRandomPlace() {
  return RANDOM_PLACES[Math.floor(Math.random() * RANDOM_PLACES.length)];
}

const INITIAL_PLACE = pickRandomPlace();

export default function Home() {
  const [center, setCenter] = useState<[number, number]>(INITIAL_PLACE.coords);
  const [circles, setCircles] = useState<BufferCircle[]>(
    createDefaultCircles(INITIAL_PLACE.coords)
  );
  const [results, setResults] = useState<InventoryResult | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [panelWidth, setPanelWidth] = useState<number>(() => {
    try {
      const saved = Number(localStorage.getItem("resultsPanelWidth"));
      if (Number.isFinite(saved) && saved > 0) return saved;
    } catch {}
    return Math.min(600, typeof window !== "undefined" ? window.innerWidth * 0.45 : 600);
  });
  useEffect(() => {
    const sync = () => {
      try {
        const saved = Number(localStorage.getItem("resultsPanelWidth"));
        if (Number.isFinite(saved) && saved > 0) setPanelWidth(saved);
      } catch {}
    };
    window.addEventListener("if:panel-width-changed", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("if:panel-width-changed", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  const [selectedSpecies, setSelectedSpecies] = useState<string | null>(null);
  const [showAbout, setShowAbout] = useState(false);
  const [showApi, setShowApi] = useState(false);
  const [showLieuxDits, setShowLieuxDits] = useState(false);
  const [currentToponym, setCurrentToponym] = useState<string>(INITIAL_PLACE.name);
  const [activePresetId, setActivePresetId] = useState("custom");
  const [activeTaxonFilters, setActiveTaxonFilters] = useState<Set<string>>(
    () => new Set(TAXON_GROUPS.map(g => g.id))
  );
  const [excludeMarine, setExcludeMarine] = useState<boolean>(true);
  const [includeINaturalist, setIncludeINaturalist] = useState<boolean>(true);
  const [projectPolygon, setProjectPolygon] = useState<ProjectPolygon | null>(null);
  const [isLoadingShapefile, setIsLoadingShapefile] = useState(false);
  const [locationKey, setLocationKey] = useState(0);
  const { toast } = useToast();

  const inventoryRequestId = useRef(0);
  const resetForNewLocation = useCallback(() => {
    inventoryRequestId.current++;
    setResults(null);
    setSelectedSpecies(null);
    setIsPanelOpen(false);
    setIsAnalyzing(false);
    setLocationKey(k => k + 1);
  }, []);

  const handleGoToPlace = async (query: string) => {
    setIsSearching(true);
    try {
      const place = await searchPlace(query);
      if (place) {
        const newCenter: [number, number] = [place.lat, place.lon];
        setCenter(newCenter);
        setCircles(prev => prev.map(c => ({ ...c, center: newCenter })));
        if (projectPolygon) setProjectPolygon(null);
        resetForNewLocation();
        setCurrentToponym(place.display_name);
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

    const requestId = ++inventoryRequestId.current;
    setIsAnalyzing(true);
    try {
      const data = await searchGBIFMultiCircle(circles, { includeINaturalist });
      if (requestId !== inventoryRequestId.current) return;
      setResults(data);
      setIsPanelOpen(true);
      toast({
        title: "Inventaire terminé",
        description: `${data.stats.speciesCount} espèces trouvées dans ${enabledCount} aire${enabledCount > 1 ? 's' : ''} d'étude.`,
      });
    } catch (error) {
      if (requestId !== inventoryRequestId.current) return;
      toast({
        title: "Erreur",
        description: "Impossible de récupérer les données GBIF.",
        variant: "destructive",
      });
    } finally {
      if (requestId === inventoryRequestId.current) setIsAnalyzing(false);
    }
  };

  const reverseGeocodeRequestId = useRef(0);
  const handleMapClick = (lat: number, lng: number) => {
    if (projectPolygon) return;
    const newCenter: [number, number] = [lat, lng];
    setCenter(newCenter);
    setCircles(prev => prev.map(c => ({ ...c, center: newCenter })));
    resetForNewLocation();
    setCurrentToponym(`Point ${lat.toFixed(4)}, ${lng.toFixed(4)}`);
    const requestId = ++reverseGeocodeRequestId.current;
    reverseGeocode(lat, lng).then(result => {
      if (requestId !== reverseGeocodeRequestId.current) return;
      if (result?.shortName) setCurrentToponym(result.shortName);
    });
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

  useEffect(() => {
    if (selectedSpecies && results) {
      const matchingOcc = results.occurrences.find(o => o.scientificName === selectedSpecies);
      if (matchingOcc && !activeTaxonFilters.has(getTaxonGroupId(matchingOcc))) {
        setSelectedSpecies(null);
      }
    }
  }, [activeTaxonFilters, selectedSpecies, results]);

  const handleToggleTaxonFilter = useCallback((groupId: string) => {
    setActiveTaxonFilters(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  }, []);

  const handleToggleAllTaxonFilters = useCallback((presentGroupIds?: string[]) => {
    setActiveTaxonFilters(prev => {
      const ids = presentGroupIds || TAXON_GROUPS.map(g => g.id);
      const allPresent = ids.every(id => prev.has(id));
      const next = new Set(prev);
      if (allPresent) {
        ids.forEach(id => next.delete(id));
      } else {
        ids.forEach(id => next.add(id));
      }
      return next;
    });
  }, []);

  const handleShapefileLoad = useCallback(async (file: File) => {
    setIsLoadingShapefile(true);
    try {
      const polygon = await parseShapefile(file);
      setProjectPolygon(polygon);
      const newCenter: [number, number] = polygon.centroid;
      setCenter(newCenter);
      setCircles(prev => prev.map(c => ({ ...c, center: newCenter })));
      resetForNewLocation();
      setCurrentToponym(polygon.name);
      toast({
        title: "Shapefile chargé",
        description: `${polygon.geojson.features.length} entité(s) — "${polygon.name}"`,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Format non reconnu";
      toast({
        title: "Erreur de chargement",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setIsLoadingShapefile(false);
    }
  }, [resetForNewLocation, toast]);

  const handleSelectLieuDitPolygon = useCallback((polygon: ProjectPolygon) => {
    setProjectPolygon(polygon);
    const newCenter: [number, number] = polygon.centroid;
    setCenter(newCenter);
    setCircles(prev => prev.map(c => ({ ...c, center: newCenter })));
    resetForNewLocation();
    setCurrentToponym(polygon.name);
    toast({
      title: "Lieu-dit chargé",
      description: `Contour utilisé comme emprise — "${polygon.name}"`,
    });
  }, [resetForNewLocation, toast]);

  const handleSelectLieuDitPoint = useCallback((lat: number, lng: number, name: string) => {
    const newCenter: [number, number] = [lat, lng];
    setCenter(newCenter);
    setCircles(prev => prev.map(c => ({ ...c, center: newCenter })));
    if (projectPolygon) setProjectPolygon(null);
    resetForNewLocation();
    setCurrentToponym(name);
    toast({
      title: "Lieu-dit localisé",
      description: `Aires d'étude centrées sur "${name}" (pas de contour OSM disponible)`,
    });
  }, [resetForNewLocation, projectPolygon, toast]);

  const handleShapefileClear = useCallback(() => {
    setProjectPolygon(null);
    toast({
      title: "Shapefile supprimé",
      description: "Mode point restauré. Cliquez sur la carte pour placer le centre.",
    });
  }, [toast]);

  return (
    <div className="relative w-full h-screen overflow-hidden bg-gray-100">
      
      <Map 
        center={center} 
        circles={circles}
        results={results} 
        onMapClick={handleMapClick}
        selectedSpecies={selectedSpecies}
        onSelectSpecies={(name) => {
          setSelectedSpecies(name);
          if (name && !isPanelOpen) setIsPanelOpen(true);
        }}
        activeTaxonFilters={activeTaxonFilters}
        excludeMarine={excludeMarine}
        projectPolygon={projectPolygon}
        panelOpen={isPanelOpen}
        panelWidth={panelWidth}
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
        onShapefileLoad={handleShapefileLoad}
        onShapefileClear={handleShapefileClear}
        projectPolygon={projectPolygon}
        isLoadingShapefile={isLoadingShapefile}
        onOpenLieuxDits={() => setShowLieuxDits(true)}
        isCollapsed={isPanelOpen}
        onExpand={() => setIsPanelOpen(false)}
      />

      <ResultsPanel 
        key={locationKey}
        isOpen={isPanelOpen} 
        onClose={() => setIsPanelOpen(false)} 
        results={results}
        selectedSpecies={selectedSpecies}
        onSelectSpecies={setSelectedSpecies}
        activeTaxonFilters={activeTaxonFilters}
        onToggleTaxonFilter={handleToggleTaxonFilter}
        onToggleAllTaxonFilters={handleToggleAllTaxonFilters}
        excludeMarine={excludeMarine}
        onToggleExcludeMarine={() => setExcludeMarine(v => !v)}
        includeINaturalist={includeINaturalist}
        onToggleIncludeINaturalist={() => setIncludeINaturalist(v => !v)}
        toponym={currentToponym}
      />

      <AboutDialog open={showAbout} onOpenChange={setShowAbout} />
      <ApiDialog open={showApi} onOpenChange={setShowApi} />
      <LieuxDitsDialog
        open={showLieuxDits}
        onOpenChange={setShowLieuxDits}
        onSelectPolygon={handleSelectLieuDitPolygon}
        onSelectPoint={handleSelectLieuDitPoint}
      />

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

        <button
          type="button"
          onClick={() => setShowApi(true)}
          className="flex items-center gap-1.5 bg-white/80 backdrop-blur px-2.5 py-2 rounded-lg cursor-pointer hover:bg-white transition-colors shadow-sm"
          aria-label="Agent IA — connecter Claude ou ChatGPT"
          data-testid="button-agent-ia"
          title="Agent IA — connecter Claude / ChatGPT à Inventaire Flash via MCP"
        >
          <Bot className="h-4 w-4 text-teal-600" />
          <span className="text-xs font-semibold text-gray-700">Agent IA</span>
        </button>

        <a
          href="https://alispecies.io"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 bg-white/80 backdrop-blur px-2.5 py-2 rounded-lg cursor-pointer hover:bg-white transition-colors shadow-sm"
          aria-label="Ouvrir ALI Species"
          data-testid="link-ali-species"
          title="Ouvrir ALI Species (statuts réglementaires TAXREF)"
        >
          <span className="text-xs font-semibold text-gray-700">ALI Species</span>
          <ExternalLink className="h-3.5 w-3.5 text-teal-600" />
        </a>

      </div>

    </div>
  );
}
