import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_REFORMAT_CONTEXT_CHARACTERS,
  MAX_REFORMAT_REPORT_CHARACTERS,
  reformatBodySchema,
} from "./validation";

test("accepte un rapport dépassant l'ancien plafond de 50 000 caractères", () => {
  const result = reformatBodySchema.safeParse({ report: "a".repeat(50_001), context: "{}" });
  assert.equal(result.success, true);
});

test("conserve une limite explicite contre les requêtes démesurées", () => {
  const result = reformatBodySchema.safeParse({
    report: "a".repeat(MAX_REFORMAT_REPORT_CHARACTERS + 1),
    context: "{}",
  });
  assert.equal(result.success, false);
  if (!result.success) {
    assert.match(result.error.issues[0]?.message ?? "", /200[  ]000 caractères/);
  }
});

test("borne séparément le contexte scientifique structuré", () => {
  const result = reformatBodySchema.safeParse({
    report: "Rapport",
    context: "a".repeat(MAX_REFORMAT_CONTEXT_CHARACTERS + 1),
  });
  assert.equal(result.success, false);
  if (!result.success) {
    assert.match(result.error.issues[0]?.message ?? "", /Contexte trop long/);
  }
});