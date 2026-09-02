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

test("regroupe les taxons et applique le tri métier par défaut", () => {
  const birdZ = { ...occurrence(30, 300), scientificName: "Aves zeta", vernacularName: "Zorzal", class: "Aves" };
  const birdA = { ...occurrence(40, 400), scientificName: "Aves alpha", vernacularName: "Alouette", class: "Aves" };
  const plantZ = { ...occurrence(50, 500), scientificName: "Zea test", vernacularName: "A plante", kingdom: "Plantae" };
  const plantA = { ...occurrence(60, 600), scientificName: "Abies test", vernacularName: "Z plante", kingdom: "Plantae" };

  const markup = renderToStaticMarkup(
    <SpeciesInventoryTable
      species={[plantZ, birdZ, plantA, birdA]}
      selectedSpecies={null}
      onSelectSpecies={() => undefined}
      centerCoords={[43, 6]}
    />,
  );

  assert.ok(markup.indexOf("Oiseaux") < markup.indexOf("Plantes"));
  assert.ok(markup.indexOf("Alouette") < markup.indexOf("Zorzal"));
  assert.ok(markup.indexOf("Abies test") < markup.indexOf("Zea test"));
});