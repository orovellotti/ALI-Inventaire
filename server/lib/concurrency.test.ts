import test from "node:test";
import assert from "node:assert/strict";
import { mapWithConcurrency, mapWithDeadline } from "./concurrency";

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

test("deadline worker retains successes, aborts the active item, and never starts later items", async () => {
  const started: number[] = [];
  let aborted = false;
  const result = await mapWithDeadline([1, 2, 3], 1, Date.now() + 60, async (value, _, signal) => {
    started.push(value);
    if (value === 1) return "first success";
    await new Promise<never>((_, reject) => {
      signal.addEventListener("abort", () => {
        aborted = true;
        reject(new Error("aborted"));
      }, { once: true });
    });
    return "unreachable";
  });
  assert.deepEqual(started, [1, 2]);
  assert.equal(aborted, true);
  assert.equal(result.results.get(0), "first success");
  assert.equal(result.attempted, 2);
  assert.equal(result.failed, 1);
});

test("deadline worker does not await or retain late results from an uncancellable mapper", async () => {
  let resolveLate: ((value: string) => void) | undefined;
  const started: number[] = [];
  const result = await mapWithDeadline([1, 2], 1, Date.now() + 20, async (value) => {
    started.push(value);
    return new Promise<string>((resolve) => { resolveLate = resolve; });
  });
  resolveLate!("late result");
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(started, [1]);
  assert.equal(result.results.size, 0);
  assert.equal(result.failed, 1);
});

test("an expired deadline starts no work", async () => {
  const result = await mapWithDeadline([1], 1, Date.now() - 1, async () => {
    throw new Error("Must not be invoked");
  });
  assert.equal(result.attempted, 0);
});

test("mapWithConcurrency rejects invalid concurrency", async () => {
  await assert.rejects(() => mapWithConcurrency([1], 0, async (value) => value), RangeError);
});