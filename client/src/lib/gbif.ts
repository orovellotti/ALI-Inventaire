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

export interface ConfidenceScore {
  total: number;
  geo: number;
  tax: number;
  time: number;
  trace: number;
  issues: number;
  dup: number;
  interpretation: "excellent" | "good" | "moderate" | "low";
  message: string;
  rawCount: number;
  filteredCount: number;
  dedupCount: number;
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
  confidence: ConfidenceScore;
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

const CRITICAL_ISSUES = [
  "ZERO_COORDINATE",
  "COORDINATE_OUT_OF_RANGE",
  "COORDINATE_INVALID",
  "COUNTRY_COORDINATE_MISMATCH",
  "COORDINATE_REPROJECTION_FAILED",
  "GEODETIC_DATUM_INVALID",
  "PRESUMED_SWAPPED_COORDINATE",
  "PRESUMED_NEGATED_LATITUDE",
  "PRESUMED_NEGATED_LONGITUDE"
];

function calculateConfidenceScore(rawRecords: any[]): ConfidenceScore {
  if (rawRecords.length === 0) {
    return {
      total: 0,
      geo: 0,
      tax: 0,
      time: 0,
      trace: 0,
      issues: 0,
      dup: 0,
      interpretation: "low",
      message: "Aucune donnée disponible",
      rawCount: 0,
      filteredCount: 0,
      dedupCount: 0
    };
  }

  const n = rawRecords.length;
  const currentYear = new Date().getFullYear();
  const uncertaintyThreshold = 300;

  let geoWithUncertainty = 0;
  let geoUnderThreshold = 0;
  let taxSpeciesRank = 0;
  let taxAccepted = 0;
  let timeWithDate = 0;
  let timeRecent = 0;
  let traceWithId = 0;
  let traceWithAuthor = 0;
  let issuesClean = 0;

  for (const r of rawRecords) {
    if (r.coordinateUncertaintyInMeters !== undefined && r.coordinateUncertaintyInMeters !== null) {
      geoWithUncertainty++;
      if (r.coordinateUncertaintyInMeters <= uncertaintyThreshold) {
        geoUnderThreshold++;
      }
    }

    const rank = r.taxonRank?.toUpperCase();
    if (rank === "SPECIES" || rank === "SUBSPECIES" || rank === "VARIETY") {
      taxSpeciesRank++;
    }
    if (r.taxonomicStatus?.toUpperCase() === "ACCEPTED") {
      taxAccepted++;
    }

    if (r.year || r.eventDate) {
      timeWithDate++;
      const year = r.year || new Date(r.eventDate).getFullYear();
      if (currentYear - year <= 10) {
        timeRecent++;
      }
    }

    if (r.occurrenceID || r.references) {
      traceWithId++;
    }
    if (r.recordedBy || r.institutionCode) {
      traceWithAuthor++;
    }

    let recordIssues: string[] = [];
    if (r.issues) {
      if (Array.isArray(r.issues)) {
        recordIssues = r.issues;
      } else if (typeof r.issues === 'string') {
        recordIssues = r.issues.split(';').filter(Boolean);
      }
    }
    const hasCritical = recordIssues.some((issue: string) => CRITICAL_ISSUES.includes(issue));
    if (!hasCritical) {
      issuesClean++;
    }
  }

  const dedupKey = new Set<string>();
  for (const r of rawRecords) {
    const key = `${r.speciesKey || r.scientificName}_${r.year || 'nodate'}_${Math.round((r.decimalLatitude || 0) * 1000)}_${Math.round((r.decimalLongitude || 0) * 1000)}`;
    dedupKey.add(key);
  }
  const dedupCount = dedupKey.size;
  const dupRatio = 1 - (n - dedupCount) / n;

  const p = geoWithUncertainty > 0 ? geoUnderThreshold / geoWithUncertainty : 0;
  const q = geoWithUncertainty / n;
  const geoScore = 0.7 * p + 0.3 * q;

  const a = taxSpeciesRank / n;
  const b = taxAccepted / n;
  const taxScore = 0.6 * a + 0.4 * b;

  const r_time = timeWithDate > 0 ? timeRecent / timeWithDate : 0;
  const m = timeWithDate / n;
  const timeScore = 0.7 * r_time + 0.3 * m;

  const t = traceWithId / n;
  const u = traceWithAuthor / n;
  const traceScore = 0.5 * t + 0.5 * u;

  const issuesScore = issuesClean / n;

  const dupScore = dupRatio;

  const total = Math.round(
    100 * (
      0.25 * geoScore +
      0.20 * taxScore +
      0.15 * timeScore +
      0.15 * traceScore +
      0.15 * issuesScore +
      0.10 * dupScore
    )
  );

  let interpretation: "excellent" | "good" | "moderate" | "low";
  if (total >= 80) interpretation = "excellent";
  else if (total >= 60) interpretation = "good";
  else if (total >= 40) interpretation = "moderate";
  else interpretation = "low";

  const issues: string[] = [];
  if (geoScore < 0.5) issues.push(`incertitude spatiale élevée (${Math.round((1 - p) * 100)}% > ${uncertaintyThreshold}m)`);
  if (taxScore < 0.5) issues.push(`qualité taxonomique faible`);
  if (timeScore < 0.5) issues.push(`données anciennes (${Math.round((1 - r_time) * 100)}% > 10 ans)`);
  if (traceScore < 0.5) issues.push(`traçabilité insuffisante`);
  if (issuesScore < 0.7) issues.push(`${Math.round((1 - issuesScore) * 100)}% avec alertes GBIF`);

  const message = issues.length > 0 
    ? `Points d'attention : ${issues.join(", ")}`
    : "Données de bonne qualité pour étude d'impact";

  return {
    total,
    geo: Math.round(geoScore * 100),
    tax: Math.round(taxScore * 100),
    time: Math.round(timeScore * 100),
    trace: Math.round(traceScore * 100),
    issues: Math.round(issuesScore * 100),
    dup: Math.round(dupScore * 100),
    interpretation,
    message,
    rawCount: n,
    filteredCount: n,
    dedupCount
  };
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
        radius: radiusMeters,
        confidence: calculateConfidenceScore([])
      };
    }

    const confidence = calculateConfidenceScore(data.results);

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
      radius: radiusMeters,
      confidence
    };
  } catch (error) {
    console.error("GBIF fetch error:", error);
    throw error;
  }
}
