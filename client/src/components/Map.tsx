import { MapContainer, TileLayer, Circle, CircleMarker, GeoJSON, useMapEvents, useMap } from "react-leaflet";
import { useEffect, useMemo } from "react";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { InventoryResult, BufferCircle, STUDY_AREAS, getTaxonGroupId } from "@/lib/gbif";
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

export function Map({ center, circles, results, onMapClick, selectedSpecies, activeTaxonFilters, projectPolygon }: MapProps) {
  const sortedCircles = [...circles]
    .filter(c => c.enabled)
    .sort((a, b) => b.radius - a.radius);

  const filteredOccurrences = useMemo(() => {
    if (!results) return [];
    return results.occurrences.filter(occ => activeTaxonFilters.has(getTaxonGroupId(occ)));
  }, [results, activeTaxonFilters]);

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
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
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
      
      <div className="absolute bottom-1 right-1 bg-white/50 backdrop-blur px-2 py-0.5 text-[10px] text-gray-500 rounded z-[400] pointer-events-none">
        Données GBIF | Fond CartoDB
      </div>
    </div>
  );
}
