import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ESS_WRITE_ALLOWLIST, ROUTE_PERMISSIONS } from "../auth";

const ruleFor = (method: string, url: string) =>
  ROUTE_PERMISSIONS.find(rule =>
    (rule.method === "*" || rule.method === method) && rule.pattern.test(url)
  );

describe("push token route permissions", () => {
  it("lets an ESS user register their own device token", () => {
    const allowed = ESS_WRITE_ALLOWLIST.some(
      rule => rule.method === "POST" && rule.pattern.test("/api/push-tokens"),
    );
    expect(allowed).toBe(true);
    // A classified rule would be evaluated first and could silently revoke that access.
    expect(ruleFor("POST", "/api/push-tokens")).toBeUndefined();
  });

  it("takes the user id from the session, never from the request body", () => {
    const route = fs.readFileSync(
      path.join(process.cwd(), "server/routes/pushTokens.ts"), "utf8",
    );
    expect(route).toContain('const user = (req as any).user;');
    expect(route).toContain(".run(user.id, platform, token)");
    expect(route).not.toContain("user_id:");
    expect(route).not.toContain("req.body?.user");
  });
});
