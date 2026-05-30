import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { makeClient } from "../aws/ssm.js";
import { openMemory } from "../memory.js";
import { createApp } from "./app.js";

const PORT = Number(process.env.PORT) || 3000;
const HOST = "127.0.0.1";
const passphrase = process.env.SSM_UI_PASSPHRASE;
const profile = process.env.AWS_PROFILE;

const db = openMemory();

/** region -> SSMClient cache (clients are created lazily, once per region). */
const clients = new Map();
function getClient(region) {
  if (!clients.has(region)) {
    clients.set(region, makeClient({ region, profile }));
  }
  return clients.get(region);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const staticDir =
  process.env.NODE_ENV === "production" ? join(__dirname, "../../web/dist") : undefined;

const app = createApp({ getClient, db, passphrase, staticDir });

app.listen(PORT, HOST, () => {
  console.log(`SSM admin UI listening on http://${HOST}:${PORT}`);
  if (!passphrase) {
    console.warn("WARNING: SSM_UI_PASSPHRASE not set — create/update/delete are disabled (503).");
  }
});
