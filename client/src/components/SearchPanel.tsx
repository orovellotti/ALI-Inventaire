import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Bot, Check, ChevronDown, ChevronUp, FileArchive, Landmark, Loader2, MapPin, Pencil, Search, Settings2, Target, Upload, X, Zap } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { BufferCircle, PROJECT_PRESETS, ProjectPreset, STUDY_AREAS } from "@/lib/gbif";
import type { ProjectPolygon } from "@/lib/shapefile";

interface SearchPanelProps {
  embedded?: boolean; toponym: string; onGoToPlace: (query: string) => void; onLaunchAnalysis: () => void;
  isSearching: boolean; isAnalyzing: boolean; circles: BufferCircle[]; onToggleCircle: (id: string) => void;
  onRadiusChange: (id: string, radius: number) => void; activePresetId: string; onApplyPreset: (preset: ProjectPreset) => void;
  onShapefileLoad: (file: File) => void; onShapefileClear: () => void; projectPolygon: ProjectPolygon | null;
  isLoadingShapefile: boolean; onOpenLieuxDits: () => void; isCollapsed?: boolean; onExpand?: () => void;
}

function AliMessage({ children }: { children: ReactNode }) {
  return <div className="ali-message" data-testid="message-ali"><Bot aria-hidden="true" /><div><p><strong>Ali</strong></p>{children}</div></div>;
}

export function SearchPanel(props: SearchPanelProps) {
  const { embedded = false, toponym, onGoToPlace, onLaunchAnalysis, isSearching, isAnalyzing, circles, onToggleCircle, onRadiusChange, activePresetId, onApplyPreset, onShapefileLoad, onShapefileClear, projectPolygon, isLoadingShapefile, onOpenLieuxDits, isCollapsed, onExpand } = props;
  const [query, setQuery] = useState("");
  const [locationChosen, setLocationChosen] = useState(false);
  const [perimeterConfirmed, setPerimeterConfirmed] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [expandedCircle, setExpandedCircle] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const initialToponymRef = useRef(toponym);
  const enabledCount = circles.filter((circle) => circle.enabled).length;

  useEffect(() => {
    if (projectPolygon || toponym !== initialToponymRef.current) {
      setLocationChosen(true);
      setPerimeterConfirmed(false);
    }
  }, [projectPolygon, toponym]);
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

  if (isCollapsed) return <button type="button" onClick={onExpand} className={embedded ? "w-full" : "absolute top-6 left-1/2 z-[1000] -translate-x-1/2"} data-testid="button-expand-search">Modifier la recherche</button>;

  return <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={embedded ? "search-dialogue" : "search-dialogue absolute top-6 left-1/2 z-[1000] w-[92%] max-w-md -translate-x-1/2"}>
    <AliMessage>
      <p>Bonjour, je suis Ali Inventaire.</p>
      <p>Je peux réaliser une première analyse de la biodiversité potentiellement présente sur votre site et identifier les vérifications à effectuer sur le terrain.</p>
      <p>Pour commencer, où se trouve le site à étudier&nbsp;?</p>
    </AliMessage>
    <div className="user-response location-response" data-testid="response-location">
      <Search aria-hidden="true" />
      <Input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => event.key === "Enter" && locate()} placeholder="Adresse, commune ou coordonnées GPS" data-testid="input-search" />
      <Button onClick={locate} disabled={isSearching || !query.trim()} aria-label="Localiser" data-testid="button-goto">{isSearching ? <Loader2 className="animate-spin" /> : <MapPin />}</Button>
      <button type="button" onClick={() => setMoreOpen(!moreOpen)} aria-expanded={moreOpen} aria-label="Autres méthodes de localisation" data-testid="button-more-location"><ChevronDown /></button>
      <AnimatePresence>{moreOpen && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="location-methods">
        <button type="button" onClick={() => chooseAlternate(onOpenLieuxDits)} data-testid="popover-lieu-dit"><Landmark /> Choisir un lieu-dit ou une commune</button>
        <button type="button" onClick={() => chooseAlternate(() => fileInputRef.current?.click())} disabled={isLoadingShapefile} data-testid="popover-shapefile">{isLoadingShapefile ? <Loader2 className="animate-spin" /> : <Upload />} Importer une emprise shapefile (.zip)</button>
      </motion.div>}</AnimatePresence>
      <input ref={fileInputRef} type="file" accept=".zip" onChange={(event) => { const file = event.target.files?.[0]; if (file) onShapefileLoad(file); event.target.value = ""; }} className="hidden" data-testid="input-shapefile" />
    </div>
    {locationChosen && <>
      <AliMessage>
        <p>J’ai localisé votre site.</p>
        <p className="site-confirmation"><MapPin /> {projectPolygon ? projectPolygon.name : toponym}</p>
        {projectPolygon && <p className="site-confirmation"><FileArchive /> Emprise importée&nbsp;: {projectPolygon.geojson.features.length} entité{projectPolygon.geojson.features.length > 1 ? "s" : ""} <button type="button" onClick={onShapefileClear} aria-label="Supprimer l'emprise" data-testid="button-clear-shapefile"><X /></button></p>}
        <p>Le périmètre est-il correct&nbsp;? Vous pouvez le confirmer ou le modifier directement sur la carte.</p>
      </AliMessage>
      <div className="response-actions" data-testid="response-perimeter">
        <button type="button" className={perimeterConfirmed ? "selected" : ""} onClick={() => { setPerimeterConfirmed(true); setSettingsOpen(false); }}><Check /> Oui, ce périmètre est correct</button>
        <button type="button" onClick={() => { setPerimeterConfirmed(true); setSettingsOpen(true); }}><Pencil /> Modifier les paramètres</button>
      </div>
    </>}
    {perimeterConfirmed && <>
      <AliMessage><p>Pour adapter la pré-étude, choisissez la nature de votre projet et les aires à prendre en compte.</p></AliMessage>
      <div className="user-response settings-response" data-testid="response-study-settings">
        <button type="button" onClick={() => setSettingsOpen(!settingsOpen)} aria-expanded={settingsOpen} data-testid="button-toggle-settings"><Settings2 /> <span>{PROJECT_PRESETS.find((preset) => preset.id === activePresetId)?.label || "Paramètres personnalisés"}</span>{settingsOpen ? <ChevronUp /> : <ChevronDown />}</button>
        <AnimatePresence>{settingsOpen && <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="settings-detail">
          <p>Nature du projet</p><div className="preset-list">{PROJECT_PRESETS.filter((preset) => preset.id !== "custom").map((preset) => <button key={preset.id} type="button" onClick={() => onApplyPreset(preset)} className={activePresetId === preset.id ? "selected" : ""} data-testid={`preset-${preset.id}`}>{preset.label}</button>)}</div>
          <p><Target /> Aires d’étude</p>
          {circles.map((circle) => <div key={circle.id} className="circle-control" data-testid={`circle-item-${circle.id}`}><button type="button" onClick={() => onToggleCircle(circle.id)} className={circle.enabled ? "selected" : ""} data-testid={`toggle-circle-${circle.id}`}><Check /> {circle.label}</button>{circle.enabled && <><button type="button" onClick={() => setExpandedCircle(expandedCircle === circle.id ? null : circle.id)}>{formatRadius(circle.radius)} <ChevronDown /></button>{expandedCircle === circle.id && <Slider value={[circle.radius]} onValueChange={(values) => onRadiusChange(circle.id, values[0])} min={100} max={circle.id === "eloignee" ? 15000 : circle.id === "rapprochee" ? 5000 : 2000} step={100} data-testid={`slider-radius-${circle.id}`} />}</>}</div>)}
        </motion.div>}</AnimatePresence>
      </div>
      <AliMessage><p>Je vais lancer une pré-étude biodiversité à partir des données disponibles&nbsp;: habitats, observations à proximité, espèces potentiellement présentes et zonages.</p><p><strong>Cette analyse ne remplace pas un inventaire réalisé sur le terrain par un écologue.</strong></p></AliMessage>
      <div className="response-actions launch-response"><button type="button" onClick={onLaunchAnalysis} disabled={isAnalyzing || enabledCount === 0} data-testid="button-launch-analysis">{isAnalyzing ? <Loader2 className="animate-spin" /> : <Zap />} Lancer la pré-étude biodiversité</button></div>
    </>}
  </motion.div>;
}