import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Bot, Check, ChevronDown, ChevronUp, FileArchive, Landmark, Loader2, MapPin, Pencil, Search, Settings2, Target, Upload, X, Zap } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { BufferCircle, PROJECT_PRESETS, ProjectPreset, STUDY_AREAS } from "@/lib/gbif";
import type { ProjectPolygon } from "@/lib/shapefile";

interface SearchPanelProps {
  embedded?: boolean; toponym: string; locationReady: boolean; onGoToPlace: (query: string) => void; onLaunchAnalysis: () => void;
  isSearching: boolean; isAnalyzing: boolean; circles: BufferCircle[]; onToggleCircle: (id: string) => void;
  onRadiusChange: (id: string, radius: number) => void; activePresetId: string; onApplyPreset: (preset: ProjectPreset) => void;
  onShapefileLoad: (file: File) => void; onShapefileClear: () => void; projectPolygon: ProjectPolygon | null;
  isLoadingShapefile: boolean; onOpenLieuxDits: () => void; isCollapsed?: boolean; onExpand?: () => void;
}

function AliMessage({ children }: { children: ReactNode }) {
  return <div className="ali-message" data-testid="message-ali"><Bot aria-hidden="true" /><div><p><strong>ALi</strong></p>{children}</div></div>;
}

export function SearchPanel(props: SearchPanelProps) {
  const { embedded = false, toponym, locationReady, onGoToPlace, onLaunchAnalysis, isSearching, isAnalyzing, circles, onToggleCircle, onRadiusChange, activePresetId, onApplyPreset, onShapefileLoad, onShapefileClear, projectPolygon, isLoadingShapefile, onOpenLieuxDits, isCollapsed, onExpand } = props;
  const [query, setQuery] = useState("");
  const [perimeterConfirmed, setPerimeterConfirmed] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [expandedCircle, setExpandedCircle] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const enabledCount = circles.filter((circle) => circle.enabled).length;

  useEffect(() => {
    if (locationReady) setPerimeterConfirmed(false);
  }, [locationReady, toponym]);
  const locate = () => {
    if (!query.trim()) return;
    setPerimeterConfirmed(false);
    onGoToPlace(query.trim());
  };
  const chooseAlternate = (action: () => void) => {
    setMoreOpen(false);
    setPerimeterConfirmed(false);
    action();
  };
  const formatRadius = (radius: number) => radius >= 1000 ? `${radius / 1000} km` : `${radius} m`;

  if (isCollapsed) return <button type="button" onClick={onExpand} className={embedded ? "w-full" : "absolute top-6 left-1/2 z-[1000] -translate-x-1/2"} data-testid="button-expand-search">Edit search</button>;

  return <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={embedded ? "search-dialogue" : "search-dialogue absolute top-6 left-1/2 z-[1000] w-[92%] max-w-md -translate-x-1/2"}>
    <AliMessage>
      <p>Hello, I'm ALi Inventory.</p>
      <p>I can prepare an initial ecological assessment from available public data and identify what needs checking in the field. Public-data coverage varies around the world.</p>
      <p>Where is the site you want to study?</p>
    </AliMessage>
    <div className="user-response location-response" data-testid="response-location">
      <Search aria-hidden="true" />
        <Input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => event.key === "Enter" && locate()} placeholder="Place, address or GPS coordinates worldwide" aria-label="Place, address or GPS coordinates" data-testid="input-search" />
      <Button onClick={locate} disabled={isSearching || !query.trim()} aria-label="Find location" data-testid="button-goto">{isSearching ? <Loader2 className="animate-spin" /> : <MapPin />}</Button>
        <button type="button" onClick={() => setMoreOpen(!moreOpen)} aria-expanded={moreOpen} aria-controls="location-methods" aria-label="Other ways to select a location" data-testid="button-more-location"><ChevronDown /></button>
       <AnimatePresence>{moreOpen && <motion.div id="location-methods" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="location-methods">
         <button type="button" onClick={() => chooseAlternate(onOpenLieuxDits)} data-testid="popover-lieu-dit"><Landmark /> Search for a place or locality</button>
         <button type="button" onClick={() => chooseAlternate(() => fileInputRef.current?.click())} disabled={isLoadingShapefile} data-testid="popover-shapefile">{isLoadingShapefile ? <Loader2 className="animate-spin" /> : <Upload />} Import a shapefile boundary (.zip)</button>
      </motion.div>}</AnimatePresence>
      <input ref={fileInputRef} type="file" accept=".zip" onChange={(event) => { const file = event.target.files?.[0]; if (file) onShapefileLoad(file); event.target.value = ""; }} className="hidden" data-testid="input-shapefile" />
    </div>
    {locationReady && <>
      <AliMessage>
        <p>Selected location:</p>
        <p className="site-confirmation"><MapPin /> {projectPolygon ? projectPolygon.name : toponym}</p>
        {projectPolygon && <p className="site-confirmation"><FileArchive /> Imported boundary: {projectPolygon.geojson.features.length} feature{projectPolygon.geojson.features.length > 1 ? "s" : ""} <button type="button" onClick={onShapefileClear} aria-label="Remove boundary" data-testid="button-clear-shapefile"><X /></button></p>}
        <p>Is this the right area? Confirm it or adjust the location on the map.</p>
      </AliMessage>
      <div className="response-actions" data-testid="response-perimeter">
        <button type="button" className={perimeterConfirmed ? "selected" : ""} onClick={() => { setPerimeterConfirmed(true); setSettingsOpen(false); }}><Check /> Yes, this area is correct</button>
        <button type="button" onClick={() => { setPerimeterConfirmed(true); setSettingsOpen(true); }}><Pencil /> Adjust settings</button>
      </div>
    </>}
    {perimeterConfirmed && <>
      <AliMessage><p>Choose your project type and study areas to tailor the preliminary biodiversity assessment.</p></AliMessage>
      <div className="user-response settings-response" data-testid="response-study-settings">
          <button type="button" onClick={() => setSettingsOpen(!settingsOpen)} aria-expanded={settingsOpen} aria-controls="study-settings-detail" data-testid="button-toggle-settings"><Settings2 /> <span>{PROJECT_PRESETS.find((preset) => preset.id === activePresetId)?.label || "Custom settings"}</span>{settingsOpen ? <ChevronUp /> : <ChevronDown />}</button>
         <AnimatePresence>{settingsOpen && <motion.div id="study-settings-detail" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="settings-detail">
           <p>Project type</p><div className="preset-list">{PROJECT_PRESETS.filter((preset) => preset.id !== "custom").map((preset) => <button key={preset.id} type="button" onClick={() => onApplyPreset(preset)} className={activePresetId === preset.id ? "selected" : ""} data-testid={`preset-${preset.id}`}>{preset.label}</button>)}</div>
           <p><Target /> Study areas</p>
            {circles.map((circle) => <div key={circle.id} className="circle-control" data-testid={`circle-item-${circle.id}`}><button type="button" onClick={() => onToggleCircle(circle.id)} className={circle.enabled ? "selected" : ""} aria-pressed={circle.enabled} data-testid={`toggle-circle-${circle.id}`}><Check /> {circle.label}</button>{circle.enabled && <><button type="button" onClick={() => setExpandedCircle(expandedCircle === circle.id ? null : circle.id)} aria-expanded={expandedCircle === circle.id} aria-controls={`radius-${circle.id}`}>{formatRadius(circle.radius)} <ChevronDown /></button>{expandedCircle === circle.id && <div id={`radius-${circle.id}`}><Slider value={[circle.radius]} onValueChange={(values) => onRadiusChange(circle.id, values[0])} min={100} max={circle.id === "eloignee" ? 15000 : circle.id === "rapprochee" ? 5000 : 2000} step={100} aria-label={`Radius for ${circle.label}`} data-testid={`slider-radius-${circle.id}`} /></div>}</>}</div>)}
        </motion.div>}</AnimatePresence>
      </div>
      <AliMessage><p>The preliminary biodiversity assessment combines nearby public observations, ecological compatibility and available protected-area data. Coverage varies by country and source.</p><p><strong>These results support decisions but do not confirm species presence on site. Field surveys and an ecologist's expertise are needed for confirmation.</strong></p></AliMessage>
       <div className="response-actions launch-response"><button type="button" onClick={onLaunchAnalysis} disabled={isAnalyzing || enabledCount === 0} aria-busy={isAnalyzing} data-testid="button-launch-analysis">{isAnalyzing ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Zap aria-hidden="true" />} Start preliminary biodiversity assessment</button>{isAnalyzing && <p role="status" aria-live="polite">Preliminary biodiversity assessment in progress…</p>}</div>
    </>}
  </motion.div>;
}