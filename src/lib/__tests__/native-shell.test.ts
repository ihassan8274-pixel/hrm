import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const read = (relative: string) => fs.readFileSync(path.join(ROOT, relative), "utf8");

describe("Capacitor shell", () => {
  it("bundles the existing web build instead of serving it from a remote URL", () => {
    const config = read("capacitor.config.ts");
    expect(config).toContain("appId: 'com.empower.hr.tamkeen'");
    expect(config).toContain("webDir: 'dist'");
    expect(config).not.toContain("server:");
  });

  it("rewrites API paths only inside the WebView and keeps the web PWA unchanged", () => {
    const main = read("src/main.tsx");
    expect(main).toContain("Capacitor.isNativePlatform()");
    expect(main).toContain("const API_ORIGIN = 'https://hr.restocost.shop'");
    expect(main).toContain("function nativeUrl(");
    expect(main).toContain("const target = nativeUrl(input);");
    expect(main).toContain("if (!NATIVE_APP) return input;");
    expect(main).toContain("&& !NATIVE_APP"); // service worker stays on the web only
  });

  it("uses Keychain/KeyStore on devices and never the insecure web implementation of SecureStorage", () => {
    const session = read("src/lib/nativeSession.ts");
    expect(session).toContain("Capacitor.isNativePlatform()");
    expect(session).toContain("if (!NATIVE) return localStorage.getItem(key);");
    expect(session).toContain("if (!NATIVE) return;"); // offline snapshots are device-only
    expect(session).toContain("localStorage.removeItem(key);"); // migration away from the PWA token
  });

  it("disables device backup and declares only the permissions the wrapper needs", () => {
    const manifest = read("android/app/src/main/AndroidManifest.xml");
    expect(manifest).toContain('android:allowBackup="false"');
    expect(manifest).toContain('android.permission.INTERNET');
    expect(manifest).toContain('android.permission.POST_NOTIFICATIONS');
    expect(manifest).toContain('android.permission.USE_BIOMETRIC');
  });
});
