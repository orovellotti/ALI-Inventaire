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

export function getIucnLabel(code: string | undefined): string {
  const labels: Record<string, string> = {
    "EX": "Éteint",
    "EXTINCT": "Éteint",
    "EW": "Éteint à l'état sauvage",
    "EXTINCT_IN_THE_WILD": "Éteint à l'état sauvage",
    "RE": "Éteint régionalement",
    "REGIONALLY_EXTINCT": "Éteint régionalement",
    "CR": "En danger critique",
    "CRITICALLY_ENDANGERED": "En danger critique",
    "EN": "En danger",
    "ENDANGERED": "En danger",
    "VU": "Vulnérable",
    "VULNERABLE": "Vulnérable",
    "NT": "Quasi menacé",
    "NEAR_THREATENED": "Quasi menacé",
    "LC": "Préoccupation mineure",
    "LEAST_CONCERN": "Préoccupation mineure",
    "DD": "Données insuffisantes",
    "DATA_DEFICIENT": "Données insuffisantes",
    "NA": "Non applicable",
    "NOT_APPLICABLE": "Non applicable",
    "NE": "Non évalué",
    "NOT_EVALUATED": "Non évalué"
  };
  return labels[code || ""] || "Non évalué";
}

function getAlertLevelFromIucn(iucnStatus: string | undefined): "high" | "medium" | "low" {
  const status = iucnStatus?.toUpperCase();
  switch (status) {
    case "EX":
    case "EXTINCT":
    case "EW":
    case "EXTINCT_IN_THE_WILD":
    case "RE":
    case "REGIONALLY_EXTINCT":
    case "CR":
    case "CRITICALLY_ENDANGERED":
    case "EN":
    case "ENDANGERED":
    case "VU":
    case "VULNERABLE":
    case "NT":
    case "NEAR_THREATENED":
      return "high";
    case "DD":
    case "DATA_DEFICIENT":
      return "medium";
    default:
      return "low";
  }
}

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

async function fetchSpeciesIucnStatus(speciesKey: number): Promise<string | undefined> {
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

async function fetchFrenchVernacularName(speciesKey: number): Promise<string | undefined> {
  try {
    const response = await fetch(`https://api.gbif.org/v1/species/${speciesKey}/vernacularNames?language=fra&limit=1`);
    if (response.ok) {
      const data = await response.json();
      if (data.results && data.results.length > 0) {
        return data.results[0].vernacularName;
      }
    }
    // Try without language filter and look for French
    const fallbackResponse = await fetch(`https://api.gbif.org/v1/species/${speciesKey}/vernacularNames?limit=20`);
    if (fallbackResponse.ok) {
      const fallbackData = await fallbackResponse.json();
      const frenchName = fallbackData.results?.find(
        (v: any) => v.language === "fra" || v.language === "fr" || v.language === "fre"
      );
      if (frenchName) {
        return frenchName.vernacularName;
      }
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
  url.searchParams.set("limit", "1000");

  try {
    const response = await fetch(url.toString());
    
    if (!response.ok) {
      throw new Error(`GBIF API Error: ${response.status}`);
    }

    const data = await response.json();

    if (!data.results || data.results.length === 0) {
      return {
        occurrences: [],
        stats: { total: 0, speciesCount: 0, sensitiveCount: 0 },
        center: [lat, lng],
        radius: radiusMeters
      };
    }

    const speciesMap = new Map<string, any>();
    for (const record of data.results) {
      if (record.scientificName && record.decimalLatitude && record.decimalLongitude) {
        if (!speciesMap.has(record.scientificName)) {
          speciesMap.set(record.scientificName, record);
        }
      }
    }

    const uniqueSpecies = Array.from(speciesMap.values());
    
    const speciesWithData = await Promise.all(
      uniqueSpecies.map(async (record) => {
        const speciesKey = record.speciesKey || record.taxonKey;
        let imageUrl: string | undefined;
        let iucnStatus: string | undefined;
        let frenchName: string | undefined;

        if (speciesKey) {
          [imageUrl, iucnStatus, frenchName] = await Promise.all([
            fetchSpeciesMedia(speciesKey),
            fetchSpeciesIucnStatus(speciesKey),
            fetchFrenchVernacularName(speciesKey)
          ]);
        }

        const alertLevel = getAlertLevelFromIucn(iucnStatus);

        return {
          key: record.key,
          scientificName: record.scientificName || "Inconnu",
          decimalLatitude: record.decimalLatitude,
          decimalLongitude: record.decimalLongitude,
          vernacularName: frenchName || record.vernacularName || record.species || record.genus,
          order: record.order,
          family: record.family,
          alertLevel,
          imageUrl,
          iucnStatus,
          taxonKey: speciesKey
        };
      })
    );

    const occurrences = speciesWithData.filter((occ) => {
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

    const sensitiveCount = occurrences.filter(
      o => o.alertLevel === "high" || o.alertLevel === "medium"
    ).length;

    return {
      occurrences,
      stats: {
        total: occurrences.length,
        speciesCount: new Set(occurrences.map(o => o.scientificName)).size,
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
