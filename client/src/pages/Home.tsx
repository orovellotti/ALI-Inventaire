import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { Map } from "@/components/Map";
import { SearchPanel } from "@/components/SearchPanel";
import { ResultsPanel } from "@/components/ResultsPanel";
import { ALiBrandMark } from "@/components/ALiBrandMark";
import { AboutDialog } from "@/components/AboutDialog";
import { ApiDialog } from "@/components/ApiDialog";
import { LieuxDitsDialog } from "@/components/LieuxDitsDialog";
import { HarnessDialog } from "@/components/HarnessDialog";
import { SignInButton, UserButton, useAuth } from "@clerk/react";
import { searchGBIFMultiCircle, InventoryResult, BufferCircle, STUDY_AREAS, ProjectPreset, TAXON_GROUPS, getTaxonGroupId } from "@/lib/gbif";
import { searchPlace, reverseGeocode } from "@/lib/geocoding";
import { parseShapefile, ProjectPolygon } from "@/lib/shapefile";
import { toZonageMapFeatures } from "@/lib/zonageMap";
import { occurrenceKey } from "@/lib/resultKeys";
import { fetchZonages, type ZonagesData } from "@/lib/zonages";
import type { PotentialSpeciesResult, StudyCoverage } from "@shared/types";
import { DEFAULT_HARNESS_CONFIG, type HarnessConfig } from "@shared/harness";
import {
  createAnalysisConversationId,
  deleteAnalysisConversation,
  listAnalysisConversations,
  renameAnalysisConversation,
  saveAnalysisConversation,
  type AnalysisConversation,
  type AnalysisConversationStatus,
} from "@/lib/analysisHistory";
import { useToast } from "@/hooks/use-toast";
import { Leaf, HelpCircle, Bot, BookOpen, MessageSquare, MapPin, Share2 } from "lucide-react";
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
  { name: "Camargue, France", coords: [43.5396, 4.4697] },
  { name: "Lake District, United Kingdom", coords: [54.46, -3.09] },
  { name: "Everglades, United States", coords: [25.86, -80.89] },
  { name: "Serengeti, Tanzania", coords: [-2.33, 34.83] },
  { name: "Sundarbans, Bangladesh", coords: [21.95, 89.18] },
  { name: "Melbourne, Australia", coords: [-37.8136, 144.9631] },
  { name: "Amazon rainforest, Brazil", coords: [-3.47, -62.22] },
  { name: "Banff National Park, Canada", coords: [51.5, -116.05] },
  { name: "Doñana National Park, Spain", coords: [37.0, -6.44] },
  { name: "Fiordland National Park, New Zealand", coords: [-45.42, 167.72] },
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
  const [isPanelOpen, setIsPanelOpen] = useState(true);
  const [selectedSpecies, setSelectedSpecies] = useState<string | null>(null);
  const [showAbout, setShowAbout] = useState(false);
  const [showApi, setShowApi] = useState(false);
  const [showHarness, setShowHarness] = useState(false);
  const [harnessConfig, setHarnessConfig] = useState<HarnessConfig>(DEFAULT_HARNESS_CONFIG);
  const [showLieuxDits, setShowLieuxDits] = useState(false);
  const [currentToponym, setCurrentToponym] = useState<string>("Location to confirm");
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
  const [coverage, setCoverage] = useState<StudyCoverage | null>(null);
  const [coverageError, setCoverageError] = useState<string | null>(null);
  const [selectedZonageId, setSelectedZonageId] = useState<string | null>(null);
  const [isLoadingShapefile, setIsLoadingShapefile] = useState(false);
  const [isLocationReady, setIsLocationReady] = useState(false);
  const [locationKey, setLocationKey] = useState(0);
  const [analysisFailed, setAnalysisFailed] = useState(false);
  const [zonagesError, setZonagesError] = useState(false);
  const [conversations, setConversations] = useState<AnalysisConversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [historyReady, setHistoryReady] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [pendingLocationChange, setPendingLocationChange] = useState<
    { kind: "map"; center: [number, number] } | { kind: "reset" } | null
  >(null);
  const { toast } = useToast();
  const { isLoaded: authLoaded, isSignedIn } = useAuth();

  const refreshRuntimeHarness = useCallback(() => {
    fetch("/api/runtime/harness")
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then(setHarnessConfig)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    refreshRuntimeHarness();
  }, [refreshRuntimeHarness]);

  const openHarness = () => setShowHarness(true);

  const inventoryRequestId = useRef(0);
  const coverageAbortController = useRef<AbortController | null>(null);
  const zonagesAbortController = useRef<AbortController | null>(null);
  const potentialSpeciesAbortController = useRef<AbortController | null>(null);
  const suppressNextHistorySave = useRef(false);
  const resetForNewLocation = useCallback((locationReady = false) => {
    inventoryRequestId.current++;
    coverageAbortController.current?.abort();
    coverageAbortController.current = null;
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
    setCoverage(null);
    setCoverageError(null);
    setAnalysisFailed(false);
    setZonagesError(false);
    setSelectedSpecies(null);
    setSelectedZonageId(null);
    setActiveConversationId(null);
    setIsPanelOpen(true);
    setIsAnalyzing(false);
    setIsLocationReady(locationReady);
    setLocationKey(k => k + 1);
  }, []);

  const restoreConversation = useCallback((conversation: AnalysisConversation) => {
    inventoryRequestId.current++;
    coverageAbortController.current?.abort();
    coverageAbortController.current = null;
    zonagesAbortController.current?.abort();
    potentialSpeciesAbortController.current?.abort();
    zonagesAbortController.current = null;
    potentialSpeciesAbortController.current = null;
    suppressNextHistorySave.current = true;
    setActiveConversationId(conversation.id);
    setCenter(conversation.parameters.center);
    setCircles(conversation.parameters.circles);
    setCurrentToponym(conversation.parameters.toponym);
    setActivePresetId(conversation.parameters.activePresetId);
    setActiveTaxonFilters(new Set(conversation.parameters.activeTaxonFilters));
    setExcludeMarine(conversation.parameters.excludeMarine);
    setIncludeINaturalist(conversation.parameters.includeINaturalist);
    setProjectPolygon(conversation.parameters.projectPolygon);
    setResults(conversation.results.inventory);
    setCoverage(conversation.results.inventory?.coverage ?? null);
    setCoverageError(null);
    setZonages(conversation.results.zonages);
    setPotentialSpecies(conversation.results.potentialSpecies);
    setZonagesLoading(false);
    setPotentialSpeciesLoading(false);
    setPotentialSpeciesError(Boolean(conversation.agentErrors.potentialSpecies));
    setZonagesError(Boolean(conversation.agentErrors.zonages));
    setAnalysisFailed(conversation.status === "failed");
    setSelectedSpecies(null);
    setSelectedZonageId(null);
    setIsAnalyzing(false);
    setIsPanelOpen(true);
    setIsLocationReady(true);
    setLocationKey((key) => key + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    listAnalysisConversations()
      .then((saved) => {
        if (cancelled) return;
        const normalized = saved.map((conversation) => {
          if (conversation.status !== "running") return conversation;
          const hasInventory = conversation.results.inventory !== null;
          return {
            ...conversation,
            status: hasInventory ? "partial" as const : "failed" as const,
            agentErrors: {
              ...conversation.agentErrors,
              ...(!hasInventory
                 ? { inventory: "This analysis was interrupted before the observations agent responded." }
                : {}),
              ...(hasInventory && !conversation.results.zonages
                 ? { zonages: "This step was interrupted before completion." }
                : {}),
              ...(hasInventory && !conversation.results.potentialSpecies
                 ? { potentialSpecies: "This step was interrupted before completion." }
                : {}),
            },
          };
        });
        setConversations(normalized);
        if (normalized[0]) restoreConversation(normalized[0]);
        normalized
          .filter((conversation, index) => saved[index]?.status === "running")
          .forEach((conversation) => void saveAnalysisConversation(conversation));
      })
      .catch((error: unknown) => {
        if (cancelled) return;
         setHistoryError(error instanceof Error ? error.message : "Local history is unavailable.");
      })
      .finally(() => {
        if (!cancelled) setHistoryReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [restoreConversation]);

  const handleGoToPlace = async (query: string) => {
    setIsSearching(true);
    try {
      const place = await searchPlace(query);
      if (place) {
        const newCenter: [number, number] = [place.lat, place.lon];
        setCenter(newCenter);
        setCircles(prev => prev.map(c => ({ ...c, center: newCenter })));
        if (projectPolygon) setProjectPolygon(null);
        resetForNewLocation(true);
        setCurrentToponym(place.display_name);
        toast({
           title: "Location found",
          description: place.display_name,
        });
      } else {
        toast({
           title: "Location not found",
           description: `Could not locate "${query}".`,
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
         title: "Geocoding error",
         description: "Could not contact the location service.",
        variant: "destructive",
      });
    } finally {
      setIsSearching(false);
    }
  };

  const handleLaunchAnalysis = async () => {
    const agentEnabled = (id: string) => harnessConfig.agents.find((agent) => agent.id === id)?.enabled === true;
    if (!agentEnabled("occurrences")) {
       toast({ title: "Observations agent disabled", description: "Enable it in the Harness to start an assessment.", variant: "destructive" });
      return;
    }
    const enabledCircles = circles.filter(c => c.enabled);
    const enabledCount = enabledCircles.length;
    if (enabledCount === 0) {
      toast({
         title: "No study area selected",
         description: "Enable at least one study area to start the analysis.",
        variant: "destructive",
      });
      return;
    }

    const requestId = ++inventoryRequestId.current;
    const referenceCircle =
      enabledCircles.find((circle) => circle.id === "immediate") ?? enabledCircles[0];
    const conversationId = createAnalysisConversationId();
    const now = new Date().toISOString();
    const initialConversation: AnalysisConversation = {
      version: 1,
      id: conversationId,
       title: currentToponym.split(",")[0].trim() || "New analysis",
      status: "running",
      parameters: {
        toponym: currentToponym,
        center,
        circles,
        activePresetId,
        activeTaxonFilters: Array.from(activeTaxonFilters),
        excludeMarine,
        includeINaturalist,
        projectPolygon,
      },
      results: {
        inventory: null,
        zonages: null,
        potentialSpecies: null,
      },
      agentErrors: {},
      createdAt: now,
      updatedAt: now,
    };
    setActiveConversationId(conversationId);
    setConversations((previous) => [initialConversation, ...previous].slice(0, 20));
    setHistoryError(null);
    coverageAbortController.current?.abort();
    const coverageController = new AbortController();
    coverageAbortController.current = coverageController;
    zonagesAbortController.current?.abort();
    const zonagesController = new AbortController();
    zonagesAbortController.current = zonagesController;
    potentialSpeciesAbortController.current?.abort();
    const potentialController = new AbortController();
    potentialSpeciesAbortController.current = potentialController;
    setResults(null);
    setSelectedSpecies(null);
    setIsPanelOpen(true);
    setLocationKey((key) => key + 1);
    setZonages(null);
    setSelectedZonageId(null);
    setZonagesLoading(false);
    setPotentialSpecies(null);
    setPotentialSpeciesLoading(false);
    setPotentialSpeciesError(false);
    setCoverage(null);
    setCoverageError(null);
    setAnalysisFailed(false);
    setZonagesError(false);
    setIsAnalyzing(true);
    // Global inventory does not depend on France-specific coverage. Start it
    // immediately, while country coverage is resolved for the regional calls.
    const inventoryPromise = searchGBIFMultiCircle(circles, { includeINaturalist })
      .then((data) => ({ data, error: null as unknown }))
      .catch((error: unknown) => ({ data: null, error }));

    try {
      await saveAnalysisConversation(initialConversation);
    } catch (error) {
       setHistoryError(error instanceof Error ? error.message : "Could not add this analysis to history.");
    }

    let resolvedCoverage: StudyCoverage | null = null;
    const coverageTimeout = window.setTimeout(() => coverageController.abort(), 12_000);
    try {
      const params = new URLSearchParams({
        lat: String(referenceCircle.center[0]),
        lng: String(referenceCircle.center[1]),
      });
      const response = await fetch(`/api/coverage?${params.toString()}`, {
        signal: coverageController.signal,
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || `Country coverage lookup failed (${response.status})`);
      }
      const value: StudyCoverage = await response.json();
      if (typeof value.countryCode !== "string" || typeof value.frenchSources !== "boolean") {
        throw new Error("Country coverage response was incomplete");
      }
      resolvedCoverage = value;
      if (requestId === inventoryRequestId.current) setCoverage(value);
    } catch (error) {
      if (requestId === inventoryRequestId.current) {
        setCoverageError(
          `Country coverage could not be verified (${error instanceof Error && error.name !== "AbortError" ? error.message : "request timed out"}). France-only sources were skipped; this is not evidence of absence.`,
        );
      }
    } finally {
      window.clearTimeout(coverageTimeout);
      if (coverageAbortController.current === coverageController) coverageAbortController.current = null;
    }
    if (requestId !== inventoryRequestId.current) return;

    // Never query French-only endpoints outside confirmed French coverage.
    // An unknown country is not a negative finding; global inventory continues.
    if (agentEnabled("zonages") && resolvedCoverage?.frenchSources) {
      setZonagesLoading(true);
      void fetchZonages(
      referenceCircle.center[0],
      referenceCircle.center[1],
      referenceCircle.radius,
      zonagesController.signal,
    )
      .then((data) => {
        if (requestId === inventoryRequestId.current) {
          setZonages(data);
          setZonagesError(false);
        }
      })
      .catch((error: unknown) => {
        if (
          requestId === inventoryRequestId.current &&
          !(error instanceof DOMException && error.name === "AbortError")
        ) {
          setZonages(null);
          setZonagesError(true);
        }
      })
      .finally(() => {
        if (requestId === inventoryRequestId.current) setZonagesLoading(false);
      });
    }

    try {
      const inventoryOutcome = await inventoryPromise;
      if (!inventoryOutcome.data) {
        throw inventoryOutcome.error ?? new Error("Global inventory unavailable");
      }
      const data = inventoryOutcome.data;
      if (requestId !== inventoryRequestId.current) return;
      setResults({ ...data, coverage: data.coverage ?? resolvedCoverage ?? undefined });
      setAnalysisFailed(false);
      setIsPanelOpen(true);
      toast({
         title: "Inventory complete",
         description: `${data.stats.speciesCount} species found across ${enabledCount} study area${enabledCount > 1 ? 's' : ''}.`,
      });
      if (agentEnabled("zonages") && resolvedCoverage?.frenchSources) {
        setPotentialSpeciesLoading(true);
        void fetch("/api/potential-species", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: potentialController.signal,
          body: JSON.stringify({
            lat: referenceCircle.center[0],
            lng: referenceCircle.center[1],
            radius: referenceCircle.radius,
            projectArea: projectPolygon?.geojson,
            occurrences: data.occurrences.slice(0, 5000).map((occurrence) => ({
              key: occurrence.key,
              scientificName: occurrence.scientificName,
              decimalLatitude: occurrence.decimalLatitude,
              decimalLongitude: occurrence.decimalLongitude,
              source: occurrence.source ?? "gbif",
            })),
          }),
        })
          .then(async (response) => {
            if (!response.ok) {
              const payload = await response.json().catch(() => ({}));
               throw new Error(payload.error || "Ecological potential analysis unavailable");
            }
            return response.json() as Promise<PotentialSpeciesResult>;
          })
          .then((potential) => {
            if (requestId !== inventoryRequestId.current) return;
            setPotentialSpecies(potential);
            setPotentialSpeciesError(false);
          })
          .catch((potentialError: unknown) => {
            if (
              requestId === inventoryRequestId.current &&
              !(potentialError instanceof DOMException && potentialError.name === "AbortError")
            ) {
              setPotentialSpecies(null);
              setPotentialSpeciesError(true);
            }
          })
          .finally(() => {
            if (requestId === inventoryRequestId.current) setPotentialSpeciesLoading(false);
          });
      }
    } catch (error) {
      if (requestId !== inventoryRequestId.current) return;
      zonagesController.abort();
      potentialController.abort();
      setZonages(null);
      setZonagesLoading(false);
      setPotentialSpecies(null);
      setPotentialSpeciesLoading(false);
      setAnalysisFailed(true);
      toast({
         title: "Error",
         description: "Could not retrieve GBIF data.",
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
    resetForNewLocation(true);
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
      const matchingOcc = results.occurrences.find(o => occurrenceKey(o) === selectedSpecies);
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
      resetForNewLocation(true);
      setCurrentToponym(polygon.name);
      toast({
         title: "Shapefile loaded",
         description: `${polygon.geojson.features.length} feature(s) — "${polygon.name}"`,
      });
    } catch (error) {
       const msg = error instanceof Error ? error.message : "Unrecognized format";
      toast({
         title: "Upload error",
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
    resetForNewLocation(true);
    setCurrentToponym(polygon.name);
    toast({
       title: "Place loaded",
       description: `Using the boundary for "${polygon.name}"`,
    });
  }, [resetForNewLocation, toast]);

  const handleSelectLieuDitPoint = useCallback((lat: number, lng: number, name: string) => {
    const newCenter: [number, number] = [lat, lng];
    setCenter(newCenter);
    setCircles(prev => prev.map(c => ({ ...c, center: newCenter })));
    if (projectPolygon) setProjectPolygon(null);
    resetForNewLocation(true);
    setCurrentToponym(name);
    toast({
       title: "Place located",
       description: `Study areas centered on "${name}" (no OSM boundary available)`,
    });
  }, [resetForNewLocation, projectPolygon, toast]);

  const handleShapefileClear = useCallback(() => {
    setProjectPolygon(null);
    toast({
       title: "Shapefile removed",
       description: "Point mode restored. Click the map to set the center.",
    });
  }, [toast]);

  useEffect(() => {
    if (!historyReady || !activeConversationId) return;
    if (suppressNextHistorySave.current) {
      suppressNextHistorySave.current = false;
      return;
    }

    const existing = conversations.find((conversation) => conversation.id === activeConversationId);
    if (!existing) return;
    const status: AnalysisConversationStatus =
      isAnalyzing || zonagesLoading || potentialSpeciesLoading
        ? "running"
        : analysisFailed
          ? "failed"
          : results
            ? potentialSpeciesError || zonagesError || potentialSpecies?.partial || Boolean(zonages?.errors.length)
              ? "partial"
              : "complete"
            : "draft";
    const updated: AnalysisConversation = {
      ...existing,
      status,
      parameters: {
        toponym: currentToponym,
        center,
        circles,
        activePresetId,
        activeTaxonFilters: Array.from(activeTaxonFilters),
        excludeMarine,
        includeINaturalist,
        projectPolygon,
      },
      results: {
        inventory: results,
        zonages,
        potentialSpecies,
      },
      agentErrors: {
         ...(analysisFailed ? { inventory: "The observations agent could not complete the inventory." } : {}),
         ...(zonagesError ? { zonages: "The protected-area agent could not retrieve boundaries." } : {}),
         ...(potentialSpeciesError ? { potentialSpecies: "The ecological potential agent is unavailable." } : {}),
      },
      updatedAt: new Date().toISOString(),
    };

    setConversations((previous) =>
      [updated, ...previous.filter((conversation) => conversation.id !== updated.id)]
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, 20),
    );
    void saveAnalysisConversation(updated)
      .then(() => setHistoryError(null))
      .catch((error: unknown) => {
         setHistoryError(error instanceof Error ? error.message : "Could not save this analysis.");
      });
  }, [
    activeConversationId,
    activePresetId,
    activeTaxonFilters,
    analysisFailed,
    center,
    circles,
    currentToponym,
    excludeMarine,
    historyReady,
    includeINaturalist,
    isAnalyzing,
    potentialSpecies,
    potentialSpeciesError,
    potentialSpeciesLoading,
    projectPolygon,
    results,
    zonages,
    zonagesError,
    zonagesLoading,
  ]);

  const handleSelectConversation = useCallback((id: string) => {
    const conversation = conversations.find((item) => item.id === id);
    if (conversation) restoreConversation(conversation);
  }, [conversations, restoreConversation]);

  const handleNewConversation = useCallback(() => {
    resetForNewLocation();
  }, [resetForNewLocation]);

  const handleRenameConversation = useCallback(async (id: string, title: string) => {
    try {
      const renamed = await renameAnalysisConversation(id, title.trim());
      setConversations((previous) =>
        previous.map((conversation) => conversation.id === id ? renamed : conversation)
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
      );
      setHistoryError(null);
    } catch (error) {
       setHistoryError(error instanceof Error ? error.message : "Could not rename this conversation.");
    }
  }, []);

  const handleDeleteConversation = useCallback(async (id: string) => {
    try {
      await deleteAnalysisConversation(id);
      setConversations((previous) => previous.filter((conversation) => conversation.id !== id));
      if (id === activeConversationId) resetForNewLocation();
      setHistoryError(null);
    } catch (error) {
       setHistoryError(error instanceof Error ? error.message : "Could not delete this conversation.");
    }
  }, [activeConversationId, resetForNewLocation]);

  const requestSummary = useMemo(() => {
    const enabled = circles.filter((circle) => circle.enabled);
     const siteLabel = projectPolygon?.name || currentToponym.split(",")[0]?.trim() || "Selected site";
    const areaLabel = enabled
       .map((circle) => `${circle.label} (${circle.radius >= 1000 ? `${circle.radius / 1000} km` : `${circle.radius} m`})`)
      .join(", ");
     const sources = `GBIF${includeINaturalist ? " and iNaturalist" : ""}`;
     return `Site: ${siteLabel}. Study areas: ${areaLabel}. Sources: ${sources}.${projectPolygon ? " Imported boundary." : ""}`;
  }, [circles, currentToponym, includeINaturalist, projectPolygon]);

  return (
    <div className="relative h-[100dvh] min-h-[100dvh] w-full overflow-hidden bg-[#f8f7f0]">
      <header className="ali-global-header absolute inset-x-0 top-0 z-[2500] flex h-[76px] items-center border-b border-[#dfe3d8] bg-[#faf9f3]/95 px-4 backdrop-blur-md sm:px-6">
         <button type="button" onClick={() => { if (results || isAnalyzing) setPendingLocationChange({ kind: "reset" }); else { setIsPanelOpen(true); resetForNewLocation(); } }} className="flex items-center gap-3 text-left" aria-label="Start a new analysis" data-testid="global-brand">
          <span className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-[#1e594a] text-[#dcc05b]">
            <ALiBrandMark className="h-8 w-8" />
          </span>
          <span className="leading-none">
            <span className="flex items-center gap-2">
              <strong className="block font-serif text-[22px] font-semibold tracking-[-.05em] text-[#17483d]">ALi</strong>
               <span className="rounded-full border border-[#b9c9bb] bg-[#edf2e9] px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[.12em] text-[#426158]">Beta</span>
            </span>
             <small className="mt-1 block text-[9px] font-semibold uppercase tracking-[.19em] text-[#6b8076]">Global · Biodiversity</small>
          </span>
        </button>
        <div className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-2 md:flex">
           <span className="h-2 w-2 rounded-full bg-[#c4a642]" aria-hidden="true" /><span className="text-sm font-semibold text-[#315b4e]">{isLocationReady ? currentToponym.split(",")[0] : "New study"}</span><span className="text-xs text-[#7b8c83]">Preliminary biodiversity assessment</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {authLoaded && !isSignedIn && (
            <SignInButton mode="modal">
               <button type="button" className="hidden items-center gap-2 rounded-xl border border-[#d5ddd2] bg-[#fffef9] px-3 py-2 text-xs font-semibold text-[#426158] shadow-sm transition-colors hover:bg-[#edf2e9] sm:flex">Sign in</button>
            </SignInButton>
          )}
           <button type="button" onClick={openHarness} className="hidden items-center gap-2 rounded-xl border border-[#d5ddd2] bg-[#fffef9] px-3 py-2 text-xs font-semibold text-[#426158] shadow-sm transition-colors hover:bg-[#edf2e9] sm:flex" aria-label="View agent harness" data-testid="button-harness"><Bot className="h-4 w-4 text-[#1e594a]" /> Harness</button>
          {isSignedIn && <UserButton />}
           <button type="button" onClick={() => { const text = requestSummary || `Preliminary biodiversity assessment — ${currentToponym}`; if (navigator.share) void navigator.share({ title: "ALi Inventory", text }); else void navigator.clipboard?.writeText(text); }} className="flex items-center gap-2 rounded-xl border border-[#d5ddd2] bg-[#fffef9] px-3 py-2 text-xs font-semibold text-[#426158] shadow-sm transition-colors hover:bg-[#edf2e9]" aria-label="Share this study" data-testid="button-share"><Share2 className="h-4 w-4 text-[#1e594a]" /> <span className="hidden sm:inline">Share</span></button>
        </div>
      </header>
      {(coverageError || (coverage && !coverage.frenchSources && (!isPanelOpen || !results?.coverage))) && (
        <aside
          role="note"
          aria-live="polite"
          className="absolute left-4 top-[84px] z-[2600] max-w-[min(90vw,29rem)] rounded-xl border border-sky-200 bg-sky-50/95 px-4 py-3 text-xs leading-5 text-sky-900 shadow-sm"
          data-testid="coverage-gap-notice"
        >
          {coverageError ? (
            <><strong>Regional coverage unknown.</strong> {coverageError} Global observation sources are still queried where available.</>
          ) : (
            <><strong>{coverage?.country || coverage?.countryCode}: regional data gap.</strong> GBIF and iNaturalist observations remain available, but France-only zoning, habitats and territorial statuses were not queried here. Missing French data does not mean species or protected areas are absent.</>
          )}
        </aside>
      )}
      
      <Map 
        center={center} 
        circles={circles}
        results={results} 
        onMapClick={handleMapClick}
        selectedSpecies={selectedSpecies}
        onSelectSpecies={(key) => {
          setSelectedSpecies(key);
          if (key && !isPanelOpen) setIsPanelOpen(true);
        }}
        activeTaxonFilters={activeTaxonFilters}
        excludeMarine={excludeMarine}
        projectPolygon={projectPolygon}
        panelOpen={isPanelOpen}
        panelWidth={680}
        zonageFeatures={zonageFeatures}
        selectedZonageId={selectedZonageId}
        onSelectZonage={(id) => {
          setSelectedZonageId(id);
          if (id && !isPanelOpen) setIsPanelOpen(true);
        }}
      />

      {!isPanelOpen && (
        <button
          type="button"
          onClick={() => setIsPanelOpen(true)}
          className="absolute bottom-6 right-4 z-[1000] flex items-center gap-2 rounded-full border border-[#1e594a] bg-[#1e594a] px-4 py-2.5 text-sm font-semibold text-[#fffdf5] shadow-[0_10px_25px_rgba(25,70,58,.18)] transition-colors hover:bg-[#17483d] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c4a642] focus-visible:ring-offset-2"
           aria-label="Open analysis conversation"
          data-testid="button-open-conversation"
        >
          <MessageSquare className="h-4 w-4" />
          Conversation
        </button>
      )}

      <ResultsPanel 
        key={locationKey}
        isOpen={isPanelOpen} 
        isAnalyzing={isAnalyzing || zonagesLoading || potentialSpeciesLoading}
        areaCount={circles.filter((c) => c.enabled).length}
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
        projectArea={projectPolygon?.geojson}
        selectedZonageId={selectedZonageId}
        onSelectZonage={setSelectedZonageId}
        composer={
          <SearchPanel
            embedded
            toponym={currentToponym}
            locationReady={isLocationReady}
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
          />
        }
        conversations={conversations}
        activeConversationId={activeConversationId}
        historyError={historyError}
        requestSummary={requestSummary}
        onSelectConversation={handleSelectConversation}
        onNewConversation={handleNewConversation}
        onRenameConversation={handleRenameConversation}
        onDeleteConversation={handleDeleteConversation}
        harnessConfig={harnessConfig}
      />

      <AboutDialog open={showAbout} onOpenChange={setShowAbout} />
      <ApiDialog open={showApi} onOpenChange={setShowApi} />
      <HarnessDialog open={showHarness} onOpenChange={setShowHarness} config={harnessConfig} onConfigChange={() => refreshRuntimeHarness()} />
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
               {pendingLocationChange?.kind === "map" ? "Move the study center?" : "Start a new analysis?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
               This conversation will remain in your history. A new analysis will be prepared for the new area.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
             <AlertDialogCancel>Keep results</AlertDialogCancel>
            <AlertDialogAction onClick={confirmLocationChange} className="bg-[#1e594a] text-[#fffdf5] hover:bg-[#17483d]">
               {pendingLocationChange?.kind === "map" ? "Move center" : "New analysis"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="absolute left-3 top-3 z-[1000] flex items-center gap-2 sm:left-5 sm:top-4">
        <button 
          type="button"
          className="flex items-center gap-2 rounded-xl border border-[#d9ddd1] bg-[#fffef9]/95 px-3 py-2 shadow-[0_4px_14px_rgba(29,70,57,.08)] backdrop-blur transition-colors hover:bg-[#fffef9]"
          onClick={() => {
            if (results || isAnalyzing) setPendingLocationChange({ kind: "reset" });
            else {
              setIsPanelOpen(true);
              resetForNewLocation();
            }
          }}
           aria-label="Start a new analysis"
           title="Start a new analysis"
          data-testid="button-reset"
        >
          <div className="rounded-[10px] bg-[#1e594a] p-1.5">
            <Leaf className="h-4 w-4 text-[#dcc05b]" />
          </div>
          <span className="font-serif text-lg font-semibold tracking-[-0.04em] text-[#17483d]">ALi</span>
           <span className="rounded-full border border-[#b9c9bb] bg-[#edf2e9] px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[.12em] text-[#426158]">Beta</span>
           <span className="hidden text-[9px] font-semibold uppercase tracking-[.18em] text-[#668075] sm:inline">Global · Biodiversity</span>
        </button>

        <button
          type="button"
          onClick={() => setShowAbout(true)}
          className="rounded-xl border border-[#d9ddd1] bg-[#fffef9]/95 p-2 shadow-[0_4px_14px_rgba(29,70,57,.08)] backdrop-blur transition-colors hover:bg-[#fffef9]"
           aria-label="About the methodology"
          data-testid="button-about"
        >
          <HelpCircle className="h-4 w-4 text-[#557067]" />
        </button>

        <Link
          href="/methodologie"
          className="flex items-center gap-1.5 rounded-xl border border-[#d9ddd1] bg-[#fffef9]/95 px-2.5 py-2 text-[#426158] shadow-[0_4px_14px_rgba(29,70,57,.08)] backdrop-blur transition-colors hover:bg-[#fffef9]"
           aria-label="Read the methodology"
           title="Read the methodology"
        >
          <BookOpen className="h-4 w-4 text-[#1e594a]" />
           <span className="hidden text-xs font-semibold sm:inline">Method</span>
        </Link>

        <button
          type="button"
          onClick={() => setShowApi(true)}
          className="flex items-center gap-1.5 rounded-xl border border-[#d9ddd1] bg-[#fffef9]/95 px-2.5 py-2 shadow-[0_4px_14px_rgba(29,70,57,.08)] backdrop-blur transition-colors hover:bg-[#fffef9]"
           aria-label="MCP — connect Claude or ChatGPT to ALi Inventory"
          data-testid="button-agent-ia"
           title="MCP — connect Claude / ChatGPT to ALi Inventory"
        >
          <Bot className="h-4 w-4 text-[#1e594a]" />
          <span className="text-xs font-semibold text-[#426158]">MCP</span>
        </button>

      </div>

    </div>
  );
}
