import test from "node:test";
import assert from "node:assert/strict";
import { computeEnjeuLevel } from "./scoring";

const base = {
  globalIucn: undefined,
  frenchProtected: false,
  isInvasive: false,
  isPlant: false,
};

test("privilégie strictement la liste rouge régionale", () => {
  const result = computeEnjeuLevel({
    ...base,
    globalIucn: "CR",
    aliStatuses: [
      { category: "Liste rouge nationale", value: "EN", label: "En danger", tone: "danger" },
      { category: "Liste rouge régionale", value: "LC", label: "Préoccupation mineure", tone: "neutral", scope: "PACA" },
    ],
  });
  assert.equal(result.enjeuLevel, "faible");
});

test("utilise le statut national puis européen en l'absence de régional", () => {
  const national = computeEnjeuLevel({
    ...base,
    aliStatuses: [{ category: "Liste rouge nationale", value: "EN", label: "En danger", tone: "danger" }],
  });
  const european = computeEnjeuLevel({
    ...base,
    aliStatuses: [{ category: "Liste rouge européenne", value: "VU", label: "Vulnérable", tone: "warn" }],
  });
  assert.equal(national.enjeuLevel, "fort");
  assert.equal(european.enjeuLevel, "fort");
});

test("n'utilise jamais seul le statut mondial pour classer une plante", () => {
  for (const globalIucn of ["CR", "EN", "VU", "NT"]) {
    const result = computeEnjeuLevel({
      ...base,
      globalIucn,
      isPlant: true,
      aliStatuses: undefined,
    });
    assert.equal(result.enjeuLevel, "a_confirmer");
    assert.match(result.enjeuWarnings.join(" "), /global IUCN status alone is insufficient/);
  }
});

test("conserve le mondial comme repli prudent pour les autres groupes", () => {
  const result = computeEnjeuLevel({
    ...base,
    globalIucn: "EN",
    aliStatuses: undefined,
  });
  assert.equal(result.enjeuLevel, "fort");
});