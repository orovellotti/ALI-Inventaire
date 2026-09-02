import assert from "node:assert/strict";
import test from "node:test";
import { extractVernacularNames } from "./services/gbifApi";

test("extrait les noms français et anglais quand GBIF les fournit", () => {
  assert.deepEqual(
    extractVernacularNames([
      { language: "eng", vernacularName: "European robin" },
      { language: "fra", vernacularName: "Rougegorge familier" },
      { language: "deu", vernacularName: "Rotkehlchen" },
    ]),
    { french: "Rougegorge familier", english: "European robin" },
  );
});

test("n'invente aucun nom vernaculaire absent", () => {
  assert.deepEqual(extractVernacularNames([{ language: "deu", vernacularName: "Rotkehlchen" }]), {});
});