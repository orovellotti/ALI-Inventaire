import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Occurrence } from "@shared/types";
import { SpeciesInventoryTable } from "./ResultsPanel";
import { occurrenceKey } from "@/lib/resultKeys";

function occurrence(key: number, taxonKey: number): Occurrence {
  return {
    key,
    taxonKey,
    scientificName: "Nom scientifique partagé",
    decimalLatitude: 43,
    decimalLongitude: 6,
    alertLevel: "low",
    source: "gbif",
  };
}

test("deux taxons homonymes ont deux lignes et une sélection indépendante", () => {
  const first = occurrence(10, 100);
  const second = occurrence(20, 200);
  const firstKey = occurrenceKey(first);
  const secondKey = occurrenceKey(second);

  const markup = renderToStaticMarkup(
    <SpeciesInventoryTable
      species={[first, second]}
      selectedSpecies={secondKey}
      onSelectSpecies={() => undefined}
      centerCoords={[43, 6]}
    />,
  );

  assert.match(markup, new RegExp(`data-species-item="${firstKey}"`));
  assert.match(markup, new RegExp(`data-species-item="${secondKey}"`));
  assert.equal((markup.match(/data-species-item=/g) ?? []).length, 4);
  assert.equal((markup.match(/aria-expanded="true"/g) ?? []).length, 2);
  assert.equal((markup.match(/aria-expanded="false"/g) ?? []).length, 2);
});