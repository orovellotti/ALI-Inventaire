import test from "node:test";
import assert from "node:assert/strict";
import { mapWithConcurrency } from "./concurrency";

test("mapWithConcurrency bounds active work and preserves result order", async () => {
  let active = 0;
  let maximumActive = 0;

  const results = await mapWithConcurrency([30, 5, 20, 1, 10], 2, async (delay, index) => {
    active++;
    maximumActive = Math.max(maximumActive, active);
    await new Promise((resolve) => setTimeout(resolve, delay));
    active--;
    return index;
  });

  assert.deepEqual(results, [0, 1, 2, 3, 4]);
  assert.equal(maximumActive, 2);
});

test("mapWithConcurrency rejects invalid concurrency", async () => {
  await assert.rejects(() => mapWithConcurrency([1], 0, async (value) => value), RangeError);
});