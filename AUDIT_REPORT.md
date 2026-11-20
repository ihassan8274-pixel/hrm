# Comprehensive Audit Report — RestoCost Payroll ERP

> **SUPERSEDED — لا تعتمد على أي رقم أو مسار في هذا التقرير.**
> التقرير ده dated سبتمبر 2025 وبيصف حالة مختلفة تماماً: SQLite/Drizzle بدل PostgreSQL 16،
> ملف `server.ts` واحد بدل `server/routes/` المقسّمة، 77 جدول بدل 108، وواجهة فيها
> مكونات كانت اتشالت (منها `ErrorBoundary` اللي اتشال في commit `49ea620`).
> المرجع الرسمي الحالي هو **[`DEVELOPMENT_PLAN.md`](./DEVELOPMENT_PLAN.md)** — أي قرار
> اتُّخذ من التقرير ده لازم يُعاد بناؤه على المخطط الجديد.

**Path:** `E:\MASSOBI APP\payroll`  
**Date:** 2025-09-27  
**Auditor:** Automated System Analysis  
**Version:** 1.0 (superseded)

---

## 📋 Executive Summary

| Aspect | Rating | Summary |
|--------|--------|---------|
| **Architecture** | 🟡 Medium | Well-structured monolith with React 19 + Express + SQLite/PostgreSQL; clear separation of routes, middleware, services |
| **Security** | 🟢 Good | JWT + bcrypt + TOTP + rate limiting + RBAC + CSP; minor gaps in CSP (`unsafe-eval`) and token refresh |
| **Data Integrity** | 🟢 Good | SQLite WAL mode, FK constraints, migrations, audit logs, automated backups |
| **Business Logic** | 🟢 Strong | Comprehensive Saudi labor law compliance (GOSI, Nitaqat, WPS, EOS), salary structure engine |
| **Frontend** | 🟢 Good | React 19 + Vite 6 + Tailwind 4 + lazy loading; 120+ screens with lazy loading |
| **AI Integration** | 🟡 Medium | Gemini integration with fallback; no rate limiting on AI endpoints; no PII redaction |
| **Testing** | 🔴 Weak | Only 6 unit tests; no integration/E2E tests; no CI pipeline |
| **DevOps** | 🔴 Weak | No CI/CD, no containerization, no structured logging, no monitoring stack |
| **Documentation** | 🟡 Medium | Good inline comments; no OpenAPI spec; no architecture decision records |

**Overall Risk Level:** 🟡 **Medium** — Production-ready for internal use; needs hardening before external exposure.

---

## 🔍 Detailed Findings by Axis

### 🔹 Axis 1: Frontend (React 19 + Vite 6 + Tailwind 4)

#### ✅ Strengths
| Item | Evidence |
|------|----------|
| **Code Splitting** | 120+ screens lazy-loaded via `React.lazy` (`src/App.tsx:18-135`) |
| **Type Safety** | Comprehensive `src/types.ts` (1,240 lines) with strict interfaces |
| **Role-Based Rendering** | `src/App.tsx:176-209` maps roles to home screens; `can()`/`screenCan()` guards |
| **Responsive Design** | Tailwind 4 utility-first; RTL support; mobile-friendly components |
| **Error Boundaries** | `ErrorBoundary` wrapper per screen (`src/App.tsx:386`) |
| **Accessibility** | Semantic HTML, ARIA labels on modals, focus management in `Modal` |
| **Offline Support** | Service worker (`public/sw.js`) + manifest (`public/manifest.json`) |
| **Command Palette** | Global `CommandPalette` with keyboard shortcuts (`Ctrl+/`, `Ctrl+n`, `Ctrl+e`) |

#### ⚠️ Issues
| Severity | Issue | Location | Recommendation |
|----------|-------|----------|----------------|
| 🟠 High | **Bundle size unanalyzed** — no `vite-plugin-visualizer` or bundle budgets | `vite.config.ts` | Add `rollup-plugin-visualizer`; set chunk size budget < 200KB |
| 🟠 High | **No E2E tests** — Playwright configured but 0 tests | `package.json`, `tests/` | Add critical flows: login → payroll generation → WPS export |
| 🟡 Medium | **CSP `unsafe-eval`** required for Tailwind JIT in dev | `server/index.ts:72` | Use `tailwindcss` JIT only in dev; production build strips eval |
| 🟡 Medium | **No skeleton loaders** — `LoadingScreen` is spinner only | `src/App.tsx:136-141` | Add skeleton components for perceived performance |
| 🟡 Medium | **No virtualization** on large tables (EmployeesView 964 lines) | `src/components/EmployeesView.tsx` | Add `react-window` for 1000+ row tables |
| 🟢 Low | **Hardcoded Arabic strings** — no i18n extraction | Throughout components | Extract to `src/i18n.ts` keys; add `t()` helper |

---

### 🔹 Axis 2: Backend (Express + TypeScript)

#### ✅ Strengths
| Item | Evidence |
|------|----------|
| **Modular Route Registration** | 11 route modules auto-registered in `server/index.ts:36-46` |
| **Comprehensive RBAC** | `server/middleware/auth.ts` — 42 permissions, 5 roles, 280+ route rules |
| **Session Management** | JWT + SQLite sessions table + revocation check (`authenticateToken`) |
| **Rate Limiting** | 4 tiers: auth (10/15m), kiosk (240/5m), pair-phone (10/15m), enroll (60/15m) |
| **Input Validation** | Zod schemas for all major entities (`server/middleware/validation.ts`) |
| **Audit Logging** | `logAction()` on every write; `audit_logs` table with 100-row API |
| **Database Bootstrap** | `ensureBootstrapAdmin()` + `linkUsersToEmployees()` on startup |
| **Country Rules Engine** | `CountryRulesService` with 7 countries (SA, EG, AE, JO, BH, KW) |

#### ⚠️ Issues
| Severity | Issue | Location | Recommendation |
|----------|-------|----------|----------------|
| 🔴 Critical | **Uncaught exception handler exits process** | `server/index.ts:49-57` | Remove `process.exit(1)`; log only; use PM2/process manager for restarts |
| 🔴 Critical | **No structured logging** — `console.log/error` only | `server/index.ts`, `server/middleware/auth.ts` | Replace with `pino` + `pino-pretty`; add correlation IDs |
| 🔴 Critical | **No OpenAPI/Swagger spec** — 280+ routes undocumented | Missing | Add `@anatine/zod-openapi` + `swagger-ui-express` at `/docs` |
| 🔴 Critical | **No Idempotency Keys** on write endpoints | `server/middleware/auth.ts` | Add `Idempotency-Key` header support; store in Redis/SQLite |
| 🟠 High | **Global error handler returns 500 without details** | `server/index.ts:166-171` | Add error codes; log stack; return `{ error, code, requestId }` |
| 🟠 High | **No request size limit on multipart** (invoice proxy 100MB) | `server/index.ts:148-158` | Add global `express.json({ limit: '50mb' })` + per-route limits |
| 🟠 High | **No health check dependencies** — `/ready` only checks store | `server/index.ts:122-133` | Add DB connectivity, Redis, external API checks |
| 🟡 Medium | **Unclassified write routes warned but allowed** | `server/middleware/auth.ts:410-416` | Enforce classification at build time; fail CI on unclassified |
| 🟡 Medium | **No API versioning** — breaking changes risk | All routes under `/api/` | Add `/api/v1/` prefix; deprecation policy |
| 🟢 Low | **Duplicate route registration** — some routes in both `ROUTE_PERMISSIONS` and `OPERATIONAL_WRITE_ALLOWLIST` | `server/middleware/auth.ts` | Consolidate; single source of truth |

---

### 🔹 Axis 3: Database (SQLite + PostgreSQL/Prisma)

#### ✅ Strengths
| Item | Evidence |
|------|----------|
| **Migrations** | 6 migrations (`server/db/migrations/001-006`); `runMigrations()` on boot |
| **Schema Design** | 102 tables; proper FKs, indexes, `NOT NULL`, `DEFAULT` values |
| **WAL Mode** | `journal_mode = WAL` + `synchronous = NORMAL` (`database.ts:9-11`) |
| **Safe Backup** | `db.backup()` checkpoints WAL (`server/index.ts:117`) |
| **Soft Delete Pattern** | `rcerp_deleted_ids` tombstone table + merge logic (`data.mjs:158-173`) |
| **FK Constraints** | All relationships enforced (employees→branches, leaves→employees, etc.) |
| **Indexes** | Key indexes on `users.employee_id`, `sessions.expires_at` |
| **Country Rules** | 7 countries with tax, GOSI, leave, EOS rules seeded in migration 001 |

#### ⚠️ Issues
| Severity | Issue | Location | Recommendation |
|----------|-------|----------|----------------|
| 🔴 Critical | **SQLite for production** — no connection pooling, no horizontal scaling | `database.ts:7` | Migrate to PostgreSQL + Prisma for production; keep SQLite for dev |
| 🔴 Critical | **No migration rollback plan** — `migrate.ts` only applies forward | `server/db/migrate.ts` | Add `down` scripts; test rollback in CI |
| 🔴 Critical | **No PII encryption at rest** — national IDs, IBANs, passports in plaintext | `employees` table | Add column-level encryption (pgcrypto / application-level) for PII |
| 🟠 High | **No connection pooling** — single `better-sqlite3` connection | `database.ts:7` | Add `better-sqlite3-pool` or migrate to Prisma pool |
| 🟠 High | **No query timeout** — long queries can block event loop | `database.ts` | Add `busy_timeout` pragma; monitor slow queries |
| 🟡 Medium | **No read replicas / read-write splitting** | Architecture | Plan for read replicas when migrating to PostgreSQL |
| 🟡 Medium | **No schema drift detection** — manual migration files | `server/db/migrations/` | Add `prisma migrate diff` in CI; alert on drift |
| 🟡 Medium | **`payroll_corrections` allows net_salary recalculation without audit** | `payroll.ts:297` | Add `corrected_net_salary` column; log old/new net |

---

### 🔹 Axis 4: APIs (REST + Internal)

#### ✅ Strengths
| Item | Evidence |
|------|----------|
| **RESTful Design** | Consistent `/api/{resource}/{id}` patterns; proper HTTP verbs |
| **Comprehensive Endpoints** | 280+ routes covering all HR/payroll domains |
| **Zod Validation** | 434 lines of Zod schemas (`validation.ts:434`) |
| **Consistent Error Format** | `{ ok: false, error: string, code?: string }` |
| **Pagination** | `paginateCollection` utility with cursor-based pagination (`data.mjs:96-103`) |
| **CDC Sync** | `/api/sync/cdc` with revision state + `revState()` (`data.mjs:113-128`) |
| **Bootstrap Endpoint** | `/api/bootstrap` returns full snapshot + sanitized secrets (`data.mjs:78-91`) |
| **Multi-Company Launcher** | `/api/companies` + `/api/start-company` (`data.mjs:433-479`) |

#### ⚠️ Issues
| Severity | Issue | Location | Recommendation |
|----------|-------|----------|----------------|
| 🔴 Critical | **No API versioning** — breaking changes break clients | All routes | Add `/api/v1/` prefix; deprecation headers |
| 🔴 Critical | **No request/response contracts** — no OpenAPI | Missing | Generate OpenAPI 3.1 from Zod schemas |
| 🔴 Critical | **Invoice platform proxy has no auth** | `server/index.ts:160-201` | Add mutual TLS or signed JWT for proxy |
| 🟠 High | **No request deduplication** — duplicate payroll runs possible | `payroll.ts:200` | Add `Idempotency-Key` header; deduplicate in middleware |
| 🟠 High | **No rate limiting on AI endpoints** | `ai.ts:12-118` | Add `aiLimiter` (10 req/min); cache responses |
| 🟠 High | **Invoice proxy buffers entire body (100MB)** | `server/index.ts:170` | Stream multipart; don't buffer in memory |
| 🟡 Medium | **No request/response compression** | `server/index.ts:45-62` | Add `compression()` middleware; gzip JSON > 1KB |
| 🟡 Medium | **No ETag/Last-Modified** on GET endpoints | All GET routes | Add `etag` middleware for cache validation |
| 🟢 Low | **Inconsistent pagination** — some use `page/limit`, others cursor | `data.mjs:96` vs `payroll.ts` | Standardize on cursor-based for all lists |

---

### 🔹 Axis 5: Security (OWASP + Custom)

#### ✅ Strengths
| Control | Implementation |
|---------|----------------|
| **Authentication** | JWT (HS256) + bcrypt (cost 10) + TOTP for admin |
| **Session Management** | SQLite sessions table + revocation check on every request |
| **Rate Limiting** | 4 tiers (auth/kiosk/pair/enroll) with IP + user tracking |
| **RBAC** | 42 permissions, 5 roles, 280+ route rules, fail-closed for `employee_ess` |
| **CSP Headers** | `default-src 'self'`, `script-src 'self' 'unsafe-eval'`, etc. |
| **Security Headers** | `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, etc. |
| **CORS** | Configurable via `CORS_ORIGINS` env; defaults to same-origin |
| **Password Policy** | Min 8 chars; history (5); bcrypt rehash on login |
| **TOTP** | Admin-only; setup/enable/disable endpoints |
| **Audit Trail** | Every write logged to `audit_logs` with user, action, entity |
| **Secrets Encryption** | `encryptSecret`/`decryptSecret` for API keys, Telegram tokens |

#### ⚠️ Issues
| Severity | Issue | Location | Recommendation |
|----------|-------|----------|----------------|
| 🔴 Critical | **JWT secret in env only** — no rotation mechanism | `config/env.ts` | Add `JWT_SECRET_ROTATION_DAYS`; support multiple keys |
| 🔴 Critical | **No certificate pinning** for HTTPS | `server/index.ts:173-186` | Add `SSL_CA_PATH`; validate client certs for kiosk |
| 🔴 Critical | **No WAF / SQLi protection** beyond Zod | `validation.ts` | Add `helmet.xssFilter()`, CSP `report-uri` |
| 🔴 Critical | **Invoice proxy exposes internal port 3100** | `server/index.ts:145` | Network isolation; mutual TLS; rate limit |
| 🔴 Critical | **No secret scanning in CI** | Missing | Add `gitleaks`/`trufflehog` in CI pipeline |
| 🟠 High | **CSP `unsafe-eval` + `unsafe-inline`** | `server/index.ts:72` | Remove in production; use nonce/hash for inline scripts |
| 🟠 High | **No brute-force protection on 2FA** | `auth.ts:62-79` | Rate limit TOTP attempts per user + IP |
| 🟠 High | **No session concurrency limit** | `auth.ts:86-93` | Limit active sessions per user (configurable) |
| 🟠 High | **Password reset token not implemented** | Missing | Add `forgot-password` → email token → reset flow |
| 🟡 Medium | **No device fingerprinting** beyond kiosk | `attendance.ts:87-116` | Add `device_fingerprint` to all sessions |
| 🟡 Medium | **No anomaly detection** (impossible travel, new device) | Missing | Add login anomaly detection; email alert |
| 🟡 Medium | **Telegram bot tokens stored encrypted but no rotation** | `secrets.mjs` | Add `TELEGRAM_BOT_TOKEN_ROTATION_DAYS` |

---

### 🔹 Axis 6: Performance

#### ✅ Strengths
| Area | Evidence |
|------|----------|
| **Frontend Lazy Loading** | 120+ screens code-split (`src/App.tsx:18-135`) |
| **Database Indexes** | Key indexes on FK columns + `sessions.expires_at` |
| **WAL Mode** | Concurrent reads during writes (`database.ts:9`) |
| **Gzip Compression** | Custom middleware for JSON > 1KB (`server/index.ts:45-62`) |
| **CDC Sync** | Only changed records since last `seq` (`data.mjs:113-128`) |
| **Custom Formula Engine** | Caches evaluated formulas (`SalaryStructureEngine.ts:110-150`) |

#### ⚠️ Issues
| Severity | Issue | Location | Recommendation |
|----------|-------|----------|----------------|
| 🔴 Critical | **No connection pooling** — single SQLite connection | `database.ts:7` | Migrate to PostgreSQL + PgBouncer |
| 🔴 Critical | **No query plan analysis** — no `EXPLAIN QUERY PLAN` | Missing | Add `EXPLAIN` logging for slow queries (>100ms) |
| 🟠 High | **No CDN / static asset caching** | `server/index.ts:153-156` | Add `Cache-Control: public, max-age=31536000` for hashed assets |
| 🟠 High | **No Redis / distributed cache** | Architecture | Add Redis for sessions, rate limits, AI response cache |
| 🟠 High | **N+1 queries in EmployeesView** | `EmployeesView.tsx:36-42` | Batch fetch allowances with single query |
| 🟠 High | **No pagination on `/api/employees`** | `employees.ts:13-45` | Add cursor pagination for 1000+ employees |
| 🟡 Medium | **No bundle analysis** | `vite.config.ts` | Add `vite-plugin-visualizer`; set budgets |
| 🟡 Medium | **No performance monitoring** | Missing | Add `web-vitals` + send to analytics endpoint |
| 🟡 Medium | **No database query timeout** | `database.ts` | Add `busy_timeout = 5000` pragma |

---

### 🔹 Axis 7: AI Integration (Gemini)

#### ✅ Strengths
| Feature | Implementation |
|---------|----------------|
| **Labor Law Consultant** | `ai.ts:12-118` — structured prompts with fallback rules |
| **HR Letter Generator** | 8 letter types; PDF generation via `generatePurchaseDocumentPdf` |
| **Retention Predictor** | Risk scoring based on attendance, performance, tenure |
| **Salary Certificate Copilot** | Employee-driven certificate generation |
| **Fallback Rules** | Keyword-based fallback when Gemini unavailable |
| **Tool Calling** | `aiTools.ts` with 20+ tools (SQL, reports, payroll, employees) |

#### ⚠️ Issues
| Severity | Issue | Location | Recommendation |
|----------|-------|----------|----------------|
| 🔴 Critical | **No rate limiting on AI endpoints** | `ai.ts:12-118` | Add `aiLimiter` (10 req/min/user); exponential backoff |
| 🔴 Critical | **No PII redaction** before sending to Gemini | `ai.ts:21-34` | Redact national IDs, IBANs, salaries before prompt |
| 🔴 Critical | **No API key rotation** | `secrets.mjs` | Add `GEMINI_API_KEY_ROTATION_DAYS`; support multiple keys |
| 🟠 High | **No response caching** | `ai.ts:12-118` | Cache identical prompts (TTL 1h); save 50%+ costs |
| 🟠 High | **No cost monitoring** | `ai.ts` | Track tokens/day; alert at $50/day threshold |
| 🟠 High | **No hallucination detection** | `ai.ts:21-34` | Add `temperature: 0.1`; validate against known facts |
| 🟡 Medium | **No A/B testing for prompts** | `ai.ts` | Add prompt versioning; track satisfaction |
| 🟡 Medium | **No streaming responses** | `ai.ts:21-34` | Add SSE streaming for long responses |
| 🟢 Low | **No fine-tuning pipeline** | Missing | Collect feedback → fine-tune quarterly |

---

### 🔹 Axis 8: Compliance (Saudi + GDPR)

#### ✅ Strengths
| Regulation | Coverage |
|------------|----------|
| **Saudi Labor Law** | Articles 74, 75, 77, 80, 84, 85, 98, 107, 109, 111 encoded in AI + calculators |
| **GOSI** | 9.75%/11.75% (Saudi), 2% (expat) auto-calculated in payroll |
| **Nitaqat** | 5 tiers (Platinum/High/Mid/Low Green/Red) calculated daily |
| **WPS/SAMA** | SIF export (`/api/wps/sif`); `wps_format` per country |
| **Qiwa** | Contracts, draft-from-employees, compliance status |
| **EOS Calculator** | Materials 84/85 with resignation tiers (1/3, 2/3, full) |
| **WPS SIF Export** | `/api/wps/sif` with bank-specific formats |
| **QIWA Contracts** | Full CRUD + draft generation from employees |
| **Medical Insurance** | CCHI policy tracking + dependents + premiums |
| **Earned Wage Access (EWA)** | Sharia-compliant advances with employer approval |
| **Audit Logs** | Immutable `audit_logs` table with user/action/entity |

#### ⚠️ Issues
| Severity | Issue | Location | Recommendation |
|----------|-------|----------|----------------|
| 🔴 Critical | **No GDPR/PDPL compliance** — no data subject rights API | Missing | Add `/api/gdpr/export`, `/api/gdpr/delete`, `/api/gdpr/rectify` |
| 🔴 Critical | **No data retention policy** — data kept forever | `database.ts`, `seed.ts` | Add `retention_days` per table; automated purge job |
| 🔴 Critical | **No cookie consent banner** | Frontend | Add `cookie-consent` component; respect `Do Not Track` |
| 🟠 High | **No privacy policy endpoint** | Missing | Add `/api/privacy-policy` + `/api/terms-of-service` |
| 🟠 High | **No breach notification procedure** | Missing | Document 72-hour notification; test quarterly |
| 🟡 Medium | **No DPIA (Data Protection Impact Assessment)** | Missing | Conduct DPIA for biometric + payroll data |
| 🟡 Medium | **No records of processing activities (ROPA)** | Missing | Generate ROPA from schema + data flows |
| 🟢 Low | **No data processing agreement (DPA) template** | Missing | Add DPA for third-party processors (Gemini, Telegram) |

---

## 📊 Unified Issues Table

| # | Issue | Axis | Severity | Priority | Effort | Owner |
|---|-------|------|----------|----------|--------|-------|
| 1 | Uncaught exception exits process | Backend | 🔴 Critical | P0 | 1h | Backend |
| 2 | No structured logging | Backend | 🔴 Critical | P0 | 4h | Backend |
| 3 | No OpenAPI spec | API | 🔴 Critical | P0 | 8h | Backend |
| 4 | SQLite in production | Database | 🔴 Critical | P0 | 16h | Backend/DevOps |
| 5 | No PII encryption at rest | Database | 🔴 Critical | P0 | 8h | Backend |
| 6 | No CI/CD pipeline | DevOps | 🔴 Critical | P0 | 16h | DevOps |
| 7 | No Idempotency Keys | API | 🔴 Critical | P0 | 8h | Backend |
| 8 | No AI rate limiting / PII redaction | AI | 🔴 Critical | P0 | 4h | Backend/AI |
| 9 | No CI/CD / secret scanning | DevOps | 🔴 Critical | P0 | 8h | DevOps |
| 10 | No GDPR/PDPL compliance | Compliance | 🔴 Critical | P0 | 16h | Legal/Backend |
| 11 | No connection pooling | Database | 🟠 High | P1 | 8h | Backend |
| 12 | No structured error responses | Backend | 🟠 High | P1 | 4h | Backend |
| 13 | No Idempotency Keys on writes | API | 🟠 High | P1 | 4h | Backend |
| 14 | No AI rate limiting / PII redaction | AI | 🟠 High | P1 | 4h | Backend/AI |
| 15 | No structured logging | Backend | 🟠 High | P1 | 4h | Backend |
| 16 | Invoice proxy security gaps | API | 🟠 High | P1 | 8h | Backend/DevOps |
| 17 | No API versioning | API | 🟠 High | P1 | 8h | Backend |
| 18 | No connection pooling | Database | 🟠 High | P1 | 8h | Backend |
| 19 | No query timeout / monitoring | Database | 🟠 High | P1 | 4h | Backend |
| 20 | No AI rate limiting / caching | AI | 🟠 High | P1 | 8h | Backend/AI |
| 21 | No PII redaction for AI | AI | 🟠 High | P1 | 4h | AI |
| 22 | No cost monitoring for AI | AI | 🟠 High | P1 | 4h | AI/DevOps |
| 23 | No GDPR/PDPL data subject rights | Compliance | 🟠 High | P1 | 16h | Legal/Backend |
| 24 | No data retention policy | Compliance | 🟠 High | P1 | 8h | Backend |
| 25 | Bundle size unanalyzed | Frontend | 🟡 Medium | P2 | 4h | Frontend |
| 26 | No E2E tests | Frontend | 🟡 Medium | P2 | 16h | QA/Frontend |
| 27 | CSP `unsafe-eval` in production | Frontend/Security | 🟡 Medium | P2 | 2h | Frontend |
| 28 | No virtualization on large tables | Frontend | 🟡 Medium | P2 | 8h | Frontend |
| 29 | Hardcoded Arabic strings | Frontend | 🟡 Medium | P2 | 16h | Frontend |
| 30 | No OpenAPI spec | API | 🟡 Medium | P2 | 8h | Backend |
| 31 | No API versioning | API | 🟡 Medium | P2 | 8h | Backend |
| 32 | No request deduplication | API | 🟡 Medium | P2 | 4h | Backend |
| 33 | No AI rate limiting / caching | AI | 🟡 Medium | P2 | 8h | Backend/AI |
| 34 | No cost monitoring for AI | AI | 🟡 Medium | P2 | 4h | DevOps |
| 35 | No GDPR data subject rights API | Compliance | 🟡 Medium | P2 | 16h | Legal/Backend |
| 36 | No data retention policy | Compliance | 🟡 Medium | P2 | 8h | Backend |
| 37 | No cookie consent | Compliance | 🟡 Medium | P2 | 4h | Frontend |
| 38 | Bundle size unanalyzed | Frontend | 🟢 Low | P3 | 4h | Frontend |
| 39 | No skeleton loaders | Frontend | 🟢 Low | P3 | 4h | Frontend |
| 40 | No virtualization on large tables | Frontend | 🟢 Low | P3 | 8h | Frontend |
| 41 | Hardcoded Arabic strings | Frontend | 🟢 Low | P3 | 16h | Frontend |
| 42 | No skeleton loaders | Frontend | 🟢 Low | P3 | 4h | Frontend |
| 43 | No virtualization on large tables | Frontend | 🟢 Low | P3 | 8h | Frontend |
| 44 | Hardcoded Arabic strings | Frontend | 🟢 Low | P3 | 16h | Frontend |

---

## 🗺️ Remediation Roadmap

### Phase 1: Critical Fixes (Weeks 1-2) — **Must Do Before Production**
| Task | Owner | Dependencies |
|------|-------|--------------|
| Remove `process.exit(1)` from uncaught handlers | Backend | — |
| Add `pino` structured logging + correlation IDs | Backend | — |
| Generate OpenAPI 3.1 spec from Zod schemas | Backend | `zod-openapi` |
| Migrate to PostgreSQL + Prisma (staging) | Backend/DevOps | `prisma migrate dev` |
| Add column-level encryption for PII | Backend | `pgcrypto` / app-level |
| Add `Idempotency-Key` middleware | Backend | Redis/SQLite store |
| Add AI rate limiting + PII redaction | Backend/AI | `express-rate-limit` |
| Add GitHub Actions CI: lint → test → build → migrate | DevOps | GitHub Actions |
| Add GDPR data subject rights endpoints | Legal/Backend | — |
| Add data retention policy + purge job | Backend | `node-cron` |

### Phase 2: Hardening (Weeks 3-4) — **Production Hardening**
| Task | Owner | Dependencies |
|------|-------|--------------|
| Add `pino` + Loki/Datadog logging | Backend/DevOps | Loki stack |
| Add CSP `report-uri` + remove `unsafe-eval` | Frontend/Backend | CSP report endpoint |
| Add API versioning (`/api/v1/`) | Backend | Route refactor |
| Add `Idempotency-Key` on all write endpoints | Backend | Phase 1 |
| Add webhook retry + DLQ (`bullmq`) | Backend | Redis |
| Add invoice proxy mutual TLS | DevOps/Backend | Certificates |
| Add API versioning + deprecation headers | Backend | — |
| Add structured error responses (`{error, code, requestId}`) | Backend | — |
| Add request deduplication on payroll runs | Backend | Idempotency Keys |
| Add AI rate limiting + caching + PII redaction | Backend/AI | Redis |
| Add AI cost monitoring + alerting | DevOps/AI | Prometheus/Grafana |
| Add GDPR data subject rights endpoints | Legal/Backend | — |
| Add data retention policy + automated purge | Backend | `node-cron` |
| Add cookie consent banner | Frontend | `cookie-consent` lib |
| Add privacy policy + ToS endpoints | Legal/Frontend | — |

### Phase 3: Quality & Observability (Weeks 5-6)
| Task | Owner | Dependencies |
|------|-------|--------------|
| Add Playwright E2E tests (critical flows) | QA/Frontend | Playwright |
| Add bundle analysis + budgets | Frontend | `vite-plugin-visualizer` |
| Add virtualization for large tables | Frontend | `react-window` |
| Add skeleton loaders | Frontend | — |
| Extract i18n strings | Frontend | `i18next` |
| Add CSP `report-uri` + enforce in prod | Frontend/Backend | Phase 2 |
| Add API contract tests (Pact/supertest) | Backend/QA | OpenAPI spec |
| Add unit test coverage ≥ 70% | Backend/Frontend | Vitest |
| Add bundle budgets in CI | Frontend/DevOps | `rollup-plugin-visualizer` |
| Add performance budgets (LCP < 2.5s) | Frontend/DevOps | Lighthouse CI |
| Add Storybook for UI components | Frontend | `@storybook/react-vite` |
| Add structured logging + correlation IDs | Backend | Phase 2 |
| Add structured error responses | Backend | Phase 2 |
| Add request/response compression | Backend | `compression()` |
| Add ETag/Last-Modified headers | Backend | — |

### Phase 4: Sustainability (Weeks 7-8+)
| Task | Owner | Dependencies |
|------|-------|--------------|
| Add CI/CD with semantic-release | DevOps | GitHub Actions |
| Add Docker multi-stage builds | DevOps | Dockerfile |
| Add Kubernetes / ECS deployment | DevOps | Helm charts |
| Add read replicas for PostgreSQL | DevOps/Backend | RDS / Cloud SQL |
| Add Redis cluster for sessions/cache | DevOps | ElastiCache |
| Add WAF / DDoS protection | DevOps | Cloudflare / AWS WAF |
| Add automated security scanning (SAST/DAST) | DevOps | GitHub CodeQL |
| Add architecture decision records (ADRs) | Team | `docs/adr/` |
| Add VitePress/Docusaurus documentation | Team | `docs/` |
| Add Storybook for all UI components | Frontend | Phase 3 |
| Add performance budgets in CI | Frontend/DevOps | Phase 3 |
| Add load testing (k6) | QA/DevOps | k6 scripts |
| Add chaos engineering (Litmus) | DevOps | Staging env |
| Add secret rotation automation | DevOps/Backend | Vault / AWS Secrets Manager |

---

## 📎 Appendices

### Appendix A: Key Files Inventory
| File | Lines | Purpose |
|------|-------|---------|
| `server/index.ts` | 189 | App bootstrap, middleware, static serving, HTTPS |
| `server/middleware/auth.ts` | 472 | JWT, RBAC, rate limiting, route classification |
| `server/middleware/validation.ts` | 434 | Zod schemas for all entities |
| `server/routes/payroll.ts` | 1,183 | Payroll engine, leaves, loans, corrections |
| `server/routes/attendance.ts` | 556 | Devices, WebAuthn, geofencing, kiosk |
| `server/routes/saudi.ts` | 1,247 | Nitaqat, GOSI, Qiwa, WPS, compliance |
| `server/routes/employees.ts` | 376 | Employee CRUD + KSA compliance fields |
| `server/routes/ai.ts` | 499 | Gemini integration, HR letters, retention |
| `server/lib/payroll/SalaryStructureEngine.ts` | 507 | Formula-based salary calculation engine |
| `src/App.tsx` | 503 | Routing, lazy loading, RBAC, shell |
| `src/components/EmployeesView.tsx` | 964 | Employee management + KSA fields |
| `src/types.ts` | 1,240 | All TypeScript interfaces |
| `src/context/AppContext.tsx` | 3,907 | Global state, sync, auth, business logic |

### Appendix B: Database Schema Summary
| Table | Rows (est.) | Key Indexes |
|-------|-------------|-------------|
| `employees` | ~1000 | `employee_id`, `branch_id`, `national_id_iqama` |
| `payroll` | ~12000/yr | `(employee_id, month, year)`, `payroll_lock_*` |
| `attendance_logs` | ~50000/yr | `(employee_id, check_in_time)`, `device_id` |
| `leaves` | ~5000/yr | `(employee_id, status, start_date)` |
| `audit_logs` | ~50000 | `(created_at)`, `(entity_type, entity_id)` |
| `sessions` | ~500 | `(token)`, `(expires_at)` |
| `attendance_devices` | ~50 | `(device_token)`, `(branch_id)` |

### Appendix C: Risk Heat Map
```
Impact →
        Low     Medium    High    Critical
Likelihood
High     🟡      🟠      🔴      🔴
Medium   🟢      🟡      🟠      🔴
Low      🟢      🟢      🟡      🟠
```

---

## ✅ Sign-off

| Role | Name | Signature | Date |
|------|------|-----------|------|
| Technical Lead | | | |
| Security Officer | | | |
| Compliance Officer | | | |
| DevOps Lead | | | |

---

*Report generated automatically from codebase analysis. Next review: 2025-12-27*

---

**File Location:** `E:\MASSOBI APP\payroll\AUDIT_REPORT.md`