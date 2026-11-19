# TestSprite AI Testing Report (MCP)

## 1. Document Metadata

| Field | Value |
|---|---|
| Project Name | massobi-hr-payroll (Massobi HR & Payroll) |
| Project Path | E:\MASSOBI APP\payroll |
| Date | 2026-09-16 |
| Prepared by | TestSprite AI + AutoCoder (report completion) |
| Test Type | Frontend end-to-end (browser, cloud execution via TLS tunnel) |
| Test Scope | codebase |
| Server Mode | production (`npm run build` then `node dist/server.cjs`) |
| App Under Test | http://localhost:8090 (Express + SQLite/WAL, SPA served from same origin) |
| Runtime | Windows, Node v22.22.0, better-sqlite3, DB `payroll.db` with 0 employees at run start |
| TestSprite Project ID | a60ce5c4-0193-5b1f-bccd-ba2d4fe26669 |
| Inputs | standard_prd.json, code_summary.yaml, testsprite_frontend_test_plan.json |
| Plan size | 50 test cases (32 High, 18 Medium) |
| Executed | 30 (the high-priority set) |
| Result | 8 Passed, 1 Failed, 21 Blocked |
| Credits | 144.5 before, 138.5 after |

---

## 2. Requirement Validation Summary

### 2.1 Login and session — 3/3 passed

#### Test TC001 Log in and reach the dashboard
- **Test Code:** [TC001_Log_in_and_reach_the_dashboard.py](./TC001_Log_in_and_reach_the_dashboard.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/a60ce5c4-0193-5b1f-bccd-ba2d4fe26669/test/e0043f32-2a2e-4a4f-81c3-f8990887b8ec
- **Status:** Passed
- **Analysis / Findings:** Signing in with the demo admin account issues a JWT and renders the sidebar shell with the dashboard. Confirms `POST /api/auth/login` and the client auth context work end to end.

#### Test TC007 Stay signed in after a page reload
- **Test Code:** [TC007_Stay_signed_in_after_a_page_reload.py](./TC007_Stay_signed_in_after_a_page_reload.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/a60ce5c4-0193-5b1f-bccd-ba2d4fe26669/test/9e395fe1-d652-4d94-80f5-03d23d970bc9
- **Status:** Passed
- **Analysis / Findings:** The session is restored from localStorage after a reload, as designed. Note the same mechanism is the most likely cause of the TC006 failure below.

#### Test TC015 Reject invalid credentials
- **Test Code:** [TC015_Reject_invalid_credentials.py](./TC015_Reject_invalid_credentials.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/a60ce5c4-0193-5b1f-bccd-ba2d4fe26669/test/7564e2fb-96f4-459c-878c-8d16b8631791
- **Status:** Passed
- **Analysis / Findings:** Invalid credentials are rejected and an error is surfaced. Behaviour is correct.

### 2.2 Employee register — 3/3 passed

#### Test TC003 Create a new employee record
- **Test Code:** [TC003_Create_a_new_employee_record.py](./TC003_Create_a_new_employee_record.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/a60ce5c4-0193-5b1f-bccd-ba2d4fe26669/test/5d9b5c6f-ef15-45b1-9eaa-9cbd742be56e
- **Status:** Passed
- **Analysis / Findings:** The create-employee form submits and the row appears in the register.

#### Test TC009 Delete an employee record
- **Test Code:** [TC009_Delete_an_employee_record.py](./TC009_Delete_an_employee_record.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/a60ce5c4-0193-5b1f-bccd-ba2d4fe26669/test/65913de2-cb9d-4257-897f-c86d61369bb7
- **Status:** Passed
- **Analysis / Findings:** Delete works and the row disappears. Note the API has no confirmation-free guard beyond the UI dialog.

#### Test TC010 Update an existing employee record
- **Test Code:** [TC010_Update_an_existing_employee_record.py](./TC010_Update_an_existing_employee_record.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/a60ce5c4-0193-5b1f-bccd-ba2d4fe26669/test/f0618331-ff8d-45b9-bcdc-c662eadd5cd5
- **Status:** Passed
- **Analysis / Findings:** Editing and saving an employee persists the change.

### 2.3 Monthly payroll run — 2 passed, 3 blocked

#### Test TC002 Run payroll for a selected month
- **Test Code:** [TC002_Run_payroll_for_a_selected_month.py](./TC002_Run_payroll_for_a_selected_month.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/a60ce5c4-0193-5b1f-bccd-ba2d4fe26669/test/9a8a1606-f81d-4109-bc53-50b9dda18e6a
- **Status:** Passed
- **Analysis / Findings:** The payroll screen runs the generation flow without error. Caveat: the database had 0 employees, so this is a UI-level pass with no real payroll maths exercised.

#### Test TC004 Lock a completed payroll month
- **Test Code:** [TC004_Lock_a_completed_payroll_month.py](./TC004_Lock_a_completed_payroll_month.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/a60ce5c4-0193-5b1f-bccd-ba2d4fe26669/test/771b6acb-f6b2-47c6-9f6d-8f6dfb3f5dd1
- **Status:** Passed
- **Analysis / Findings:** The month lock is applied and reflected in the UI.

#### Test TC008 Sync attendance into payroll results
- **Test Code:** [TC008_Sync_attendance_into_payroll_results.py](./TC008_Sync_attendance_into_payroll_results.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/a60ce5c4-0193-5b1f-bccd-ba2d4fe26669/test/3a29fcfd-4f88-4891-b6c8-039db996a68e
- **Status:** Blocked
- **Analysis / Findings:** Could not authenticate — the login endpoint returned the rate-limit banner (see 4.1). No evidence either way about payroll sync.

#### Test TC021 Review payroll without generating new results
- **Test Code:** [TC021_Review_payroll_without_generating_new_results.py](./TC021_Review_payroll_without_generating_new_results.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/a60ce5c4-0193-5b1f-bccd-ba2d4fe26669/test/4f344bb6-d020-4ece-9934-28d50b808b68
- **Status:** Blocked
- **Analysis / Findings:** Finance sign-in blocked by the same rate limiter.

#### Test TC029 Keep payroll controls available for the selected period
- **Test Code:** [TC029_Keep_payroll_controls_available_for_the_selected_period.py](./TC029_Keep_payroll_controls_available_for_the_selected_period.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/a60ce5c4-0193-5b1f-bccd-ba2d4fe26669/test/15192a16-532c-410c-ba8d-d75ef621b0ac
- **Status:** Blocked
- **Analysis / Findings:** Admin sign-in blocked by the same rate limiter.

### 2.4 Role-based screen gating — 3 blocked

#### Test TC011 Show only allowed screens for a finance user
- **Test Code:** [TC011_Show_only_allowed_screens_for_a_finance_user.py](./TC011_Show_only_allowed_screens_for_a_finance_user.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/a60ce5c4-0193-5b1f-bccd-ba2d4fe26669/test/6c6c6e9d-5e59-48bb-8275-fbb7879cc577
- **Status:** Blocked
- **Analysis / Findings:** Finance login blocked by the rate limiter. Unverified.

#### Test TC012 Show only allowed screens for a branch manager
- **Test Code:** [TC012_Show_only_allowed_screens_for_a_branch_manager.py](./TC012_Show_only_allowed_screens_for_a_branch_manager.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/a60ce5c4-0193-5b1f-bccd-ba2d4fe26669/test/9ca12b5f-a660-47e5-85f4-dc28bbde57c3
- **Status:** Blocked
- **Analysis / Findings:** Branch-manager login blocked by the rate limiter. Unverified.

#### Test TC013 Show only the ESS screen for an employee
- **Test Code:** [TC013_Show_only_the_ESS_screen_for_an_employee.py](./TC013_Show_only_the_ESS_screen_for_an_employee.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/a60ce5c4-0193-5b1f-bccd-ba2d4fe26669/test/41833663-168f-4185-a024-38a6fd05da56
- **Status:** Blocked
- **Analysis / Findings:** Employee login blocked by the rate limiter. This is the case that should have cross-checked the TC006 failure, so the RBAC UI question remains open.

### 2.5 Employee self-service (ESS) — 1 failed, 2 blocked

#### Test TC006 Employee can access only the self-service area
- **Test Code:** [TC006_Employee_can_access_only_the_self_service_area.py](./TC006_Employee_can_access_only_the_self_service_area.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/a60ce5c4-0193-5b1f-bccd-ba2d4fe26669/test/3c658ffc-5225-46a1-87c6-48cb040ecdab
- **Status:** Failed
- **Analysis / Findings:** After signing in with the `employee` account the browser showed the general dashboard with admin/HR menu items rather than the ESS-only experience. The strongest candidate explanation is *stale client session*, not a server authorization hole: the SPA stores `auth_token` / `auth_user` in localStorage, and TestSprite reuses a single browser context across test cases, so a token left over from an earlier admin case can be restored instead of the employee session. Independent API probing (separate from this run) showed `employee_ess` correctly receives HTTP 403 on admin endpoints, and the sidebar allow-list restricts that role to `ess`. This failure therefore needs a deterministic re-test with a cleared browser context before it is treated as a product defect.

#### Test TC020 Employee can generate a salary certificate
- **Test Code:** [TC020_Employee_can_generate_a_salary_certificate.py](./TC020_Employee_can_generate_a_salary_certificate.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/a60ce5c4-0193-5b1f-bccd-ba2d4fe26669/test/579f330d-48f4-4487-80f1-3cdf8d196c5e
- **Status:** Blocked
- **Analysis / Findings:** Employee login blocked by the rate limiter. Unverified.

#### Test TC027 Employee can open the self-service area after login
- **Test Code:** [TC027_Employee_can_open_the_self_service_area_after_login.py](./TC027_Employee_can_open_the_self_service_area_after_login.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/a60ce5c4-0193-5b1f-bccd-ba2d4fe26669/test/18d3ea4f-32dc-4038-89d9-931f4c06b670
- **Status:** Blocked
- **Analysis / Findings:** Same rate-limit block. Unverified.

### 2.6 WPS SIF export — 1 blocked

#### Test TC005 Generate and download a WPS SIF export
- **Test Code:** [TC005_Generate_and_download_a_WPS_SIF_export.py](./TC005_Generate_and_download_a_WPS_SIF_export.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/a60ce5c4-0193-5b1f-bccd-ba2d4fe26669/test/71289923-be48-4897-b3df-58b397929e04
- **Status:** Blocked
- **Analysis / Findings:** This was the first case to hit the rate limiter. The report also mentions prior "Internal server error" responses; because authentication never completed, nothing can be concluded about the SIF export itself.

### 2.7 Leaves — 2 blocked

#### Test TC016 Submit a leave request
- **Test Code:** [TC016_Submit_a_leave_request.py](./TC016_Submit_a_leave_request.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/a60ce5c4-0193-5b1f-bccd-ba2d4fe26669/test/9edee2e6-d12b-4ad0-a563-025e04354e70
- **Status:** Blocked
- **Analysis / Findings:** Login rate-limited. Unverified.

#### Test TC022 Update a leave request status
- **Test Code:** [TC022_Update_a_leave_request_status.py](./TC022_Update_a_leave_request_status.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/a60ce5c4-0193-5b1f-bccd-ba2d4fe26669/test/8a3da7d0-d360-4f6b-be9b-1e98b1a627da
- **Status:** Blocked
- **Analysis / Findings:** Login rate-limited. Unverified.

### 2.8 Saudi compliance hub — 2 blocked

#### Test TC017 Review compliance summary data
- **Test Code:** [TC017_Review_compliance_summary_data.py](./TC017_Review_compliance_summary_data.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/a60ce5c4-0193-5b1f-bccd-ba2d4fe26669/test/c9d6dfd9-0d13-4c8e-8fe2-eeb5925ef156
- **Status:** Blocked
- **Analysis / Findings:** Login rate-limited. Unverified.

#### Test TC023 Calculate end-of-service amount
- **Test Code:** [TC023_Calculate_end_of_service_amount.py](./TC023_Calculate_end_of_service_amount.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/a60ce5c4-0193-5b1f-bccd-ba2d4fe26669/test/f849a7e1-b1ea-41b2-ac06-2024fabf660d
- **Status:** Blocked
- **Analysis / Findings:** Login rate-limited. Unverified.

### 2.9 Branches, departments and settings — 2 blocked

#### Test TC018 Add a branch with geofence coordinates
- **Test Code:** [TC018_Add_a_branch_with_geofence_coordinates.py](./TC018_Add_a_branch_with_geofence_coordinates.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/a60ce5c4-0193-5b1f-bccd-ba2d4fe26669/test/0b08d4f0-a57c-459d-bfe4-eef8eda9c738
- **Status:** Blocked
- **Analysis / Findings:** Login rate-limited. Unverified.

#### Test TC026 Add a department and keep it in the catalog
- **Test Code:** [TC026_Add_a_department_and_keep_it_in_the_catalog.py](./TC026_Add_a_department_and_keep_it_in_the_catalog.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/a60ce5c4-0193-5b1f-bccd-ba2d4fe26669/test/87daf9fa-f30e-4c1c-ac38-8fe49154c75f
- **Status:** Blocked
- **Analysis / Findings:** Login rate-limited. Unverified.

### 2.10 Approval workflows and manager inbox — 3 blocked

#### Test TC014 Approve a pending request from the manager inbox
- **Test Code:** [TC014_Approve_a_pending_request_from_the_manager_inbox.py](./TC014_Approve_a_pending_request_from_the_manager_inbox.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/a60ce5c4-0193-5b1f-bccd-ba2d4fe26669/test/d569c1ac-8391-428a-a442-52eb9521dbd2
- **Status:** Blocked
- **Analysis / Findings:** Login rate-limited. Unverified.

#### Test TC019 Reject a pending request from the manager inbox
- **Test Code:** [TC019_Reject_a_pending_request_from_the_manager_inbox.py](./TC019_Reject_a_pending_request_from_the_manager_inbox.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/a60ce5c4-0193-5b1f-bccd-ba2d4fe26669/test/5e4dafd5-911f-43f0-a967-7c2807c908dd
- **Status:** Blocked
- **Analysis / Findings:** Login rate-limited. Unverified.

#### Test TC030 Create an approval workflow definition
- **Test Code:** [TC030_Create_an_approval_workflow_definition.py](./TC030_Create_an_approval_workflow_definition.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/a60ce5c4-0193-5b1f-bccd-ba2d4fe26669/test/661aff09-17a5-4b54-ba8a-022bb83a8e5c
- **Status:** Blocked
- **Analysis / Findings:** Login rate-limited. Unverified.

### 2.11 Disciplinary matrix — 1 blocked

#### Test TC024 Apply a disciplinary penalty to payroll
- **Test Code:** [TC024_Apply_a_disciplinary_penalty_to_payroll.py](./TC024_Apply_a_disciplinary_penalty_to_payroll.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/a60ce5c4-0193-5b1f-bccd-ba2d4fe26669/test/3d85c079-2330-406d-b97e-c38c0e36ad83
- **Status:** Blocked
- **Analysis / Findings:** Login rate-limited. Unverified.

### 2.12 Assets, smart assets and fleet — 1 blocked

#### Test TC025 Record a traffic fine and deduct it from payroll
- **Test Code:** [TC025_Record_a_traffic_fine_and_deduct_it_from_payroll.py](./TC025_Record_a_traffic_fine_and_deduct_it_from_payroll.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/a60ce5c4-0193-5b1f-bccd-ba2d4fe26669/test/64e238fa-7e16-43d4-918a-c20f6942ca4a
- **Status:** Blocked
- **Analysis / Findings:** Login rate-limited. Unverified.

### 2.13 Loans — 1 blocked

#### Test TC028 Request an employee loan
- **Test Code:** [TC028_Request_an_employee_loan.py](./TC028_Request_an_employee_loan.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/a60ce5c4-0193-5b1f-bccd-ba2d4fe26669/test/b220d121-d14e-4042-9a86-d70170d11cdf
- **Status:** Blocked
- **Analysis / Findings:** Login rate-limited. Unverified.

### 2.14 Unclassified cases

All 30 executed cases mapped cleanly onto the requirements in `testsprite_frontend_test_plan.json`. No orphan cases.

---

## 3. Coverage & Matching Metrics

**Executed:** 30 of 50 planned cases (the 20 medium-priority cases were not selected).
**Of the executed set:** 8 Passed (26.67%), 1 Failed (3.33%), 21 Blocked (70.00%).

| Requirement | Total | Passed | Failed | Blocked |
|---|---|---|---|---|
| Login and session | 3 | 3 | 0 | 0 |
| Employee register | 3 | 3 | 0 | 0 |
| Monthly payroll run | 5 | 2 | 0 | 3 |
| Role-based screen gating | 3 | 0 | 0 | 3 |
| Employee self-service (ESS) | 3 | 0 | 1 | 2 |
| WPS SIF export | 1 | 0 | 0 | 1 |
| Leaves | 2 | 0 | 0 | 2 |
| Saudi compliance hub | 2 | 0 | 0 | 2 |
| Branches, departments and settings | 2 | 0 | 0 | 2 |
| Approval workflows and manager inbox | 3 | 0 | 0 | 3 |
| Disciplinary matrix | 1 | 0 | 0 | 1 |
| Assets, smart assets and fleet | 1 | 0 | 0 | 1 |
| Loans | 1 | 0 | 0 | 1 |
| **Total** | **30** | **8** | **1** | **21** |

**Reading of these numbers:** the pass rate is not a product quality signal. 70% of the run was blocked by a single environmental cause (the login rate limiter, section 4.1), so the effective coverage of the executed set is 9 cases, and of the 50-case plan it is 9/50 = 18%.

---

## 4. Key Gaps / Risks

### 4.1 The login rate limiter blocks sustained testing — and is a production risk
Highest-impact finding. `authLimiter` in `server/middleware/auth.ts` allows **10 requests per 15 minutes per IP**, applied to `POST /api/auth/login`. Because every test in a run shares one egress IP, the 11th login onwards returns "Too many attempts, please try again later" and 21 of 30 cases never got past the login screen.

This is not only a test issue. In production, an entire office or branch behind one NAT/public IP shares that bucket, so **10 failed sign-ins in 15 minutes lock out everyone at that site**. Recommended changes:
- add `skipSuccessfulRequests: true` so only failures count;
- key the limiter on `username + IP` (or username alone) instead of IP alone;
- raise the threshold for the login route, and consider an escalating back-off rather than a flat window.

Fixing this is a prerequisite for meaningful automated testing of this app.

### 4.2 ESS session isolation needs a deterministic re-test (TC006)
Reported as FAILED: the employee login showed admin navigation. Candidate cause is a stale `auth_token` in localStorage restored from an earlier test case (TestSprite reuses one browser context), not a server-side authorization bypass — server-side RBAC was separately verified to return 403 for `employee_ess` on admin endpoints, and the sidebar allow-list restricts that role to the ESS screen. Before treating this as a product bug, re-run with localStorage cleared per user. Regardless of the outcome, two client-side hardening items are worth doing: clear any stored session before applying a new login result, and hard-fail to the login screen when a login attempt does not succeed.

### 4.3 Large unverified surface
Zero real coverage was obtained for: payroll generation maths, payroll sync and locking, WPS SIF export, leaves, Saudi compliance and end-of-service, branches/departments/settings persistence, approval workflows, disciplinary penalties applied to payroll, fleet fines applied to payroll, loans, and the ESS salary certificate. The 20 unexecuted medium-priority cases extend this further.

### 4.4 No test data
The database held **0 employees** when the run started. Payroll and reporting cases that "passed" only proved the screens respond; no assertion covered a real calculation. Seeding a few employees, a branch, departments and allowance types before the next run is necessary for the results to mean anything.

### 4.5 Navigation model constrains test strategy
The app has no URL router: all screens live at `/` and are switched by React state, so deep-link-driven navigation is impossible and refresh always returns to the dashboard. Tests must navigate by clicking the sidebar. This is also a UX limitation in its own right.

### 4.6 Pre-existing defects carried in from the code review
- `GET`/`POST /api/documents` are registered twice in `server/routes/employees.ts`; the second pair (which targets `employee_documents`) is unreachable. `GET /api/notifications` and `PUT /api/notifications/read-all` are duplicated the same way in `server/routes/core.ts`.
- `testsprite` aside, `npm run lint` (`tsc --noEmit`) still fails with 20 errors, 19 of them in the unused `src/db/**` Drizzle layer.
- Demo accounts ship with documented passwords (`admin/admin123`, `hr/hr123`, `finance/finance123`, `branch_manager/branch123`, `employee/employee123`).
- `helmet` CSP is disabled, `cors()` is unrestricted, and the JWT is kept in localStorage.
- The Cairo web font `@import` sits after other CSS rules and is therefore ignored by browsers.

### 4.7 Cost note
TestSprite Free plan: credits went from 144.5 to 138.5 for this run (approximately 0.2 credits per executed case). Re-running before fixing 4.1 would spend credits to reproduce the same 21 blocks, so fix the limiter and seed data first.