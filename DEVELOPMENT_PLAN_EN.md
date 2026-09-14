# Massobi HR & Payroll — Development Plan & Vision

**Version:** 1.0
**Date:** 2026-09-13
**Status:** v1 — Complete System Blueprint (Current State → Enterprise-Ready)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current State Analysis (Code-Grounded)](#2-current-state-analysis)
3. [Strategic Positioning](#3-strategic-positioning)
4. [Target Architecture](#4-target-architecture)
5. [Module Map](#5-module-map)
6. [Detailed Security & Technical Debt Audit](#6-security--technical-debt-audit)
7. [Roadmap (12 Months)](#7-roadmap-12-months)
8. [The "Enterprise-Ready" Checklist](#8-the-enterprise-ready-checklist)
9. [Technology Decisions](#9-technology-decisions)
10. [First 30 Days — Immediate Execution](#10-first-30-days)
11. [Success Metrics](#11-success-metrics)
12. [Appendix: Current Database Tables](#12-appendix-current-database-tables)

---

## 1. Executive Summary

Massobi is **the deepest technical HR/payroll engine for Gulf & Arabic compliance** — with modules (WPS SIF, Qiwa contracts, Nitaqat simulator, GOSI audit, EOSB per articles 84/85, IAS 19 provisions, TCOE, EWA, flexible work) that **no global competitor has natively**. However, it currently lacks the **platform layer** (API, authorization, multi-tenancy, SSO, mobile, tests, CI/CD) required to compete in enterprise procurement.

**The core thesis:** «Ambitiously win on *exclusive Gulf compliance* + *data sovereignty (On-Premise)* + *price (one-time / low subscription)* — NOT by fighting Workday/SAP/Oracle head-on on global breadth.»

**Current position:** *A mature product functionally, immature platform-wise.* The very first priority is NOT a new feature — it is **security + authorization + API layer + a single source of truth for data** (Drizzle migration).

---

## 2. Current State Analysis

> Grounded in a full code audit (server.ts = 7,865 lines; src/ = ~27,300 lines; 66 components; 235 API routes).

### 2.1 Architecture Snapshot

| Layer | Reality | Impact |
|---|---|---|
| **Backend** | Single `server.ts` (7,865 lines): all routes + raw SQL + business logic + AI in one file | God-monolith; hard to maintain, test, scale |
| **Database** | better-sqlite3 raw `CREATE TABLE` (77 tables); Drizzle schema exists (74 tables in 23 files) but **never used** | Two sources of truth = drift risk |
| **Frontend** | React 19 + Vite; `App.tsx` 716 lines (no React Router — `useState`-based); 57 screens statically loaded | No code-splitting; fragile role gating |
| **Types** | 3 incompatible layers: `types.ts` (snake_case), Drizzle schema (camelCase), `payroll-types.ts` (camelCase) | Refactoring hazard |
| **UI kit** | `ui.tsx` = 25 lines only; ~67 hand-built modal implementations duplicated | Any design change = 67-file edit |
| **Data fetching** | Raw `fetch` in every component (~130 call sites); TanStack Query installed but **0 usage** | No cache/validation/retry |
| **Repo tools** | Vitest + Playwright installed but **zero tests, no config, no specs** | No guardrails |
| **Deployment** | EXE installer + `launcher.vbs`; no Dockerfile, no CI/CD | Only single-machine distribution |

### 2.2 Strengths to Preserve

- **Multi-country payroll engine**: `PayrollCalculator` (pure) + extensible `CountryRulesService` → 6 countries covered (SA, EG, AE, JO, BH, KW).
- **Exclusive compliance modules**: WPS/SIF, Qiwa, GOSI, Nitaqat, EOSB (art. 84/85), IAS 19, TCOE, EWA, Flexible Work, HSE, Work Injuries, CCHI.
- **Kiosk attendance**: geofencing + WebAuthn/FIDO2 + ZKTeco-ready.
- **Arabic RTL-native UI** + Hijri/Gregorian calendar.
- **Full data ownership**: local SQLite, offline-capable — vital for banks/government/defense.
- **Low TCO**: one-time license vs $25–40/user/month.

### 2.3 Critical Weaknesses (Gate to Enterprise Sales)

| # | Issue | Severity | Location |
|---|---|---|---|
| 1 | Hardcoded default JWT secret `"your-super-secret-jwt-key-change-in-production"` | 🔴 Critical | `server.ts:1506` |
| 2 | Any authenticated user can export/restore the entire DB | 🔴 Critical | `/api/backup/*` |
| 3 | ~229 of 235 routes have **no role enforcement** (RBAC "worked" only via hidden menus) | 🔴 Critical | global gate |
| 4 | WebAuthn verification parses `clientDataJSON` but **does not verify signature/origin** | 🟠 High | `server.ts:7196` |
| 5 | WPS/SIF export computes from live employee data, **ignoring locked payroll records** | 🟠 High | `/api/wps/export-sif` |
| 6 | `requireEntity` middleware defined but **never used** → cross-tenant leakage | 🟠 High | multi-tenant risk |
| 7 | `CountryRulesService.getRules()` queries a missing `is_active` column → runtime failure | 🟠 High | `CountryRulesService.ts:26` |
| 8 | Duplicate route registrations shadow later routes (`/api/documents`, `/api/notifications`); `/api/backup/status` unreachable in production due to `app.get("*")` ordering | 🟡 Medium | route ordering |
| 9 | 3 tables missing from Drizzle schema: `countries`, `kiosk_security_logs`, `employee_webauthn_credentials` | 🟡 Medium | schema drift |
| 10 | No migration system (`src/db/migrations/` referenced but empty/missing); dual-DB (raw + Drizzle) | 🟡 Medium | infra |
| 11 | Business-critical calculation (bonus/penalties, organizational allowances, medical premiums, GOSI 45,000 cap, Ramadan hours) missing from `PayrollCalculator` | 🟡 Medium | payroll |
| 12 | No tests despite Vitest/Playwright installed; no Dockerfile/CI | 🟡 Medium | quality |

### 2.4 Payroll Gap Analysis (what the calculator does NOT do today)

```
PayrollCalculator.calculate() = basic + allowances + overtime − insurance − tax − absence − loan

NOT included:
  ├── Bonuses / Penalties (from bonuses_penalties table — never read in batch)
  ├── Organizational allowances (employee_allowances join)
  ├── Medical insurance premium deduction
  ├── Work permit / Iqama renewal fee deduction
  ├── GOSI ceiling enforcement (45,000 SAR)
  ├── Deferred deductions / installment plans
  ├── Holiday pay / shift differentials
  ├── Ramadan reduced hours (art. 98)
  ├── Annual ticket accrual (expats)
  ├── EOSB accrual with resignation % (art. 85)
  └── Tax exemption for housing/transport allowances
```

---

## 3. Strategic Positioning

### Do NOT compete with Workday/SAP/Oracle on their own turf.

**Position:** «The Gulf & Arabic compliance engine + a fully integrated HR/Payroll platform, delivered On-Premise or SaaS.»

**Three revenue lines (the "trinity"):**

| Line | Audience | What they buy |
|---|---|---|
| **Value-type On-Premise** | 50–500 employees, private sector | One-time license + annual support |
| **SaaS Multi-tenant** | 100–2,000 employees, growth companies | $10–20/user/month |
| **Localization Add-on (B2B2B)** | Workday/SAP/Oracle customers in the Gulf | $50–150K license + API integration |

### Decision Matrix

| Scenario | Recommendation | Rationale |
|---|---|---|
| Saudi company 50–500, single legal entity | **Build on Massobi** | 80% cheaper, 100% compliance, data ownership, full customization |
| Multinational, 5+ countries | **Hybrid: Workday Core + Massobi compliance** via API | Workday for global HR; Massobi as local compliance engine |
| Startup hiring globally w/o entities | **Deel/Remote (Buy)** | EOR is a different operating model |
| Mid-market 200–1,000, low budget | **Massobi SaaS + customizations** | Cheaper, native compliance |
| Government/military/central bank | **Massobi On-Premise (Build)** | Absolute data sovereignty |

---

## 4. Target Architecture

### 4.1 Layered Clean Architecture

```
┌─ Presentation   React 19 PWA + Mobile (Expo) + Kiosk/PWA
├─ Application    Use-cases / Commands / Queries   ← thin routers only
├─ Domain         Entities + compliance rules (CountryRulesService)  ← pure ← testable
└─ Infrastructure DB (PostgreSQL/SQLite via Drizzle) + Integrations + External APIs
```

### 4.2 Monolith → Modules Decomposition

```
server.ts (7,865 lines)
   │ decompose
   ├─ src/api/routes/        (auth.ts, employees.ts, payroll.ts, attendance.ts, compliance.ts, ...)
   ├─ src/api/controllers/   (thin: parse → validate → call service → respond)
   ├─ src/application/services/  (all business logic, testable)
   ├─ src/domain/rules/      (country rules: eg-rules.ts, sa-rules.ts, ...)
   └─ src/infrastructure/db/migrations/  ← adopt existing Drizzle schema as single truth
```

### 4.3 Dual Database Strategy (do NOT do a single hard migration)

| Deployment | Database | Why |
|---|---|---|
| **On-Premise** | SQLite (keep) | Data sovereignty, zero-infra, works offline |
| **Cloud/SaaS** | PostgreSQL + Multi-tenant (Row-Level Security) | Concurrency >50 users, replication, RLS |

Implement one **Data Access Layer** (via Drizzle) over both → a competitive advantage no global vendor has: **full client-side data control + flexible cloud**.

---

## 5. Module Map

| Module | Status | Plan |
|---|---|---|
| **Core HR** | ✅ Complete (files, organization, transfers) | + interactive Org Chart, job titles hierarchy, positions |
| **Payroll** | ✅ Strong engine + EOSB + IAS19 + TCOE + WPS | + per-country rules engine across all unions, plug bonuses/medical/permits into calculator |
| **Attendance** | ✅ Kiosk + GPS + Biometrics + ZKTeco | + native mobile attendance, offline sync, large hardware vendors |
| **Saudi Compliance** | ✅ Exclusive (Qiwa, SIF, Nitaqat, CCHI, art.209, Flexible) | + auto-update on MOL/GOSI rule changes, official GOSI API |
| **Talent** | ✅ 9-Box + Succession + Training + Retention AI | + internal compensation benchmarking, 360° reviews, LinkedIn ATS |
| **AI** | ✅ Copilot + Letter Studio + basic RAG | + Text-to-SQL reports, document OCR, workforce scheduling |
| **Assets/Fleet/HSE** | ✅ Advanced | + RF handover at branch via mobile |
| **ESS/Mobile** | ⛔ PWA only | + **native app** (Expo): push, biometric, QR, offline |
| **API/Platform** | ❌ Not present | + REST/OpenAPI + Webhooks + SDK (**commercially critical**) |
| **Integrations** | ❌ | + banks (SAMA open banking), ERP (SAP B1, NetSuite, Odoo), ZKTeco, AI providers |
| **Ops/Backups** | ✅ Daily auto | + encrypted cloud/off-site backup, point-in-time recovery, retention policy |
| **Testing** | ❌ None | + Vitest on all payroll/compliance logic + Playwright E2E |

---

## 6. Security & Technical Debt Audit

### 6.1 Authentication & Sessions

| Item | Current | Action |
|---|---|---|
| Password hashing | bcryptjs, 10 rounds | OK for now; optionally Argon2id in P1 |
| JWT | Standard HS256, 24h | **Remove hardcoded fallback**; fail at startup if `JWT_SECRET` missing |
| Sessions | Stored in DB, real revocation on logout/change-password | Keep; add refresh tokens + sliding expiry |
| Rate limiting | Login (10/15min) + kiosk (80/5min) only | Add global + per-route limits |

### 6.2 Authorization (the #1 gap)

- `requireRole` is applied on **6 routes only**.
- **Fix**: define a route×role policy matrix; enforce `requireEntity` everywhere; start with field/settlement-level ABAC in P1.
- Add **immutable audit trail** (hash-chained, append-only) — enterprise/government must-have.

### 6.3 Sensitive Data

- `/uploads` served via `express.static` without auth → gate it.
- CORS is fully open (`cors()`), CSP disabled in helmet → tighten for production.
- `bodyParser.json()` default 100KB limit → raise + validate upload size/type.
- Gemini key currently injected into frontend bundle (vite `define`) → move strictly to server (already server-side per `metadata.json`; verify).

### 6.4 Bad Hygiene (quick wins)

- Route shadowing fixes (`/api/documents`, `/api/notifications` order).
- Move `app.get("*")` after `/api/*` routes so `/api/backup/status` works in production.
- CSV escaping + BOM for Arabic-safe exports; strict SIF field escaping.

---

## 7. Roadmap (12 Months)

### Phase 0 — Stability & Foundations (Weeks 1–4) 🔴 Critical

| Task | Effort | Outcome |
|---|---|---|
| Decompose `server.ts` into `routes/controllers/services` (no behavior change) | 2 wks | Maintainable code |
| Adopt Drizzle schema as the **single source of truth**; add missing tables (`countries`, `kiosk_security_logs`, `employee_webauthn_credentials`); run migrations (no raw `CREATE TABLE` in code) | 2 wks | No dual-DB drift |
| **Security hardening**: env-only JWT secret, full RBAC matrix, permission-lock `/api/backup/*`, gate `/uploads`, CORS/CSP | 1 wk | Enterprise-sellable security baseline |
| Enable TypeScript `strict`; split domain/DTO types | 1 wk | Safer refactoring |
| Vitest coverage ≥80% on `PayrollCalculator` + `CountryRulesService` (fix `is_active` bug); first Playwright E2E | 2 wks | Guardrails for the core |

### Phase 1 — Sellable to Enterprises (Weeks 5–10) 🔴 Critical

- **API Layer**: REST + OpenAPI/Swagger + Zod validation on every route.
- **Auth overhaul**: refresh tokens, MFA, account lockout.
- **SSO/OIDC/SAML**: Azure AD, Okta, Google Workspace, Keycloak.
- **ABAC** field/record-level policies (CASL or custom policy engine).
- **Immutable audit trail** (hash-chained append-only ledger).
- **Webhooks** (employee, payroll-close, EWA events) with retry/dead-letter + signature.
- **CI/CD**: GitHub Actions — build/test/scan/deploy; Dockerfile.

### Phase 2 — SaaS Platform (Weeks 11–18) 🟡 Strategic

- **Multi-tenancy**: PostgreSQL + Row-Level Security (schema-per-tenant or RLS); resolve entity isolation (currently leaking).
- Deployment: Docker Compose → Kubernetes (Helm, ArgoCD, HPA).
- Managed PostgreSQL (RDS/CloudSQL) + PgBouncer + automated backups.
- Observability: OpenTelemetry + Prometheus/Grafana + Loki + Tempo + alerting.
- **Mobile app** (Expo/React Native): ESS requests, GPS attendance, push, QR, offline-first.
- Fix payroll gaps (bonuses, allowances join, GOSI cap, medical premiums) into the central calculator.

### Phase 3 — AI & Advanced Analytics (Weeks 19–28) 🟢 Competitive Edge

- RAG pipeline for Saudi law/GOSI/Qiwa docs (pgvector), citations.
- Predictive analytics: attrition, salary benchmarking, Nitaqat forecasting.
- **Natural-language queries** (Text-to-SQL) for reports.
- **Document intelligence**: OCR passports/Iqamas/contracts, extraction + validation vs Qiwa/GOSI.
- AI Copilot v2: multi-turn + action execution + proactive alerts.

### Phase 4 — Ecosystem & Regional Expansion (Months 7–12) 🟢 Growth

- **Marketplace / plugin system** (SDK + revenue sharing).
- **Regional expansion**: UAE (MOHRE/WPS), Qatar, Kuwait via `CountryRulesService`.
- **Banking integration**: SAMA open-banking salary disbursement, statement import.
- **ERP connectors**: SAP B1, NetSuite, Dynamic365, Zoho, Odoo.
- **Embedded BI**: self-service analytics, scheduled email reports.

---

## 8. The "Enterprise-Ready" Checklist

The 7 questions every procurement committee asks before putting you on the same list as Workday:

1. **Do you have documented REST API + Webhooks?** → Phase 1
2. **Do you support SSO (SAML/OIDC) with Azure AD/Okta?** → Phase 1
3. **Do you have SOC 2 / customer-controlled data (On-Prem)?** → Security + docs (start now)
4. **Can you pass >50 concurrent-user performance tests?** → PostgreSQL + Multi-tenant (Phase 2)
5. **Do you have a native Mobile app for field employees?** → Phase 2
6. **Do you support self-service BI reports?** → Phase 4 (embedded Metabase/Superset)
7. **Do you have ERP/bank integration requests handled?** → Phase 3–4

> In short, for tenders: **the %API + SSO + Multi-tenancy% gap is what removes you from the list today — not features.** Your functional features (SIF, Qiwa, EOSB) are already stronger than any competitor.

---

## 9. Technology Decisions

| Layer | Current | Target | Why |
|---|---|---|---|
| DB | SQLite | PostgreSQL (Cloud) / SQLite (On-Prem) | concurrency, RLS, sovereignty |
| ORM | Raw SQL | Drizzle ORM (schema ready) | safe migrations, shared types |
| Server | Express monolith | Express + modular routers (or Fastify) | incremental, low-risk |
| Validation | None | Zod on every route | (already a dependency) |
| State | useState/Context | TanStack Query (server) + Zustand (client) | caching, perf |
| Tests | None | Vitest (unit) + Playwright (E2E) | quality |
| Auth | Simple JWT | JWT + refresh + SSO (OIDC) + MFA | procurement must-have |
| API docs | None | OpenAPI/Swagger + Webhooks | partnerships |
| Deploy | EXE | EXE + Docker/Kubernetes | hybrid model |

---

## 10. First 30 Days

```bash
# 1. Immediate security (1 day — no feature risk)
#    - Set .env JWT_SECRET; remove hardcoded fallback; fail fast in prod
#    - Lock /api/backup/* + /api/admin/clear-data behind admin + gate /uploads

# 2. Tests on the heart of the system (week 1)
#    - src/lib/payroll/PayrollCalculator.ts  → GOSI (SA) + progressive tax (EG) specs
#    - src/lib/payroll/CountryRulesService.ts → fix is_active bug, all 6 countries

# 3. Drizzle migration pilot (week 1–2)
#    - Diff schema vs server.ts; add missing tables (countries, kiosk_security_logs, webauthn)
#    - Move first modules off raw SQL: employees → payroll → compliance

# 4. API Layer (weeks 2–4)
#    - Extract /api/* into src/api/routes + controllers
#    - Zod validation per route; start OpenAPI + webhook log table
```

---

## 11. Success Metrics

| Metric | Target |
|---|---|
| Security baseline pass (RBAC on 100% of routes, no secrets in repo) | Phase 0 end |
| Unit test coverage on payroll/compliance core | ≥80% by Phase 0 end |
| SOC 2 Type I readiness documented (or equivalent internal controls) | Phase 1 end |
| First enterprise/medium tender won | Phase 1 end |
| First SaaS multi-tenant customer live | Phase 2 end |
| Full API + Webhook + SSO documented in public developer portal | Phase 2 end |
| 1,000+ concurrent users supported (load-tested) | Phase 2 end |
| 3 Gulf countries natively supported (SA, AE, QA, KW) | Phase 4 end |
| $500K–2M ARR within 2 years (SaaS line) | Phase 4 horizon |

---

## 12. Appendix: Current Database Tables (77)

### Core (7)
`settings`, `audit_logs`, `notifications`, `entities`, `users`, `sessions`, `permissions`

### Organization (5)
`branches`, `departments`, `allowance_types`, `employees`, `employee_allowances`

### Payroll (4)
`payroll`, `attendance`, `loans`, `bonuses_penalties`

### HR (5)
`leaves`, `leave_balances`, `documents`, `assets`, `appraisals`

### Compliance (2)
`government_renewals`, `eos_calculations`

### Country Rules (2)
`country_rules`, `tax_brackets`

### Operations (13)
`overtime_records`, `policies`, `checklists`, `skills`, `employee_skills`, `training_courses`, `employee_training`, `projects`, `tasks`, `job_openings`, `candidates`, `expense_claims`, `promotions`

### Attendance (4)
`attendance_devices`, `attendance_logs`, `employee_documents`, `employee_transfers`

### Clearance (1)
`employee_clearances`

### Visas (3)
`visas`, `flight_tickets`, `salary_certificates`

### Qiwa/Disciplinary (2)
`qiwa_contracts`, `disciplinary_violations`

### HSE (3)
`work_injuries`, `hse_inspections`, `hse_ppe_logs`

### Medical (3)
`medical_policies`, `medical_dependents`, `insurance_endorsements`

### Talent (2)
`talent_assessments`, `succession_plans`

### Fleet (2)
`fleet_vehicles`, `traffic_fines`

### Flexible Work (2)
`flexible_work_shifts`, `telework_permits`

### EWA (1)
`ewa_withdrawals`

### Grievances (3)
`employee_grievances`, `hearing_sessions`, `official_warnings`

### Rewards (4)
`peer_kudos`, `reward_catalog`, `reward_redemptions`, `pulse_survey_results`

### Smart Assets (1)
`smart_assets`

### AI (1)
`hr_generated_letters`

### Analytics (4)
`exit_interviews`, `approval_workflows`, `approval_requests`, `department_budgets`

### Live-only (missing from Drizzle schema — must add)
`countries`, `kiosk_security_logs`, `employee_webauthn_credentials`

---

*Companion Arabic document: `DEVELOPMENT_PLAN_AR.md`.*