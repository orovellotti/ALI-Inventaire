import { MapContainer, TileLayer, Circle, CircleMarker, useMapEvents, useMap } from "react-leaflet";
import { useEffect } from "react";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { InventoryResult, BufferCircle } from "@/lib/gbif";

import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});

L.Marker.prototype.options.icon = DefaultIcon;

const CIRCLE_COLORS = [
  "#0d9488",
  "#6366f1",
  "#e11d48",
  "#ea580c",
  "#8b5cf6",
  "#0284c7",
];

function getCircleColor(index: number) {
  return CIRCLE_COLORS[index % CIRCLE_COLORS.length];
}

interface MapProps {
  center: [number, number];
  radius: number;
  circles: BufferCircle[];
  activeCircleId: string;
  results: InventoryResult | null;
  onMapClick: (lat: number, lng: number) => void;
  selectedSpecies: string | null;
  isPlacingCircle: boolean;
}

function MapController({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo(center, map.getZoom());
  }, [center, map]);
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

function CursorStyle({ isPlacingCircle }: { isPlacingCircle: boolean }) {
  const map = useMap();
  useEffect(() => {
    const container = map.getContainer();
    if (isPlacingCircle) {
      container.style.cursor = 'crosshair';
    } else {
      container.style.cursor = '';
    }
    return () => {
      container.style.cursor = '';
    };
  }, [isPlacingCircle, map]);
  return null;
}

export function Map({ center, radius, circles, activeCircleId, results, onMapClick, selectedSpecies, isPlacingCircle }: MapProps) {
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
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        />
        
        <MapController center={center} />
        <MapEvents onMapClick={onMapClick} />
        <CursorStyle isPlacingCircle={isPlacingCircle} />

        {circles.map((circle, index) => {
          const color = getCircleColor(index);
          const isActive = circle.id === activeCircleId;
          return (
            <Circle
              key={circle.id}
              center={circle.center}
              pathOptions={{
                fillColor: color,
                color: color,
                weight: isActive ? 3 : 2,
                fillOpacity: isActive ? 0.12 : 0.06,
                dashArray: isActive ? undefined : '5, 10'
              }}
              radius={circle.radius}
            />
          );
        })}

        {circles.map((circle, index) => {
          const color = getCircleColor(index);
          const isActive = circle.id === activeCircleId;
          return (
            <CircleMarker
              key={`center-${circle.id}`}
              center={circle.center}
              radius={isActive ? 7 : 5}
              pathOptions={{
                color: color,
                fillColor: color,
                fillOpacity: 1,
                weight: isActive ? 3 : 1
              }}
            />
          );
        })}

        {results && results.occurrences.map((occ) => {
          const isSelected = selectedSpecies === occ.scientificName;
          return (
            <CircleMarker
              key={occ.key}
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
