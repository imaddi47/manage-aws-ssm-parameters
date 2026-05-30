import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../../src/server/app.js";
import { openMemory } from "../../src/memory.js";

function makeFake(overrides = {}) {
  return {
    send: async (cmd) => {
      const name = cmd.constructor.name;
      if (overrides[name]) return overrides[name](cmd);
      switch (name) {
        case "GetParametersByPathCommand":
          return { Parameters: [{ Name: "/a/b", Type: "SecureString" }], NextToken: undefined };
        case "GetParameterCommand":
          return { Parameter: { Name: cmd.input.Name, Value: "plain-value", Type: "SecureString", Version: 3 } };
        case "PutParameterCommand":
          return { Version: 5 };
        case "DeleteParameterCommand":
          return {};
        default:
          throw new Error("unexpected command " + name);
      }
    },
  };
}

function build(opts = {}) {
  const db = openMemory(":memory:");
  const fake = makeFake(opts.overrides);
  const calls = [];
  const getClient = (region) => {
    calls.push(region);
    return fake;
  };
  const app = createApp({ getClient, db, passphrase: opts.passphrase ?? "pw" });
  return { app, db, calls };
}

const enc = encodeURIComponent;

test("GET /api/regions returns the list and default", async () => {
  const { app } = build();
  const res = await request(app).get("/api/regions");
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.data.regions));
  assert.equal(res.body.data.default, "us-east-1");
});

test("list defaults to us-east-1 when region omitted", async () => {
  const { app, calls } = build();
  const res = await request(app).get("/api/secrets?path=/");
  assert.equal(res.status, 200);
  assert.equal(calls.at(-1), "us-east-1");
});

test("list uses the requested region", async () => {
  const { app, calls } = build();
  const res = await request(app).get("/api/secrets?path=/&region=eu-west-1");
  assert.equal(res.status, 200);
  assert.equal(calls.at(-1), "eu-west-1");
});

test("invalid region is rejected with 400", async () => {
  const { app } = build();
  const res = await request(app).get("/api/secrets?path=/&region=moon-1");
  assert.equal(res.status, 400);
});

test("POST with an invalid region is rejected with 400", async () => {
  const { app } = build();
  const res = await request(app)
    .post("/api/secrets")
    .set("X-SSM-Passphrase", "pw")
    .send({ name: "/a/b", value: "x", region: "moon-1" });
  assert.equal(res.status, 400);
});

test("reveal returns value and never stores it in audit", async () => {
  const { app, db } = build();
  const res = await request(app).get("/api/secrets/value?region=us-east-1&name=" + enc("/a/b"));
  assert.equal(res.status, 200);
  assert.equal(res.body.data.value, "plain-value");
  const row = db.prepare("SELECT action, meta FROM audit ORDER BY id DESC LIMIT 1").get();
  assert.equal(row.action, "reveal");
  assert.ok(!String(row.meta).includes("plain-value"));
});

test("POST is gated by passphrase and takes region in the body", async () => {
  const { app, calls } = build();
  const noPass = await request(app).post("/api/secrets").send({ name: "/a/b", value: "x", region: "us-west-2" });
  assert.equal(noPass.status, 401);
  const ok = await request(app)
    .post("/api/secrets")
    .set("X-SSM-Passphrase", "pw")
    .send({ name: "/a/b", value: "x", region: "us-west-2" });
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.body.data, { name: "/a/b", version: 5 });
  assert.equal(calls.at(-1), "us-west-2");
});

test("DELETE is gated and audits 'delete'", async () => {
  const { app, db } = build();
  const noPass = await request(app).delete("/api/secrets?region=us-east-1&name=" + enc("/a/b"));
  assert.equal(noPass.status, 401);
  const ok = await request(app)
    .delete("/api/secrets?region=us-east-1&name=" + enc("/a/b"))
    .set("X-SSM-Passphrase", "pw");
  assert.equal(ok.status, 200);
  const row = db.prepare("SELECT action FROM audit ORDER BY id DESC LIMIT 1").get();
  assert.equal(row.action, "delete");
});

test("maps AWS ParameterNotFound to 404", async () => {
  const overrides = {
    GetParameterCommand: () => {
      const e = new Error("nope");
      e.name = "ParameterNotFound";
      throw e;
    },
  };
  const { app } = build({ overrides });
  const res = await request(app).get("/api/secrets/value?region=us-east-1&name=" + enc("/x"));
  assert.equal(res.status, 404);
});

test("region validation uses the dynamically-resolved set (getRegions)", async () => {
  const db = openMemory(":memory:");
  const fake = makeFake();
  const calls = [];
  const getClient = (region) => {
    calls.push(region);
    return fake;
  };
  // Account-enabled set includes an opt-in region absent from the static list,
  // and omits a region (eu-west-1) that IS in the static list.
  const getRegions = async () => ({ regions: ["us-east-1", "ap-east-1"], default: "us-east-1" });
  const app = createApp({ getClient, getRegions, db, passphrase: "pw" });

  const accepted = await request(app).get("/api/secrets?path=/&region=ap-east-1");
  assert.equal(accepted.status, 200);
  assert.equal(calls.at(-1), "ap-east-1");

  const rejected = await request(app).get("/api/secrets?path=/&region=eu-west-1");
  assert.equal(rejected.status, 400);

  const regions = await request(app).get("/api/regions");
  assert.deepEqual(regions.body.data.regions, ["us-east-1", "ap-east-1"]);
});
