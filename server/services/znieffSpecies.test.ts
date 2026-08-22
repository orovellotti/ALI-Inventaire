import assert from "node:assert/strict";
import test from "node:test";
import type { Zonage } from "./geoservices";
import {
  buildZnieffDocumentedSpecies,
  canonicalTaxonName,
} from "./znieffSpecies";

const zones: Zonage[] = [
  {
    category: "znieff",
    type: "ZNIEFF de type I",
    name: "Marais local",
    url: "https://inpn.mnhn.fr/zone/znieff/123",
    id: "1",
    code: "123",
  },
  {
    category: "znieff",
    type: "ZNIEFF de type II",
    name: "Plaine locale",
    url: "https://inpn.mnhn.fr/zone/znieff/456",
    id: "2",
    code: "456",
  },
];

test("déduplique un taxon TAXREF tout en conservant chaque ZNIEFF source", () => {
  const species = buildZnieffDocumentedSpecies(
    [
      {
        zoneCode: "123",
        cdRef: "60577",
        scientificName: "Lutra lutra",
        citedName: "Lutra lutra (Linnaeus, 1758)",
        speciesGroup: "Mammifères",
        determinationStatus: "A",
      },
      {
        zoneCode: "456",
        cdRef: "60577",
        scientificName: "Lutra lutra",
        citedName: "Lutra lutra (Linnaeus, 1758)",
        speciesGroup: "Mammifères",
        determinationStatus: "D",
      },
    ],
    zones,
    new Set(),
  );

  assert.equal(species.length, 1);
  assert.equal(species[0].determinationStatus, "D");
  assert.deepEqual(
    species[0].zones.map((zone) => [zone.code, zone.determinationStatus]),
    [
      ["123", "A"],
      ["456", "D"],
    ],
  );
});

test("une mention ZNIEFF ne devient jamais une observation par elle-même", () => {
  const [species] = buildZnieffDocumentedSpecies(
    [
      {
        zoneCode: "123",
        cdRef: "60577",
        scientificName: "Lutra lutra",
        citedName: "Lutra lutra (Linnaeus, 1758)",
        speciesGroup: "Mammifères",
        determinationStatus: "D",
      },
    ],
    zones,
    new Set(),
  );
  assert.equal(species.alsoObserved, false);
  assert.equal("observed" in species, false);
  assert.equal("score" in species, false);
});

test("le signal également observée exige le même nom dans les occurrences", () => {
  const [species] = buildZnieffDocumentedSpecies(
    [
      {
        zoneCode: "123",
        cdRef: "60577",
        scientificName: "Lutra lutra",
        citedName: "",
        speciesGroup: "Mammifères",
        determinationStatus: "E",
      },
    ],
    zones,
    new Set(["lutra lutra"]),
  );
  assert.equal(species.alsoObserved, true);
});

test("rapproche un nom ZNIEFF d'une occurrence portant une autorité taxonomique", () => {
  const occurrenceName = "Lutra lutra (Linnaeus, 1758)";
  assert.equal(canonicalTaxonName(occurrenceName), "lutra lutra");
  const [species] = buildZnieffDocumentedSpecies(
    [
      {
        zoneCode: "123",
        cdRef: "60577",
        scientificName: "Lutra lutra",
        citedName: occurrenceName,
        speciesGroup: "Mammifères",
        determinationStatus: "D",
      },
    ],
    zones,
    new Set([canonicalTaxonName(occurrenceName)]),
  );
  assert.equal(species.alsoObserved, true);
});

test("ignore une zone hors aire et tout statut confidentiel ou inconnu", () => {
  const species = buildZnieffDocumentedSpecies(
    [
      {
        zoneCode: "999",
        cdRef: "1",
        scientificName: "Species absent",
        citedName: "",
        speciesGroup: "",
        determinationStatus: "D",
      },
      {
        zoneCode: "123",
        cdRef: "2",
        scientificName: "Species confidentialis",
        citedName: "",
        speciesGroup: "",
        determinationStatus: "C",
      },
    ],
    zones,
    new Set(),
  );
  assert.deepEqual(species, []);
});