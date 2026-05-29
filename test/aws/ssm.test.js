import { test } from "node:test";
import assert from "node:assert/strict";
import { deleteSecret } from "../../src/aws/ssm.js";

test("deleteSecret sends DeleteParameterCommand with the name", async () => {
  let sent;
  const client = { send: async (cmd) => { sent = cmd; return {}; } };
  const result = await deleteSecret(client, "/a/b");
  assert.equal(sent.constructor.name, "DeleteParameterCommand");
  assert.equal(sent.input.Name, "/a/b");
  assert.deepEqual(result, { name: "/a/b" });
});
