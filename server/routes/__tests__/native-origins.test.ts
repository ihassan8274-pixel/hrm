import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(path.join(process.cwd(), "server/index.ts"), "utf8");

describe("native WebView CORS", () => {
  it("allows only the platform-local WebView origins", () => {
    expect(source).toContain("capacitor://localhost");
    expect(source).toContain("http://localhost");
    expect(source).toContain("https://localhost");
    expect(source).toContain("ionic://localhost");
    expect(source).toContain("if (nativeWebViewOrigins.has(origin)) return cors()(req, res, next);");
  });

  it("does not weaken the production guard for ordinary origins", () => {
    expect(source).toContain('process.env.NODE_ENV === "production" && corsOrigins.length === 0');
    expect(source).toContain('res.status(403).json({ error: "Origin not allowed" })');
  });

  it("registers the device token route with the rest of the API", () => {
    expect(source).toContain('import { registerPushTokens } from "./routes/pushTokens"');
    expect(source).toContain("registerPushTokens(app)");
  });
});
