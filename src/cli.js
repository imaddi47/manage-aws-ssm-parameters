#!/usr/bin/env node
import { makeClient, listSecrets, getSecret, saveSecret } from "./aws/ssm.js";
import { openMemory, logAudit, setKV } from "./memory.js";

const [, , cmd, ...args] = process.argv;
const client = makeClient({
  region: process.env.AWS_REGION,
  profile: process.env.AWS_PROFILE,
});
const db = openMemory();

async function run() {
  switch (cmd) {
    case "list": {
      const path = args[0] || "/";
      const items = await listSecrets(client, { path });
      logAudit(db, "list", path, { count: items.length });
      console.table(items);
      break;
    }
    case "get": {
      if (!args[0]) throw new Error("usage: get <name>");
      const s = await getSecret(client, args[0]);
      logAudit(db, "get", args[0]);
      console.log(JSON.stringify(s, null, 2));
      break;
    }
    case "set": {
      const [name, ...rest] = args;
      if (!name || rest.length === 0) throw new Error("usage: set <name> <value>");
      const r = await saveSecret(client, { name, value: rest.join(" ") });
      setKV(db, `last:${name}`, { version: r.version, at: Date.now() });
      logAudit(db, "set", name, { version: r.version });
      console.log(`saved ${name} v${r.version}`);
      break;
    }
    default:
      console.log("usage: ssmctl <list [path] | get <name> | set <name> <value>>");
  }
}

run().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
