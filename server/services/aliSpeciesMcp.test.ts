import assert from "node:assert/strict";
import test from "node:test";

import { statusesForStudyRegion, territorialScopeFromRegions } from "./aliSpeciesMcp";

const payload = {
  territoire: "Auvergne-Rhône-Alpes",
  patrimonialite: {
    drivers: [
      {
        label: "LRR EN",
        code: "EN",
        title: "Liste rouge régionale (Auvergne-Rhône-Alpes) : EN",
        kind: "redlist",
      },
    ],
  },
  statuts: [
    {
      cdTypeStatut: "LRR",
      codeStatut: "RE",
      labelStatut: "Disparue au niveau régional",
      lbAdmTr: "Aquitaine",
    },
    {
      cdTypeStatut: "LRN",
      codeStatut: "VU",
      labelStatut: "Vulnérable",
      lbAdmTr: "France métropolitaine",
    },
  ],
};

test("ne conserve que la liste rouge de la région étudiée", () => {
  const statuses = statusesForStudyRegion(payload, "Auvergne-Rhône-Alpes");
  assert.deepEqual(
    statuses.filter((status) => status.category === "Liste rouge régionale"),
    [{
      category: "Liste rouge régionale",
      value: "EN",
      label: "Liste rouge régionale (Auvergne-Rhône-Alpes) : EN",
      tone: "danger",
      scope: "Auvergne-Rhône-Alpes",
    }],
  );
  assert.equal(
    statuses.find((status) => status.category === "Liste rouge nationale")?.value,
    "VU",
  );
});

test("rejette le driver régional si le territoire renvoyé ne correspond pas", () => {
  const statuses = statusesForStudyRegion(payload, "Occitanie");
  assert.equal(
    statuses.some((status) => status.category === "Liste rouge régionale"),
    false,
  );
});

test("n'attribue aucune région unique à une analyse multi-régions", () => {
  assert.deepEqual(
    territorialScopeFromRegions(["Occitanie", "Nouvelle-Aquitaine"], 2),
    { scope: "multiple" },
  );
});

test("reste prudent si toutes les localisations n'ont pas été résolues", () => {
  assert.deepEqual(
    territorialScopeFromRegions(["Occitanie"], 2),
    { scope: "unknown" },
  );
});