import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export function openMemory(file = ".memory/app.db") {
  mkdirSync(dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS kv (
      key        TEXT PRIMARY KEY,
      value      TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS audit (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      action     TEXT NOT NULL,
      target     TEXT,
      meta       TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  return db;
}

export function setKV(db, key, value) {
  db.prepare(
    `INSERT INTO kv(key, value, updated_at) VALUES(?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
  ).run(key, JSON.stringify(value));
}

export function getKV(db, key) {
  const row = db.prepare(`SELECT value FROM kv WHERE key = ?`).get(key);
  return row ? JSON.parse(row.value) : null;
}

export function logAudit(db, action, target = null, meta = {}) {
  db.prepare(`INSERT INTO audit(action, target, meta) VALUES(?, ?, ?)`).run(
    action,
    target,
    JSON.stringify(meta)
  );
}
