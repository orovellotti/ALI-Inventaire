import assert from "node:assert/strict";
import test from "node:test";

import { lookupAliSpeciesForStudy, statusesForStudyRegion, territorialScopeFromRegions } from "./aliSpeciesMcp";
import { enrichPrioritySpeciesForStudy, type PrioritySpecies } from "../llm";
import type { Occurrence } from "@shared/types";

const payload = {
  territoire: "Auvergne-Rhône-Alpes",
  patrimonialite: {
    drivers: [
      {
        label: "LRR EN",
        code: "EN",
        title: "Liste rouge régionale (Auvergne-Rhône-Alpes) : EN",
        kind: "redlist",
      },
    ],
  },
  statuts: [
    {
      cdTypeStatut: "LRR",
      codeStatut: "RE",
      labelStatut: "Disparue au niveau régional",
      lbAdmTr: "Aquitaine",
    },
    {
      cdTypeStatut: "LRN",
      codeStatut: "VU",
      labelStatut: "Vulnérable",
      lbAdmTr: "France métropolitaine",
    },
  ],
};

test("ne conserve que la liste rouge de la région étudiée", () => {
  const statuses = statusesForStudyRegion(payload, "Auvergne-Rhône-Alpes");
  assert.deepEqual(
    statuses.filter((status) => status.category === "Liste rouge régionale"),
    [{
      category: "Liste rouge régionale",
      value: "EN",
      label: "Liste rouge régionale (Auvergne-Rhône-Alpes) : EN",
      tone: "danger",
      scope: "Auvergne-Rhône-Alpes",
    }],
  );
  assert.equal(
    statuses.find((status) => status.category === "Liste rouge nationale")?.value,
    "VU",
  );
});

function priority(scientificName: string): PrioritySpecies {
  return {
    scientificName, group: "Plants", icon: "🌿", reason: "Documented record",
    level: "modéré", sources: ["GBIF"], inInventory: true,
    evidenceClass: "A", evidenceLabel: "Documented occurrence", score: 40, scoreLabel: "moderate",
  };
}

function mockMcpFetch(
  regionForLatitude: (latitude: number) => string,
  onTool: (args: Record<string, any>, signal?: AbortSignal | null) => Promise<unknown>,
): typeof fetch {
  return async (input, init) => {
    const url = new URL(String(input));
    if (url.hostname === "nominatim.openstreetmap.org") {
      return Response.json({ address: {
        state: regionForLatitude(Number(url.searchParams.get("lat"))), country_code: "fr",
      } });
    }
    assert.equal(url.hostname, "taxref-explorer.replit.app");
    if (init?.method !== "POST") return new Response(null, { status: 405 });
    const message = JSON.parse(String(init.body));
    if (!("id" in message)) return new Response(null, { status: 202 });
    const result = message.method === "initialize"
      ? {
        protocolVersion: message.params.protocolVersion,
        capabilities: { tools: {} },
        serverInfo: { name: "Regression-test MCP", version: "1.0.0" },
      }
      : { content: [{ type: "text", text: JSON.stringify(await onTool(message.params.arguments, init.signal)) }] };
    return Response.json({ jsonrpc: "2.0", id: message.id, result });
  };
}

const scopedPayload = {
  territoire: "Occitanie",
  patrimonialite: { drivers: [{ kind: "redlist", label: "LRR LC", code: "LC" }] },
  statuts: [
    { cdTypeStatut: "LRR", regroupementType: "Liste rouge", codeStatut: "CR", lbAdmTr: "Aquitaine" },
    {
      cdTypeStatut: "LRN", regroupementType: "Liste rouge", codeStatut: "VU",
      lbAdmTr: "France métropolitaine", docUrl: "https://inpn.mnhn.fr/reference/status",
    },
  ],
};

test("priority enrichment reuses scoped inventory rules and the unchanged patrimoniality formula", async () => {
  const originalFetch = globalThis.fetch;
  const argumentsSeen: Record<string, any>[] = [];
  globalThis.fetch = mockMcpFetch(() => "Occitanie", async (args) => {
    argumentsSeen.push(args);
    return scopedPayload;
  });
  const occurrence: Occurrence = {
    key: 1, scientificName: "Pinus nigra subsp. salzmannii (Dunal) Franco", cdNom: 123,
    decimalLatitude: 43, decimalLongitude: 3, alertLevel: "low",
  };
  try {
    const result = await enrichPrioritySpeciesForStudy(
      [priority("Pinus nigra subsp. salzmannii")], [occurrence], [[43, 3]],
    );
    assert.deepEqual(argumentsSeen, [{ cdNom: 123, region: "Occitanie" }]);
    assert.equal(result.species[0].statuses?.find((status) => status.category === "Liste rouge régionale")?.value, "LC");
    assert.equal(result.species[0].patrimonialite?.score, 30, "national VU contributes 0.5 × 0.6; foreign CR is excluded");
    assert.equal(result.species[0].statuses?.find((status) => status.category === "Liste rouge nationale")?.docUrl,
      "https://inpn.mnhn.fr/reference/status");
    assert.equal(result.trace.enriched, 1);
    assert.equal(result.trace.partial, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("multi-region priority analysis cannot inherit one region's driver", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockMcpFetch((lat) => lat < 44 ? "Occitanie" : "Nouvelle-Aquitaine", async (args) => {
    assert.equal(args.region, undefined);
    return scopedPayload;
  });
  try {
    const result = await enrichPrioritySpeciesForStudy(
      [priority("Testus plantus")], [], [[43, 3], [45, -1]],
    );
    assert.equal(result.trace.territorialScope, "multiple");
    assert.equal(result.species[0].statuses?.some((status) => status.category === "Liste rouge régionale"), false);
    assert.equal(result.species[0].patrimonialite?.score, 30);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("priority ALI deadline retains earlier successes and cancels without querying later taxa", async () => {
  const originalFetch = globalThis.fetch;
  const called: string[] = [];
  globalThis.fetch = mockMcpFetch(() => "Occitanie", async (args, signal) => {
    called.push(args.scientificName);
    if (called.length === 1) return scopedPayload;
    return new Promise((_, reject) => {
      signal?.addEventListener("abort", () => reject(new Error("Fetch aborted")), { once: true });
    });
  });
  try {
    const species = [priority("Testus first"), priority("Testus slow"), priority("Testus skipped")];
    const result = await enrichPrioritySpeciesForStudy(species, [], [[43, 3]], { budgetMs: 100 });
    assert.deepEqual(called, ["Testus first", "Testus slow"]);
    assert.equal(result.species[0].statuses?.length, 2);
    assert.equal(result.species[1].statuses, undefined);
    assert.equal(result.trace.attempted, 2);
    assert.equal(result.trace.enriched, 1);
    assert.equal(result.trace.failed, 1);
    assert.equal(result.trace.skipped, 1);
    assert.equal(result.trace.partial, true);
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(called.length, 2, "no background scheduling after the response");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("MCP source connection failure exposes partial state, not an empty successful lookup", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => String(input).includes("nominatim")
    ? Response.json({ address: { state: "Occitanie", country_code: "fr" } })
    : new Response("unavailable", { status: 503 });
  try {
    const result = await lookupAliSpeciesForStudy([{ scientificName: "Testus plantus" }], [[43, 3]]);
    assert.equal(result.results.size, 0);
    assert.equal(result.trace.partial, true);
    assert.equal(result.trace.attempted, 0);
    assert.equal(result.trace.skipped, 1);
    assert.match(result.trace.error!, /unavailable/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rejette le driver régional si le territoire renvoyé ne correspond pas", () => {
  const statuses = statusesForStudyRegion(payload, "Occitanie");
  assert.equal(
    statuses.some((status) => status.category === "Liste rouge régionale"),
    false,
  );
});

test("n'attribue aucune région unique à une analyse multi-régions", () => {
  assert.deepEqual(
    territorialScopeFromRegions(["Occitanie", "Nouvelle-Aquitaine"], 2),
    { scope: "multiple" },
  );
});

test("reste prudent si toutes les localisations n'ont pas été résolues", () => {
  assert.deepEqual(
    territorialScopeFromRegions(["Occitanie"], 2),
    { scope: "unknown" },
  );
});