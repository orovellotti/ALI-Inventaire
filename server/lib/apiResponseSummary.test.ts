import test from "node:test";
import assert from "node:assert/strict";
import { summarizeApiResponse } from "./apiResponseSummary";

test("summarizeApiResponse reports only collection sizes", () => {
  assert.equal(summarizeApiResponse([{ secret: "hidden" }]), "items=1");
  assert.equal(
    summarizeApiResponse({ occurrences: [{ scientificName: "Sensitive species" }] }),
    "items=1",
  );
  assert.equal(summarizeApiResponse({ message: "private error detail" }), undefined);
});