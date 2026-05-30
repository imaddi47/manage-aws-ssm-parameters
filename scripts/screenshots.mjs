/**
 * Capture README screenshots of the admin UI with sensitive info masked.
 *
 * Masks (black strips) the parameter PATHS (group headers + detail breadcrumb)
 * fully, and ~52% of every parameter NAME (leaf), so the images are safe to
 * publish. Type labels (SecureString / String) and region names stay visible.
 * It never reveals a parameter value.
 *
 * Usage:
 *   npm install --no-save playwright && npx playwright install chromium
 *   SSM_UI_PASSPHRASE=demo node scripts/screenshots.mjs
 *
 * Requires the built UI (run `npm run build` first) and AWS credentials in the
 * environment (same as `npm start`). The script boots the prod server itself.
 */
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const PORT = Number(process.env.SHOT_PORT) || 4123;
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = "docs/screenshots";

mkdirSync(OUT, { recursive: true });

const server = spawn("node", ["src/server/index.js"], {
  env: {
    ...process.env,
    NODE_ENV: "production",
    PORT: String(PORT),
    SSM_UI_PASSPHRASE: process.env.SSM_UI_PASSPHRASE || "demo",
  },
  stdio: "inherit",
});

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`${BASE}/api/regions`);
      if (r.ok) return;
    } catch {
      /* not up yet */
    }
    await sleep(500);
  }
  throw new Error("server did not start on " + BASE);
}

/**
 * Runs in the browser. Blacks out paths fully and the right ~52% of each leaf.
 * @param {boolean} maskDetail also mask the detail header (breadcrumb + title leaf)
 */
function maskInPage(maskDetail) {
  const blackFull = (el) => {
    el.dataset.masked = "1";
    el.style.background = "#000";
    el.style.color = "transparent";
    el.style.borderRadius = "2px";
  };
  const maskHalf = (el, width) => {
    el.dataset.masked = "1";
    const text = el.textContent;
    el.textContent = "";
    const inner = document.createElement("span");
    inner.textContent = text;
    inner.style.cssText = "position:relative;display:inline-block;max-width:100%;";
    const strip = document.createElement("span");
    strip.style.cssText = `position:absolute;top:0;right:0;height:100%;width:${width};background:#000;border-radius:2px;`;
    inner.appendChild(strip);
    el.appendChild(inner);
  };

  document.querySelectorAll(".grp:not([data-masked])").forEach(blackFull);
  document.querySelectorAll(".leaf:not([data-masked])").forEach((el) => maskHalf(el, "52%"));

  if (maskDetail) {
    document.querySelectorAll(".crumb:not([data-masked])").forEach(blackFull);
    document.querySelectorAll(".title:not([data-masked])").forEach((t) => {
      t.dataset.masked = "1";
      const tn = [...t.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim());
      if (!tn) return;
      const inner = document.createElement("span");
      inner.textContent = tn.textContent.trim();
      inner.style.cssText = "position:relative;display:inline-block;";
      const strip = document.createElement("span");
      strip.style.cssText =
        "position:absolute;top:0;right:0;height:100%;width:55%;background:#000;border-radius:3px;";
      inner.appendChild(strip);
      tn.replaceWith(inner);
    });
  }
}

async function run() {
  await waitForServer();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForSelector(".item", { timeout: 15000 });

  // 1) Hero: select a parameter, mask list + detail header, capture.
  await page.click(".item");
  await page.waitForSelector(".crumb");
  await page.evaluate(maskInPage, true);
  await page.screenshot({ path: `${OUT}/admin-ui.png` });
  console.log("wrote admin-ui.png");

  // 2) Region picker open (regions are not secret; list behind stays masked).
  await page.click(".region-trigger");
  await page.waitForSelector(".region-pop");
  await page.evaluate(maskInPage, true);
  await page.screenshot({ path: `${OUT}/region-filter.png` });
  console.log("wrote region-filter.png");
  await page.keyboard.press("Escape");

  // 3) Create view with a throwaway name + fake value (no real data to mask
  //    in the detail; still mask the sidebar list). Reload first so the
  //    earlier mask mutations (rewritten text nodes) don't leave React unable
  //    to process the click that opens the create view.
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForSelector(".item", { timeout: 15000 });
  await page.click(".toolbar button.primary");
  await page.waitForSelector('input[aria-label="New name"]', { timeout: 15000 });
  await page.fill('input[aria-label="New name"]', "/demo/example.json");
  await page.click(".cm-content");
  await page.keyboard.type('{\n  "example": true,\n  "count": 3\n}');
  await page.evaluate(maskInPage, false);
  await page.screenshot({ path: `${OUT}/create-type.png` });
  console.log("wrote create-type.png");

  await browser.close();
}

run()
  .then(() => {
    server.kill();
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    server.kill();
    process.exit(1);
  });
