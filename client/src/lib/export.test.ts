import assert from "node:assert/strict";
import test from "node:test";
import type { Occurrence } from "@shared/types";
import { buildSpeciesRows } from "./export";

test("export prioritises territorial concern and explains desk-based evidence", () => {
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
  assert.equal(row["Territorial concern level"], "High");
  assert.equal(row["Priority IUCN status"], "VU");
  assert.match(String(row["Status territory / source"]), /Provence-Alpes-Côte d’Azur/);
  assert.equal(row["Occurrence sources"], "GBIF | iNaturalist");
  assert.match(String(row["Evidence type"]), /field confirmation/);
  assert.equal(row["Documented occurrence count"], 3);
});

test("export explicitly flags a territorial concern not enriched", () => {
  const occurrence: Occurrence = {
    key: 13,
    scientificName: "Testus incertus",
    decimalLatitude: 43,
    decimalLongitude: 6,
    alertLevel: "medium",
  };
  const [row] = buildSpeciesRows([occurrence]) as Array<Record<string, unknown>>;
  assert.equal(row["Territorial concern level"], "Moderate (heuristic)");
  assert.match(String(row["Uncertainties / caveats"]), /not enriched/);
  assert.equal(row["Occurrence sources"], "Not provided");
});