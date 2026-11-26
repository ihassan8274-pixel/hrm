import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const read = (relative: string) => fs.readFileSync(path.join(ROOT, relative), "utf8");

describe("mobile PWA shell", () => {
  it("is mounted on /m without changing the desktop entry", () => {
    const main = read("src/main.tsx");
    expect(main).toContain('import MobilePwa from \'./components/MobilePwa\'');
    expect(main).toContain('/^\\/m\\/?$/');
    expect(main).toContain('<MobilePwa />');
  });

  it("has its own installable manifest with both required icon sizes", () => {
    const manifest = JSON.parse(read("public/m-manifest.json"));
    expect(manifest.start_url).toBe("/m");
    expect(manifest.scope).toBe("/m/");
    expect(manifest.display).toBe("standalone");
    const sizes = manifest.icons.map((i: any) => i.sizes);
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");
    // أيقونة قابلة للقصّ لأندرويد — بنفس شعار تمكين ثلاثي الأبعاد.
    expect(manifest.icons.some((i: any) => i.purpose === "maskable" && i.sizes === "512x512")).toBe(true);
    const html = read("index.html");
    expect(html).toContain("/m-manifest.json");
  });

  it("never caches API responses or kiosk tokens in the service worker", () => {
    const sw = read("public/sw.js");
    expect(sw).toContain("url.pathname.startsWith('/api/')");
    expect(sw).toContain("url.pathname.includes('/kiosk/')");
    expect(sw).not.toContain("caches.match(request) });\n    return;");
  });

  it("calls only existing API routes and keeps the ESS self-service boundary", () => {
    const component = read("src/components/MobilePwa.tsx");
    for (const route of [
      "/api/auth/login",
      "/api/auth/me",
      "/api/employees",
      "/api/notifications",
      "/api/ess/requests",
      "/api/payroll",
      "/api/annual/me",
      "/api/workflow-requests",
      "/api/presence/me",
      "/api/presence/gate",
      "/api/presence/recheck",
      "/api/presence/checkout",
      "/api/presence/exit-request",
    ]) {
      expect(component).toContain(route);
    }
    expect(component).not.toContain("/api/mobile/");
    expect(component).not.toContain("employee_id: sessionEmployeeId");
    // Permit renewal is one sample at expiry, never continuous tracking.
    expect(component).not.toContain("geolocation.watchPosition");
    expect(component).toContain("presenceRecheckDelay(");
    expect(component).toContain("samplePresenceOnce()");
  });

  it("wraps the native build in a biometric lock instead of duplicating auth logic", () => {
    const component = read("src/components/MobilePwa.tsx");
    expect(component).toContain("import NativeLock, { useBiometric } from './NativeLock'");
    expect(component).toContain("<NativeLock><MobilePwaInner /></NativeLock>");
    expect(component).toContain("useBiometric()");
    // The lock is a device gate only; it never writes a session or role.
    const lock = read("src/components/NativeLock.tsx");
    expect(lock).toContain("BiometricAuth.authenticate(authOptions)");
    expect(lock).toContain("App.addListener('appStateChange'");
    expect(lock).not.toContain("auth_token");
  });

  it("keeps offline data as encrypted, read-only and clearly labelled", () => {
    const component = read("src/components/MobilePwa.tsx");
    expect(component).toContain("loadOfflineSnapshot()");
    expect(component).toContain("saveOfflineSnapshot(payload)");
    expect(component).toContain("للقراءة فقط");
    expect(component).toContain("لا يمكن الاعتماد دون اتصال");
    const session = read("src/lib/nativeSession.ts");
    expect(session).toContain("SecureStorage.set(SNAPSHOT_KEY");
    expect(session).toContain("SNAPSHOT_MAX_AGE_MS");
    expect(session).toContain("await clearOfflineSnapshot();");
  });

  it("registers push tokens only inside the native wrapper", () => {
    const component = read("src/components/MobilePwa.tsx");
    expect(component).toContain("startNativePush(");
    const push = read("src/lib/nativePush.ts");
    expect(push).toContain("PushNotifications.register()");
    expect(push).toContain("fetch('/api/push-tokens'");
    expect(push).not.toContain("localStorage");
  });
});
