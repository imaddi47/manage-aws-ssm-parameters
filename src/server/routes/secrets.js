import { Router } from "express";
import { listSecrets, getSecret, saveSecret, deleteSecret } from "../../aws/ssm.js";
import { logAudit } from "../../memory.js";
import { requirePassphrase } from "../middleware/passphrase.js";
import { asyncHandler, HttpError } from "../middleware/errors.js";

const ALLOWED_TYPES = ["SecureString", "String", "StringList"];

/**
 * Build the `/api/secrets` router (list, reveal, create/update, delete).
 * Mutations are gated by {@link requirePassphrase}; every action is audited and
 * decrypted values are never written to the audit log.
 * @param {{ client: import("@aws-sdk/client-ssm").SSMClient, db: import("better-sqlite3").Database, passphrase: string|undefined }} deps
 * @returns {import("express").Router}
 */
export function createSecretsRouter({ client, db, passphrase }) {
  const router = Router();

  router.get(
    "/",
    asyncHandler(async (req, res) => {
      const path = req.query.path || "/";
      const recursive = req.query.recursive !== "false";
      const items = await listSecrets(client, { path, recursive });
      logAudit(db, "list", path, { count: items.length });
      res.json({ ok: true, data: items });
    })
  );

  router.get(
    "/value",
    asyncHandler(async (req, res) => {
      const name = req.query.name;
      if (!name) throw new HttpError(400, "Missing 'name' query parameter");
      const secret = await getSecret(client, name);
      logAudit(db, "reveal", name);
      res.json({ ok: true, data: secret });
    })
  );

  router.post(
    "/",
    requirePassphrase(passphrase),
    asyncHandler(async (req, res) => {
      const { name, value, type } = req.body ?? {};
      if (!name || typeof value !== "string" || value.length === 0) {
        throw new HttpError(400, "Body must include 'name' and a non-empty 'value'");
      }
      if (type && !ALLOWED_TYPES.includes(type)) {
        throw new HttpError(400, "Invalid 'type'");
      }
      const result = await saveSecret(client, { name, value, type });
      logAudit(db, "set", name, { version: result.version });
      res.json({ ok: true, data: result });
    })
  );

  router.delete(
    "/",
    requirePassphrase(passphrase),
    asyncHandler(async (req, res) => {
      const name = req.query.name;
      if (!name) throw new HttpError(400, "Missing 'name' query parameter");
      await deleteSecret(client, name);
      logAudit(db, "delete", name);
      res.json({ ok: true, data: { name } });
    })
  );

  return router;
}
