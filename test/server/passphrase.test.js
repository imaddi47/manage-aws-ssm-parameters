import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import request from "supertest";
import { requirePassphrase } from "../../src/server/middleware/passphrase.js";
import { errorHandler } from "../../src/server/middleware/errors.js";

function appWith(expected) {
  const app = express();
  app.post("/x", requirePassphrase(expected), (_req, res) =>
    res.json({ ok: true, data: "done" })
  );
  app.use(errorHandler);
  return app;
}

test("503 when passphrase is not configured", async () => {
  const res = await request(appWith(undefined)).post("/x");
  assert.equal(res.status, 503);
});

test("401 when the header is missing", async () => {
  const res = await request(appWith("secret")).post("/x");
  assert.equal(res.status, 401);
});

test("401 when the header is wrong", async () => {
  const res = await request(appWith("secret")).post("/x").set("X-SSM-Passphrase", "nope");
  assert.equal(res.status, 401);
});

test("passes through when the header is correct", async () => {
  const res = await request(appWith("secret")).post("/x").set("X-SSM-Passphrase", "secret");
  assert.equal(res.status, 200);
  assert.equal(res.body.data, "done");
});
