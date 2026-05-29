import { test } from "node:test";
import assert from "node:assert/strict";
import { errorHandler, HttpError } from "../../src/server/middleware/errors.js";

function fakeRes() {
  return {
    statusCode: 200,
    body: null,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
}

test("maps HttpError to its status and message", () => {
  const res = fakeRes();
  errorHandler(new HttpError(401, "Invalid passphrase"), {}, res, () => {});
  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, { ok: false, error: "Invalid passphrase" });
});

test("maps AWS ParameterNotFound to 404", () => {
  const res = fakeRes();
  const err = new Error("nope");
  err.name = "ParameterNotFound";
  errorHandler(err, {}, res, () => {});
  assert.equal(res.statusCode, 404);
});

test("hides the message for unexpected 500 errors", () => {
  const res = fakeRes();
  errorHandler(new Error("internal detail"), {}, res, () => {});
  assert.equal(res.statusCode, 500);
  assert.equal(res.body.error, "Internal server error");
});
