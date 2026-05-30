import express from "express";
import { join } from "node:path";
import { createSecretsRouter } from "./routes/secrets.js";
import { asyncHandler, errorHandler } from "./middleware/errors.js";
import { AWS_REGIONS, DEFAULT_REGION } from "./regions.js";

const staticRegions = async () => ({ regions: AWS_REGIONS, default: DEFAULT_REGION });

/**
 * Build the Express app: JSON parsing, `/api/regions`, the `/api/secrets`
 * router, optional static UI serving (prod), and the error handler.
 * @param {{ getClient: (region: string) => import("@aws-sdk/client-ssm").SSMClient, getRegions?: () => Promise<{ regions: string[], default: string }>, db: import("better-sqlite3").Database, passphrase: string|undefined, staticDir?: string }} [deps]
 * @returns {import("express").Express}
 */
export function createApp({ getClient, getRegions = staticRegions, db, passphrase, staticDir } = {}) {
  const app = express();
  app.use(express.json());

  app.get(
    "/api/regions",
    asyncHandler(async (_req, res) => {
      res.json({ ok: true, data: await getRegions() });
    })
  );

  app.use("/api/secrets", createSecretsRouter({ getClient, getRegions, db, passphrase }));

  if (staticDir) {
    app.use(express.static(staticDir));
    app.use((req, res, next) => {
      if (req.method === "GET" && !req.path.startsWith("/api")) {
        return res.sendFile(join(staticDir, "index.html"));
      }
      next();
    });
  }

  app.use(errorHandler);
  return app;
}
