import assert from "node:assert/strict";
import test from "node:test";
import { searchINaturalist } from "./inaturalist";
import { searchOccurrences } from "./services/gbifApi";

test("iNaturalist global query is not filtered to France or classified by French protection", async () => {
  const originalFetch = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = async (input) => {
    urls.push(String(input));
    if (String(input).includes("species_counts")) {
      return new Response(JSON.stringify({
        total_results: 1,
        results: [{
          count: 1,
          taxon: {
            id: 42, name: "Testus avius", rank: "species", iconic_taxon_name: "Aves",
            conservation_status: { place_id: 6753, iucn_status_code: "CR" },
          },
        }],
      }), { status: 200 });
    }
    return new Response(JSON.stringify({ results: [] }), { status: 200 });
  };
  try {
    const result = await searchINaturalist(51.5074, -0.1278, 500, false);
    const speciesQuery = new URL(urls[0]);
    assert.equal(speciesQuery.searchParams.get("locale"), "en");
    assert.equal(speciesQuery.searchParams.has("preferred_place_id"), false);
    assert.equal(result.occurrences[0].frenchProtected, undefined);
    assert.equal(result.occurrences[0].alertLevel, "low");
    assert.equal(result.occurrences[0].iucnStatus, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("GBIF queries both sides of the international date line", async () => {
  const originalFetch = globalThis.fetch;
  const ranges: string[] = [];
  globalThis.fetch = async (input) => {
    ranges.push(new URL(String(input)).searchParams.get("decimalLongitude") ?? "");
    return new Response(JSON.stringify({ results: [] }), { status: 200 });
  };
  try {
    await searchOccurrences({ lat: -17, lng: 179.99, radiusMeters: 5000 });
    assert.equal(ranges.length, 2);
    assert.ok(ranges.some((range) => range.endsWith(",180.0000")));
    assert.ok(ranges.some((range) => range.startsWith("-180.0000,")));
  } finally {
    globalThis.fetch = originalFetch;
  }
});