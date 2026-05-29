import express from "express";
import { join } from "node:path";
import { createSecretsRouter } from "./routes/secrets.js";
import { errorHandler } from "./middleware/errors.js";

/**
 * Build the Express app: JSON body parsing, the `/api/secrets` router, optional
 * static UI serving (when `staticDir` is set, for production), and the error handler.
 * @param {{ client: import("@aws-sdk/client-ssm").SSMClient, db: import("better-sqlite3").Database, passphrase: string|undefined, staticDir?: string }} [deps]
 * @returns {import("express").Express}
 */
export function createApp({ client, db, passphrase, staticDir } = {}) {
  const app = express();
  app.use(express.json());
  app.use("/api/secrets", createSecretsRouter({ client, db, passphrase }));

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
