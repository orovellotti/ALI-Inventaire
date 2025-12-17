import { MapContainer, TileLayer, Circle, CircleMarker, useMapEvents, useMap } from "react-leaflet";
import { useEffect } from "react";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { InventoryResult } from "@/lib/gbif";

// Fix Leaflet icons
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
  radius: number;
  results: InventoryResult | null;
  onMapClick: (lat: number, lng: number) => void;
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

export function Map({ center, radius, results, onMapClick }: MapProps) {
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

        {/* Analysis Radius */}
        <Circle 
          center={center}
          pathOptions={{ fillColor: '#0d9488', color: '#0d9488', weight: 2, fillOpacity: 0.1, dashArray: '5, 10' }}
          radius={radius}
        />

        {/* Center Marker */}
        <CircleMarker center={center} radius={6} pathOptions={{ color: '#0d9488', fillColor: '#0d9488', fillOpacity: 1 }}>
        </CircleMarker>

        {/* Results Visualization */}
        {results && results.occurrences.map((occ) => (
          <CircleMarker
            key={occ.key}
            center={[occ.decimalLatitude, occ.decimalLongitude]}
            radius={occ.alertLevel === 'high' ? 8 : (occ.alertLevel === 'medium' ? 6 : 4)}
            pathOptions={{
              color: 'white',
              weight: 1,
              fillColor: occ.alertLevel === 'high' ? '#dc2626' : (occ.alertLevel === 'medium' ? '#f59e0b' : '#22c55e'),
              fillOpacity: 0.8
            }}
          />
        ))}
      </MapContainer>
      
      {/* Attribution Overlay */}
      <div className="absolute bottom-1 right-1 bg-white/50 backdrop-blur px-2 py-0.5 text-[10px] text-gray-500 rounded z-[400] pointer-events-none">
        Données GBIF | Fond CartoDB
      </div>
    </div>
  );
}
