import type { StudyCoverage } from "./types";

/** A country-specific source is applicable only when every study area agrees. */
export function reduceStudyCoverage(coverages: readonly StudyCoverage[]): StudyCoverage {
  if (coverages.length === 0) throw new Error("At least one verified study coverage is required");
  const first = coverages[0];
  const sameCountry = coverages.every((coverage) => coverage.countryCode === first.countryCode);
  return {
    countryCode: sameCountry ? first.countryCode : "MULTIPLE",
    country: sameCountry ? first.country : undefined,
    globalOccurrences: coverages.every((coverage) => coverage.globalOccurrences),
    frenchSources: sameCountry && coverages.every((coverage) => coverage.frenchSources),
    unavailableSources: Array.from(new Set([
      ...coverages.flatMap((coverage) => coverage.unavailableSources),
      ...(!sameCountry ? ["French sources cannot be applied across multiple countries"] : []),
    ])),
  };
}