import assert from "node:assert/strict";
import test from "node:test";
import { coverageForCountry, getStudyCoverage, requireFrenchCoverage } from "./coverage";
import { reduceStudyCoverage } from "@shared/coverage";

test("global coverage does not imply local French conservation or regulatory coverage", () => {
  const outside = coverageForCountry("GB", "United Kingdom");
  assert.equal(outside.globalOccurrences, true);
  assert.equal(outside.frenchSources, false);
  assert.ok(outside.unavailableSources.includes("CARHAB habitats"));
  assert.equal(coverageForCountry("fr").frenchSources, true);
  assert.equal(coverageForCountry("GP").frenchSources, true);
  assert.throws(() => coverageForCountry(undefined), /country could not be determined/i);
});

test("aggregate coverage never enables French classification for mixed countries", () => {
  const france = coverageForCountry("FR");
  const uk = coverageForCountry("GB");
  for (const coverages of [[france, uk], [uk, france]]) {
    const coverage = reduceStudyCoverage(coverages);
    assert.equal(coverage.countryCode, "MULTIPLE");
    assert.equal(coverage.frenchSources, false);
    assert.ok(coverage.unavailableSources.includes("ALI/TAXREF territorial statuses"));
  }
  assert.deepEqual(reduceStudyCoverage([france, france]), france);
  assert.equal(reduceStudyCoverage([france, { ...france, frenchSources: false }]).frenchSources, false);
  assert.throws(() => reduceStudyCoverage([]), /verified study coverage/);
});

test("country is resolved from reverse geocoding before French-only sources can run", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (request) => {
    const url = String(request);
    assert.match(url, /nominatim\.openstreetmap\.org\/reverse/);
    return new Response(JSON.stringify({
      name: "London",
      display_name: "London, England, United Kingdom",
      address: { city: "London", country: "United Kingdom", country_code: "gb" },
    }), { status: 200 });
  };
  try {
    const coverage = await getStudyCoverage(51.5074, -0.1278);
    assert.equal(coverage.countryCode, "GB");
    await assert.rejects(requireFrenchCoverage(51.5074, -0.1278, "ZNIEFF"), /France only.*GB/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});