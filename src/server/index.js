import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { makeClient } from "../aws/ssm.js";
import { openMemory } from "../memory.js";
import { createApp } from "./app.js";

const PORT = Number(process.env.PORT) || 3000;
const HOST = "127.0.0.1";
const passphrase = process.env.SSM_UI_PASSPHRASE;

const client = makeClient({ region: process.env.AWS_REGION, profile: process.env.AWS_PROFILE });
const db = openMemory();

const __dirname = dirname(fileURLToPath(import.meta.url));
const staticDir =
  process.env.NODE_ENV === "production" ? join(__dirname, "../../web/dist") : undefined;

const app = createApp({ client, db, passphrase, staticDir });

app.listen(PORT, HOST, () => {
  console.log(`SSM admin UI listening on http://${HOST}:${PORT}`);
  if (!passphrase) {
    console.warn("WARNING: SSM_UI_PASSPHRASE not set — create/update/delete are disabled (503).");
  }
});
