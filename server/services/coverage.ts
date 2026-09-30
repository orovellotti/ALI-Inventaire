import type { StudyCoverage } from "@shared/types";
import { HttpError } from "../lib/httpError";
import { reverseGeocode } from "./nominatim";

// ISO 3166-1 codes for France and overseas French territories covered by the
// French reference services. Country is resolved from coordinates, not a name.
const FRENCH_CODES = new Set(["FR", "GP", "MQ", "GF", "RE", "YT", "PM", "BL", "MF", "WF", "PF", "NC", "TF"]);
const cache = new Map<string, { value: StudyCoverage; expires: number }>();

export function coverageForCountry(countryCode: string | undefined, country?: string): StudyCoverage {
  const code = countryCode?.trim().toUpperCase();
  if (!code || !/^[A-Z]{2}$/.test(code)) {
    throw new HttpError(422, "Study country could not be determined; coverage cannot be assessed.");
  }
  const french = FRENCH_CODES.has(code);
  return {
    countryCode: code,
    country,
    globalOccurrences: true,
    frenchSources: french,
    unavailableSources: french ? [] : [
      "French SINP", "French protected-area zoning", "French Natura 2000 and ZNIEFF species",
      "CARHAB habitats", "ALI/TAXREF territorial statuses", "French invasive-species classification",
    ],
  };
}

export async function getStudyCoverage(lat: number, lng: number): Promise<StudyCoverage> {
  const key = `${lat.toFixed(4)}:${lng.toFixed(4)}`;
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return cached.value;
  const location = await reverseGeocode(lat, lng);
  const value = coverageForCountry(location.countryCode, location.country);
  if (cache.size > 500) cache.clear();
  cache.set(key, { value, expires: Date.now() + 60 * 60_000 });
  return value;
}

export async function requireFrenchCoverage(lat: number, lng: number, source: string): Promise<StudyCoverage> {
  const coverage = await getStudyCoverage(lat, lng);
  if (!coverage.frenchSources) {
    throw new HttpError(422, `${source} covers France only; ${coverage.countryCode} is outside its coverage. This does not mean the feature or species is absent.`);
  }
  return coverage;
}