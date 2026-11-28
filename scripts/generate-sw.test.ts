import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildServiceWorker, collectAssets } from "./generate-sw";

const template = fs.readFileSync(path.join(process.cwd(), "public/sw.js"), "utf8");

describe("mobile service worker build", () => {
  it("starts from a template with exactly two placeholders", () => {
    expect(template).toContain('const BUILD_ID = "__BUILD_ID__"');
    expect(template).toContain("const ASSET_URLS = __ASSET_URLS__");
    expect(template).toContain("const CACHEABLE = new Set([...SHELL, ...ASSET_URLS])");
    expect(template).toContain("const FORBIDDEN = /^\\/(api|kiosk|uploads)(\\/|$)/i");
    expect(template).toContain("if (!CACHEABLE.has(url.pathname)) return;");
    expect(template).toContain("if (url.search || url.hash) return;");
    // No dynamic response may be stored with the generic `request` key.
    expect(template).not.toContain("cache.put(request");
  });

  it("injects a stable hash-derived cache version and the full asset list", () => {
    const assets = ["/assets/index-Bg61g6ak.js", "/assets/index-Css-xyz.css"];
    const first = buildServiceWorker(template, assets);
    const second = buildServiceWorker(template, [...assets].reverse().sort());
    expect(first.buildId).toBe(second.buildId);
    expect(first.buildId).toMatch(/^[0-9a-f]{12}$/);
    expect(first.output).toContain(`const BUILD_ID = "${first.buildId}"`);
    expect(first.output).toContain("const SHELL_CACHE = `tamkeen-mobile-shell-${BUILD_ID}`");
    expect(first.output).toContain(JSON.stringify(assets, null, 2));
    expect(first.output).not.toContain("__BUILD_ID__");
    expect(first.output).not.toContain("__ASSET_URLS__");
    expect(buildServiceWorker(template, ["/assets/other.js"]).buildId).not.toBe(first.buildId);
  });

  it("refuses an empty build or a non-template file", () => {
    expect(() => buildServiceWorker(template, [])).toThrow(/empty asset list/);
    expect(() => buildServiceWorker("const BUILD_ID = 'x';", ["/assets/a.js"])).toThrow(/placeholders missing/);
    expect(() => collectAssets(path.join(process.cwd(), "definitely-not-a-build"))).toThrow(/Missing/);
  });
});
