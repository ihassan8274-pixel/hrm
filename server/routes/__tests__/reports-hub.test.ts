process.env.DATABASE_URL ||= "postgres://payroll:payroll@localhost:5432/payroll";

import { describe, expect, it } from 'vitest';
import {
  CUSTOM_DATASETS, REPORT_CATALOG, buildCustomReport, reportsSchema, validateBuilderSpec,
  asksForGeneratedReport,
} from '../../lib/report-catalog';
import { hasPermission, PERM, ROUTE_PERMISSIONS, ruleMatches } from '../../middleware/auth';

const scope = { entityId: null, branchId: 4, employeeId: null };

describe('reports hub catalog and builder', () => {
  it('exposes metadata only — no SQL fragments, no employee data', () => {
    const schema = reportsSchema();
    expect(schema.catalog.length).toBe(REPORT_CATALOG.length);
    expect(schema.catalog.every((entry) => !('sql' in entry))).toBe(true);
    expect(JSON.stringify(schema)).not.toContain('entity_id');
    for (const dataset of schema.datasets) {
      expect(JSON.stringify(dataset)).not.toContain('SELECT');
      expect('from' in dataset).toBe(false);
    }
  });

  it('labels drafts only for explicit report/file requests', () => {
    expect(asksForGeneratedReport('ما الفرق بين اعتماد مسير الرواتب وحالة الدفع؟')).toBe(false);
    expect(asksForGeneratedReport('ما التقارير المتاحة للامتثال السعودي؟')).toBe(false);
    expect(asksForGeneratedReport('أين أجد بوابة التواجد؟')).toBe(false);
    expect(asksForGeneratedReport('أنشئ تقريرًا غير موجود في الدليل')).toBe(true);
    expect(asksForGeneratedReport('أعطني ملف CSV للموظفين')).toBe(true);
  });

  it('rejects anything that is not an allowlisted dataset, field or filter', () => {
    expect(() => validateBuilderSpec({ dataset: 'employees; DROP TABLE payroll' })).toThrow();
    expect(() => validateBuilderSpec({ dataset: 'employees', fields: ['basic_salary; --'] })).toThrow();
    expect(() => validateBuilderSpec({ dataset: 'employees', fields: [1, 2] })).toThrow();
    expect(() => validateBuilderSpec({ dataset: 'employees', filters: [{ key: 'status = 1 --', value: 'x' }] })).toThrow();
    expect(() => validateBuilderSpec({ dataset: 'employees', limit: 100000 })).toThrow();
    expect(() => validateBuilderSpec({ dataset: 'employees', fields: ['id', 'id'] })).toThrow();
    expect(() => validateBuilderSpec({ dataset: 'overtime', filters: [{ key: 'status', value: "approved' OR 1=1" }] })).toThrow();
  });

  it('builds SQL from trusted fragments only, binding every value', async () => {
    const captured: { sql: string; params: unknown[] } = { sql: '', params: [] };
    const fakeDb = {
      prepare(sql: string) {
        captured.sql = sql;
        return {
          async all(...params: unknown[]) {
            captured.params = params;
            return [{ id: 7, name: 'اسم`' }];
          },
        };
      },
    };
    const report = await buildCustomReport(fakeDb, scope, {
      dataset: 'employees',
      fields: ['id', 'name'],
      filters: [{ key: 'name', value: "a'%_b" }],
      limit: 5,
    });
    expect(captured.sql).toContain('LIKE ? ESCAPE');
    expect(captured.sql).not.toContain('DROP');
    expect(captured.sql).not.toContain('a%_b');
    expect(captured.params).toContain(4); // the only scope value is the branch id
    expect(captured.params.at(-1)).toBe(6); // limit + 1, bound
    expect(report.rows).toEqual([[7, 'اسم`']]);
  });

  it('describes system screens without leaking database details', async () => {
    const { SYSTEM_MODULES, matchingScreens, systemKnowledge } = await import('../../lib/system-knowledge');
    expect(SYSTEM_MODULES.length).toBeGreaterThan(15);
    expect(new Set(SYSTEM_MODULES.map((m) => m.navId)).size).toBe(SYSTEM_MODULES.length);
    expect(JSON.stringify(systemKnowledge())).not.toMatch(/entity_id|branch_id|SELECT\b/i);
    expect(matchingScreens('بوابة التواجد').map((m) => m.navId)).toContain('presence_gate');
    expect(matchingScreens('الرواتب').map((m) => m.navId)).toContain('payroll');

    const conceptual = 'ما الفرق بين اعتماد مسير الرواتب وحالة الدفع؟';
    expect(matchingScreens(conceptual).map((m) => m.navId)).toContain('payroll');
    expect(matchingScreens('كيف أجد بوابة التواجد؟').map((m) => m.navId)).toContain('presence_gate');
    expect(matchingScreens('أين شاشة تقارير الرواتب؟').map((m) => m.navId)).toContain('salary_reports');

    const known = new Set(SYSTEM_MODULES.map((m) => m.navId));
    for (const screen of matchingScreens(conceptual)) {
      expect(known.has(screen.navId)).toBe(true);
      expect(screen.titleAr).toBe(SYSTEM_MODULES.find((m) => m.navId === screen.navId)?.titleAr);
    }
    expect(JSON.stringify(matchingScreens(conceptual))).not.toMatch(/entity_id|branch_id|SELECT\b/i);
  });

  it('has a nonempty catalog for every registered report group', () => {
    const groups = new Set(REPORT_CATALOG.map((entry) => entry.group));
    expect([...groups].sort()).toEqual(['consolidated', 'operational', 'salary']);
    expect(CUSTOM_DATASETS.every((d) => d.defaultFields.every((k) => d.fields.some((f) => f.key === k)))).toBe(true);
  });
});

describe('reports hub permissions', () => {
  const cases: Array<[string, string]> = [
    ['GET', '/api/reports-hub/catalog'],
    ['POST', '/api/reports-hub/custom'],
    ['GET', '/api/reports-hub/custom/csv'],
    ['POST', '/api/reports-hub/ai/ask'],
  ];

  it('classifies every endpoint under AI_TOOLS_USE', () => {
    for (const [method, url] of cases) {
      const rule = ROUTE_PERMISSIONS.find((r) => ruleMatches(r, method, url));
      expect(rule?.perm, `${method} ${url} must be classified`).toBe(PERM.AI_TOOLS_USE);
    }
  });

  it('allows only admin and hr_manager', () => {
    for (const role of ['admin', 'hr_manager']) {
      expect(hasPermission(role, PERM.AI_TOOLS_USE), role).toBe(true);
    }
    for (const role of ['finance', 'branch_manager', 'employee_ess', '', 'unknown']) {
      expect(hasPermission(role, PERM.AI_TOOLS_USE), role || 'anonymous').toBe(false);
    }
  });
});
