import assert from "node:assert/strict";
import test from "node:test";
import { formatGeocodeDisplayName } from "./services/nominatim";

test("retire l'arrondissement administratif parasite du libellé d'une commune", () => {
  const label = formatGeocodeDisplayName({
    name: "Le Rove",
    display_name: "Le Rove, Istres, Bouches-du-Rhône, Provence-Alpes-Côte d'Azur, France",
    address: {
      village: "Le Rove",
      municipality: "Istres",
      county: "Bouches-du-Rhône",
      state: "Provence-Alpes-Côte d'Azur",
    },
  });

  assert.equal(label, "Le Rove, Bouches-du-Rhône, Provence-Alpes-Côte d'Azur");
  assert.doesNotMatch(label, /Istres/);
});

test("conserve le lieu local et son contexte utile sans doublon", () => {
  const label = formatGeocodeDisplayName({
    name: "Les Gondoins",
    address: {
      hamlet: "Les Gondoins",
      village: "Les Borels",
      municipality: "Gap",
      county: "Hautes-Alpes",
      state: "Provence-Alpes-Côte d'Azur",
    },
  });

  assert.equal(label, "Les Gondoins, Les Borels, Hautes-Alpes, Provence-Alpes-Côte d'Azur");
});