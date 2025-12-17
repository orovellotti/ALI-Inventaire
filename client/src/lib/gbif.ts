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

// Get alert level from IUCN status
function getAlertLevel(iucnStatus: string | undefined): "high" | "medium" | "low" {
  if (iucnStatus === "CR" || iucnStatus === "EN" || iucnStatus === "VU" || iucnStatus === "EX" || iucnStatus === "EW") {
    return "high";
  }
  if (iucnStatus === "NT") {
    return "medium";
  }
  return "low";
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

// Fetch species IUCN status from GBIF
async function fetchSpeciesStatus(speciesKey: number): Promise<string | undefined> {
  try {
    const response = await fetch(`https://api.gbif.org/v1/species/${speciesKey}/iucnRedListCategory`);
    if (response.ok) {
      const data = await response.json();
      return data.category;
    }
  } catch (e) {
    // Silently fail
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

    // Group by species to avoid duplicate API calls
    const speciesMap = new Map<string, any>();
    for (const record of data.results) {
      if (record.scientificName && record.decimalLatitude && record.decimalLongitude) {
        if (!speciesMap.has(record.scientificName)) {
          speciesMap.set(record.scientificName, record);
        }
      }
    }

    // Fetch media and status for unique species (limit to first 20 for performance)
    const uniqueSpecies = Array.from(speciesMap.values()).slice(0, 20);
    
    const enrichedSpecies = await Promise.all(
      uniqueSpecies.map(async (record) => {
        const speciesKey = record.speciesKey || record.taxonKey;
        let imageUrl: string | undefined;
        let iucnStatus: string | undefined;

        if (speciesKey) {
          // Fetch media and status in parallel
          const [media, status] = await Promise.all([
            fetchSpeciesMedia(speciesKey),
            fetchSpeciesStatus(speciesKey)
          ]);
          imageUrl = media;
          iucnStatus = status;
        }

        return {
          key: record.key,
          scientificName: record.scientificName || "Inconnu",
          decimalLatitude: record.decimalLatitude,
          decimalLongitude: record.decimalLongitude,
          vernacularName: record.vernacularName || record.species || record.genus,
          order: record.order,
          family: record.family,
          alertLevel: getAlertLevel(iucnStatus),
          imageUrl,
          iucnStatus,
          taxonKey: speciesKey
        };
      })
    );

    // Filter by radius
    const occurrences = enrichedSpecies.filter((occ) => {
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

    const uniqueSpeciesCount = new Set(occurrences.map(o => o.scientificName)).size;
    const sensitiveCount = occurrences.filter(o => o.alertLevel === "high" || o.alertLevel === "medium").length;

    return {
      occurrences,
      stats: {
        total: occurrences.length,
        speciesCount: uniqueSpeciesCount,
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
