import { MapContainer, TileLayer, Circle, CircleMarker, GeoJSON, useMapEvents, useMap } from "react-leaflet";
import { useEffect, useMemo, useState } from "react";
import { Layers, Map as MapIcon, Satellite, Mountain } from "lucide-react";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { InventoryResult, BufferCircle, STUDY_AREAS, getTaxonGroupId, isMarineSpecies } from "@/lib/gbif";
import type { ProjectPolygon } from "@/lib/shapefile";

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
  activeTaxonFilters: Set<string>;
  excludeMarine?: boolean;
  projectPolygon: ProjectPolygon | null;
}

function MapController({ center, projectPolygon }: { center: [number, number]; projectPolygon: ProjectPolygon | null }) {
  const map = useMap();
  useEffect(() => {
    if (projectPolygon) {
      map.fitBounds(projectPolygon.bounds, { padding: [60, 60], maxZoom: 15 });
    } else {
      map.flyTo(center, map.getZoom());
    }
  }, [center, projectPolygon, map]);
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

type BaseLayer = "osm" | "nature" | "satellite";

const BASE_LAYERS: Record<BaseLayer, { url: string; attribution: string; maxZoom: number; label: string }> = {
  osm: {
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
    label: "OpenStreetMap",
  },
  nature: {
    url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    attribution: 'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> contributors, SRTM | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)',
    maxZoom: 17,
    label: "OpenTopoMap",
  },
  satellite: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, USDA, USGS, AeroGRID, IGN, and the GIS User Community',
    maxZoom: 19,
    label: "Esri Imagery",
  },
};

export function Map({ center, circles, results, onMapClick, selectedSpecies, activeTaxonFilters, excludeMarine, projectPolygon }: MapProps) {
  const [baseLayer, setBaseLayer] = useState<BaseLayer>("nature");
  const layer = BASE_LAYERS[baseLayer];
  const sortedCircles = [...circles]
    .filter(c => c.enabled)
    .sort((a, b) => b.radius - a.radius);

  const filteredOccurrences = useMemo(() => {
    if (!results) return [];
    return results.occurrences.filter(occ =>
      activeTaxonFilters.has(getTaxonGroupId(occ)) &&
      !(excludeMarine && isMarineSpecies(occ))
    );
  }, [results, activeTaxonFilters, excludeMarine]);

  return (
    <div id="map-container" className="h-full w-full relative z-0">
      <MapContainer 
        center={center} 
        zoom={13} 
        scrollWheelZoom={true} 
        className="h-full w-full outline-none"
        zoomControl={false}
      >
        <TileLayer
          key={baseLayer}
          attribution={layer.attribution}
          url={layer.url}
          maxZoom={layer.maxZoom}
        />
        
        <MapController center={center} projectPolygon={projectPolygon} />
        <MapEvents onMapClick={onMapClick} />

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
          const isSelected = selectedSpecies === occ.scientificName;
          return (
            <CircleMarker
              key={occ.key || `occ-${occ.scientificName}-${occ.decimalLatitude}-${occ.decimalLongitude}`}
              center={[occ.decimalLatitude, occ.decimalLongitude]}
              radius={isSelected ? 14 : (occ.alertLevel === 'high' ? 8 : (occ.alertLevel === 'medium' ? 6 : 4))}
              pathOptions={{
                color: isSelected ? '#0d9488' : 'white',
                weight: isSelected ? 3 : 1,
                fillColor: occ.alertLevel === 'high' ? '#dc2626' : (occ.alertLevel === 'medium' ? '#f59e0b' : '#22c55e'),
                fillOpacity: isSelected ? 1 : 0.8
              }}
            />
          );
        })}
      </MapContainer>

      <div className="absolute top-3 right-3 z-[400] flex flex-col gap-1 bg-white/95 backdrop-blur rounded-lg shadow-md border border-gray-200 p-1" data-testid="basemap-toggle">
        <button
          type="button"
          onClick={() => setBaseLayer("nature")}
          className={`flex items-center gap-1.5 text-xs px-2 py-1.5 rounded-md transition-colors ${
            baseLayer === "nature" ? "bg-teal-600 text-white" : "text-gray-700 hover:bg-gray-100"
          }`}
          title="Fond topographique nature (OpenTopoMap) — reliefs, forêts, cours d'eau"
          data-testid="button-basemap-nature"
        >
          <Mountain className="h-3.5 w-3.5" />
          <span>Nature</span>
        </button>
        <button
          type="button"
          onClick={() => setBaseLayer("osm")}
          className={`flex items-center gap-1.5 text-xs px-2 py-1.5 rounded-md transition-colors ${
            baseLayer === "osm" ? "bg-teal-600 text-white" : "text-gray-700 hover:bg-gray-100"
          }`}
          title="Fond OpenStreetMap"
          data-testid="button-basemap-osm"
        >
          <MapIcon className="h-3.5 w-3.5" />
          <span>Plan</span>
        </button>
        <button
          type="button"
          onClick={() => setBaseLayer("satellite")}
          className={`flex items-center gap-1.5 text-xs px-2 py-1.5 rounded-md transition-colors ${
            baseLayer === "satellite" ? "bg-teal-600 text-white" : "text-gray-700 hover:bg-gray-100"
          }`}
          title="Vue satellite (Esri World Imagery)"
          data-testid="button-basemap-satellite"
        >
          <Satellite className="h-3.5 w-3.5" />
          <span>Satellite</span>
        </button>
      </div>

      <div className="absolute bottom-1 right-1 bg-white/50 backdrop-blur px-2 py-0.5 text-[10px] text-gray-500 rounded z-[400] pointer-events-none">
        Données GBIF · iNat | Fond {layer.label}
      </div>
    </div>
  );
}
