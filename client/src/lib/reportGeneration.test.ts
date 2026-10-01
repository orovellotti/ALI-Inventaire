import assert from "node:assert/strict";
import test from "node:test";
import { ReportGenerationGate } from "./reportGeneration";

test("changing inputs aborts and rejects stale successes, errors and finalizers", async () => {
  const gate = new ReportGenerationGate();
  const firstScope = {};
  const secondScope = {};
  const first = gate.begin(firstScope)!;
  let resolve!: (text: string) => void;
  const delayed = new Promise<string>((done) => { resolve = done; });
  let generated: string | null = null;
  let trace: string | null = null;
  const completion = delayed.then((text) => {
    if (gate.isCurrent(first)) {
      generated = text;
      trace = "old trace";
    }
    gate.finish(first);
  });
  gate.setScope(secondScope);
  assert.equal(first.controller.signal.aborted, true);
  const second = gate.begin(secondScope)!;
  resolve("stale report");
  await completion;
  assert.equal(generated, null);
  assert.equal(trace, null);
  assert.equal(gate.isCurrent(first), false);
  assert.equal(gate.isCurrent(second), true);
  gate.invalidate();
  assert.equal(gate.isCurrent(second), false);
  assert.equal(second.controller.signal.aborted, true);
});

test("double confirmation does not create two requests; retry after finishing is allowed", () => {
  const gate = new ReportGenerationGate();
  const scope = {};
  const first = gate.begin(scope)!;
  assert.equal(gate.begin(scope), null);
  gate.finish(first);
  assert.equal(gate.isCurrent(first), false);
  const retry = gate.begin(scope)!;
  assert.equal(gate.isCurrent(retry), true);
});

test("late failure cannot set an error or clear a newer request's loading state", async () => {
  const gate = new ReportGenerationGate();
  const first = gate.begin({})!;
  let reject!: (error: Error) => void;
  const delayed = new Promise<void>((_resolve, fail) => { reject = fail; });
  let error: string | null = null;
  let loading = true;
  const completion = delayed.catch((failure: Error) => {
    if (gate.isCurrent(first)) error = failure.message;
  }).finally(() => {
    if (gate.isCurrent(first)) loading = false;
    gate.finish(first);
  });
  const latest = gate.begin({})!;
  reject(new Error("Stale server error"));
  await completion;
  assert.equal(error, null);
  assert.equal(loading, true);
  assert.equal(gate.isCurrent(latest), true);
});