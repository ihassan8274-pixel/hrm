/**
 * Fill the service-worker template with the actual hashed Vite assets.
 *
 * Runs after `vite build`: the public/ template has already been copied to
 * dist/sw.js with two placeholders. BUILD_ID is derived only from asset names,
 * so an unchanged bundle keeps its cache and a new bundle invalidates it.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const BUILD_ID_PLACEHOLDER = "__BUILD_ID__";
export const ASSETS_PLACEHOLDER = "__ASSET_URLS__";

export function collectAssets(distDir: string): string[] {
  const assetsDir = path.join(distDir, "assets");
  if (!fs.existsSync(assetsDir)) throw new Error(`Missing ${assetsDir}: run vite build first`);
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) found.push("/assets/" + path.relative(assetsDir, full).split(path.sep).join("/"));
    }
  };
  walk(assetsDir);
  const assets = found.sort();
  if (!assets.length) throw new Error(`No build assets found in ${assetsDir}`);
  return assets;
}

export function buildServiceWorker(template: string, assets: string[]) {
  if (!template.includes(BUILD_ID_PLACEHOLDER) || !template.includes(ASSETS_PLACEHOLDER)) {
    throw new Error("dist/sw.js is not the service worker template (placeholders missing)");
  }
  if (!assets.length) throw new Error("Refusing to build a service worker with an empty asset list");
  const buildId = crypto.createHash("sha256").update(assets.join("\n")).digest("hex").slice(0, 12);
  const output = template
    .replace(BUILD_ID_PLACEHOLDER, buildId)
    .replace(ASSETS_PLACEHOLDER, JSON.stringify(assets, null, 2));
  if (output.includes(BUILD_ID_PLACEHOLDER) || output.includes(ASSETS_PLACEHOLDER)) {
    throw new Error("Service worker placeholders were not fully replaced");
  }
  return { output, buildId, assets };
}

function main() {
  const distDir = path.resolve(process.cwd(), "dist");
  const swPath = path.join(distDir, "sw.js");
  if (!fs.existsSync(swPath)) throw new Error(`Missing ${swPath}: vite must copy public/ first`);
  const { output, buildId, assets } = buildServiceWorker(
    fs.readFileSync(swPath, "utf8"),
    collectAssets(distDir),
  );
  fs.writeFileSync(swPath, output);
  console.log(`[sw] build ${buildId} — ${assets.length} static assets, no API or kiosk URLs cached`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main();
}
