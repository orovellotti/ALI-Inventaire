import assert from "node:assert/strict";
import test from "node:test";
import type { NextFunction, Request, Response } from "express";
import { createRequireHarnessAdmin } from "./harnessAuth";

function responseRecorder() {
  const state = { status: 200, body: undefined as unknown };
  const response = {
    status(code: number) {
      state.status = code;
      return response;
    },
    json(body: unknown) {
      state.body = body;
      return response;
    },
  } as unknown as Response;
  return { response, state };
}

test("un visiteur anonyme reçoit 401", async () => {
  const { response, state } = responseRecorder();
  let nextCalled = false;
  const guard = createRequireHarnessAdmin(async () => ({}), () => null);
  await guard({} as Request, response, (() => { nextCalled = true; }) as NextFunction);
  assert.equal(state.status, 401);
  assert.equal(nextCalled, false);
});

test("un compte sans rôle administrateur reçoit 403", async () => {
  const { response, state } = responseRecorder();
  let nextCalled = false;
  const guard = createRequireHarnessAdmin(async () => ({ publicMetadata: { role: "ecologue" } }), () => "user-1");
  await guard({} as Request, response, (() => { nextCalled = true; }) as NextFunction);
  assert.equal(state.status, 403);
  assert.equal(nextCalled, false);
});

test("un administrateur authentifié atteint la route protégée", async () => {
  const { response, state } = responseRecorder();
  let nextCalled = false;
  const guard = createRequireHarnessAdmin(async () => ({ privateMetadata: { role: "admin" } }), () => "admin-1");
  await guard({} as Request, response, (() => { nextCalled = true; }) as NextFunction);
  assert.equal(state.status, 200);
  assert.equal(nextCalled, true);
});