import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildNavigation, defaultCollapsedSections, navSectionTitleKeyFor,
  openNavSection, toggleNavSection, NAV_ITEMS, NAV_SECTIONS,
  type NavBuildOptions,
} from '../navigation';

const t: NavBuildOptions['t'] = (key, fallback) => fallback;

const allowFor = (role: string) => (id: string) => {
  if (!role) return false;
  if (id === 'users') return role === 'admin';
  if (role === 'admin' || role === 'hr_manager') return true;
  if (role === 'employee_ess') return ['ess', 'presence_gate', 'presence_schedules', 'presence_exits', 'presence_reports'].includes(id);
  if (role === 'finance') return ['dashboard', 'payroll', 'wps_audit', 'loans', 'bonuses', 'expenses', 'allowances', 'reports', 'salary_reports', 'consolidated_reports', 'provisions', 'cost_employment', 'budgeting', 'annual_cycle', 'extended_reports'].includes(id);
  if (role === 'branch_manager') return ['dashboard', 'attendance', 'attendance_kiosk', 'attendance_live', 'employees', 'leaves', 'approval_workflows', 'manager_inbox', 'ess', 'alerts_center', 'forms_center', 'annual_cycle', 'presence_gate', 'presence_exits', 'presence_reports', 'presence_violations'].includes(id);
  return false;
};

const ids = (nav: ReturnType<typeof buildNavigation>) =>
  nav.sections.flatMap(section => section.items.map(item => item.id));

describe('dynamic navigation', () => {
  it('declares every screen exactly once in one flat list', () => {
    expect(NAV_ITEMS).toHaveLength(72);
    expect(new Set(NAV_ITEMS.map(item => item.id)).size).toBe(NAV_ITEMS.length);
    expect(NAV_SECTIONS).toHaveLength(9);
    for (const item of NAV_ITEMS) {
      expect(NAV_SECTIONS.some(section => section.id === item.section)).toBe(true);
    }
  });

  it('generates all sections for a full-access role', () => {
    const nav = buildNavigation({ canOpen: allowFor('admin'), t });
    expect(nav.sections).toHaveLength(9);
    expect(ids(nav)).toHaveLength(72);
    expect(nav.total).toBe(72);
    expect(nav.quick.map(item => item.id)).toEqual([
      'dashboard', 'employees', 'payroll', 'attendance', 'forms_center',
    ]);
    expect(nav.quick[0].key).toBe('nav.quick.dashboard');
    expect(nav.quick[0].defaultLabel).toBe('لوحة التحكم');
  });

  it('fails closed for a role without permissions', () => {
    for (const role of ['', 'contractor', 'unknown']) {
      const nav = buildNavigation({ canOpen: allowFor(role), t });
      expect(nav.sections).toEqual([]);
      expect(nav.quick).toEqual([]);
      expect(nav.total).toBe(0);
    }
  });

  it('keeps restricted roles to their allowed screens', () => {
    const ess = buildNavigation({ canOpen: allowFor('employee_ess'), t });
    const declaredOrder = (list: string[]) => list.sort(
      (a, b) => NAV_ITEMS.findIndex(item => item.id === a) - NAV_ITEMS.findIndex(item => item.id === b),
    );
    expect(ids(ess)).toEqual(declaredOrder([
      'ess', 'presence_gate', 'presence_schedules', 'presence_exits', 'presence_reports',
    ]));
    expect(ess.quick).toEqual([]);

    const finance = buildNavigation({ canOpen: allowFor('finance'), t });
    expect(ids(finance)).not.toContain('settings');
    expect(ids(finance)).not.toContain('users');
    expect(ids(finance)).toContain('wps_audit');
    expect(finance.total).toBe(15);

    // A manager never sees account administration, even though hr_manager does.
    expect(buildNavigation({ canOpen: allowFor('branch_manager'), t }).total).toBe(16);
  });

  it('filters by translated label, default label, id and alias', () => {
    const all = { canOpen: allowFor('admin'), t };
    expect(ids(buildNavigation({ ...all, query: 'EXTENDED_REPORTS' }))).toEqual(['extended_reports']);
    expect(ids(buildNavigation({ ...all, query: 'operational reports' }))).toEqual(['extended_reports']);
    expect(ids(buildNavigation({ ...all, query: '9-box' }))).toEqual(['talent_9box']);
    expect(buildNavigation({ ...all, query: 'wps' }).quick).toEqual([]);
    const translated: NavBuildOptions['t'] = (key, fallback) =>
      key === 'nav.dashboard' ? 'Main Dashboard' : fallback;
    expect(ids(buildNavigation({ canOpen: allowFor('admin'), t: translated, query: 'main dashboard' })))
      .toEqual(['dashboard']);
  });

  it('collapses by section translation key and resolves labels/sections', () => {
    const nav = buildNavigation({
      canOpen: allowFor('admin'), t,
      collapsed: { 'nav.sec.overview': true },
    });
    expect(nav.sections.find(section => section.id === 'overview')?.isCollapsed).toBe(true);
    expect(nav.sections.find(section => section.id === 'people')?.isCollapsed).toBe(false);
    expect(nav.labelFor('payroll')).toBe('مسير الرواتب (WPS)');
    expect(nav.labelFor('not_a_view')).toBe('');
    expect(nav.sectionOf('presence_gate')?.id).toBe('attendance');
    expect(nav.sectionOf('not_a_view')).toBeUndefined();
  });

  it('starts with every section closed and opens exactly one at a time', () => {
    const defaults = defaultCollapsedSections();
    expect(Object.keys(defaults)).toEqual(NAV_SECTIONS.map(s => s.titleKey));
    expect(Object.values(defaults).every(value => value === true)).toBe(true);

    const overview = openNavSection(defaults, 'nav.sec.overview');
    expect(overview['nav.sec.overview']).toBe(false);
    expect(Object.values(overview).filter(value => value === false)).toHaveLength(1);

    // Choosing another tab merges the previously open section back into the rail.
    const people = openNavSection(overview, 'nav.sec.people');
    expect(people['nav.sec.overview']).toBe(true);
    expect(people['nav.sec.people']).toBe(false);
    expect(Object.values(people).filter(value => value === false)).toHaveLength(1);
  });

  it('toggles the clicked section closed instead of leaving a gap', () => {
    const opened = openNavSection(defaultCollapsedSections(), 'nav.sec.payroll_finance');
    expect(toggleNavSection(opened, 'nav.sec.payroll_finance')['nav.sec.payroll_finance']).toBe(true);
    const other = toggleNavSection(opened, 'nav.sec.attendance');
    expect(other['nav.sec.payroll_finance']).toBe(true);
    expect(other['nav.sec.attendance']).toBe(false);
  });

  it('resolves a view to its section without building the navigation', () => {
    expect(navSectionTitleKeyFor('payroll')).toBe('nav.sec.payroll_finance');
    expect(navSectionTitleKeyFor('presence_gate')).toBe('nav.sec.attendance');
    expect(navSectionTitleKeyFor('missing')).toBeUndefined();
  });

  it('keeps shell hooks above the auth early returns', () => {
    const app = fs.readFileSync(path.join(process.cwd(), 'src/App.tsx'), 'utf8');
    const hook = app.indexOf('const lastViewRef = useRef');
    const earlyReturn = app.indexOf('if (isLoading)');
    expect(hook).toBeGreaterThan(-1);
    expect(earlyReturn).toBeGreaterThan(hook);
  });

  it('uses the brand ink for sidebar text in day and night mode', () => {
    const app = fs.readFileSync(path.join(process.cwd(), 'src/App.tsx'), 'utf8');
    const css = fs.readFileSync(path.join(process.cwd(), 'src/index.css'), 'utf8');
    const sidebar = app.slice(app.indexOf('<motion.aside'), app.indexOf('</motion.aside>'));

    expect(css).toContain('--color-brand-night: #dce8f5;');
    expect(sidebar).toContain('text-brand-600 dark:text-brand-night');
    //Logout stays semantic rose; no other nav text falls back to slate/navy.
    expect(sidebar).not.toMatch(/text-(slate|navy)-/);
  });

  it('keeps App.tsx on the single generated source', () => {
    const app = fs.readFileSync(path.join(process.cwd(), 'src/App.tsx'), 'utf8');
    expect(app).toContain('buildNavigation');
    expect(app).not.toContain('const navSections = [');
    expect(app).not.toContain('const quickAccess = [');
    expect(app).toContain('toggleNavSection');
    expect(app).not.toContain('[section.titleKey]: !prev[section.titleKey]');
  });
});
