import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";

/**
 * Characterization test for the HTTP surface of the server.
 *
 * The route table IS the public API of this application: the frontend calls
 * these paths, the RBAC table in server/middleware/auth.ts matches them by
 * regex, and the tenant guard in server/middleware/tenantScope.ts fires on
 * them. Splitting a route module, renaming a handler or dropping a middleware
 * from a route therefore changes behaviour even though no single line of
 * business logic moved.
 *
 * This test pins the table so that a structural refactor can prove it did not
 * move a single route:
 *
 *   - the method and path of every registered route
 *   - the number of handlers on it (auth gate, scope guard, validation, ...)
 *   - the order the routes are registered in (Express answers with the first
 *     match, so a reordered table is a behaviour change)
 *
 * Update the snapshot with:
 *   set UPDATE_ROUTE_TABLE=1 && npm run test:route-table     (cmd.exe)
 *   UPDATE_ROUTE_TABLE=1 npm run test:route-table            (bash)
 */
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SNAPSHOT = path.join(HERE, "route-table.snapshot.txt");

// The DB module refuses to load without a connection string. The pool is lazy,
// so no connection is opened here — the route table is pure registration.
process.env.DATABASE_URL ||= "postgres://payroll:payroll@localhost:5432/payroll";

/** Registration order mirrors server/index.ts — the order Express matches in. */
const REGISTRARS: Array<[string, string]> = [
  ["registerAuth", "../auth"],
  ["registerCore", "../core"],
  ["registerEmployees", "../employees"],
  ["registerPayroll", "../payroll"],
  ["registerAttendance", "../attendance"],
  ["registerSaudi", "../saudi"],
  ["registerReports", "../reports"],
  ["registerWorkflows", "../workflows"],
  ["registerCompliance", "../compliance"],
  ["registerAi", "../ai"],
  ["registerHrModules", "../hrModules"],
  ["registerHealthCertificates", "../healthCertificates"],
  ["registerImporter", "../importer"],
  ["registerForms", "../forms"],
  ["registerEssRequests", "../essRequests"],
];

interface RouteEntry {
  method: string;
  path: string;
  handlers: number;
}

function collectRoutes(app: express.Express): RouteEntry[] {
  const out: RouteEntry[] = [];
  const stack = (app as any)._router?.stack ?? (app as any).router?.stack ?? [];

  const walk = (layers: any[]) => {
    for (const layer of layers) {
      if (layer.route) {
        const methods = Object.keys(layer.route.methods ?? {}).filter((m) => layer.route.methods[m]);
        for (const method of methods) {
          out.push({ method: method.toUpperCase(), path: layer.route.path, handlers: layer.route.stack.length });
        }
        continue;
      }
      const handle = layer.handle;
      if (handle && Array.isArray(handle.stack)) walk(handle.stack);
    }
  };

  walk(stack);
  return out;
}

function renderTable(entries: RouteEntry[]): string {
  return entries.map((e) => `${e.method} ${e.path} [${e.handlers}]`).join("\n") + "\n";
}

describe("server route table", () => {
  it("registers every route module in the order server/index.ts does", async () => {
    const indexSource = fs.readFileSync(path.join(HERE, "..", "..", "index.ts"), "utf8");
    const called = [...indexSource.matchAll(/^\s*(register[A-Za-z]+)\(app\);/gm)].map((m) => m[1]);
    expect(called).toEqual(REGISTRARS.map(([name]) => name));
  });

  it("matches the pinned route table", async () => {
    const app = express();
    for (const [, modulePath] of REGISTRARS) {
      const mod = await import(modulePath);
      const register = Object.values(mod).find(
        (value) => typeof value === "function" && value.length === 1,
      ) as (app: express.Express) => void;
      expect(typeof register, `no registrar exported from ${modulePath}`).toBe("function");
      register(app);
    }

    const table = renderTable(collectRoutes(app));

    if (process.env.UPDATE_ROUTE_TABLE === "1") {
      fs.writeFileSync(SNAPSHOT, table, "utf8");
    }

    expect(fs.existsSync(SNAPSHOT), "route-table.snapshot.txt is missing — run with UPDATE_ROUTE_TABLE=1").toBe(true);
    expect(table).toBe(fs.readFileSync(SNAPSHOT, "utf8"));
  });
});
