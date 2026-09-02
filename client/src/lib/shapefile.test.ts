import assert from "node:assert/strict";
import test from "node:test";
import { computeCentroid } from "./shapefile";

test("pondère toutes les composantes d'un MultiPolygon et soustrait les trous", () => {
  const centroid = computeCentroid({
    type: "FeatureCollection",
    features: [{
      type: "Feature",
      properties: {},
      geometry: {
        type: "MultiPolygon",
        coordinates: [
          // carré 1×1, centre (0.5, 0.5)
          [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
          // carré 3×3 avec trou 1×1 : centre (3.5, 1.5), surface nette 8
          [
            [[2, 0], [5, 0], [5, 3], [2, 3], [2, 0]],
            [[3, 1], [4, 1], [4, 2], [3, 2], [3, 1]],
          ],
        ],
      },
    }],
  });
  // (1 * .5 + 8 * 3.5) / 9; latitude équivalente.
  assert.ok(Math.abs(centroid[0] - 1.3888889) < 1e-6);
  assert.ok(Math.abs(centroid[1] - 3.1666667) < 1e-6);
});