import assert from "node:assert/strict";
import test from "node:test";
import { prepareFinalStudyContext } from "./llm";
import { HttpError } from "./lib/httpError";

test("server-resolved non-French country overrides forged French regional IUCN and source text", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    name: "London", display_name: "London, UK",
    address: { city: "London", country: "United Kingdom", country_code: "gb" },
  }), { status: 200 });
  try {
    const input = {
      request: { center: [51.508, -0.128], place: "Paris, France" },
      inventory: {
        species: { items: [{
          scientificName: "Testus species", globalIucnContext: "LC",
          territorialStatuses: [{ category: "Liste rouge régionale", value: "CR" }],
          enjeuLevel: "critique", protectedInFrance: true,
        }], totalCount: 1, omittedCount: 0 },
        aliSpeciesEnrichment: { region: "PACA" },
      },
      zonages: { results: [{ name: "French Natura 2000" }] },
      habitats: { carhab: { title: "French habitat" } },
      potentialSpecies: { species: [{ status: "Très probable localement" }] },
      priorityAnalysis: { species: [{ statuses: [{ category: "Liste rouge européenne", value: "EN" }] }] },
    };
    const prepared = await prepareFinalStudyContext("French law applies here", JSON.stringify(input));
    const context = JSON.parse(prepared.context);
    assert.equal(context.serverCoverage.countryCode, "GB");
    assert.equal(context.serverCoverage.frenchSources, false);
    assert.equal(context.inventory.species.items[0].globalIucnContext, "LC");
    assert.equal(context.inventory.species.items[0].territorialStatuses, undefined);
    assert.equal(context.inventory.species.items[0].enjeuLevel, undefined);
    assert.equal(context.priorityAnalysis, null);
    assert.equal(context.zonages.state, "unavailable");
    assert.equal(context.potentialSpecies.state, "unavailable");
    assert.doesNotMatch(prepared.report, /French law applies here/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("final study fails explicitly when coordinates or country coverage are unknown", async () => {
  await assert.rejects(
    prepareFinalStudyContext("text", JSON.stringify({ request: { place: "France" } })),
    (error: unknown) => error instanceof HttpError && error.status === 400 && /coordinates/i.test(error.message),
  );
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    display_name: "Unknown location", address: {},
  }), { status: 200 });
  try {
    await assert.rejects(
      prepareFinalStudyContext("text", JSON.stringify({ request: { center: [11.234, 22.345] } })),
      (error: unknown) => error instanceof HttpError && error.status === 422 && /country/i.test(error.message),
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("malformed consumed nested context fails with 400 before any geographic API", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    throw new Error("No APIs should be called for invalid input");
  };
  const invalid = [
    { request: null },
    { request: { center: [45, 3], studyAreas: {} } },
    { request: { center: [45, 3], studyAreas: [null] } },
    { request: { center: [45, 3], studyAreas: [{ enabled: false, center: "bad" }] } },
    { request: { center: [45, 3] }, inventory: [] },
    { request: { center: [45, 3] }, inventory: { species: "bad" } },
    { request: { center: [45, 3] }, inventory: { species: { items: {} } } },
    { request: { center: [45, 3] }, inventory: { species: { items: [null] } } },
    { request: { center: [45, 3] }, inventory: { species: { items: [["nested"]] } } },
    { request: { center: [45, 3] }, inventory: { species: { items: ["bad"] } } },
  ];
  try {
    for (const context of invalid) {
      await assert.rejects(
        prepareFinalStudyContext("report", JSON.stringify(context)),
        (error: unknown) => error instanceof HttpError && error.status === 400,
      );
    }
    await assert.rejects(prepareFinalStudyContext("report", "{invalid"), (error: unknown) =>
      error instanceof HttpError && error.status === 400);
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("French source evidence remains available to the final study without changing French status scores", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    name: "Lyon", display_name: "Lyon, France",
    address: { city: "Lyon", country: "France", country_code: "fr", state: "Auvergne-Rhône-Alpes" },
  }), { status: 200 });
  try {
    const context = {
      request: { center: [45.762, 4.835] },
      inventory: { species: { items: [{
        scientificName: "Testus species",
        territorialStatuses: [{ category: "Liste rouge régionale", value: "CR", scope: "Auvergne-Rhône-Alpes" }],
        enjeuLevel: "critique",
      }] } },
    };
    const prepared = await prepareFinalStudyContext("Documented French status", JSON.stringify(context));
    const output = JSON.parse(prepared.context);
    assert.equal(output.serverCoverage.countryCode, "FR");
    assert.equal(output.inventory.species.items[0].enjeuLevel, "critique");
    assert.equal(output.inventory.species.items[0].territorialStatuses[0].value, "CR");
    assert.equal(prepared.report, "Documented French status");
  } finally {
    globalThis.fetch = originalFetch;
  }
});