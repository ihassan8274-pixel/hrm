// Route module. Registered from server/index.ts; the order there is the route order.
import db, { logAction, createNotification } from "../config/postgres";
import express from "express";
import { requireOrganizationScope, organizationScope, denyEmployee } from "../middleware/organizationScope";
import { scopeFilter } from "../lib/organization-scope";

export function registerHrModules(app: express.Express) {

  // Whole days from today until the given date, or null when there is no
  // date. Works for a date column, a timestamp or a plain YYYY-MM-DD string,
  // so it does not depend on the database dialect.
  //
  // A date column arrives as a Date at local midnight, so the calendar parts
  // are read in local time; both sides are then compared as UTC midnights.
  const daysUntil = (value: unknown): number | null => {
    if (value === null || value === undefined || value === '') return null;
    let year: number;
    let month: number;
    let day: number;
    if (value instanceof Date) {
      if (Number.isNaN(value.getTime())) return null;
      year = value.getFullYear();
      month = value.getMonth();
      day = value.getDate();
    } else {
      const parts = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value).trim());
      if (!parts) return null;
      year = Number(parts[1]);
      month = Number(parts[2]) - 1;
      day = Number(parts[3]);
    }
    const today = new Date();
    const startOfToday = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
    return Math.round((Date.UTC(year, month, day) - startOfToday) / 86_400_000);
  };

    // The fleet screen writes the expiry dates into the text columns
    // (istimara_expiry / periodic_inspection_expiry), while the importer and
    // the original schema use the date columns (registration_expiry /
    // inspection_expiry). Both are written from here on, and the read takes
    // whichever one carries a value — otherwise the days-to counters came back
    // empty for every vehicle the screen had saved.
    const pickExpiry = (...values: unknown[]): unknown => {
      for (const value of values) {
        if (value === null || value === undefined || value === '') continue;
        return value;
      }
      return null;
    };

    // PostgreSQL rejects an empty string on a date column, so a blank form
    // field is stored as NULL rather than aborting the whole request.
    const dateOrNull = (value: unknown): string | null => {
      const text = value === null || value === undefined ? '' : String(value).trim();
      return text === '' ? null : text;
    };

    // ==========================================
    // 7. MEDICAL INSURANCE & CCHI (التأمين الطبي والضمان الصحي)
    // ==========================================

  app.get('/api/medical/summary', async (req, res) => {
    const policies = await db.prepare('SELECT * FROM medical_policies ORDER BY coverage_end ASC').all();
    const dependentsCount = (await db.prepare('SELECT COUNT(*) as count FROM medical_dependents').get() as any).count;
    const insuredEmployeesCount = (await db.prepare("SELECT COUNT(*) as count FROM employees WHERE medical_insurance_policy IS NOT NULL AND medical_insurance_policy != ''").get() as any).count;
    const categoryStats = await db.prepare(`
      SELECT medical_insurance_category as category, COUNT(*) as count 
      FROM employees 
      WHERE medical_insurance_category IS NOT NULL
      GROUP BY medical_insurance_category
    `).all();
    const upcomingExpiringPolicies = await db.prepare(`
      SELECT * FROM medical_policies 
      WHERE coverage_end::date <= CURRENT_DATE + INTERVAL '60 days'
    `).all();
    const totalAnnualPremium = (await db.prepare("SELECT SUM(premium) as total FROM medical_policies WHERE status = 'active'").get() as any).total || 84500;
    res.json({
      policies,
      totalMembers: insuredEmployeesCount + dependentsCount,
      insuredEmployeesCount,
      dependentsCount,
      categoryStats,
      upcomingExpiringPolicies,
      totalAnnualPremium,
      monthlyAveragePremium: Math.round(totalAnnualPremium / 12)
    });
  });

  app.get('/api/medical/dependents', async (req, res) => {
    const dependents = await db.prepare(`
      SELECT md.*, e.name as employee_name, e.national_id_iqama as employee_national_id,
             d.name as department_name, e.insurance_company
      FROM medical_dependents md
      JOIN medical_policies mp ON md.policy_id = mp.id
      JOIN employees e ON mp.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      ORDER BY md.created_at DESC
    `).all();
    res.json(dependents);
  });

  app.post('/api/medical/dependents', async (req, res) => {
    const {
      employee_id, name, relationship, national_id_iqama, birth_date,
      gender, category, card_number, annual_premium = 2500
    } = req.body;
    const cardNum = card_number || `MED-${category || 'A'}-${Math.floor(1000 + Math.random() * 9000)}`;
    const info = await db.prepare(`
      INSERT INTO medical_dependents (
        employee_id, name, relationship, national_id_iqama, birth_date,
        gender, category, card_number, annual_premium, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
    `).run(
      employee_id, name, relationship, national_id_iqama, birth_date,
      gender, category, cardNum, annual_premium
    );
    await db.prepare(`
      UPDATE employees 
      SET medical_dependents_count = (SELECT COUNT(*) FROM medical_dependents WHERE employee_id = ? AND status = 'active')
      WHERE id = ?
    `).run(employee_id, employee_id);
    await db.prepare(`
      INSERT INTO insurance_endorsements (employee_id, type, endorsement_date, premium_adjustment, cchi_reference, status)
      VALUES (?, 'addition', CURRENT_DATE, ?, ?, 'processed')
    `).run(employee_id, annual_premium, `CCHI-ADD-${Math.floor(100000 + Math.random() * 900000)}`);
    await logAction('create', 'medical_dependent', Number(employee_id), `Added dependent ${name} to medical insurance`);
    await createNotification('إضافة تابع للتأمين الطبي', `تم تسجيل التابع ${name} ضمن وثيقة التأمين الطبي المعتمدة بنجاح`, 'success');
    res.json({ id: info.lastInsertRowid, card_number: cardNum });
  });

  app.delete('/api/medical/dependents/:id', async (req, res) => {
    const dep = await db.prepare('SELECT * FROM medical_dependents WHERE id = ?').get(req.params.id) as any;
    if (dep) {
      await db.prepare('DELETE FROM medical_dependents WHERE id = ?').run(req.params.id);
      await db.prepare(`
        UPDATE employees 
        SET medical_dependents_count = (SELECT COUNT(*) FROM medical_dependents WHERE employee_id = ? AND status = 'active')
        WHERE id = ?
      `).run(dep.employee_id, dep.employee_id);
      await db.prepare(`
        INSERT INTO insurance_endorsements (employee_id, type, endorsement_date, premium_adjustment, cchi_reference, status)
        VALUES (?, 'deletion', CURRENT_DATE, ?, ?, 'processed')
      `).run(dep.employee_id, -dep.annual_premium, `CCHI-DEL-${Math.floor(100000 + Math.random() * 900000)}`);
    }
    res.json({ success: true });
  });

  app.get('/api/medical/policies', async (req, res) => {
    const policies = await db.prepare('SELECT * FROM medical_policies ORDER BY coverage_start DESC').all();
    res.json(policies);
  });

  app.post('/api/medical/policies', async (req, res) => {
    const { policy_number, insurance_company, start_date, expiry_date, total_members, total_premium, cchi_approval_number } = req.body;
    const info = await db.prepare(`
      INSERT INTO medical_policies (policy_number, insurance_company, start_date, expiry_date, total_members, total_premium, cchi_approval_number, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'active')
    `).run(policy_number, insurance_company, start_date, expiry_date, total_members || 0, total_premium || 0, cchi_approval_number || `CCHI-${Math.floor(100000 + Math.random() * 900000)}`);
    res.json({ id: info.lastInsertRowid });
  });

  // ==========================================
  // 8b. INSURANCE CATALOG (شركات التأمين وفئات شبكة العلاج)
  // Admin-editable options behind the employee insurance fields. Employee
  // values are plain text by design, so a catalog rename is propagated to the
  // existing records and a used option cannot be deleted silently.
  // ==========================================

  const isUniqueViolation = (error: unknown) =>
    Boolean(error && typeof error === 'object' && (error as any).code === '23505');

  const cleanText = (value: unknown) => String(value ?? '').trim();

  app.get('/api/medical/insurance-companies', async (req, res) => {
    const rows = await db.prepare(`
      SELECT ic.id, ic.name, ic.is_active,
             (SELECT COUNT(*) FROM employees e WHERE e.insurance_company = ic.name) AS employee_count,
             (SELECT COUNT(*) FROM medical_policies mp WHERE mp.insurance_company = ic.name) AS policy_count
      FROM insurance_companies ic
      ORDER BY ic.id
    `).all();
    res.json((rows as any[]).map((row: any) => ({
      ...row,
      employee_count: Number(row.employee_count),
      policy_count: Number(row.policy_count)
    })));
  });

  app.post('/api/medical/insurance-companies', async (req, res) => {
    const name = cleanText(req.body?.name);
    if (!name) return res.status(400).json({ error: 'اسم شركة التأمين مطلوب' });
    try {
      const info = await db.prepare(
        'INSERT INTO insurance_companies (name, is_active) VALUES (?, ?)'
      ).run(name, req.body?.is_active === false ? false : true);
      await logAction('create', 'insurance_company', Number(info.lastInsertRowid), `Added insurance company: ${name}`);
      res.json({ id: info.lastInsertRowid, name });
    } catch (error) {
      if (isUniqueViolation(error)) return res.status(409).json({ error: 'شركة التأمين موجودة بالفعل' });
      throw error;
    }
  });

  app.put('/api/medical/insurance-companies/:id', async (req, res) => {
    const id = req.params.id;
    const name = cleanText(req.body?.name);
    if (!name) return res.status(400).json({ error: 'اسم شركة التأمين مطلوب' });
    const existing = await db.prepare('SELECT * FROM insurance_companies WHERE id = ?').get(id) as any;
    if (!existing) return res.status(404).json({ error: 'شركة التأمين غير موجودة' });
    try {
      await db.prepare('UPDATE insurance_companies SET name = ?, is_active = ? WHERE id = ?')
        .run(name, req.body?.is_active === false ? false : true, id);
      if (existing.name !== name) {
        // Keep assignments consistent: employee records and policy records
        // carry the company name as text, so rename them with the catalog.
        await db.prepare('UPDATE employees SET insurance_company = ? WHERE insurance_company = ?').run(name, existing.name);
        await db.prepare('UPDATE medical_policies SET insurance_company = ? WHERE insurance_company = ?').run(name, existing.name);
      }
      await logAction('update', 'insurance_company', Number(id), `Renamed insurance company to: ${name}`);
      res.json({ success: true });
    } catch (error) {
      if (isUniqueViolation(error)) return res.status(409).json({ error: 'شركة التأمين موجودة بالفعل' });
      throw error;
    }
  });

  app.delete('/api/medical/insurance-companies/:id', async (req, res) => {
    const id = req.params.id;
    const row = await db.prepare(`
      SELECT ic.name,
             (SELECT COUNT(*) FROM employees e WHERE e.insurance_company = ic.name) AS employee_count,
             (SELECT COUNT(*) FROM medical_policies mp WHERE mp.insurance_company = ic.name) AS policy_count
      FROM insurance_companies ic WHERE ic.id = ?
    `).get(id) as any;
    if (!row) return res.status(404).json({ error: 'شركة التأمين غير موجودة' });
    if (Number(row.employee_count) > 0 || Number(row.policy_count) > 0) {
      return res.status(409).json({
        error: `لا يمكن حذف شركة مستخدمة: ${row.employee_count} موظف، ${row.policy_count} وثيقة. يمكن إلغاء تفعيلها بدلاً من ذلك.`
      });
    }
    await db.prepare('DELETE FROM insurance_companies WHERE id = ?').run(id);
    await logAction('delete', 'insurance_company', Number(id), `Deleted insurance company: ${row.name}`);
    res.json({ success: true });
  });

  app.get('/api/medical/coverage-categories', async (req, res) => {
    const rows = await db.prepare(`
      SELECT cc.id, cc.code, cc.label_ar, cc.is_active,
             (SELECT COUNT(*) FROM employees e WHERE e.medical_insurance_category = cc.code) AS employee_count,
             (SELECT COUNT(*) FROM medical_policies mp WHERE mp.category = cc.code) AS policy_count
      FROM insurance_coverage_categories cc
      ORDER BY cc.id
    `).all();
    res.json((rows as any[]).map((row: any) => ({
      ...row,
      employee_count: Number(row.employee_count),
      policy_count: Number(row.policy_count)
    })));
  });

  app.post('/api/medical/coverage-categories', async (req, res) => {
    const code = cleanText(req.body?.code);
    const labelAr = cleanText(req.body?.label_ar);
    if (!code || !labelAr) return res.status(400).json({ error: 'الرمز والاسم العربي مطلوبان' });
    try {
      const info = await db.prepare(
        'INSERT INTO insurance_coverage_categories (code, label_ar, is_active) VALUES (?, ?, ?)'
      ).run(code, labelAr, req.body?.is_active === false ? false : true);
      await logAction('create', 'insurance_coverage_category', Number(info.lastInsertRowid), `Added coverage category: ${code}`);
      res.json({ id: info.lastInsertRowid, code });
    } catch (error) {
      if (isUniqueViolation(error)) return res.status(409).json({ error: 'رمز الفئة موجود بالفعل' });
      throw error;
    }
  });

  app.put('/api/medical/coverage-categories/:id', async (req, res) => {
    const id = req.params.id;
    const code = cleanText(req.body?.code);
    const labelAr = cleanText(req.body?.label_ar);
    if (!code || !labelAr) return res.status(400).json({ error: 'الرمز والاسم العربي مطلوبان' });
    const existing = await db.prepare('SELECT * FROM insurance_coverage_categories WHERE id = ?').get(id) as any;
    if (!existing) return res.status(404).json({ error: 'الفئة غير موجودة' });
    try {
      await db.prepare('UPDATE insurance_coverage_categories SET code = ?, label_ar = ?, is_active = ? WHERE id = ?')
        .run(code, labelAr, req.body?.is_active === false ? false : true, id);
      if (existing.code !== code) {
        await db.prepare('UPDATE employees SET medical_insurance_category = ? WHERE medical_insurance_category = ?').run(code, existing.code);
        await db.prepare('UPDATE medical_policies SET category = ? WHERE category = ?').run(code, existing.code);
      }
      await logAction('update', 'insurance_coverage_category', Number(id), `Updated coverage category to: ${code}`);
      res.json({ success: true });
    } catch (error) {
      if (isUniqueViolation(error)) return res.status(409).json({ error: 'رمز الفئة موجود بالفعل' });
      throw error;
    }
  });

  app.delete('/api/medical/coverage-categories/:id', async (req, res) => {
    const id = req.params.id;
    const row = await db.prepare(`
      SELECT cc.code,
             (SELECT COUNT(*) FROM employees e WHERE e.medical_insurance_category = cc.code) AS employee_count,
             (SELECT COUNT(*) FROM medical_policies mp WHERE mp.category = cc.code) AS policy_count
      FROM insurance_coverage_categories cc WHERE cc.id = ?
    `).get(id) as any;
    if (!row) return res.status(404).json({ error: 'الفئة غير موجودة' });
    if (Number(row.employee_count) > 0 || Number(row.policy_count) > 0) {
      return res.status(409).json({
        error: `لا يمكن حذف فئة مستخدمة: ${row.employee_count} موظف، ${row.policy_count} وثيقة. يمكن إلغاء تفعيلها بدلاً من ذلك.`
      });
    }
    await db.prepare('DELETE FROM insurance_coverage_categories WHERE id = ?').run(id);
    await logAction('delete', 'insurance_coverage_category', Number(id), `Deleted coverage category: ${row.code}`);
    res.json({ success: true });
  });

    // ==========================================
    // 9. 9-BOX TALENT MATRIX & SUCCESSION (مصفوفة المواهب والتعاقب)
    // ==========================================

  app.get('/api/talent/9box', async (req, res) => {
    const emps = await db.prepare(`
      SELECT e.id, e.name, e.position, e.job_title, e.nationality, e.is_saudi,
             d.name as department_name, b.name as branch_name,
             ta.id as assessment_id, ta.performance_score, ta.potential_score,
             ta.box as box_category, ta.strengths as key_strengths,
             ta.development_areas as development_needs,
             ta.readiness as readiness_timeline, ta.next_review_date,
             ta.assessment_date as assessed_at
      FROM employees e
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN branches b ON e.branch_id = b.id
      -- One row per employee: the latest assessment wins. Joining every
      -- assessment row duplicated employees in the grid and inflated boxCounts.
      LEFT JOIN talent_assessments ta ON ta.id = (
        SELECT t2.id FROM talent_assessments t2
        WHERE t2.employee_id = e.id
        ORDER BY COALESCE(CAST(t2.assessment_date AS TEXT), '') DESC, t2.id DESC
        LIMIT 1
      )
    `).all() as any[];
    const determineBox = (perf: number, pot: number): string => {
      if (perf === 3 && pot === 3) return 'star';
      if (perf === 2 && pot === 3) return 'high_potential';
      if (perf === 1 && pot === 3) return 'dilemma';
      if (perf === 3 && pot === 2) return 'high_performer';
      if (perf === 2 && pot === 2) return 'core_player';
      if (perf === 1 && pot === 2) return 'inconsistent';
      if (perf === 3 && pot === 1) return 'solid_performer';
      if (perf === 2 && pot === 1) return 'effective';
      return 'underperformer';
    };
    const categorized = emps.map(emp => {
      const perf = emp.performance_score || 2;
      const pot = emp.potential_score || 2;
      const category = emp.box_category || determineBox(perf, pot);
      return {
        ...emp,
        performance_score: perf,
        potential_score: pot,
        box_category: category,
        readiness_timeline: emp.readiness_timeline || 'ready_1_year'
      };
    });
    const boxCounts: Record<string, number> = {};
    categorized.forEach(e => {
      boxCounts[e.box_category] = (boxCounts[e.box_category] || 0) + 1;
    });
    res.json({
      employees: categorized,
      boxCounts,
      totalAssessed: categorized.length,
      highTalentRatio: Math.round(((boxCounts['star'] || 0) + (boxCounts['high_potential'] || 0) + (boxCounts['high_performer'] || 0)) / (categorized.length || 1) * 100)
    });
  });

  app.post('/api/talent/assessments', async (req, res) => {
    const {
      employee_id, performance_score, potential_score, key_strengths,
      development_needs, readiness_timeline, assessed_by = 'لجنة الموارد البشرية'
    } = req.body || {};
    const determineBox = (perf: number, pot: number): string => {
      if (perf === 3 && pot === 3) return 'star';
      if (perf === 2 && pot === 3) return 'high_potential';
      if (perf === 1 && pot === 3) return 'dilemma';
      if (perf === 3 && pot === 2) return 'high_performer';
      if (perf === 2 && pot === 2) return 'core_player';
      if (perf === 1 && pot === 2) return 'inconsistent';
      if (perf === 3 && pot === 1) return 'solid_performer';
      if (perf === 2 && pot === 1) return 'effective';
      return 'underperformer';
    };
    const employeeId = Number(employee_id);
    if (!Number.isFinite(employeeId) || employeeId <= 0) {
      return res.status(400).json({ error: 'employee_id is required' });
    }
    // The scores are 1-5. Anything unusable falls back to the middle of the
    // scale so a bad payload cannot park somebody in the bottom box.
    const clampScore = (value: unknown): number => {
      const score = Number(value);
      if (!Number.isFinite(score)) return 2;
      return Math.min(5, Math.max(1, Math.round(score)));
    };
    const perf = clampScore(performance_score);
    const pot = clampScore(potential_score);
    const boxCategory = determineBox(perf, pot);

    // The readiness timeline the screen collects. The table has a column for
    // it now, so the value is stored instead of being dropped on the floor.
    const READINESS_VALUES = ['ready_now', 'ready_1_year', 'ready_2_years', 'future_talent'];
    const readiness = READINESS_VALUES.includes(String(readiness_timeline))
      ? String(readiness_timeline)
      : 'ready_1_year';

    const today = new Date();
    const isoDate = (value: Date): string =>
      `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
    // The next review follows the readiness: ready now -> a quarter, ready in
    // a year -> a year, and so on. The day of the month is clamped so a review
    // never rolls into the following month.
    const REVIEW_MONTHS: Record<string, number> = {
      ready_now: 3,
      ready_1_year: 12,
      ready_2_years: 24,
      future_talent: 36,
    };
    const year = today.getFullYear();
    const month = today.getMonth() + REVIEW_MONTHS[readiness];
    const day = Math.min(today.getDate(), new Date(year, month + 1, 0).getDate());
    const nextReview = isoDate(new Date(year, month, day));

    // The columns are the ones the table actually has: box / strengths /
    // development_areas / readiness / next_review_date / assessment_date. The
    // API field names (box_category, key_strengths, …) are aliases on the
    // read side.
    await db.prepare(`
      INSERT INTO talent_assessments (
        employee_id, assessor_id, assessment_date, performance_score,
        potential_score, box, strengths, development_areas, readiness,
        next_review_date
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      employeeId,
      (req as any).user?.employee_id ?? null,
      isoDate(today),
      perf,
      pot,
      boxCategory,
      key_strengths ?? '',
      development_needs ?? '',
      readiness,
      nextReview
    );
    await logAction('update', 'talent_assessment', employeeId, `Assessed talent as ${boxCategory} (${readiness}) by ${assessed_by}`);
    res.json({ success: true, box_category: boxCategory, readiness_timeline: readiness, next_review_date: nextReview });
  });

  app.get('/api/talent/succession', async (req, res) => {
    const plans = await db.prepare(`
      SELECT sp.*, d.name as department_name,
             cur.name as current_holder_name, cur.position as current_holder_position,
             p1.name as primary_successor_name, p1.position as primary_successor_position,
             p1.is_saudi as primary_successor_is_saudi,
             p2.name as secondary_successor_name, p2.position as secondary_successor_position
      FROM succession_plans sp
      LEFT JOIN departments d ON sp.department_id = d.id
      LEFT JOIN employees cur ON sp.current_holder_id = cur.id
      LEFT JOIN employees p1 ON sp.primary_successor_id = p1.id
      LEFT JOIN employees p2 ON sp.secondary_successor_id = p2.id
      ORDER BY sp.risk_level DESC
    `).all();
    res.json(plans);
  });

  app.post('/api/talent/succession', async (req, res) => {
    const {
      critical_role_title, department_id, current_holder_id, risk_level,
      primary_successor_id, secondary_successor_id, readiness_status,
      development_action_plan, is_saudization_target = 1
    } = req.body;
    const info = await db.prepare(`
      INSERT INTO succession_plans (
        critical_role_title, department_id, current_holder_id, risk_level,
        primary_successor_id, secondary_successor_id, readiness_status,
        development_action_plan, is_saudization_target
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      critical_role_title, department_id, current_holder_id, risk_level,
      primary_successor_id, secondary_successor_id, readiness_status,
      development_action_plan, is_saudization_target
    );
    res.json({ id: info.lastInsertRowid });
  });

  app.put('/api/talent/succession/:id', async (req, res) => {
    const {
      critical_role_title, department_id, current_holder_id, risk_level,
      primary_successor_id, secondary_successor_id, readiness_status,
      development_action_plan, is_saudization_target
    } = req.body;
    await db.prepare(`
      UPDATE succession_plans SET
        critical_role_title = ?, department_id = ?, current_holder_id = ?,
        risk_level = ?, primary_successor_id = ?, secondary_successor_id = ?,
        readiness_status = ?, development_action_plan = ?, is_saudization_target = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      critical_role_title, department_id, current_holder_id, risk_level,
      primary_successor_id, secondary_successor_id, readiness_status,
      development_action_plan, is_saudization_target, req.params.id
    );
    res.json({ success: true });
  });

  app.delete('/api/talent/succession/:id', async (req, res) => {
    await db.prepare('DELETE FROM succession_plans WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  });

    // ==========================================
    // 10. FLEET & CUSTODY VEHICLES (إدارة أسطول السيارات والمخالفات)
    // ==========================================

  app.get('/api/fleet/vehicles', async (req, res) => {
    // The remaining days are computed here rather than in SQL: julianday() is a
    // SQLite function, and the same statement has to run on PostgreSQL, where
    // the expiry columns are dates rather than text.
    const vehicles = (await db.prepare(`
      SELECT fv.*, e.name as assigned_employee_name, e.position as employee_position,
             d.name as department_name, e.national_id_iqama as employee_national_id
      FROM fleet_vehicles fv
      LEFT JOIN employees e ON fv.assigned_employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      ORDER BY fv.created_at DESC
    `).all() as any[]).map((vehicle) => ({
      ...vehicle,
      days_to_istimara: daysUntil(pickExpiry(vehicle.istimara_expiry, vehicle.registration_expiry)),
      days_to_insurance: daysUntil(pickExpiry(vehicle.insurance_expiry)),
      days_to_mvpi: daysUntil(pickExpiry(vehicle.periodic_inspection_expiry, vehicle.inspection_expiry)),
    }));
    res.json(vehicles);
  });

  app.post('/api/fleet/vehicles', async (req, res) => {
    const {
      plate_number, make_model, year, vin_number, assigned_employee_id,
      assignment_date, istimara_expiry, insurance_expiry, periodic_inspection_expiry,
      status = 'assigned', current_odometer = 0, fuel_card_number
    } = req.body;
    const info = await db.prepare(`
      INSERT INTO fleet_vehicles (
        plate_number, make_model, year, vin_number, assigned_employee_id,
        assignment_date, istimara_expiry, insurance_expiry, periodic_inspection_expiry,
        registration_expiry, inspection_expiry,
        status, current_odometer, fuel_card_number
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      plate_number, make_model, year, vin_number, assigned_employee_id || null,
      assignment_date || null,
      dateOrNull(istimara_expiry), dateOrNull(insurance_expiry), dateOrNull(periodic_inspection_expiry),
      dateOrNull(istimara_expiry), dateOrNull(periodic_inspection_expiry),
      status, current_odometer, fuel_card_number
    );
    await logAction('create', 'fleet_vehicle', Number(info.lastInsertRowid), `Added vehicle ${plate_number}`);
    res.json({ id: info.lastInsertRowid });
  });

  app.put('/api/fleet/vehicles/:id', async (req, res) => {
    const {
      plate_number, make_model, year, vin_number, assigned_employee_id,
      assignment_date, istimara_expiry, insurance_expiry, periodic_inspection_expiry,
      status, current_odometer, fuel_card_number
    } = req.body;
    await db.prepare(`
      UPDATE fleet_vehicles SET
        plate_number = ?, make_model = ?, year = ?, vin_number = ?,
        assigned_employee_id = ?, assignment_date = ?,
        istimara_expiry = ?, insurance_expiry = ?, periodic_inspection_expiry = ?,
        registration_expiry = ?, inspection_expiry = ?,
        status = ?, current_odometer = ?, fuel_card_number = ?
      WHERE id = ?
    `).run(
      plate_number, make_model, year, vin_number, assigned_employee_id || null,
      assignment_date || null,
      dateOrNull(istimara_expiry), dateOrNull(insurance_expiry), dateOrNull(periodic_inspection_expiry),
      dateOrNull(istimara_expiry), dateOrNull(periodic_inspection_expiry),
      status, current_odometer, fuel_card_number, req.params.id
    );
    res.json({ success: true });
  });

  app.delete('/api/fleet/vehicles/:id', async (req, res) => {
    await db.prepare('DELETE FROM fleet_vehicles WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  });

  app.get('/api/fleet/traffic-fines', async (req, res) => {
    const fines = await db.prepare(`
      SELECT tf.*, fv.plate_number, fv.brand || ' ' || fv.model as make_model,
             e.name as employee_name, e.national_id_iqama as employee_national_id,
             d.name as department_name
      FROM traffic_fines tf
      JOIN fleet_vehicles fv ON tf.vehicle_id = fv.id
      JOIN employees e ON tf.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      ORDER BY tf.fine_date DESC
    `).all();
    res.json(fines);
  });

  app.post('/api/fleet/traffic-fines', async (req, res) => {
    const { vehicle_id, employee_id, fine_number, violation_type, amount, fine_date } = req.body;
    const fNum = fine_number || `FINE-${Math.floor(10000000 + Math.random() * 90000000)}`;
    const info = await db.prepare(`
      INSERT INTO traffic_fines (vehicle_id, employee_id, fine_number, violation_type, amount, fine_date, status)
      VALUES (?, ?, ?, ?, ?, ?, 'pending')
    `).run(vehicle_id, employee_id, fNum, violation_type, amount, fine_date || new Date().toISOString().split('T')[0]);
    await createNotification('مخالفة مرورية جديدة على عهدة مركبة', `تم رصد مخالفة مرورية (${violation_type}) بقيمة ${amount} ر.س برقم ${fNum}`, 'warning');
    res.json({ id: info.lastInsertRowid, fine_number: fNum });
  });

  app.post('/api/fleet/traffic-fines/:id/deduct', async (req, res) => {
    const fine = await db.prepare('SELECT * FROM traffic_fines WHERE id = ?').get(req.params.id) as any;
    if (!fine) return res.status(404).json({ error: 'المخالفة غير موجودة' });
    const currentMonth = new Date().getMonth() + 1;
    const currentYear = new Date().getFullYear();
    await db.prepare(`
      UPDATE traffic_fines 
      SET deducted_from_payroll = 1, status = 'deducted',
          payroll_month = ?, payroll_year = ?
      WHERE id = ?
    `).run(currentMonth, currentYear, req.params.id);
    await db.prepare(`
      INSERT INTO bonuses_penalties (employee_id, type, amount, reason, month, year)
      VALUES (?, 'penalty', ?, ?, ?, ?)
    `).run(
      fine.employee_id, fine.amount,
      `استقطاع قيمة مخالفة مرورية مسجلة برقم ${fine.fine_number} (${fine.violation_type})`,
      currentMonth, currentYear
    );
    await logAction('update', 'traffic_fine', fine.id, `Deducted fine ${fine.fine_number} from employee ${fine.employee_id}`);
    await createNotification('استقطاع مخالفة مرورية من المسير', `تم ترحيل استقطاع المخالفة بقيمة ${fine.amount} ر.س لمسير شهر ${currentMonth}/${currentYear}`, 'success');
    res.json({ success: true });
  });

    // ==========================================
    // 11. FLEXIBLE WORK & TELEWORK (العمل المرن والعمل عن بعد)
    // ==========================================

  app.get('/api/flexible/shifts', async (req, res) => {
    const shifts = await db.prepare(`
      SELECT fws.*, e.name as employee_name, e.position, e.is_saudi,
             d.name as department_name
      FROM flexible_work_shifts fws
      JOIN employees e ON fws.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      ORDER BY fws.date DESC
    `).all();
    const totalHours = (await db.prepare('SELECT SUM(hours_worked) as total FROM flexible_work_shifts WHERE supervisor_approved = 1').get() as any).total || 0;
    const totalPaid = (await db.prepare('SELECT SUM(total_pay) as total FROM flexible_work_shifts WHERE supervisor_approved = 1').get() as any).total || 0;
    const saudiFlexHours = (await db.prepare(`
      SELECT SUM(fws.hours_worked) as total 
      FROM flexible_work_shifts fws 
      JOIN employees e ON fws.employee_id = e.id 
      WHERE e.is_saudi = 1 AND fws.supervisor_approved = 1
    `).get() as any).total || 0;
    const nitaqatUnitsGained = Number((saudiFlexHours / 168 * 0.33).toFixed(2));
    res.json({
      shifts,
      totalHours,
      totalPaid,
      saudiFlexHours,
      nitaqatUnitsGained
    });
  });

  app.post('/api/flexible/shifts', async (req, res) => {
    const { employee_id, date, hours_worked, hourly_rate, notes, qiwa_contract_ref } = req.body;
    const totalPay = Number(hours_worked) * Number(hourly_rate);
    const contractRef = qiwa_contract_ref || `QW-FLX-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const info = await db.prepare(`
      INSERT INTO flexible_work_shifts (
        employee_id, date, hours_worked, hourly_rate, total_pay,
        mowaamah_hours_accumulated, qiwa_contract_ref, supervisor_approved, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
    `).run(
      employee_id, date || new Date().toISOString().split('T')[0],
      hours_worked, hourly_rate, totalPay, hours_worked, contractRef, notes
    );
    await logAction('create', 'flexible_shift', Number(employee_id), `Logged ${hours_worked} flexible hours`);
    res.json({ id: info.lastInsertRowid, total_pay: totalPay });
  });

  app.get('/api/telework/permits', async (req, res) => {
    const permits = await db.prepare(`
      SELECT tp.*, e.name as employee_name, e.position, e.job_title,
             e.is_saudi, d.name as department_name
      FROM telework_permits tp
      JOIN employees e ON tp.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      ORDER BY tp.created_at DESC
    `).all();
    res.json(permits);
  });

  app.post('/api/telework/permits', async (req, res) => {
    const {
      employee_id, permit_type = 'hybrid', remote_days_per_week = 2,
      contract_start, contract_end, telework_platform_registered = 1,
      productivity_score = 95
    } = req.body;
    const info = await db.prepare(`
      INSERT INTO telework_permits (
        employee_id, permit_type, remote_days_per_week, contract_start, contract_end,
        telework_platform_registered, productivity_score, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active')
    `).run(
      employee_id, permit_type, remote_days_per_week,
      contract_start || new Date().toISOString().split('T')[0],
      contract_end || '2026-12-31', telework_platform_registered, productivity_score
    );
    await logAction('create', 'telework_permit', Number(employee_id), `Issued ${permit_type} telework permit`);
    res.json({ id: info.lastInsertRowid });
  });

  app.put('/api/telework/permits/:id', async (req, res) => {
    const { permit_type, remote_days_per_week, contract_start, contract_end, telework_platform_registered, productivity_score, status } = req.body;
    await db.prepare(`
      UPDATE telework_permits SET
        permit_type = ?, remote_days_per_week = ?, contract_start = ?,
        contract_end = ?, telework_platform_registered = ?, productivity_score = ?, status = ?
      WHERE id = ?
    `).run(
      permit_type, remote_days_per_week, contract_start,
      contract_end, telework_platform_registered, productivity_score, status,
      req.params.id
    );
    res.json({ success: true });
  });

    // GET EWA eligibility for an employee

  app.get("/api/ewa/eligibility/:empId", async (req, res) => {
    const emp = await db.prepare(`
      SELECT id, name, basic_salary, housing_allowance, transport_allowance, other_allowances, saudi_iban
      FROM employees WHERE id = ?
    `).get(req.params.empId) as any;
    if (!emp) return res.status(404).json({ error: "الموظف غير موجود" });
    const totalSalary = (emp.basic_salary || 0) + (emp.housing_allowance || 0) + (emp.transport_allowance || 0) + (emp.other_allowances || 0);
    const now = new Date();
    const currentDay = now.getDate(); // e.g. 25
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate(); // 30 or 31
    const daysWorked = Math.min(currentDay, daysInMonth);
    const earnedSoFar = Math.round((totalSalary / daysInMonth) * daysWorked);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const withdrawnSum = await db.prepare(`
      SELECT SUM(requested_amount) as total FROM ewa_withdrawals
      WHERE employee_id = ? AND request_date >= ? AND status != 'rejected'
    `).get(emp.id, startOfMonth) as any;
    const alreadyWithdrawn = withdrawnSum?.total || 0;
    const maxLimitAllowed = Math.round(earnedSoFar * 0.5); // 50% policy
    const availableLimit = Math.max(0, maxLimitAllowed - alreadyWithdrawn);
    res.json({
      employee_id: emp.id,
      employee_name: emp.name,
      total_monthly_salary: totalSalary,
      days_in_month: daysInMonth,
      days_worked_so_far: daysWorked,
      earned_so_far: earnedSoFar,
      already_withdrawn: alreadyWithdrawn,
      available_limit: availableLimit,
      max_withdrawal_percentage: 50,
      can_withdraw: availableLimit >= 100,
      iban: emp.saudi_iban
    });
  });

    // GET all EWA withdrawals

  app.get("/api/ewa/withdrawals", async (req, res) => {
    const rows = await db.prepare(`
      SELECT ew.*, e.name as employee_name, d.name as department_name, e.saudi_iban as iban
      FROM ewa_withdrawals ew
      JOIN employees e ON ew.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      ORDER BY ew.id DESC
    `).all();
    res.json(rows);
  });

    // POST new EWA withdrawal request

  app.post("/api/ewa/withdrawals", async (req, res) => {
    const { employee_id, requested_amount, disbursement_method } = req.body;
    if (!employee_id || !requested_amount) {
      return res.status(400).json({ error: "بيانات السحب غير مكتملة" });
    }
    const emp = await db.prepare("SELECT * FROM employees WHERE id = ?").get(employee_id) as any;
    if (!emp) return res.status(404).json({ error: "الموظف غير موجود" });
    const totalSalary = (emp.basic_salary || 0) + (emp.housing_allowance || 0) + (emp.transport_allowance || 0) + (emp.other_allowances || 0);
    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const daysWorked = Math.min(now.getDate(), daysInMonth);
    const earnedSoFar = Math.round((totalSalary / daysInMonth) * daysWorked);
    const fee = 15; // Standard 15 SAR processing fee
    const netDisbursed = requested_amount - fee;
    const requestDate = now.toISOString().split('T')[0];
    const result = await db.prepare(`
      INSERT INTO ewa_withdrawals (employee_id, request_date, earned_salary_so_far, requested_amount, fee, net_disbursed, status, disbursement_method)
      VALUES (?, ?, ?, ?, ?, ?, 'paid', ?)
    `).run(employee_id, requestDate, earnedSoFar, requested_amount, fee, netDisbursed, disbursement_method || 'instant_iban');
    await db.prepare(`
      INSERT INTO audit_logs (action, entity_type, entity_id, details, created_by)
      VALUES (?, 'ewa_withdrawal', ?, ?, 'EWA_System')
    `).run("EWA_INSTANT_PAYOUT", result.lastInsertRowid, `سحب مبكر للراتب بمبلغ ${requested_amount} ر.س للموظف ${emp.name}`);
    res.json({ success: true, id: result.lastInsertRowid, net_disbursed: netDisbursed });
  });

    // ====================================================
    // API: Smart Assets & QR Handover (الأصول والعهد الذكية وإبراء الذمة)
    // ====================================================

  app.get("/api/smart-assets", async (req, res) => {
    try {
      const rows = await db.prepare(`
        SELECT a.*, e.name as assigned_employee_name, d.name as assigned_department
        FROM smart_assets a
        LEFT JOIN employees e ON a.current_assigned_to = e.id
        LEFT JOIN departments d ON e.department_id = d.id
        ORDER BY a.created_at DESC
      `).all();
      res.json(rows);
    } catch (e) {
      res.status(500).json({ error: "فشل استرجاع الأصول والعهد" });
    }
  });

  app.post("/api/smart-assets", async (req, res) => {
    try {
      const { name, category, brand_model, serial_number, purchase_date, purchase_value, current_assigned_to, condition } = req.body;
      const count = (await db.prepare("SELECT COUNT(*) as c FROM smart_assets").get() as any).c + 1;
      const code = `AST-${(category || 'GEN').toUpperCase().slice(0, 2)}-${count.toString().padStart(3, '0')}`;
      const qr = `QR-${code}-${Date.now().toString().slice(-4)}`;
      const status = current_assigned_to ? 'assigned' : 'in_stock';
      const assignedDate = current_assigned_to ? new Date().toISOString().split('T')[0] : null;
      const result = await db.prepare(`
        INSERT INTO smart_assets (asset_code, name, category, brand_model, serial_number, purchase_date, purchase_value, current_assigned_to, assigned_date, handover_qr_code, condition, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(code, name, category || 'laptop', brand_model, serial_number, purchase_date || new Date().toISOString().split('T')[0], purchase_value || 0, current_assigned_to || null, assignedDate, qr, condition || 'good', status);
      res.json({ id: result.lastInsertRowid, asset_code: code, success: true });
    } catch (e) {
      res.status(500).json({ error: "فشل إضافة العهدة والأصل" });
    }
  });

  app.put("/api/smart-assets/:id/assign", async (req, res) => {
    try {
      const { current_assigned_to, status, condition } = req.body;
      const assignedDate = current_assigned_to ? new Date().toISOString().split('T')[0] : null;
      await db.prepare(`
        UPDATE smart_assets 
        SET current_assigned_to = ?, status = ?, condition = COALESCE(?, condition), assigned_date = ?
        WHERE id = ?
      `).run(current_assigned_to || null, status || (current_assigned_to ? 'assigned' : 'in_stock'), condition, assignedDate, req.params.id);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: "فشل تحديث تسليم العهدة" });
    }
  });

  // ---------------------------------------------------------------------------
  // Training & development: the missing link between appraisal and promotion.
  // A recommendation is a record, completion is a record, and a promotion may
  // only cite both. Nothing here is a free-text note that can be lost.
  // ---------------------------------------------------------------------------

  app.get("/api/training/courses", requireOrganizationScope, async (_req, res) => {
    try {
      const rows = await db.prepare(`
        SELECT c.*, (SELECT COUNT(*) FROM training_enrollments e WHERE e.course_id = c.id) AS enrollment_count
        FROM training_courses c ORDER BY c.id DESC
      `).all();
      res.json(rows);
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });

  app.post("/api/training/courses", requireOrganizationScope, async (req, res) => {
    try {
      const { title, description, category, duration_hours, target_position, status } = req.body || {};
      if (!title || !String(title).trim()) return res.status(400).json({ error: "عنوان الدورة مطلوب" });
      const info = await db.prepare(`
        INSERT INTO training_courses (title, description, category, duration_hours, target_position, status, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(String(title).trim(), description || null, category || null, Number(duration_hours) || 0,
        target_position || null, status || 'active', (req as any).user?.username || 'system');
      await logAction('create', 'training_course', Number(info.lastInsertRowid), `دورة تدريبية: ${title}`);
      res.json({ id: Number(info.lastInsertRowid), success: true });
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });

  app.get("/api/training/enrollments", requireOrganizationScope, async (req, res) => {
    try {
      const scope = organizationScope(res);
      const employeeId = req.query.employee_id;
      const status = req.query.status;
      const rows = await db.prepare(`
        SELECT t.*, e.name AS employee_name, e.position, c.title AS course_title, c.target_position,
               a.rating AS appraisal_rating, a.period AS appraisal_period
        FROM training_enrollments t
        JOIN employees e ON t.employee_id = e.id
        LEFT JOIN training_courses c ON t.course_id = c.id
        LEFT JOIN appraisals a ON t.appraisal_id = a.id
        WHERE (? IS NULL OR t.employee_id = ?) AND (? IS NULL OR t.status = ?)
          AND (? IS NULL OR e.entity_id = ?) AND (? IS NULL OR e.branch_id = ?) AND (? IS NULL OR e.id = ?)
        ORDER BY t.id DESC
      `).all(employeeId || null, employeeId || null, status || null, status || null, ...scopeFilter(scope));
      res.json(rows);
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });

  app.post("/api/training/enrollments", requireOrganizationScope, async (req, res) => {
    try {
      const { employee_id, course_id, appraisal_id, source } = req.body || {};
      if (!employee_id) return res.status(400).json({ error: "الموظف مطلوب" });
      const scope = organizationScope(res);
      if (await denyEmployee(res, scope, Number(employee_id))) return;
      if (course_id) {
        const course = await db.prepare("SELECT id FROM training_courses WHERE id = ? AND status = 'active'").get(course_id);
        if (!course) return res.status(404).json({ error: "الدورة غير موجودة أو غير نشطة" });
      }
      const info = await db.prepare(`
        INSERT INTO training_enrollments (employee_id, course_id, appraisal_id, source, status, created_by)
        VALUES (?, ?, ?, ?, 'recommended', ?)
      `).run(employee_id, course_id || null, appraisal_id || null, source || 'manual', (req as any).user?.username || 'system');
      await logAction('create', 'training_enrollment', Number(info.lastInsertRowid), `تسجيل تدريبي للموظف ${employee_id}`);
      res.json({ id: Number(info.lastInsertRowid), success: true });
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });

  app.post("/api/training/enrollments/:id/complete", requireOrganizationScope, async (req, res) => {
    try {
      const { score, certificate_number, completed_at } = req.body || {};
      const enrollment = await db.prepare(`
        SELECT t.*, e.entity_id, e.branch_id FROM training_enrollments t
        JOIN employees e ON t.employee_id = e.id WHERE t.id = ?
      `).get(req.params.id) as any;
      if (!enrollment) return res.status(404).json({ error: "التسجيل غير موجود" });
      const scope = organizationScope(res);
      if (await denyEmployee(res, scope, Number(enrollment.employee_id))) return;
      const certificate = String(certificate_number || '').trim();
      if (!certificate) return res.status(400).json({ error: "رقم الشهادة مطلوب — لا يُكمل تدريب بلا شهادة موثقة" });
      await db.prepare(`
        UPDATE training_enrollments
        SET status = 'completed', score = ?, completed_at = ?, certificate_number = ?
        WHERE id = ?
      `).run(score == null ? null : Number(score), completed_at || new Date().toISOString().split('T')[0], certificate, req.params.id);
      await logAction('update', 'training_enrollment', Number(req.params.id), `إكمال تدريب بشهادة ${certificate}`);
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });

  // Low appraisals create real enrollments, not a reminder the operator can ignore.
  app.post("/api/training/recommend-from-appraisal", requireOrganizationScope, async (req, res) => {
    try {
      const scope = organizationScope(res);
      const { threshold, course_id } = req.body || {};
      const limit = Number.isFinite(Number(threshold)) ? Number(threshold) : 3;
      const courses = await db.prepare("SELECT id, target_position FROM training_courses WHERE status = 'active'").all() as any[];
      const appraisals = await db.prepare(`
        SELECT a.*, e.name AS employee_name, e.position, e.entity_id, e.branch_id
        FROM appraisals a JOIN employees e ON a.employee_id = e.id
        WHERE a.rating < ?
          AND (? IS NULL OR e.entity_id = ?) AND (? IS NULL OR e.branch_id = ?) AND (? IS NULL OR e.id = ?)
      `).all(limit, ...scopeFilter(scope)) as any[];
      const created: any[] = [];
      for (const a of appraisals) {
        if (await denyEmployee(res, scope, Number(a.employee_id))) return;
        const existing = await db.prepare(`
          SELECT id FROM training_enrollments WHERE employee_id = ? AND appraisal_id = ? AND status IN ('recommended','enrolled','completed')
        `).get(a.employee_id, a.id);
        if (existing) continue;
        const course = course_id
          ? courses.find((c) => Number(c.id) === Number(course_id))
          : courses.find((c) => a.position && c.target_position === a.position) || courses[0];
        const info = await db.prepare(`
          INSERT INTO training_enrollments (employee_id, course_id, appraisal_id, source, status, created_by)
          VALUES (?, ?, ?, 'appraisal', 'recommended', ?)
        `).run(a.employee_id, course?.id || null, a.id, (req as any).user?.username || 'system');
        created.push({ id: Number(info.lastInsertRowid), employee_id: a.employee_id, employee_name: a.employee_name, rating: a.rating });
      }
      await logAction('create', 'training_enrollment', null, `توليد ${created.length} توصية تدريب من تقييمات الأداء`);
      res.json({ created: created.length, enrollments: created });
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });

}
