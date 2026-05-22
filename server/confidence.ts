import type { ConfidenceScore } from "@shared/types";

const CRITICAL_ISSUES = [
  "ZERO_COORDINATE",
  "COORDINATE_OUT_OF_RANGE",
  "COORDINATE_INVALID",
  "COUNTRY_COORDINATE_MISMATCH",
  "COORDINATE_REPROJECTION_FAILED",
  "GEODETIC_DATUM_INVALID",
  "PRESUMED_SWAPPED_COORDINATE",
  "PRESUMED_NEGATED_LATITUDE",
  "PRESUMED_NEGATED_LONGITUDE",
];

const UNCERTAINTY_THRESHOLD_METERS = 300;
const RECENT_YEARS_WINDOW = 10;

const WEIGHTS = {
  geo: 0.25,
  tax: 0.20,
  time: 0.15,
  trace: 0.15,
  issues: 0.15,
  dup: 0.10,
} as const;

const INTERPRETATION_THRESHOLDS = {
  excellent: 80,
  good: 60,
  moderate: 40,
} as const;

interface Accumulators {
  geoWithUncertainty: number;
  geoUnderThreshold: number;
  taxSpeciesRank: number;
  taxAccepted: number;
  timeWithDate: number;
  timeRecent: number;
  traceWithId: number;
  traceWithAuthor: number;
  issuesClean: number;
}

function parseIssues(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") return raw.split(";").filter(Boolean);
  return [];
}

function accumulate(records: any[]): Accumulators {
  const acc: Accumulators = {
    geoWithUncertainty: 0,
    geoUnderThreshold: 0,
    taxSpeciesRank: 0,
    taxAccepted: 0,
    timeWithDate: 0,
    timeRecent: 0,
    traceWithId: 0,
    traceWithAuthor: 0,
    issuesClean: 0,
  };
  const currentYear = new Date().getFullYear();

  for (const r of records) {
    if (r.coordinateUncertaintyInMeters != null) {
      acc.geoWithUncertainty++;
      if (r.coordinateUncertaintyInMeters <= UNCERTAINTY_THRESHOLD_METERS) acc.geoUnderThreshold++;
    }

    const rank = r.taxonRank?.toUpperCase();
    if (rank === "SPECIES" || rank === "SUBSPECIES" || rank === "VARIETY") acc.taxSpeciesRank++;
    if (r.taxonomicStatus?.toUpperCase() === "ACCEPTED") acc.taxAccepted++;

    if (r.year || r.eventDate) {
      acc.timeWithDate++;
      const year = r.year || new Date(r.eventDate).getFullYear();
      if (currentYear - year <= RECENT_YEARS_WINDOW) acc.timeRecent++;
    }

    if (r.occurrenceID || r.references) acc.traceWithId++;
    if (r.recordedBy || r.institutionCode) acc.traceWithAuthor++;

    const issues = parseIssues(r.issues);
    if (!issues.some((i) => CRITICAL_ISSUES.includes(i))) acc.issuesClean++;
  }

  return acc;
}

function countUniqueRecords(records: any[]): number {
  const keys = new Set<string>();
  for (const r of records) {
    const lat = Math.round((r.decimalLatitude || 0) * 1000);
    const lng = Math.round((r.decimalLongitude || 0) * 1000);
    keys.add(`${r.speciesKey || r.scientificName}_${r.year || "nodate"}_${lat}_${lng}`);
  }
  return keys.size;
}

function interpret(total: number): ConfidenceScore["interpretation"] {
  if (total >= INTERPRETATION_THRESHOLDS.excellent) return "excellent";
  if (total >= INTERPRETATION_THRESHOLDS.good) return "good";
  if (total >= INTERPRETATION_THRESHOLDS.moderate) return "moderate";
  return "low";
}

function buildMessage(
  scores: { geo: number; tax: number; time: number; trace: number; issues: number },
  ratios: { p: number; rTime: number },
): string {
  const issues: string[] = [];
  if (scores.geo < 0.5) {
    issues.push(
      `incertitude spatiale élevée (${Math.round((1 - ratios.p) * 100)}% > ${UNCERTAINTY_THRESHOLD_METERS}m)`,
    );
  }
  if (scores.tax < 0.5) issues.push("qualité taxonomique faible");
  if (scores.time < 0.5) {
    issues.push(`données anciennes (${Math.round((1 - ratios.rTime) * 100)}% > ${RECENT_YEARS_WINDOW} ans)`);
  }
  if (scores.trace < 0.5) issues.push("traçabilité insuffisante");
  if (scores.issues < 0.7) issues.push(`${Math.round((1 - scores.issues) * 100)}% avec alertes GBIF`);

  return issues.length > 0
    ? `Points d'attention : ${issues.join(", ")}`
    : "Données de bonne qualité pour un pré-diagnostic";
}

export function emptyConfidence(): ConfidenceScore {
  return {
    total: 0, geo: 0, tax: 0, time: 0, trace: 0, issues: 0, dup: 0,
    interpretation: "low",
    message: "Aucune donnée disponible",
    rawCount: 0, filteredCount: 0, dedupCount: 0,
  };
}

export function calculateConfidenceScore(rawRecords: any[]): ConfidenceScore {
  if (rawRecords.length === 0) return emptyConfidence();

  const n = rawRecords.length;
  const acc = accumulate(rawRecords);
  const dedupCount = countUniqueRecords(rawRecords);
  const dupRatio = 1 - (n - dedupCount) / n;

  const p = acc.geoWithUncertainty > 0 ? acc.geoUnderThreshold / acc.geoWithUncertainty : 0;
  const q = acc.geoWithUncertainty / n;
  const geoScore = 0.7 * p + 0.3 * q;

  const taxScore = 0.6 * (acc.taxSpeciesRank / n) + 0.4 * (acc.taxAccepted / n);

  const rTime = acc.timeWithDate > 0 ? acc.timeRecent / acc.timeWithDate : 0;
  const timeScore = 0.7 * rTime + 0.3 * (acc.timeWithDate / n);

  const traceScore = 0.5 * (acc.traceWithId / n) + 0.5 * (acc.traceWithAuthor / n);
  const issuesScore = acc.issuesClean / n;

  const total = Math.round(
    100 *
      (WEIGHTS.geo * geoScore +
        WEIGHTS.tax * taxScore +
        WEIGHTS.time * timeScore +
        WEIGHTS.trace * traceScore +
        WEIGHTS.issues * issuesScore +
        WEIGHTS.dup * dupRatio),
  );

  return {
    total,
    geo: Math.round(geoScore * 100),
    tax: Math.round(taxScore * 100),
    time: Math.round(timeScore * 100),
    trace: Math.round(traceScore * 100),
    issues: Math.round(issuesScore * 100),
    dup: Math.round(dupRatio * 100),
    interpretation: interpret(total),
    message: buildMessage(
      { geo: geoScore, tax: taxScore, time: timeScore, trace: traceScore, issues: issuesScore },
      { p, rTime },
    ),
    rawCount: n,
    filteredCount: n,
    dedupCount,
  };
}
