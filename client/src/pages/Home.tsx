import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { Map } from "@/components/Map";
import { SearchPanel } from "@/components/SearchPanel";
import { ResultsPanel } from "@/components/ResultsPanel";
import { AboutDialog } from "@/components/AboutDialog";
import { ApiDialog } from "@/components/ApiDialog";
import { AnalysisProgress } from "@/components/AnalysisProgress";
import { LieuxDitsDialog } from "@/components/LieuxDitsDialog";
import { searchGBIFMultiCircle, InventoryResult, BufferCircle, STUDY_AREAS, ProjectPreset, TAXON_GROUPS, getTaxonGroupId } from "@/lib/gbif";
import { searchPlace, reverseGeocode } from "@/lib/geocoding";
import { parseShapefile, ProjectPolygon } from "@/lib/shapefile";
import { toZonageMapFeatures } from "@/lib/zonageMap";
import { fetchZonages, type ZonagesData } from "@/lib/zonages";
import { fetchPotentialSpecies } from "@/lib/potentialSpecies";
import type { PotentialSpeciesResult } from "@shared/types";
import { useToast } from "@/hooks/use-toast";
import { Leaf, HelpCircle, Bot, BookOpen } from "lucide-react";
import { Link } from "wouter";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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
  const [zonages, setZonages] = useState<ZonagesData | null>(null);
  const [zonagesLoading, setZonagesLoading] = useState(false);
  const zonageFeatures = useMemo(() => toZonageMapFeatures(zonages), [zonages]);
  const [potentialSpecies, setPotentialSpecies] = useState<PotentialSpeciesResult | null>(null);
  const [potentialSpeciesLoading, setPotentialSpeciesLoading] = useState(false);
  const [potentialSpeciesError, setPotentialSpeciesError] = useState(false);
  const [selectedZonageId, setSelectedZonageId] = useState<string | null>(null);
  const [isLoadingShapefile, setIsLoadingShapefile] = useState(false);
  const [locationKey, setLocationKey] = useState(0);
  const [pendingLocationChange, setPendingLocationChange] = useState<
    { kind: "map"; center: [number, number] } | { kind: "reset" } | null
  >(null);
  const { toast } = useToast();

  const inventoryRequestId = useRef(0);
  const zonagesAbortController = useRef<AbortController | null>(null);
  const potentialSpeciesAbortController = useRef<AbortController | null>(null);
  const resetForNewLocation = useCallback(() => {
    inventoryRequestId.current++;
    zonagesAbortController.current?.abort();
    zonagesAbortController.current = null;
    potentialSpeciesAbortController.current?.abort();
    potentialSpeciesAbortController.current = null;
    setResults(null);
    setZonages(null);
    setZonagesLoading(false);
    setPotentialSpecies(null);
    setPotentialSpeciesLoading(false);
    setPotentialSpeciesError(false);
    setSelectedSpecies(null);
    setSelectedZonageId(null);
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
    const enabledCircles = circles.filter(c => c.enabled);
    const enabledCount = enabledCircles.length;
    if (enabledCount === 0) {
      toast({
        title: "Aucune aire sélectionnée",
        description: "Activez au moins une aire d'étude pour lancer l'analyse.",
        variant: "destructive",
      });
      return;
    }

    const requestId = ++inventoryRequestId.current;
    const referenceCircle =
      enabledCircles.find((circle) => circle.id === "immediate") ?? enabledCircles[0];
    zonagesAbortController.current?.abort();
    const zonagesController = new AbortController();
    zonagesAbortController.current = zonagesController;
    potentialSpeciesAbortController.current?.abort();
    const potentialController = new AbortController();
    potentialSpeciesAbortController.current = potentialController;
    setResults(null);
    setSelectedSpecies(null);
    setIsPanelOpen(false);
    setLocationKey((key) => key + 1);
    setZonages(null);
    setSelectedZonageId(null);
    setZonagesLoading(true);
    setPotentialSpecies(null);
    setPotentialSpeciesLoading(true);
    setPotentialSpeciesError(false);

    // Les zonages partent dès le clic, en parallèle de GBIF/iNaturalist.
    // Leur échec reste non bloquant : l'inventaire d'espèces s'ouvre quand même.
    void fetchZonages(
      referenceCircle.center[0],
      referenceCircle.center[1],
      referenceCircle.radius,
      zonagesController.signal,
    )
      .then((data) => {
        if (requestId === inventoryRequestId.current) setZonages(data);
      })
      .catch((error: unknown) => {
        if (
          requestId === inventoryRequestId.current &&
          !(error instanceof DOMException && error.name === "AbortError")
        ) {
          setZonages(null);
        }
      })
      .finally(() => {
        if (requestId === inventoryRequestId.current) setZonagesLoading(false);
      });

    // La compatibilité écologique part elle aussi dès le clic. Les occurrences
    // reçues ensuite serviront uniquement à distinguer avérées et potentielles.
    void fetchPotentialSpecies(
      referenceCircle.center[0],
      referenceCircle.center[1],
      referenceCircle.radius,
      potentialController.signal,
    )
      .then((data) => {
        if (requestId === inventoryRequestId.current) setPotentialSpecies(data);
      })
      .catch((error: unknown) => {
        if (
          requestId === inventoryRequestId.current &&
          !(error instanceof DOMException && error.name === "AbortError")
        ) {
          setPotentialSpeciesError(true);
        }
      })
      .finally(() => {
        if (requestId === inventoryRequestId.current) setPotentialSpeciesLoading(false);
      });

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
      zonagesController.abort();
      potentialController.abort();
      setZonages(null);
      setZonagesLoading(false);
      setPotentialSpecies(null);
      setPotentialSpeciesLoading(false);
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
  const applyMapCenter = useCallback((lat: number, lng: number) => {
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
  }, [resetForNewLocation]);

  const handleMapClick = (lat: number, lng: number) => {
    if (projectPolygon) return;
    if (results || isAnalyzing) {
      setPendingLocationChange({ kind: "map", center: [lat, lng] });
      return;
    }
    applyMapCenter(lat, lng);
  };

  const confirmLocationChange = () => {
    const pending = pendingLocationChange;
    setPendingLocationChange(null);
    if (!pending) return;
    if (pending.kind === "map") {
      applyMapCenter(pending.center[0], pending.center[1]);
    } else {
      resetForNewLocation();
    }
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
    <div className="relative h-[100dvh] min-h-[100dvh] w-full overflow-hidden bg-gray-100">
      
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
        zonageFeatures={zonageFeatures}
        selectedZonageId={selectedZonageId}
        onSelectZonage={(id) => {
          setSelectedZonageId(id);
          if (id && !isPanelOpen) setIsPanelOpen(true);
        }}
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
        zonages={zonages}
        zonagesLoading={zonagesLoading}
        potentialSpecies={potentialSpecies}
        potentialSpeciesLoading={potentialSpeciesLoading}
        potentialSpeciesError={potentialSpeciesError}
        selectedZonageId={selectedZonageId}
        onSelectZonage={setSelectedZonageId}
      />

      <AnalysisProgress
        active={isAnalyzing}
        includeINaturalist={includeINaturalist}
        areaCount={circles.filter((c) => c.enabled).length}
        zonagesLoading={zonagesLoading}
        zonagesReady={zonages !== null}
        zonageFeatureCount={zonageFeatures.length}
        potentialSpeciesLoading={potentialSpeciesLoading}
        potentialSpeciesReady={potentialSpecies !== null}
        potentialSpeciesCount={potentialSpecies?.potentialCount ?? 0}
      />

      <AboutDialog open={showAbout} onOpenChange={setShowAbout} />
      <ApiDialog open={showApi} onOpenChange={setShowApi} />
      <LieuxDitsDialog
        open={showLieuxDits}
        onOpenChange={setShowLieuxDits}
        onSelectPolygon={handleSelectLieuDitPolygon}
        onSelectPoint={handleSelectLieuDitPoint}
      />

      <AlertDialog
        open={pendingLocationChange !== null}
        onOpenChange={(open) => { if (!open) setPendingLocationChange(null); }}
      >
        <AlertDialogContent className="z-[4000] max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingLocationChange?.kind === "map" ? "Déplacer le centre de l’étude ?" : "Commencer une nouvelle analyse ?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Les résultats actuellement affichés seront fermés et devront être recalculés pour la nouvelle emprise.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Conserver les résultats</AlertDialogCancel>
            <AlertDialogAction onClick={confirmLocationChange} className="bg-teal-700 hover:bg-teal-800">
              {pendingLocationChange?.kind === "map" ? "Déplacer le centre" : "Nouvelle analyse"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="absolute top-6 left-6 z-[1000] flex items-center gap-2">
        <button 
          type="button"
          className="flex items-center gap-2 bg-white/80 backdrop-blur px-3 py-2 rounded-lg cursor-pointer hover:bg-white transition-colors shadow-sm"
          onClick={() => {
            if (results || isAnalyzing) setPendingLocationChange({ kind: "reset" });
            else resetForNewLocation();
          }}
          aria-label="Commencer une nouvelle analyse"
          title="Commencer une nouvelle analyse"
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

        <Link
          href="/methodologie"
          className="flex items-center gap-1.5 rounded-lg bg-white/80 px-2.5 py-2 text-gray-700 shadow-sm backdrop-blur transition-colors hover:bg-white"
          aria-label="Lire la méthodologie"
          title="Lire la méthodologie"
        >
          <BookOpen className="h-4 w-4 text-teal-600" />
          <span className="hidden text-xs font-semibold sm:inline">Méthode</span>
        </Link>

        <button
          type="button"
          onClick={() => setShowApi(true)}
          className="flex items-center gap-1.5 bg-white/80 backdrop-blur px-2.5 py-2 rounded-lg cursor-pointer hover:bg-white transition-colors shadow-sm"
          aria-label="MCP — connecter Claude ou ChatGPT à Inventaire Flash"
          data-testid="button-agent-ia"
          title="MCP — connecter Claude / ChatGPT (agent IA) à Inventaire Flash"
        >
          <Bot className="h-4 w-4 text-teal-600" />
          <span className="text-xs font-semibold text-gray-700">MCP</span>
        </button>

      </div>

    </div>
  );
}
