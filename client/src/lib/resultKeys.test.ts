import assert from "node:assert/strict";
import test from "node:test";
import type { Occurrence } from "@shared/types";
import { occurrenceKey, uniqueOccurrences } from "./resultKeys";

function occurrence(overrides: Partial<Occurrence>): Occurrence {
  return {
    key: 1,
    scientificName: "Testudo hermanni",
    decimalLatitude: 43,
    decimalLongitude: 6,
    alertLevel: "low",
    ...overrides,
  };
}

test("les taxons homonymes gardent des clés distinctes", () => {
  const first = occurrence({ key: 10, taxonKey: 100, scientificName: "Nom partagé" });
  const second = occurrence({ key: 20, taxonKey: 200, scientificName: "Nom partagé" });

  assert.notEqual(occurrenceKey(first), occurrenceKey(second));
});

test("les occurrences répétées d'un même taxon ne produisent qu'une ligne", () => {
  const first = occurrence({ key: 10, taxonKey: 100, scientificName: "Nom partagé" });
  const duplicate = occurrence({ key: 20, taxonKey: 100, scientificName: "Nom partagé" });

  assert.deepEqual(uniqueOccurrences([first, duplicate]), [first]);
});

test("le nom normalisé déduplique un taxon sans identifiant taxonomique", () => {
  const first = occurrence({
    key: 10,
    taxonKey: undefined,
    cdNom: undefined,
    scientificName: "  Testudo hermanni ",
  });
  const duplicate = occurrence({
    key: 20,
    taxonKey: undefined,
    cdNom: undefined,
    scientificName: "Testudo hermanni",
  });

  assert.deepEqual(uniqueOccurrences([first, duplicate]), [first]);
});

test("un même taxon TAXREF est dédupliqué entre GBIF et iNaturalist", () => {
  const gbif = occurrence({ key: 10, source: "gbif", taxonKey: 100, cdNom: 77381 });
  const inaturalist = occurrence({ key: 20, source: "inaturalist", taxonKey: 200, cdNom: 77381 });

  assert.equal(occurrenceKey(gbif), occurrenceKey(inaturalist));
  assert.deepEqual(uniqueOccurrences([gbif, inaturalist]), [gbif]);
});