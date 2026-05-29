import { timingSafeEqual } from "node:crypto";
import { HttpError } from "./errors.js";

/**
 * Build middleware that gates a route behind the `X-SSM-Passphrase` header,
 * compared to `expected` in constant time. Responds 503 if `expected` is unset,
 * 401 if the header is missing or wrong.
 * @param {string|undefined} expected - The configured passphrase.
 * @returns {import("express").RequestHandler}
 */
export function requirePassphrase(expected) {
  return function passphraseGate(req, _res, next) {
    if (!expected) {
      return next(new HttpError(503, "Passphrase not configured (set SSM_UI_PASSPHRASE)"));
    }
    const provided = req.get("x-ssm-passphrase") || "";
    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return next(new HttpError(401, "Invalid passphrase"));
    }
    next();
  };
}
