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
  const app = createApp({ client: makeFake(opts.overrides), db, passphrase: opts.passphrase ?? "pw" });
  return { app, db };
}

const enc = encodeURIComponent;

test("GET /api/secrets lists name+type and audits 'list'", async () => {
  const { app, db } = build();
  const res = await request(app).get("/api/secrets?path=/");
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.data, [{ name: "/a/b", type: "SecureString" }]);
  const row = db.prepare("SELECT action FROM audit ORDER BY id DESC LIMIT 1").get();
  assert.equal(row.action, "list");
});

test("GET /value reveals and never stores the value in audit", async () => {
  const { app, db } = build();
  const res = await request(app).get("/api/secrets/value?name=" + enc("/a/b"));
  assert.equal(res.status, 200);
  assert.equal(res.body.data.value, "plain-value");
  const row = db.prepare("SELECT action, meta FROM audit ORDER BY id DESC LIMIT 1").get();
  assert.equal(row.action, "reveal");
  assert.ok(!String(row.meta).includes("plain-value"));
});

test("POST /api/secrets is gated by passphrase", async () => {
  const { app } = build();
  const noPass = await request(app).post("/api/secrets").send({ name: "/a/b", value: "x" });
  assert.equal(noPass.status, 401);
  const ok = await request(app)
    .post("/api/secrets")
    .set("X-SSM-Passphrase", "pw")
    .send({ name: "/a/b", value: "x" });
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.body.data, { name: "/a/b", version: 5 });
});

test("DELETE is gated by passphrase and audits 'delete'", async () => {
  const { app, db } = build();
  const noPass = await request(app).delete("/api/secrets?name=" + enc("/a/b"));
  assert.equal(noPass.status, 401);
  const ok = await request(app)
    .delete("/api/secrets?name=" + enc("/a/b"))
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
  const res = await request(app).get("/api/secrets/value?name=" + enc("/x"));
  assert.equal(res.status, 404);
});
