import { describe, expect, it } from 'vitest';
import { hasPermission, PERM, ROUTE_PERMISSIONS } from '../auth';

const paths = [
  'attendance-duty',
  'attendance-duty/csv',
  'payroll-overtime',
  'payroll-overtime/csv',
  'expiry-alerts',
  'expiry-alerts/csv',
  'ksa-compliance',
  'ksa-compliance/csv',
  'training-promotions',
  'training-promotions/csv',
  'service-termination',
  'service-termination/csv',
];

const ruleFor = (url: string) =>
  ROUTE_PERMISSIONS.find(rule =>
    (rule.method === '*' || rule.method === 'GET') && rule.pattern.test(url));

describe('extended reports route permissions', () => {
  it('puts all twelve screen and CSV endpoints behind REPORTS_VIEW', () => {
    for (const path of paths) {
      const url = `/api/reports/${path}`;
      expect(ruleFor(url)?.perm, `${url} must be classified`).toBe(PERM.REPORTS_VIEW);
    }
  });

  it('allows only admin, hr_manager and finance — ESS and branch_manager fail closed', () => {
    for (const role of ['admin', 'hr_manager', 'finance']) {
      expect(hasPermission(role, PERM.REPORTS_VIEW), role).toBe(true);
    }
    for (const role of ['employee_ess', 'branch_manager', '', 'unknown']) {
      expect(hasPermission(role, PERM.REPORTS_VIEW), role || 'anonymous').toBe(false);
    }
  });
});
