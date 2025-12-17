export interface Occurrence {
  key: number;
  scientificName: string;
  decimalLatitude: number;
  decimalLongitude: number;
  vernacularName?: string;
  order?: string;
  family?: string;
  alertLevel: "high" | "medium" | "low";
}

export interface InventoryResult {
  occurrences: Occurrence[];
  stats: {
    total: number;
    speciesCount: number;
    sensitiveCount: number;
  };
  center: [number, number];
  radius: number;
}

// Helper to calculate bounding box for a radius
function getBoundingBox(lat: number, lng: number, radiusMeters: number) {
  const latDelta = radiusMeters / 111111;
  const lngDelta = radiusMeters / (111111 * Math.cos(lat * (Math.PI / 180)));
  
  return {
    minLat: lat - latDelta,
    maxLat: lat + latDelta,
    minLng: lng - lngDelta,
    maxLng: lng + lngDelta
  };
}

// Simple heuristic to assign alert levels based on IUCN category if available
function getAlertLevel(record: any): "high" | "medium" | "low" {
  const iucn = record.iucnRedListCategory;
  
  if (iucn === "CR" || iucn === "EN" || iucn === "VU") return "high";
  if (iucn === "NT") return "medium";
  if (iucn === "LC") return "low";

  // Fallback: Deterministic based on name
  const name = record.scientificName || "unknown";
  const hash = name.split("").reduce((a: number, b: string) => {
    a = ((a << 5) - a) + b.charCodeAt(0);
    return a & a;
  }, 0);
  
  const val = Math.abs(hash) % 10;
  if (val > 8) return "high";
  if (val > 6) return "medium";
  return "low";
}

export async function searchGBIF(lat: number, lng: number, radiusMeters: number): Promise<InventoryResult> {
  const bbox = getBoundingBox(lat, lng, radiusMeters);
  
  // Build the GBIF API URL with geometry parameter (WKT polygon)
  const url = new URL("https://api.gbif.org/v1/occurrence/search");
  url.searchParams.set("decimalLatitude", `${bbox.minLat.toFixed(4)},${bbox.maxLat.toFixed(4)}`);
  url.searchParams.set("decimalLongitude", `${bbox.minLng.toFixed(4)},${bbox.maxLng.toFixed(4)}`);
  url.searchParams.set("hasCoordinate", "true");
  url.searchParams.set("hasGeospatialIssue", "false");
  url.searchParams.set("limit", "300");

  console.log("GBIF API URL:", url.toString());

  try {
    const response = await fetch(url.toString());
    
    console.log("GBIF Response status:", response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error("GBIF API Error:", errorText);
      throw new Error(`GBIF API Error: ${response.status}`);
    }

    const data = await response.json();
    
    console.log("GBIF Results count:", data.count, "Returned:", data.results?.length);

    if (!data.results || data.results.length === 0) {
      return {
        occurrences: [],
        stats: { total: 0, speciesCount: 0, sensitiveCount: 0 },
        center: [lat, lng],
        radius: radiusMeters
      };
    }

    // Process results
    const occurrences: Occurrence[] = data.results
      .filter((record: any) => record.decimalLatitude && record.decimalLongitude && record.scientificName)
      .map((record: any) => ({
        key: record.key,
        scientificName: record.scientificName || "Inconnu",
        decimalLatitude: record.decimalLatitude,
        decimalLongitude: record.decimalLongitude,
        vernacularName: record.vernacularName || record.species || record.genus,
        order: record.order,
        family: record.family,
        alertLevel: getAlertLevel(record)
      }))
      .filter((occ: Occurrence) => {
        // Haversine distance check
        const R = 6371e3;
        const φ1 = lat * Math.PI/180;
        const φ2 = occ.decimalLatitude * Math.PI/180;
        const Δφ = (occ.decimalLatitude-lat) * Math.PI/180;
        const Δλ = (occ.decimalLongitude-lng) * Math.PI/180;

        const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
                Math.cos(φ1) * Math.cos(φ2) *
                Math.sin(Δλ/2) * Math.sin(Δλ/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        const d = R * c;

        return d <= radiusMeters;
      });

    const uniqueSpecies = new Set(occurrences.map(o => o.scientificName)).size;
    const sensitiveCount = occurrences.filter(o => o.alertLevel === "high" || o.alertLevel === "medium").length;

    return {
      occurrences,
      stats: {
        total: occurrences.length,
        speciesCount: uniqueSpecies,
        sensitiveCount
      },
      center: [lat, lng],
      radius: radiusMeters
    };
  } catch (error) {
    console.error("GBIF fetch error:", error);
    throw error;
  }
}
