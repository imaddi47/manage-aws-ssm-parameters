import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { makeClient } from "../aws/ssm.js";
import { makeEc2Client, listEnabledRegions } from "../aws/regions.js";
import { AWS_REGIONS, DEFAULT_REGION } from "./regions.js";
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

/**
 * Resolve the selectable regions: the set enabled for the account (via EC2
 * DescribeRegions), cached for the process lifetime. Falls back to the curated
 * static list if discovery fails (e.g. missing ec2:DescribeRegions). The
 * resolved set is also the per-request validation allowlist.
 * @returns {Promise<{ regions: string[], default: string }>}
 */
let regionCache = null;
async function getRegions() {
  if (!regionCache) {
    try {
      const enabled = await listEnabledRegions(makeEc2Client({ region: DEFAULT_REGION, profile }));
      regionCache = enabled.length ? enabled : AWS_REGIONS;
    } catch {
      return { regions: AWS_REGIONS, default: DEFAULT_REGION };
    }
  }
  return { regions: regionCache, default: DEFAULT_REGION };
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const staticDir =
  process.env.NODE_ENV === "production" ? join(__dirname, "../../web/dist") : undefined;

const app = createApp({ getClient, getRegions, db, passphrase, staticDir });

// Warm the region cache (non-blocking) so the validation allowlist is ready.
getRegions().catch(() => {});

app.listen(PORT, HOST, () => {
  console.log(`SSM admin UI listening on http://${HOST}:${PORT}`);
  if (!passphrase) {
    console.warn("WARNING: SSM_UI_PASSPHRASE not set — create/update/delete are disabled (503).");
  }
});
