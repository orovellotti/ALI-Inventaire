import type { Occurrence, ConfidenceScore, BufferCircle, InventoryResult } from "@shared/types";
import { searchINaturalist } from "./inaturalist";

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

function getAlertLevelFromIucn(iucnStatus: string | undefined): "high" | "medium" | "low" {
  const status = iucnStatus?.toUpperCase();
  switch (status) {
    case "EX": case "EXTINCT":
    case "EW": case "EXTINCT_IN_THE_WILD":
    case "RE": case "REGIONALLY_EXTINCT":
    case "CR": case "CRITICALLY_ENDANGERED":
    case "EN": case "ENDANGERED":
    case "VU": case "VULNERABLE":
    case "NT": case "NEAR_THREATENED":
      return "high";
    default:
      return "low";
  }
}

function calculateConfidenceScore(rawRecords: any[]): ConfidenceScore {
  if (rawRecords.length === 0) {
    return {
      total: 0, geo: 0, tax: 0, time: 0, trace: 0, issues: 0, dup: 0,
      interpretation: "low",
      message: "Aucune donnée disponible",
      rawCount: 0, filteredCount: 0, dedupCount: 0
    };
  }

  const n = rawRecords.length;
  const currentYear = new Date().getFullYear();
  const uncertaintyThreshold = 300;

  let geoWithUncertainty = 0, geoUnderThreshold = 0;
  let taxSpeciesRank = 0, taxAccepted = 0;
  let timeWithDate = 0, timeRecent = 0;
  let traceWithId = 0, traceWithAuthor = 0;
  let issuesClean = 0;

  for (const r of rawRecords) {
    if (r.coordinateUncertaintyInMeters !== undefined && r.coordinateUncertaintyInMeters !== null) {
      geoWithUncertainty++;
      if (r.coordinateUncertaintyInMeters <= uncertaintyThreshold) geoUnderThreshold++;
    }

    const rank = r.taxonRank?.toUpperCase();
    if (rank === "SPECIES" || rank === "SUBSPECIES" || rank === "VARIETY") taxSpeciesRank++;
    if (r.taxonomicStatus?.toUpperCase() === "ACCEPTED") taxAccepted++;

    if (r.year || r.eventDate) {
      timeWithDate++;
      const year = r.year || new Date(r.eventDate).getFullYear();
      if (currentYear - year <= 10) timeRecent++;
    }

    if (r.occurrenceID || r.references) traceWithId++;
    if (r.recordedBy || r.institutionCode) traceWithAuthor++;

    let recordIssues: string[] = [];
    if (r.issues) {
      if (Array.isArray(r.issues)) recordIssues = r.issues;
      else if (typeof r.issues === 'string') recordIssues = r.issues.split(';').filter(Boolean);
    }
    if (!recordIssues.some((issue: string) => CRITICAL_ISSUES.includes(issue))) issuesClean++;
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
    100 * (0.25 * geoScore + 0.20 * taxScore + 0.15 * timeScore + 0.15 * traceScore + 0.15 * issuesScore + 0.10 * dupScore)
  );

  let interpretation: "excellent" | "good" | "moderate" | "low";
  if (total >= 80) interpretation = "excellent";
  else if (total >= 60) interpretation = "good";
  else if (total >= 40) interpretation = "moderate";
  else interpretation = "low";

  const issuesList: string[] = [];
  if (geoScore < 0.5) issuesList.push(`incertitude spatiale élevée (${Math.round((1 - p) * 100)}% > ${uncertaintyThreshold}m)`);
  if (taxScore < 0.5) issuesList.push(`qualité taxonomique faible`);
  if (timeScore < 0.5) issuesList.push(`données anciennes (${Math.round((1 - r_time) * 100)}% > 10 ans)`);
  if (traceScore < 0.5) issuesList.push(`traçabilité insuffisante`);
  if (issuesScore < 0.7) issuesList.push(`${Math.round((1 - issuesScore) * 100)}% avec alertes GBIF`);

  const message = issuesList.length > 0
    ? `Points d'attention : ${issuesList.join(", ")}`
    : "Données de bonne qualité pour étude d'impact";

  return {
    total,
    geo: Math.round(geoScore * 100),
    tax: Math.round(taxScore * 100),
    time: Math.round(timeScore * 100),
    trace: Math.round(traceScore * 100),
    issues: Math.round(issuesScore * 100),
    dup: Math.round(dupScore * 100),
    interpretation, message,
    rawCount: n, filteredCount: n, dedupCount
  };
}

async function fetchSpeciesMedia(speciesKey: number): Promise<string | undefined> {
  try {
    const response = await fetch(`https://api.gbif.org/v1/species/${speciesKey}/media?limit=1`);
    if (response.ok) {
      const data = await response.json();
      if (data.results?.length > 0) return data.results[0].identifier;
    }
  } catch {}
  return undefined;
}

async function fetchSpeciesIucnStatus(speciesKey: number): Promise<string | undefined> {
  try {
    const response = await fetch(`https://api.gbif.org/v1/species/${speciesKey}/iucnRedListCategory`);
    if (response.ok) {
      const data = await response.json();
      return data.category;
    }
  } catch {}
  return undefined;
}

async function fetchFrenchVernacularName(speciesKey: number): Promise<string | undefined> {
  try {
    const response = await fetch(`https://api.gbif.org/v1/species/${speciesKey}/vernacularNames?language=fra&limit=1`);
    if (response.ok) {
      const data = await response.json();
      if (data.results?.length > 0) return data.results[0].vernacularName;
    }
    const fallbackResponse = await fetch(`https://api.gbif.org/v1/species/${speciesKey}/vernacularNames?limit=20`);
    if (fallbackResponse.ok) {
      const fallbackData = await fallbackResponse.json();
      const frenchName = fallbackData.results?.find(
        (v: any) => v.language === "fra" || v.language === "fr" || v.language === "fre"
      );
      if (frenchName) return frenchName.vernacularName;
    }
  } catch {}
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

  const inatPromise = searchINaturalist(lat, lng, radiusMeters).catch(() => ({
    occurrences: [] as Occurrence[],
    summary: { records: 0, species: 0 },
  }));

  const response = await fetch(url.toString());
  if (!response.ok) throw new Error(`GBIF API Error: ${response.status}`);

  const data = await response.json();

  if (!data.results || data.results.length === 0) {
    const inatOnly = await inatPromise;
    const occurrencesOnly = inatOnly.occurrences;
    const sensitiveOnly = occurrencesOnly.filter(o => o.alertLevel === "high" || o.alertLevel === "medium").length;
    const conf = calculateConfidenceScore([]);
    if (occurrencesOnly.length > 0) {
      conf.message = `Aucune donnée GBIF • iNaturalist : ${occurrencesOnly.length} espèce(s)`;
    }
    return {
      occurrences: occurrencesOnly,
      stats: { total: occurrencesOnly.length, speciesCount: occurrencesOnly.length, sensitiveCount: sensitiveOnly },
      center: [lat, lng],
      radius: radiusMeters,
      circles: [{ id: "main", center: [lat, lng], radius: radiusMeters, label: "Zone", enabled: true }],
      confidence: conf,
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
        taxonKey: speciesKey,
        source: "gbif" as const,
        sourceUrl: speciesKey ? `https://www.gbif.org/species/${speciesKey}` : undefined,
      };
    })
  );

  const gbifOccurrences = speciesWithData.filter((occ) => {
    const R = 6371e3;
    const phi1 = lat * Math.PI / 180;
    const phi2 = occ.decimalLatitude * Math.PI / 180;
    const dPhi = (occ.decimalLatitude - lat) * Math.PI / 180;
    const dLam = (occ.decimalLongitude - lng) * Math.PI / 180;
    const a = Math.sin(dPhi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLam / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c <= radiusMeters;
  });

  const inat = await inatPromise;
  const inatOccurrences: Occurrence[] = inat.occurrences;
  const inatSummary = inat.summary;

  const mergedByName = new Map<string, Occurrence>();
  for (const occ of gbifOccurrences) mergedByName.set(occ.scientificName, occ);
  for (const iocc of inatOccurrences) {
    const existing = mergedByName.get(iocc.scientificName);
    if (!existing) {
      mergedByName.set(iocc.scientificName, iocc);
    } else {
      const enriched: Occurrence = {
        ...existing,
        imageUrl: existing.imageUrl || iocc.imageUrl,
        vernacularName: existing.vernacularName || iocc.vernacularName,
        iucnStatus: existing.iucnStatus || iocc.iucnStatus,
      };
      if (!existing.iucnStatus && iocc.iucnStatus) {
        enriched.alertLevel = iocc.alertLevel;
      }
      mergedByName.set(iocc.scientificName, enriched);
    }
  }

  const occurrences = Array.from(mergedByName.values());
  const sensitiveCount = occurrences.filter(o => o.alertLevel === "high" || o.alertLevel === "medium").length;

  if (inatSummary.species > 0) {
    const onlyInat = inatOccurrences.filter(i => !gbifOccurrences.some(g => g.scientificName === i.scientificName)).length;
    confidence.message = `${confidence.message} • iNaturalist : +${onlyInat} espèce(s) inédite(s) sur ${inatSummary.species}`;
  }

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
  const sensitiveCount = occurrences.filter(o => o.alertLevel === "high" || o.alertLevel === "medium").length;

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

export async function fetchSpeciesDetails(taxonKey: number) {
  const [imageUrl, iucnStatus, vernacularName] = await Promise.all([
    fetchSpeciesMedia(taxonKey),
    fetchSpeciesIucnStatus(taxonKey),
    fetchFrenchVernacularName(taxonKey)
  ]);

  return { taxonKey, imageUrl, iucnStatus, vernacularName };
}
