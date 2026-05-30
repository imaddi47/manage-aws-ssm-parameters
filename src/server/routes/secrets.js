import { Router } from "express";
import { listSecrets, getSecret, saveSecret, deleteSecret } from "../../aws/ssm.js";
import { logAudit } from "../../memory.js";
import { requirePassphrase } from "../middleware/passphrase.js";
import { asyncHandler, HttpError } from "../middleware/errors.js";
import { isAllowedRegion, DEFAULT_REGION } from "../regions.js";

const ALLOWED_TYPES = ["SecureString", "String", "StringList"];

/**
 * Resolve and validate a region against the currently-allowed set, falling back
 * to the default.
 * @param {unknown} value
 * @param {string[]} allowed - regions permitted for this request (the resolved set).
 * @returns {string}
 */
function resolveRegion(value, allowed) {
  const region = value ?? DEFAULT_REGION;
  if (!isAllowedRegion(region, allowed)) throw new HttpError(400, `Unsupported region: ${region}`);
  return region;
}

/**
 * Build the `/api/secrets` router. Region is taken per request (query for
 * GET/DELETE, body for POST), validated against the set from `getRegions()`,
 * and a client is obtained via `getClient(region)`. Mutations are gated by
 * {@link requirePassphrase}; decrypted values are never audited.
 * @param {{ getClient: (region: string) => import("@aws-sdk/client-ssm").SSMClient, getRegions: () => Promise<{ regions: string[], default: string }>, db: import("better-sqlite3").Database, passphrase: string|undefined }} deps
 * @returns {import("express").Router}
 */
export function createSecretsRouter({ getClient, getRegions, db, passphrase }) {
  const router = Router();

  router.get(
    "/",
    asyncHandler(async (req, res) => {
      const { regions: allowed } = await getRegions();
      const region = resolveRegion(req.query.region, allowed);
      const path = req.query.path || "/";
      const recursive = req.query.recursive !== "false";
      const items = await listSecrets(getClient(region), { path, recursive });
      logAudit(db, "list", path, { count: items.length, region });
      res.json({ ok: true, data: items });
    })
  );

  router.get(
    "/value",
    asyncHandler(async (req, res) => {
      const { regions: allowed } = await getRegions();
      const region = resolveRegion(req.query.region, allowed);
      const name = req.query.name;
      if (!name) throw new HttpError(400, "Missing 'name' query parameter");
      const secret = await getSecret(getClient(region), name);
      logAudit(db, "reveal", name, { region });
      res.json({ ok: true, data: secret });
    })
  );

  router.post(
    "/",
    requirePassphrase(passphrase),
    asyncHandler(async (req, res) => {
      const { name, value, type, region: regionInput } = req.body ?? {};
      const { regions: allowed } = await getRegions();
      const region = resolveRegion(regionInput, allowed);
      if (!name || typeof value !== "string" || value.length === 0) {
        throw new HttpError(400, "Body must include 'name' and a non-empty 'value'");
      }
      if (type && !ALLOWED_TYPES.includes(type)) {
        throw new HttpError(400, "Invalid 'type'");
      }
      const result = await saveSecret(getClient(region), { name, value, type });
      logAudit(db, "set", name, { version: result.version, region });
      res.json({ ok: true, data: result });
    })
  );

  router.delete(
    "/",
    requirePassphrase(passphrase),
    asyncHandler(async (req, res) => {
      const { regions: allowed } = await getRegions();
      const region = resolveRegion(req.query.region, allowed);
      const name = req.query.name;
      if (!name) throw new HttpError(400, "Missing 'name' query parameter");
      await deleteSecret(getClient(region), name);
      logAudit(db, "delete", name, { region });
      res.json({ ok: true, data: { name } });
    })
  );

  return router;
}
