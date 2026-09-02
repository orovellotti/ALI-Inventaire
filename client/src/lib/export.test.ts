import assert from "node:assert/strict";
import test from "node:test";
import type { Occurrence } from "@shared/types";
import { buildSpeciesRows } from "./export";

test("l’export privilégie l’enjeu territorial et explicite la preuve documentaire", () => {
  const occurrence: Occurrence = {
    key: 12,
    scientificName: "Testus documentatus",
    decimalLatitude: 43,
    decimalLongitude: 6,
    alertLevel: "low",
    source: "gbif",
    sourceNames: ["GBIF", "iNaturalist"],
    observationCount: 3,
    lastObservationYear: 2024,
    enjeuLevel: "fort",
    aliStatuses: [{
      category: "Liste rouge régionale",
      value: "VU",
      label: "Vulnérable",
      tone: "danger",
      scope: "Provence-Alpes-Côte d’Azur",
    }],
  };

  const [row] = buildSpeciesRows([occurrence]) as Array<Record<string, unknown>>;
  assert.equal(row["Niveau d'enjeu territorial"], "Fort");
  assert.equal(row["Statut UICN prioritaire"], "VU");
  assert.match(String(row["Territoire / source du statut"]), /Provence-Alpes-Côte d’Azur/);
  assert.equal(row["Provenance des occurrences"], "GBIF | iNaturalist");
  assert.match(String(row["Nature de la preuve"]), /relevés de terrain/);
  assert.equal(row["Nombre d'occurrences documentées"], 3);
});

test("l’export signale explicitement un enjeu territorial non enrichi", () => {
  const occurrence: Occurrence = {
    key: 13,
    scientificName: "Testus incertus",
    decimalLatitude: 43,
    decimalLongitude: 6,
    alertLevel: "medium",
  };
  const [row] = buildSpeciesRows([occurrence]) as Array<Record<string, unknown>>;
  assert.equal(row["Niveau d'enjeu territorial"], "Modéré (heuristique)");
  assert.match(String(row["Incertitudes / réserves"]), /non enrichi/);
  assert.equal(row["Provenance des occurrences"], "Non renseignée");
});