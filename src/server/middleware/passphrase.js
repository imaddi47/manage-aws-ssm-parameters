import { timingSafeEqual } from "node:crypto";
import { HttpError } from "./errors.js";

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
