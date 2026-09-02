import test from "node:test";
import assert from "node:assert/strict";
import { formatCarhabSummary, parseCarhabOutput } from "@shared/carhab";

test("déduplique et trie les habitats CARHAB par surface décroissante", () => {
  const output = `Résumé humain
{
  "totalAreaHa": 20,
  "source": "ign-carhab",
  "featuresFetched": 3,
  "habitats": [
    {"code":"4100","label":"Habitat ouvert","areaHa":4,"percentage":20},
    {"code":"5100","label":"Habitat forestier","areaHa":10,"percentage":50},
    {"code":"4100","label":"Habitat ouvert","areaHa":2,"percentage":10}
  ]
}`;
  const parsed = parseCarhabOutput(output);
  assert.ok(parsed);
  assert.equal(parsed.habitats.length, 2);
  assert.equal(parsed.habitats[0].code, "5100");
  assert.equal(parsed.habitats[1].areaHa, 6);
  assert.equal(parsed.habitats[1].percentage, 30);
  assert.match(formatCarhabSummary(parsed), /Surface analysée par CARHAB : 20 ha/);
});

test("accepte le résumé textuel si le JSON est absent", () => {
  const parsed = parseCarhabOutput(
    "Habitats:\n  • [4100] Habitat ouvert — 12,92 ha (16,5%)\n  • [5100] Habitat forestier — 5 ha (6%)",
  );
  assert.ok(parsed);
  assert.equal(parsed.habitats[0].areaHa, 12.92);
  assert.equal(parsed.habitats[0].label, "Habitat ouvert");
});

test("lit le format réel ALI Habitat avec résumé suivi du JSON", () => {
  const parsed = parseCarhabOutput(`Point: 43.36860, 5.25050 (radius 0.5 km)
Total area analysed: 78.41 ha — source: ign-carhab (510 features fetched)
Habitats:
  • [4100] Habitat ouvert — 12.92 ha (16.5%)
{
  "point": {"longitude": 5.2505, "latitude": 43.3686},
  "radiusKm": 0.5,
  "totalAreaHa": 78.41,
  "habitats": [{"code":"4100","label":"Habitat ouvert","areaHa":12.92,"percentage":16.5}],
  "source":"ign-carhab",
  "featuresFetched":510
}`);
  assert.ok(parsed);
  assert.equal(parsed.totalAreaHa, 78.41);
  assert.equal(parsed.featuresFetched, 510);
  assert.equal(parsed.habitats[0].code, "4100");
});

test("refuse un texte CARHAB sans habitat identifiable", () => {
  assert.equal(parseCarhabOutput("Service indisponible"), null);
});