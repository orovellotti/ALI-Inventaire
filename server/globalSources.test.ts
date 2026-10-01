import assert from "node:assert/strict";
import test from "node:test";
import { searchINaturalist } from "./inaturalist";
import { searchOccurrences } from "./services/gbifApi";
import { searchGBIFMultiCircle, consolidateByCdRef } from "./gbif";
import { normalizeTaxonIdentity } from "@shared/taxonomy";
import type { BufferCircle, Occurrence } from "@shared/types";

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

test("mixed-country circles are classified globally before merging, regardless of order", async () => {
  const originalFetch = globalThis.fetch;
  const circles: BufferCircle[] = [
    { id: "fr", center: [48.87, 2.37], radius: 1000, label: "France", enabled: true },
    { id: "uk", center: [51.51, -0.13], radius: 1000, label: "UK", enabled: true },
  ];
  let coverageCalls = 0;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.hostname === "nominatim.openstreetmap.org") {
      coverageCalls++;
      const french = Number(url.searchParams.get("lat")) < 50;
      return Response.json({ address: { country_code: french ? "fr" : "gb", state: french ? "Île-de-France" : "England" } });
    }
    assert.equal(coverageCalls, 2, "all countries must be resolved before occurrence searches");
    if (url.hostname === "api.inaturalist.org") {
      return Response.json({ total_results: 1, results: url.pathname.endsWith("species_counts") ? [{
        count: 1,
        taxon: {
          id: 99, name: "Inatus reptus", rank: "species", iconic_taxon_name: "Reptilia",
          conservation_status: { place_id: 6753, iucn_status_code: "CR" },
        },
      }] : [] });
    }
    assert.match(url.pathname, /occurrence\/search/);
    const midpoint = (key: string) => {
      const [min, max] = url.searchParams.get(key)!.split(",").map(Number);
      return (min + max) / 2;
    };
    return Response.json({ results: [{
      key: 42, scientificName: "Testus reptus", class: "Reptilia", taxonRank: "SPECIES",
      decimalLatitude: midpoint("decimalLatitude"), decimalLongitude: midpoint("decimalLongitude"),
    }] });
  };
  try {
    for (const areas of [circles, [...circles].reverse()]) {
      const result = await searchGBIFMultiCircle(areas);
      assert.equal(result.coverage?.countryCode, "MULTIPLE");
      assert.equal(result.stats.sensitiveCount, 0);
      assert.equal(result.aliSpeciesEnrichment, undefined);
      assert.equal(result.occurrences.length, 2);
      for (const occurrence of result.occurrences) {
        assert.equal(occurrence.alertLevel, "low");
        assert.equal(occurrence.frenchProtected, undefined);
        assert.equal(occurrence.isInvasive, undefined);
        assert.equal(occurrence.aliStatuses, undefined);
      }
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("single-country French inventory retains the existing classification boost", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.hostname === "nominatim.openstreetmap.org") {
      return Response.json({ address: { country_code: "fr", state: "Occitanie" } });
    }
    return Response.json({ results: [{
      key: 7, scientificName: "Testus reptus", class: "Reptilia", taxonRank: "SPECIES",
      decimalLatitude: 43.789, decimalLongitude: 3.789,
    }] });
  };
  try {
    const result = await searchGBIFMultiCircle([{
      id: "main", center: [43.789, 3.789], radius: 500, label: "France", enabled: true,
    }], { includeINaturalist: false, skipAliSpeciesMcp: true });
    assert.equal(result.coverage?.countryCode, "FR");
    assert.equal(result.occurrences[0].frenchProtected, true);
    assert.equal(result.occurrences[0].alertLevel, "medium");
    assert.equal(result.stats.sensitiveCount, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("full scientific identity preserves subspecies and still merges author variants", () => {
  assert.equal(normalizeTaxonIdentity("Aloe arborescens Mill."), normalizeTaxonIdentity("Aloe arborescens"));
  assert.equal(normalizeTaxonIdentity("Haliotis tuberculata (Linnaeus, 1758)"), "haliotis tuberculata");
  assert.equal(normalizeTaxonIdentity("Brassica oleracea L. var. capitata"), "brassica oleracea var. capitata");
  assert.equal(normalizeTaxonIdentity("Pinus nigra ssp. nigra"), normalizeTaxonIdentity("Pinus nigra subsp. nigra"));
  assert.equal(normalizeTaxonIdentity("× Cupressocyparis leylandii (A.B.Jacks. & Dallim.) Dallim."), "× cupressocyparis leylandii");
  const names = ["Pinus nigra", "Pinus nigra subsp. nigra", "Pinus nigra subsp. salzmannii",
    "Pinus nigra subsp. salzmannii (Dunal) Franco"];
  const occurrences = names.map((scientificName, key): Occurrence => ({
    key, scientificName, decimalLatitude: 43, decimalLongitude: 3, alertLevel: "low",
    ...(key === 2 ? { cdNom: 123 } : {}),
  }));
  const consolidated = consolidateByCdRef(occurrences);
  assert.equal(consolidated.consolidated.length, 3);
  assert.equal(consolidated.duplicatesRemoved, 1);
  assert.deepEqual(consolidated.consolidated[2].sourceNames, names.slice(2));
});

test("iNaturalist failure is exposed rather than reported as an empty successful source", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("unavailable", { status: 503 });
  try {
    const result = await searchINaturalist(53.1234, -1.5678, 500, false);
    assert.equal(result.occurrences.length, 0);
    assert.equal(result.status.state, "unavailable");
    assert.match(result.status.error!, /HTTP 503/);
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