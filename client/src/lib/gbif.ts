export interface Occurrence {
  key: number;
  scientificName: string;
  decimalLatitude: number;
  decimalLongitude: number;
  vernacularName?: string;
  order?: string;
  family?: string;
  alertLevel: "high" | "medium" | "low";
  imageUrl?: string;
  iucnStatus?: string;
  protectionStatus?: string;
  ecologicalNote?: string;
  taxonKey?: number;
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
  aiSummary?: string;
  overallRisk?: "high" | "medium" | "low";
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

// Map IUCN codes to readable labels
export function getIucnLabel(code: string | undefined): string {
  const labels: Record<string, string> = {
    "EX": "Éteint",
    "EW": "Éteint à l'état sauvage",
    "CR": "En danger critique",
    "EN": "En danger",
    "VU": "Vulnérable",
    "NT": "Quasi menacé",
    "LC": "Préoccupation mineure",
    "DD": "Données insuffisantes",
    "NE": "Non évalué"
  };
  return labels[code || ""] || "Non évalué";
}

// Fetch species media from GBIF
async function fetchSpeciesMedia(speciesKey: number): Promise<string | undefined> {
  try {
    const response = await fetch(`https://api.gbif.org/v1/species/${speciesKey}/media?limit=1`);
    if (response.ok) {
      const data = await response.json();
      if (data.results && data.results.length > 0) {
        return data.results[0].identifier;
      }
    }
  } catch (e) {
    // Silently fail - image is optional
  }
  return undefined;
}

export async function searchGBIF(lat: number, lng: number, radiusMeters: number): Promise<InventoryResult> {
  const bbox = getBoundingBox(lat, lng, radiusMeters);
  
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

    // Group by species to get unique species
    const speciesMap = new Map<string, any>();
    for (const record of data.results) {
      if (record.scientificName && record.decimalLatitude && record.decimalLongitude) {
        if (!speciesMap.has(record.scientificName)) {
          speciesMap.set(record.scientificName, record);
        }
      }
    }

    // Get unique species (limit to 25 for AI analysis performance)
    const uniqueSpecies = Array.from(speciesMap.values()).slice(0, 25);
    
    // Fetch images for species in parallel
    const speciesWithImages = await Promise.all(
      uniqueSpecies.map(async (record) => {
        const speciesKey = record.speciesKey || record.taxonKey;
        let imageUrl: string | undefined;

        if (speciesKey) {
          imageUrl = await fetchSpeciesMedia(speciesKey);
        }

        return {
          key: record.key,
          scientificName: record.scientificName || "Inconnu",
          decimalLatitude: record.decimalLatitude,
          decimalLongitude: record.decimalLongitude,
          vernacularName: record.vernacularName || record.species || record.genus,
          order: record.order,
          family: record.family,
          alertLevel: "low" as const, // Will be updated by AI
          imageUrl,
          taxonKey: speciesKey
        };
      })
    );

    // Filter by radius
    const occurrences = speciesWithImages.filter((occ) => {
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

    return {
      occurrences,
      stats: {
        total: occurrences.length,
        speciesCount: new Set(occurrences.map(o => o.scientificName)).size,
        sensitiveCount: 0 // Will be updated after AI analysis
      },
      center: [lat, lng],
      radius: radiusMeters
    };
  } catch (error) {
    console.error("GBIF fetch error:", error);
    throw error;
  }
}
