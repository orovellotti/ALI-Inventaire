import assert from "node:assert/strict";
import test from "node:test";
import {
  haversineM,
  isOccurrenceInStudyArea,
  type PotentialOccurrence,
} from "./potentialSpecies";

const center = { lat: 48.8566, lng: 2.3522 };
const baseOccurrence: PotentialOccurrence = {
  key: 123,
  scientificName: "Lutra lutra",
  decimalLatitude: center.lat,
  decimalLongitude: center.lng,
  source: "gbif",
};

test("accepte une occurrence exactement sur la limite du rayon", () => {
  const radius = 1_000;
  const longitudeAtBoundary =
    center.lng + radius / (111_320 * Math.cos((center.lat * Math.PI) / 180));
  const occurrence = {
    ...baseOccurrence,
    decimalLongitude: longitudeAtBoundary,
  };
  const exactRadius = haversineM(
    center.lat,
    center.lng,
    occurrence.decimalLatitude,
    occurrence.decimalLongitude,
  );
  assert.equal(
    isOccurrenceInStudyArea(occurrence, center.lat, center.lng, exactRadius),
    true,
  );
});

test("refuse une occurrence située au-delà du rayon sans tolérance implicite", () => {
  const occurrence = {
    ...baseOccurrence,
    decimalLongitude: center.lng + 0.02,
  };
  const distance = haversineM(
    center.lat,
    center.lng,
    occurrence.decimalLatitude,
    occurrence.decimalLongitude,
  );
  assert.equal(
    isOccurrenceInStudyArea(occurrence, center.lat, center.lng, distance - 0.01),
    false,
  );
});

test("refuse une occurrence sans identifiant entier exploitable", () => {
  assert.equal(
    isOccurrenceInStudyArea(
      { ...baseOccurrence, key: 1.5 },
      center.lat,
      center.lng,
      1_000,
    ),
    false,
  );
});