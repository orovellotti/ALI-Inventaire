import assert from "node:assert/strict";
import test from "node:test";
import { zonageKey, toZonageMapFeatures } from "./zonageMap";
import type { ZonagesData } from "./zonages";

test("zonageKey distingue les zonages homonymes grâce à leur identifiant", () => {
  assert.notEqual(
    zonageKey({ type: "ZNIEFF", name: "Marais", id: "zone-1" }),
    zonageKey({ type: "ZNIEFF", name: "Marais", id: "zone-2" }),
  );
});

test("zonageKey reste identique quand seul le libellé change", () => {
  assert.equal(
    zonageKey({ type: "Natura 2000", name: "Ancien libellé", code: "FR9300001" }),
    zonageKey({ type: "Natura 2000", name: "Nouveau libellé", code: "FR9300001" }),
  );
});

test("la carte conserve les homonymes distincts et retire les doublons exacts", () => {
  const geometry = { rings: [[[6, 43], [6.1, 43], [6, 43.1], [6, 43]]] };
  const zonages: ZonagesData = {
    lat: 43,
    lng: 6,
    radius: 5000,
    count: 3,
    errors: [],
    groups: [{
      category: "znieff",
      label: "ZNIEFF",
      count: 3,
      zonages: [
        { category: "znieff", type: "ZNIEFF", name: "Marais", url: null, id: "zone-1", geometry },
        { category: "znieff", type: "ZNIEFF", name: "Marais", url: null, id: "zone-2", geometry },
        { category: "znieff", type: "ZNIEFF", name: "Marais", url: null, id: "zone-1", geometry },
      ],
    }],
  };

  assert.deepEqual(
    toZonageMapFeatures(zonages).map((feature) => feature.id),
    ["ZNIEFF::zone-1", "ZNIEFF::zone-2"],
  );
});