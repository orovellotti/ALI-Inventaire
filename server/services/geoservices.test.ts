import assert from "node:assert/strict";
import test from "node:test";
import {
  collectPaginatedZonages,
  parseWfsNumberMatched,
  type LayerPage,
  type Zonage,
} from "./geoservices";

function zone(code: string): Zonage {
  return {
    category: "znieff",
    type: "ZNIEFF de type I",
    name: `Zone ${code}`,
    url: `https://inpn.mnhn.fr/zone/znieff/${code}`,
    id: code,
    code,
  };
}

test("signale une pagination partielle si le WFS répète la même page", async () => {
  const repeatedPage: LayerPage = {
    zonages: Array.from({ length: 200 }, (_, index) => zone(String(index))),
    numberMatched: 603,
    numberReturned: 200,
  };
  const requestedStarts: number[] = [];
  const result = await collectPaginatedZonages(async (startIndex) => {
    requestedStarts.push(startIndex);
    return repeatedPage;
  });

  assert.deepEqual(requestedStarts, [0, 200]);
  assert.equal(result.zones.length, 200);
  assert.equal(result.partial, true);
});

test("assemble toutes les pages quand STARTINDEX progresse réellement", async () => {
  const result = await collectPaginatedZonages(async (startIndex, count) => {
    const remaining = Math.max(0, 603 - startIndex);
    const returned = Math.min(count, remaining);
    return {
      zonages: Array.from({ length: returned }, (_, index) =>
        zone(String(startIndex + index)),
      ),
      numberMatched: 603,
      numberReturned: returned,
    };
  });

  assert.equal(result.zones.length, 603);
  assert.equal(result.partial, false);
});

test("considère null et unknown comme une absence de compteur WFS", () => {
  assert.equal(parseWfsNumberMatched(null), null);
  assert.equal(parseWfsNumberMatched(undefined), null);
  assert.equal(parseWfsNumberMatched("unknown"), null);
  assert.equal(parseWfsNumberMatched("603"), 603);
});

test("continue les pages sans numberMatched jusqu'à une page courte", async () => {
  const requestedStarts: number[] = [];
  const result = await collectPaginatedZonages(async (startIndex, count) => {
    requestedStarts.push(startIndex);
    const total = 403;
    const returned = Math.min(count, Math.max(0, total - startIndex));
    return {
      zonages: Array.from({ length: returned }, (_, index) =>
        zone(String(startIndex + index)),
      ),
      numberMatched: null,
      numberReturned: returned,
    };
  });

  assert.deepEqual(requestedStarts, [0, 200, 400]);
  assert.equal(result.zones.length, 403);
  assert.equal(result.partial, false);
});