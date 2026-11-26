import { describe, expect, it } from "vitest";
import { notificationScope, notificationViewerFromRequest } from "../notificationScope";

describe("notification scope", () => {
  it("fails closed without an authenticated user", () => {
    expect(notificationScope({})).toEqual({ sql: "1 = 0", params: [] });
    expect(notificationScope({ id: 0, role: "employee_ess" })).toEqual({ sql: "1 = 0", params: [] });
    expect(notificationScope({ id: "abc", role: "admin" })).toEqual({ sql: "1 = 0", params: [] });
  });

  it("lets only administrators read the unaddressed feed", () => {
    for (const role of ["admin", "hr_manager"]) {
      expect(notificationScope({ id: 1, role })).toEqual({ sql: "1 = 1", params: [] });
    }
    const ess = notificationScope({ id: 7, role: "employee_ess", employeeId: 42 });
    expect(ess.sql).not.toContain("1 = 1");
    expect(ess.sql).toContain("user_id = ?");
    expect(ess.sql).toContain("employee_id = ?");
    expect(ess.params).toEqual([7, 42]);
  });

  it("gives branch and entity roles only their own scope", () => {
    const manager = notificationScope({ id: 3, role: "branch_manager", branchId: 5 });
    expect(manager.sql).toContain("branch_id = ?");
    expect(manager.sql).not.toContain("entity_id = ?");
    expect(manager.params).toEqual([3, -1, 5]);

    const finance = notificationScope({ id: 4, role: "finance", entityId: 9 });
    expect(finance.sql).toContain("entity_id = ?");
    expect(finance.sql).not.toContain("branch_id = ?");
    expect(finance.params).toEqual([4, -1, 9]);
  });

  it("does not widen the scope when a role has no matching branch or entity", () => {
    const manager = notificationScope({ id: 3, role: "branch_manager" });
    expect(manager.sql).not.toContain("branch_id = ?");
    expect(manager.params).toEqual([3, -1]);
  });

  it("maps the authenticated session onto the viewer", () => {
    expect(notificationViewerFromRequest({
      user: { id: 8, role: "employee_ess", employee_id: 21, entity_id: 2, branch_id: 3 },
    })).toEqual({ id: 8, role: "employee_ess", employeeId: 21, entityId: 2, branchId: 3 });
  });
});
