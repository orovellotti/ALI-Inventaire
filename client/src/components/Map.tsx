import { MapContainer, TileLayer, WMSTileLayer, Circle, CircleMarker, GeoJSON, Polygon, Tooltip as LeafletTooltip, useMapEvents, useMap } from "react-leaflet";
import { useEffect, useMemo, useState } from "react";
import { Layers, Map as MapIcon, Satellite, Mountain, ChevronDown, Trees, Droplets, Building2 } from "lucide-react";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { InventoryResult, BufferCircle, STUDY_AREAS, getTaxonGroupId, isMarineSpecies } from "@/lib/gbif";
import type { ProjectPolygon } from "@/lib/shapefile";
import { ZonageMapFeature, ZONAGE_MAP_COLORS } from "@/lib/zonageMap";
import { occurrenceKey, uniqueOccurrences } from "@/lib/resultKeys";

import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});

L.Marker.prototype.options.icon = DefaultIcon;

interface MapProps {
  center: [number, number];
  circles: BufferCircle[];
  results: InventoryResult | null;
  onMapClick: (lat: number, lng: number) => void;
  selectedSpecies: string | null;
  onSelectSpecies?: (key: string | null) => void;
  activeTaxonFilters: Set<string>;
  excludeMarine?: boolean;
  projectPolygon: ProjectPolygon | null;
  panelOpen?: boolean;
  panelWidth?: number;
  zonageFeatures?: ZonageMapFeature[];
  selectedZonageId?: string | null;
  onSelectZonage?: (id: string | null) => void;
}

/** Centre la carte sur l'emprise du zonage sélectionné (avec marge pour le panneau). */
function ZonageFitter({ features, selectedId, panelOpen, panelWidth }: { features: ZonageMapFeature[]; selectedId: string | null | undefined; panelOpen?: boolean; panelWidth?: number }) {
  const map = useMap();
  useEffect(() => {
    if (!selectedId) return;
    const feature = features.find(f => f.id === selectedId);
    if (!feature || feature.polygons.length === 0) return;
    const bounds = L.latLngBounds(feature.polygons.flat(2) as [number, number][]);
    if (!bounds.isValid()) return;
    let firstFrame = 0;
    let settleTimer = 0;
    const fit = () => {
      map.invalidateSize({ animate: false, pan: false });
      const mapSize = map.getSize();
      const isMobile = mapSize.x < 768;
      const reservedWidth = !isMobile && panelOpen && panelWidth ? Math.min(panelWidth, mapSize.x * 0.52) : 0;
      const reservedHeight = isMobile && panelOpen ? Math.round(mapSize.y * 0.72) : 0;
      map.fitBounds(bounds, {
        paddingTopLeft: [44, 44],
        paddingBottomRight: [44 + reservedWidth, 44 + reservedHeight],
        maxZoom: 14,
        animate: false,
      } as any);
    };
    firstFrame = window.requestAnimationFrame(fit);
    settleTimer = window.setTimeout(fit, 260);
    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.clearTimeout(settleTimer);
    };
  }, [selectedId, features, panelOpen, panelWidth, map]);
  return null;
}

function circlesBounds(circles: BufferCircle[]): L.LatLngBounds | null {
  const enabled = circles.filter((circle) => circle.enabled);
  if (enabled.length === 0) return null;
  const bounds = L.latLngBounds([]);
  enabled.forEach((circle) => {
    // A small geodesic approximation is sufficient at study-area scales and
    // keeps the complete buffer visible, including on narrow mobile maps.
    const latDelta = circle.radius / 111_320;
    const lngDelta = circle.radius / (111_320 * Math.max(0.2, Math.cos(circle.center[0] * Math.PI / 180)));
    bounds.extend([
      [circle.center[0] - latDelta, circle.center[1] - lngDelta],
      [circle.center[0] + latDelta, circle.center[1] + lngDelta],
    ]);
  });
  return bounds.isValid() ? bounds : null;
}

function MapController({ center, circles, projectPolygon, panelOpen, panelWidth, selectedZonageId }: { center: [number, number]; circles: BufferCircle[]; projectPolygon: ProjectPolygon | null; panelOpen?: boolean; panelWidth?: number; selectedZonageId?: string | null }) {
  const map = useMap();
  useEffect(() => {
    if (selectedZonageId) return;
    let firstFrame = 0;
    let settleTimer = 0;
    const fit = () => {
      // The drawer changes the map's usable viewport after React has painted.
      // Re-measuring before fitting prevents stale bounds on Android and when
      // the drawer is opened during an analysis.
      map.invalidateSize({ animate: false, pan: false });
      const bounds = projectPolygon ? L.latLngBounds(projectPolygon.bounds as any) : circlesBounds(circles);
      const mapSize = map.getSize();
      const isMobile = mapSize.x < 768;
      const reservedWidth = !isMobile && panelOpen && panelWidth ? Math.min(panelWidth, mapSize.x * 0.52) : 0;
      const reservedHeight = isMobile && panelOpen ? Math.round(mapSize.y * 0.72) : 0;
      if (bounds?.isValid()) {
        map.fitBounds(bounds, {
          paddingTopLeft: [44, 44],
          paddingBottomRight: [44 + reservedWidth, 44 + reservedHeight],
          maxZoom: projectPolygon ? 15 : 16,
          animate: false,
        } as any);
      } else {
        map.flyTo(center, map.getZoom(), { animate: false });
      }
    };
    firstFrame = window.requestAnimationFrame(fit);
    settleTimer = window.setTimeout(fit, 260);
    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.clearTimeout(settleTimer);
    };
  }, [center, circles, projectPolygon, panelOpen, panelWidth, selectedZonageId, map]);
  return null;
}

function MapEvents({ onMapClick }: { onMapClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

type BaseLayer = "ignplan" | "ignortho" | "osm" | "nature" | "satellite";

const IGN_WMTS = "https://data.geopf.fr/wmts?SERVICE=WMTS&VERSION=1.0.0&REQUEST=GetTile&STYLE=normal&TILEMATRIXSET=PM";

const BASE_LAYERS: Record<BaseLayer, {
  url: string;
  attribution: string;
  maxZoom: number;
  label: string;
  category: "clair" | "nature" | "satellite";
}> = {
  ignplan: {
    url: `${IGN_WMTS}&FORMAT=image/png&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}`,
    attribution: '&copy; <a href="https://geoservices.ign.fr/">IGN</a> Plan IGN v2',
    maxZoom: 19,
    label: "IGN map (France)",
    category: "clair",
  },
  osm: {
    url: "https://tile.openstreetmap.de/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
    label: "OpenStreetMap",
    category: "clair",
  },
  nature: {
    url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    attribution: 'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> contributors, SRTM | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)',
    maxZoom: 17,
    label: "Topographic map (worldwide)",
    category: "nature",
  },
  ignortho: {
    url: `${IGN_WMTS}&FORMAT=image/jpeg&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}`,
    attribution: '&copy; <a href="https://geoservices.ign.fr/">IGN</a> Orthophotographies',
    maxZoom: 21,
    label: "IGN aerial imagery (France)",
    category: "satellite",
  },
  satellite: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, USDA, USGS, AeroGRID, IGN, and the GIS User Community',
    maxZoom: 19,
    label: "Satellite imagery (worldwide)",
    category: "satellite",
  },
};

type OverlayId = "natura2000_sic" | "natura2000_zps" | "znieff1" | "znieff2" | "hydro" | "clc";

const IGN_WMS_R = "https://data.geopf.fr/wms-r/wms";
const IGN_WMS_V = "https://data.geopf.fr/wms-v/wms";

const OVERLAYS: Record<OverlayId, {
  url: string;
  layers: string;
  label: string;
  shortLabel: string;
  attribution: string;
  color: string;
  group: "Espaces protégés" | "Habitats / Sol" | "Eau";
}> = {
  natura2000_sic: {
    url: IGN_WMS_V,
    layers: "Patrinat_SIC_France",
    label: "Natura 2000 — Sites of Community Importance (habitats, SAC/SCI; Europe)",
    shortLabel: "Natura 2000 — habitats",
    attribution: "MNHN / Patrinat — IGN Géoplateforme",
    color: "#16a34a",
    group: "Espaces protégés",
  },
  natura2000_zps: {
    url: IGN_WMS_V,
    layers: "Patrinat_ZPS_France",
    label: "Natura 2000 — Special Protection Areas (birds; Europe)",
    shortLabel: "Natura 2000 — birds",
    attribution: "MNHN / Patrinat — IGN Géoplateforme",
    color: "#0ea5e9",
    group: "Espaces protégés",
  },
  znieff1: {
    url: IGN_WMS_V,
    layers: "Patrinat_ZNIEFF1_France",
    label: "ZNIEFF type I (areas of biological interest; France)",
    shortLabel: "ZNIEFF type I (France)",
    attribution: "MNHN / Patrinat — IGN Géoplateforme",
    color: "#f59e0b",
    group: "Espaces protégés",
  },
  znieff2: {
    url: IGN_WMS_V,
    layers: "Patrinat_ZNIEFF2_France",
    label: "ZNIEFF type II (large natural areas; France)",
    shortLabel: "ZNIEFF type II (France)",
    attribution: "MNHN / Patrinat — IGN Géoplateforme",
    color: "#fbbf24",
    group: "Espaces protégés",
  },
  hydro: {
    url: IGN_WMS_V,
    layers: "BDTOPO-GEOPO-HYDROGRAPHIE_WLD_WGS84G",
    label: "BD TOPO hydrography (rivers and lakes; France)",
    shortLabel: "Rivers and lakes (France)",
    attribution: "IGN — BD TOPO Hydrographie",
    color: "#06b6d4",
    group: "Eau",
  },
  clc: {
    url: IGN_WMS_R,
    layers: "LANDCOVER.CLC18",
    label: "Corine Land Cover 2018 (Europe)",
    shortLabel: "Land cover (2018)",
    attribution: "Copernicus — IGN Géoplateforme",
    color: "#a855f7",
    group: "Habitats / Sol",
  },
};

export function Map({ center, circles, results, onMapClick, selectedSpecies, onSelectSpecies, activeTaxonFilters, excludeMarine, projectPolygon, panelOpen, panelWidth, zonageFeatures, selectedZonageId, onSelectZonage }: MapProps) {
  const [baseLayer, setBaseLayer] = useState<BaseLayer>(() => {
    try {
      const v = localStorage.getItem("if.baseLayer");
      return v && v in BASE_LAYERS ? (v as BaseLayer) : "osm";
    } catch { return "osm"; }
  });
  const [activeOverlays, setActiveOverlays] = useState<Set<OverlayId>>(() => {
    try {
      const raw = localStorage.getItem("if.overlays");
      if (!raw) return new Set<OverlayId>();
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return new Set<OverlayId>();
      return new Set(arr.filter((id): id is OverlayId => typeof id === "string" && id in OVERLAYS));
    } catch { return new Set<OverlayId>(); }
  });
  const [layerPanelOpen, setLayerPanelOpen] = useState(false);
  const layer = BASE_LAYERS[baseLayer];

  const toggleOverlay = (id: OverlayId) => {
    setActiveOverlays(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      try { localStorage.setItem("if.overlays", JSON.stringify(Array.from(next))); } catch {}
      return next;
    });
  };

  const selectBaseLayer = (id: BaseLayer) => {
    setBaseLayer(id);
    try { localStorage.setItem("if.baseLayer", id); } catch {}
  };
  const sortedCircles = [...circles]
    .filter(c => c.enabled)
    .sort((a, b) => b.radius - a.radius);

  const filteredOccurrences = useMemo(() => {
    if (!results) return [];
    return uniqueOccurrences(results.occurrences.filter(occ =>
      activeTaxonFilters.has(getTaxonGroupId(occ)) &&
      !(excludeMarine && isMarineSpecies(occ))
    ));
  }, [results, activeTaxonFilters, excludeMarine]);
  const selectedOccurrence = selectedSpecies
    ? filteredOccurrences.find((occ) => occurrenceKey(occ) === selectedSpecies)
    : undefined;

  return (
    <div
      id="map-container"
      className="h-full w-full relative z-0"
      role="region"
      aria-label="Map of the site and public data"
      aria-describedby="map-text-alternative"
    >
      <div id="map-text-alternative" className="sr-only">
        <p>
           Synchronized text alternative for the map. Current center: latitude {center[0].toFixed(5)},
          longitude {center[1].toFixed(5)}.
        </p>
        <p>
          {projectPolygon
             ? `Imported boundary: ${projectPolygon.name}.`
             : `${sortedCircles.length} circular study area${sortedCircles.length !== 1 ? "s" : ""} shown.`}
           {" "}{filteredOccurrences.length} public observation{filteredOccurrences.length !== 1 ? "s" : ""} shown.
           {" "}{(zonageFeatures || []).length} designated area{(zonageFeatures || []).length !== 1 ? "s" : ""} with mapped boundaries.
        </p>
        {selectedOccurrence && (
          <p>
             Selected taxon: {selectedOccurrence.vernacularName || selectedOccurrence.scientificName}
            {selectedOccurrence.vernacularName ? `, ${selectedOccurrence.scientificName}` : ""}.
          </p>
        )}
      </div>
      <MapContainer 
        center={center} 
        zoom={13} 
        scrollWheelZoom={true} 
        className="h-full w-full outline-none"
        zoomControl={false}
         aria-label="Interactive map. Use arrow keys to pan and plus or minus keys to zoom."
      >
        <TileLayer
          key={baseLayer}
          attribution={layer.attribution}
          url={layer.url}
          maxZoom={layer.maxZoom}
        />

        {Array.from(activeOverlays).map(id => {
          const ov = OVERLAYS[id];
          if (!ov) return null;
          return (
            <WMSTileLayer
              key={`ov-${id}`}
              url={ov.url}
              params={{ layers: ov.layers, format: "image/png", transparent: true, version: "1.3.0" } as any}
              opacity={0.55}
              attribution={ov.attribution}
              zIndex={400}
            />
          );
        })}

        <MapController center={center} circles={circles} projectPolygon={projectPolygon} panelOpen={panelOpen} panelWidth={panelWidth} selectedZonageId={selectedZonageId} />
        <MapEvents onMapClick={onMapClick} />
        <ZonageFitter features={zonageFeatures || []} selectedId={selectedZonageId} panelOpen={panelOpen} panelWidth={panelWidth} />

        {(zonageFeatures || []).map((f) => {
          const isSelected = selectedZonageId === f.id;
          const color = ZONAGE_MAP_COLORS[f.category] || ZONAGE_MAP_COLORS.autre;
          return (
            <Polygon
              key={`zonage-${f.id}`}
              positions={f.polygons}
              pathOptions={{
                color,
                weight: isSelected ? 3 : 1.5,
                dashArray: isSelected ? undefined : "4 3",
                fillColor: color,
                fillOpacity: isSelected ? 0.22 : 0.05,
              }}
              eventHandlers={{
                click: (e) => {
                  L.DomEvent.stopPropagation(e);
                  if (onSelectZonage) onSelectZonage(isSelected ? null : f.id);
                },
              }}
            >
              <LeafletTooltip direction="top" opacity={0.95} sticky>
                <div className="text-xs">
                  <div className="font-semibold">{f.name}</div>
                  <div className="text-gray-600">{f.type}</div>
                   <div className="text-[10px] text-gray-400 mt-0.5">Click to view in the list</div>
                </div>
              </LeafletTooltip>
            </Polygon>
          );
        })}

        {projectPolygon && (
          <GeoJSON
            key={projectPolygon.name}
            data={projectPolygon.geojson}
            style={{
              color: "#0d9488",
              weight: 3,
              fillColor: "#0d9488",
              fillOpacity: 0.15,
              dashArray: undefined,
            }}
          />
        )}

        {sortedCircles.map((circle) => {
          const studyArea = STUDY_AREAS.find(a => a.id === circle.id);
          const color = studyArea?.color || "#0d9488";
          const dashArray = studyArea?.dashArray;

          return (
            <Circle
              key={circle.id}
              center={circle.center}
              pathOptions={{
                fillColor: color,
                color: color,
                weight: 2,
                fillOpacity: circle.id === "immediate" ? 0.10 : 0.04,
                dashArray: dashArray,
              }}
              radius={circle.radius}
            />
          );
        })}

        <CircleMarker
          center={center}
          radius={projectPolygon ? 4 : 6}
          pathOptions={{
            color: '#0d9488',
            fillColor: '#0d9488',
            fillOpacity: 1,
            weight: 2
          }}
        />

        {filteredOccurrences.map((occ) => {
          const key = occurrenceKey(occ);
          const isSelected = selectedSpecies === key;
          return (
            <CircleMarker
              key={key}
              center={[occ.decimalLatitude, occ.decimalLongitude]}
              radius={isSelected ? 14 : (occ.alertLevel === 'high' ? 8 : (occ.alertLevel === 'medium' ? 6 : 4))}
              pathOptions={{
                color: isSelected ? '#0d9488' : 'white',
                weight: isSelected ? 3 : 1,
                fillColor: occ.alertLevel === 'high' ? '#dc2626' : (occ.alertLevel === 'medium' ? '#f59e0b' : '#22c55e'),
                fillOpacity: isSelected ? 1 : 0.8
              }}
              eventHandlers={{
                click: (e) => {
                  L.DomEvent.stopPropagation(e);
                  if (onSelectSpecies) {
                    onSelectSpecies(isSelected ? null : key);
                  }
                },
              }}
            >
              <LeafletTooltip direction="top" offset={[0, -4]} opacity={0.95} sticky>
                <div className="text-xs">
                  <div className="font-semibold">{occ.vernacularName || occ.scientificName}</div>
                  {occ.vernacularName && (
                    <div className="italic text-gray-600">{occ.scientificName}</div>
                  )}
                  {occ.iucnStatus && (
                     <div className="text-gray-500 mt-0.5">IUCN: {occ.iucnStatus}</div>
                  )}
                   <div className="text-[10px] text-gray-400 mt-0.5">Click to view species details</div>
                </div>
              </LeafletTooltip>
            </CircleMarker>
          );
        })}
      </MapContainer>

      <div
        className="absolute bottom-7 left-4 z-[400] hidden max-w-[250px] rounded-lg border border-gray-200 bg-white/95 px-3 py-2 text-[11px] text-gray-700 shadow-md backdrop-blur sm:block"
         aria-label="Map legend"
      >
         <p className="mb-1.5 font-bold text-[#17483d]">Legend</p>
        <div className="space-y-1">
           <p className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-[#0d9488]" aria-hidden="true" /> Site or study center</p>
           {projectPolygon && <p className="flex items-center gap-2"><span className="h-2.5 w-4 border-2 border-[#0d9488] bg-[#0d9488]/15" aria-hidden="true" /> Imported boundary</p>}
          {filteredOccurrences.length > 0 && (
            <p className="flex items-center gap-2">
              <span className="flex gap-0.5" aria-hidden="true">
                <span className="h-2.5 w-2.5 rounded-full bg-red-600" />
                <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                <span className="h-2.5 w-2.5 rounded-full bg-green-500" />
              </span>
               Documented public observations
            </p>
          )}
          {Array.from(activeOverlays).map((id) => (
            <p key={`legend-${id}`} className="flex items-center gap-2">
              <span className="h-2.5 w-4 rounded-sm" style={{ backgroundColor: OVERLAYS[id].color }} aria-hidden="true" />
              {OVERLAYS[id].shortLabel}
            </p>
          ))}
        </div>
      </div>

      <div className="absolute top-3 right-3 z-[400]" data-testid="layer-control">
        <button
          type="button"
          onClick={() => setLayerPanelOpen(o => !o)}
          className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-white/95 backdrop-blur shadow-md border border-gray-200 text-gray-700 hover:bg-gray-50 font-medium"
          data-testid="button-toggle-layers"
           title="Choose a basemap and ecological layers"
          aria-expanded={layerPanelOpen}
          aria-controls="map-layer-options"
        >
          <Layers className="h-3.5 w-3.5 text-teal-600" />
           <span>Map layers</span>
          {activeOverlays.size > 0 && (
            <span className="text-[10px] bg-teal-100 text-teal-700 px-1.5 py-0.5 rounded-full font-bold">
              {activeOverlays.size}
            </span>
          )}
          <ChevronDown className={`h-3 w-3 text-gray-400 transition-transform ${layerPanelOpen ? "rotate-180" : ""}`} />
        </button>

        {layerPanelOpen && (
          <div id="map-layer-options" className="mt-1 w-72 bg-white/98 backdrop-blur rounded-lg shadow-xl border border-gray-200 overflow-hidden">
            <div className="px-3 pt-2.5 pb-1.5 border-b border-gray-100">
               <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Choose a basemap</p>
            </div>
            <div className="px-2 py-1.5 max-h-72 overflow-y-auto">
              {(["clair", "nature", "satellite"] as const).map(cat => {
                const layers = (Object.entries(BASE_LAYERS) as [BaseLayer, typeof BASE_LAYERS[BaseLayer]][])
                  .filter(([, l]) => l.category === cat);
                const Icon = cat === "clair" ? MapIcon : cat === "nature" ? Mountain : Satellite;
                return (
                  <div key={cat} className="mb-1">
                    <div className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                      <Icon className="h-3 w-3" />
                       {cat === "clair" ? "Street maps" : cat === "nature" ? "Terrain and nature" : "Aerial and satellite"}
                    </div>
                    {layers.map(([id, l]) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => selectBaseLayer(id)}
                        className={`w-full flex items-center justify-between text-left text-xs px-3 py-1.5 rounded-md transition-colors ${
                          baseLayer === id ? "bg-teal-50 text-teal-800 font-semibold" : "text-gray-700 hover:bg-gray-50"
                        }`}
                        data-testid={`button-basemap-${id}`}
                        aria-pressed={baseLayer === id}
                      >
                        <span>{l.label}</span>
                        {baseLayer === id && <span className="text-teal-600">●</span>}
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
            <div className="px-3 pt-2.5 pb-1.5 border-t border-gray-100 bg-gray-50/50">
               <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Ecological layers (regional coverage)</p>
            </div>
            <div className="px-2 py-1.5 max-h-64 overflow-y-auto bg-gray-50/30">
              {(["Espaces protégés", "Eau", "Habitats / Sol"] as const).map(group => {
                 const groupLabel = group === "Espaces protégés" ? "Protected areas" : group === "Eau" ? "Water and rivers" : "Land cover";
                const items = (Object.entries(OVERLAYS) as [OverlayId, typeof OVERLAYS[OverlayId]][])
                  .filter(([, o]) => o.group === group);
                const Icon = group === "Espaces protégés" ? Trees : group === "Eau" ? Droplets : Building2;
                return (
                  <div key={group} className="mb-1">
                    <div className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                      <Icon className="h-3 w-3" />
                      {groupLabel}
                    </div>
                    {items.map(([id, ov]) => {
                      const isActive = activeOverlays.has(id);
                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={() => toggleOverlay(id)}
                          className={`w-full flex items-center gap-2 text-left text-xs px-3 py-1.5 rounded-md transition-colors ${
                            isActive ? "bg-white shadow-sm" : "hover:bg-white/60"
                          }`}
                          data-testid={`button-overlay-${id}`}
                          aria-pressed={isActive}
                        >
                          <span
                            className="h-3 w-3 rounded-sm border border-gray-300 shrink-0 flex items-center justify-center"
                            style={isActive ? { backgroundColor: ov.color, borderColor: ov.color } : {}}
                          >
                            {isActive && <span className="text-white text-[10px] leading-none">✓</span>}
                          </span>
                          <span className={isActive ? "text-gray-900 font-medium" : "text-gray-600"}>{ov.shortLabel}</span>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
              {activeOverlays.size > 0 && (
                <button
                  type="button"
                  onClick={() => { setActiveOverlays(new Set()); try { localStorage.setItem("if.overlays", "[]"); } catch {} }}
                  className="w-full text-[10px] text-teal-600 hover:text-teal-800 font-semibold uppercase tracking-wider py-1.5 mt-1"
                  data-testid="button-clear-overlays"
                >
                   Turn off all
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="absolute bottom-1 right-1 bg-white/50 backdrop-blur px-2 py-0.5 text-[10px] text-gray-500 rounded z-[400] pointer-events-none">
         GBIF · iNat data | {layer.label}{activeOverlays.size > 0 && ` + ${activeOverlays.size} layer${activeOverlays.size > 1 ? "s" : ""}`}
      </div>
    </div>
  );
}
