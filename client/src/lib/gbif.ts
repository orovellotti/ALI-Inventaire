export interface Occurrence {
  key: number;
  scientificName: string;
  decimalLatitude: number;
  decimalLongitude: number;
  vernacularName?: string;
  kingdom?: string;
  phylum?: string;
  class?: string;
  order?: string;
  family?: string;
  alertLevel: "high" | "medium" | "low";
  imageUrl?: string;
  iucnStatus?: string;
  taxonKey?: number;
}

export interface TaxonGroup {
  id: string;
  label: string;
  icon: string;
  match: (occ: Occurrence) => boolean;
}

export const TAXON_GROUPS: TaxonGroup[] = [
  { id: "oiseaux", label: "Oiseaux", icon: "🐦", match: (o) => o.class === "Aves" },
  { id: "mammiferes", label: "Mammifères", icon: "🦊", match: (o) => o.class === "Mammalia" },
  { id: "reptiles", label: "Reptiles", icon: "🦎", match: (o) => o.class === "Reptilia" },
  { id: "amphibiens", label: "Amphibiens", icon: "🐸", match: (o) => o.class === "Amphibia" },
  { id: "poissons", label: "Poissons", icon: "🐟", match: (o) => ["Actinopterygii", "Chondrichthyes", "Petromyzonti", "Cephalaspidomorphi"].includes(o.class || "") },
  { id: "insectes", label: "Insectes", icon: "🦋", match: (o) => o.class === "Insecta" },
  { id: "arachnides", label: "Arachnides", icon: "🕷️", match: (o) => o.class === "Arachnida" },
  { id: "mollusques", label: "Mollusques", icon: "🐌", match: (o) => o.phylum === "Mollusca" },
  { id: "plantes", label: "Plantes", icon: "🌿", match: (o) => o.kingdom === "Plantae" },
  { id: "champignons", label: "Champignons", icon: "🍄", match: (o) => o.kingdom === "Fungi" },
  { id: "autres", label: "Autres", icon: "🔬", match: () => true },
];

export function getTaxonGroupId(occ: Occurrence): string {
  for (const group of TAXON_GROUPS) {
    if (group.id === "autres") continue;
    if (group.match(occ)) return group.id;
  }
  return "autres";
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

export interface BufferCircle {
  id: string;
  center: [number, number];
  radius: number;
  label: string;
  enabled: boolean;
}

export const STUDY_AREAS = [
  { id: "immediate", label: "Aire d'étude immédiate", radius: 500, color: "#0d9488", dashArray: undefined as string | undefined },
  { id: "rapprochee", label: "Aire d'étude rapprochée", radius: 2000, color: "#2563eb", dashArray: "10, 8" },
  { id: "eloignee", label: "Aire d'étude éloignée", radius: 6000, color: "#6366f1", dashArray: "5, 10" },
] as const;

export interface ProjectPreset {
  id: string;
  label: string;
  icon: string;
  description: string;
  zones: {
    immediate: { radius: number; enabled: boolean };
    rapprochee: { radius: number; enabled: boolean };
    eloignee: { radius: number; enabled: boolean };
  };
}

export const PROJECT_PRESETS: ProjectPreset[] = [
  {
    id: "custom",
    label: "Personnalisé",
    icon: "⚙️",
    description: "Configuration manuelle des aires d'étude",
    zones: {
      immediate: { radius: 500, enabled: true },
      rapprochee: { radius: 2000, enabled: false },
      eloignee: { radius: 6000, enabled: false },
    },
  },
  {
    id: "eolien",
    label: "Éolien",
    icon: "💨",
    description: "Parc éolien terrestre",
    zones: {
      immediate: { radius: 500, enabled: true },
      rapprochee: { radius: 5000, enabled: true },
      eloignee: { radius: 15000, enabled: true },
    },
  },
  {
    id: "pv_petit",
    label: "PV sol petit",
    icon: "☀️",
    description: "Photovoltaïque au sol < 3 ha",
    zones: {
      immediate: { radius: 200, enabled: true },
      rapprochee: { radius: 1000, enabled: true },
      eloignee: { radius: 3000, enabled: true },
    },
  },
  {
    id: "pv_moyen",
    label: "PV sol moyen",
    icon: "☀️",
    description: "Photovoltaïque au sol 3-50 ha",
    zones: {
      immediate: { radius: 500, enabled: true },
      rapprochee: { radius: 2000, enabled: true },
      eloignee: { radius: 6000, enabled: true },
    },
  },
  {
    id: "pv_grand",
    label: "PV sol grand",
    icon: "☀️",
    description: "Photovoltaïque au sol > 50 ha",
    zones: {
      immediate: { radius: 1000, enabled: true },
      rapprochee: { radius: 3000, enabled: true },
      eloignee: { radius: 10000, enabled: true },
    },
  },
  {
    id: "urbanisation",
    label: "Urbanisation",
    icon: "🏗️",
    description: "Aménagement urbain, lotissement, ZAC",
    zones: {
      immediate: { radius: 300, enabled: true },
      rapprochee: { radius: 1000, enabled: true },
      eloignee: { radius: 3000, enabled: true },
    },
  },
  {
    id: "route",
    label: "Infrastructure linéaire",
    icon: "🛣️",
    description: "Route, voie ferrée, canalisation",
    zones: {
      immediate: { radius: 500, enabled: true },
      rapprochee: { radius: 2000, enabled: true },
      eloignee: { radius: 5000, enabled: true },
    },
  },
  {
    id: "carriere",
    label: "Carrière / ICPE",
    icon: "⛏️",
    description: "Carrière, installation classée",
    zones: {
      immediate: { radius: 500, enabled: true },
      rapprochee: { radius: 2000, enabled: true },
      eloignee: { radius: 6000, enabled: true },
    },
  },
];

export interface InventoryResult {
  occurrences: Occurrence[];
  stats: {
    total: number;
    speciesCount: number;
    sensitiveCount: number;
  };
  center: [number, number];
  radius: number;
  circles: BufferCircle[];
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
        circles: [{ id: "main", center: [lat, lng], radius: radiusMeters, label: "Zone", enabled: true }],
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
          kingdom: record.kingdom,
          phylum: record.phylum,
          class: record.class,
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
      circles: [{ id: "main", center: [lat, lng], radius: radiusMeters, label: "Zone", enabled: true }],
      confidence
    };
  } catch (error) {
    console.error("GBIF fetch error:", error);
    throw error;
  }
}

export async function searchGBIFMultiCircle(circles: BufferCircle[]): Promise<InventoryResult> {
  const enabledCircles = circles.filter(c => c.enabled);
  if (enabledCircles.length === 0) {
    throw new Error("No circles enabled");
  }

  if (enabledCircles.length === 1) {
    const c = enabledCircles[0];
    const result = await searchGBIF(c.center[0], c.center[1], c.radius);
    result.circles = circles;
    return result;
  }

  const results = await Promise.all(
    enabledCircles.map(c => searchGBIF(c.center[0], c.center[1], c.radius))
  );

  const mergedOccurrences = new Map<string, Occurrence>();
  for (const result of results) {
    for (const occ of result.occurrences) {
      const existing = mergedOccurrences.get(occ.scientificName);
      if (!existing) {
        mergedOccurrences.set(occ.scientificName, occ);
      } else {
        const priority = (level: string) => level === "high" ? 3 : level === "medium" ? 2 : 1;
        if (priority(occ.alertLevel) > priority(existing.alertLevel)) {
          mergedOccurrences.set(occ.scientificName, occ);
        }
      }
    }
  }

  const occurrences = Array.from(mergedOccurrences.values());
  const sensitiveCount = occurrences.filter(
    o => o.alertLevel === "high" || o.alertLevel === "medium"
  ).length;

  const totalScores = results.map(r => r.confidence);
  const avgConfidence: ConfidenceScore = {
    total: Math.round(totalScores.reduce((s, c) => s + c.total, 0) / totalScores.length),
    geo: Math.round(totalScores.reduce((s, c) => s + c.geo, 0) / totalScores.length),
    tax: Math.round(totalScores.reduce((s, c) => s + c.tax, 0) / totalScores.length),
    time: Math.round(totalScores.reduce((s, c) => s + c.time, 0) / totalScores.length),
    trace: Math.round(totalScores.reduce((s, c) => s + c.trace, 0) / totalScores.length),
    issues: Math.round(totalScores.reduce((s, c) => s + c.issues, 0) / totalScores.length),
    dup: Math.round(totalScores.reduce((s, c) => s + c.dup, 0) / totalScores.length),
    interpretation: (() => {
      const avg = Math.round(totalScores.reduce((s, c) => s + c.total, 0) / totalScores.length);
      if (avg >= 80) return "excellent";
      if (avg >= 60) return "good";
      if (avg >= 40) return "moderate";
      return "low";
    })(),
    message: `Moyenne sur ${enabledCircles.length} aires d'étude`,
    rawCount: totalScores.reduce((s, c) => s + c.rawCount, 0),
    filteredCount: totalScores.reduce((s, c) => s + c.filteredCount, 0),
    dedupCount: totalScores.reduce((s, c) => s + c.dedupCount, 0),
  };

  const immediateCircle = enabledCircles.find(c => c.id === "immediate") || enabledCircles[0];

  return {
    occurrences,
    stats: {
      total: occurrences.length,
      speciesCount: new Set(occurrences.map(o => o.scientificName)).size,
      sensitiveCount
    },
    center: immediateCircle.center,
    radius: immediateCircle.radius,
    circles,
    confidence: avgConfidence
  };
}
