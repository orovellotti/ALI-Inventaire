import assert from "node:assert/strict";
import test from "node:test";
import type { Occurrence } from "@shared/types";
import { buildSpeciesRows, buildConcernSummaryRows } from "./export";

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

test("rows and Excel totals share canonical, heuristic and invasive classifications", () => {
  const base: Occurrence = { key: 1, scientificName: "Testus concern", class: "Aves", decimalLatitude: 43, decimalLongitude: 6, alertLevel: "high" };
  const species = [
    { ...base, enjeuLevel: "modere" as const },
    { ...base, enjeuLevel: "a_confirmer" as const },
    { ...base, enjeuLevel: "faible" as const },
    { ...base, enjeuLevel: "critique" as const, isInvasive: true },
    base,
  ];
  assert.deepEqual(buildSpeciesRows(species).map((row) => row["Territorial concern level"]), [
    "Moderate", "To confirm", "Low", "Invasive alien species — management concern", "High (heuristic)",
  ]);
  const total = buildConcernSummaryRows(species).at(-1)!;
  assert.equal(total["High or critical concerns"], 1);
  assert.equal(total["Moderate concerns"], 1);
  assert.equal(total["To confirm"], 1);
  assert.equal(total["Low concerns"], 1);
  assert.equal(total["Invasive management concerns"], 1);
  assert.equal(total["Species count"], 5);
});