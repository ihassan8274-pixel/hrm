import { z } from "zod";

// ============================================
// COMMON REUSABLE SCHEMAS
// ============================================

export const idParam = z.object({
  id: z.string().regex(/^\d+$/, "ID must be numeric"),
});

export const paginationQuery = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export const monthYearQuery = z.object({
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2000).max(2100),
});

// ============================================
// AUTH SCHEMAS
// ============================================

export const loginSchema = z.object({
  username: z.string().min(1, "Username required"),
  password: z.string().min(1, "Password required"),
});

export const registerSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: z.enum(["admin", "hr_manager", "finance", "branch_manager", "employee_ess"]),
  entity_id: z.coerce.number().int().positive().optional(),
  employee_id: z.coerce.number().int().positive().optional(),
  email: z.string().optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password required"),
  newPassword: z.string().min(8, "New password must be at least 8 characters"),
});

/**
 * Public registration request. It deliberately does NOT carry a role: the
 * requester can never choose their own privileges. An administrator picks the
 * role when the request is approved.
 */
export const signupRequestSchema = z.object({
  full_name: z.string().trim().min(2, "الاسم مطلوب").max(120),
  email: z.string().trim().email("البريد الإلكتروني غير صالح").max(200),
  phone: z.string().trim().regex(/^(?:\+966|00966|0)?5\d{8}$/, "رقم الجوال السعودي غير صالح"),
  username: z.string().trim().min(3, "اسم المستخدم 3 أحرف على الأقل").max(40)
    .regex(/^[A-Za-z0-9._@-]+$/, "اسم المستخدم يحتوي على حروف لاتينية وأرقام و . _ @ - فقط"),
  password: z.string().min(8, "كلمة المرور 8 أحرف على الأقل").max(128),
});

/**
 * Public password-recovery request. Only the two identifiers the account owner
 * is expected to know travel over the wire. No privilege, status or new secret
 * can be supplied here; the server resolves the account and an administrator
 * decides what happens next.
 */
export const passwordResetRequestSchema = z.object({
  username: z.string().trim().min(3, "اسم المستخدم 3 أحرف على الأقل").max(40)
    .regex(/^[A-Za-z0-9._@-]+$/, "اسم المستخدم يحتوي على حروف لاتينية وأرقام و . _ @ - فقط"),
  email: z.string().trim().email("البريد الإلكتروني غير صالح").max(200),
});

// ============================================
// EMPLOYEE SCHEMAS
// ============================================

export const employeeCreateSchema = z.object({
  branch_id: z.coerce.number().int().positive(),
  department_id: z.coerce.number().int().positive().optional(),
  name: z.string().min(2, "Name must be at least 2 characters"),
  position: z.string().min(1, "Position required"),
  job_title: z.string().optional(),
  basic_salary: z.coerce.number().nonnegative().default(0),
  deductions: z.coerce.number().nonnegative().default(0),
  allowances_list: z.array(z.object({
    type_id: z.coerce.number().int().positive(),
    amount: z.coerce.number().nonnegative(),
  })).optional(),
  insurance_number: z.string().optional(),
  bank_account: z.string().optional(),
  nationality: z.string().default("سعودي"),
  is_saudi: z.coerce.number().int().min(0).max(1).default(1),
  national_id_iqama: z.string().optional(),
  border_number: z.string().optional(),
  iqama_expiry_gregorian: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  iqama_expiry_hijri: z.string().optional(),
  iqama_profession: z.string().optional(),
  work_permit_number: z.string().optional(),
  work_permit_expiry: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  work_permit_fee: z.coerce.number().nonnegative().default(9600),
  housing_allowance: z.coerce.number().nonnegative().default(0),
  transport_allowance: z.coerce.number().nonnegative().default(0),
  other_allowances: z.coerce.number().nonnegative().default(0),
  payment_method: z.enum(["cash", "bank", "split"]).default("bank"),
  cash_percentage: z.coerce.number().min(0).max(100).default(0),
  contract_type: z.enum(["fixed", "indefinite"]).default("fixed"),
  contract_start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  contract_end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const employeeUpdateSchema = z.object({
  branch_id: z.coerce.number().int().positive().optional(),
  department_id: z.coerce.number().int().positive().optional(),
  name: z.string().min(2).optional(),
  position: z.string().optional(),
  job_title: z.string().optional(),
  basic_salary: z.coerce.number().nonnegative().optional(),
  deductions: z.coerce.number().nonnegative().optional(),
  allowances_list: z.array(z.object({
    type_id: z.coerce.number().int().positive(),
    amount: z.coerce.number().nonnegative(),
  })).optional(),
  insurance_number: z.string().optional(),
  bank_account: z.string().optional(),
  nationality: z.string().optional(),
  is_saudi: z.coerce.number().int().min(0).max(1).optional(),
  national_id_iqama: z.string().optional(),
  border_number: z.string().optional(),
  iqama_expiry_gregorian: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  iqama_expiry_hijri: z.string().optional(),
  iqama_profession: z.string().optional(),
  work_permit_number: z.string().optional(),
  work_permit_expiry: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  work_permit_fee: z.coerce.number().nonnegative().optional(),
  housing_allowance: z.coerce.number().nonnegative().optional(),
  transport_allowance: z.coerce.number().nonnegative().optional(),
  other_allowances: z.coerce.number().nonnegative().optional(),
  payment_method: z.enum(["cash", "bank", "split"]).optional(),
  cash_percentage: z.coerce.number().min(0).max(100).optional(),
  contract_type: z.enum(["fixed", "indefinite"]).optional(),
  contract_start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  contract_end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  // Annual-increase eligibility data. Kept optional so partial updates cannot
  // wipe an existing anniversary; the handler validates the values.
  hire_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  hire_month: z.coerce.number().int().min(1).max(12).optional(),
  sponsorship_type: z.enum(["saudi", "company_sponsored", "leased"]).optional(),
});

// ============================================
// PAYROLL SCHEMAS
// ============================================

export const payrollGenerateSchema = z.object({
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2000).max(2100),
  employee_ids: z.array(z.coerce.number().int().positive()).optional(),
});

export const payrollLockSchema = z.object({
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2000).max(2100),
});

export const payrollCalculateSlipSchema = z.object({
  employee_id: z.coerce.number().int().positive(),
  structure_id: z.coerce.number().int().positive(),
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2000).max(2100),
});

export const payrollSaveSlipSchema = z.object({
  slip_data: z.object({
    employee_id: z.coerce.number().int().positive(),
    structure_id: z.coerce.number().int().positive(),
    period_month: z.coerce.number().int().min(1).max(12),
    period_year: z.coerce.number().int().min(2000).max(2100),
    working_days: z.coerce.number().int().nonnegative(),
    payment_days: z.coerce.number().int().nonnegative(),
    absent_days: z.coerce.number().int().nonnegative().default(0),
    leave_without_pay_days: z.coerce.number().int().nonnegative().default(0),
    overtime_hours: z.coerce.number().nonnegative().default(0),
    late_minutes: z.coerce.number().int().nonnegative().default(0),
    items: z.array(z.object({
      component_id: z.coerce.number().int().positive(),
      component_code: z.string(),
      component_name_ar: z.string(),
      component_type: z.enum(["earning", "deduction", "employer_contribution"]),
      amount: z.number(),
      base_amount: z.number(),
      formula_used: z.string(),
      sequence: z.coerce.number().int().nonnegative(),
    })),
    gross_earnings: z.number(),
    total_deductions: z.number(),
    total_employer_contributions: z.number(),
    net_pay: z.number(),
  }),
});

// ============================================
// SALARY STRUCTURE SCHEMAS
// ============================================

export const salaryStructureCreateSchema = z.object({
  code: z.string().min(1, "Code required"),
  name_ar: z.string().min(1, "Arabic name required"),
  name_en: z.string().optional(),
  entity_id: z.coerce.number().int().positive().default(1),
  department_id: z.coerce.number().int().positive().optional(),
  position_id: z.coerce.number().int().positive().optional(),
  payroll_frequency: z.enum(["monthly", "weekly", "biweekly"]).default("monthly"),
  currency: z.string().default("SAR"),
  country_code: z.string().default("SA"),
  component_ids: z.array(z.coerce.number().int().positive()),
});

export const salaryStructureUpdateSchema = z.object({
  code: z.string().optional(),
  name_ar: z.string().optional(),
  name_en: z.string().optional(),
  entity_id: z.coerce.number().int().positive().optional(),
  department_id: z.coerce.number().int().positive().optional(),
  position_id: z.coerce.number().int().positive().optional(),
  payroll_frequency: z.enum(["monthly", "weekly", "biweekly"]).optional(),
  currency: z.string().optional(),
  country_code: z.string().optional(),
  is_active: z.coerce.number().int().min(0).max(1).optional(),
  component_ids: z.array(z.coerce.number().int().positive()).optional(),
});

export const salaryComponentCreateSchema = z.object({
  code: z.string().min(1, "Code required"),
  name_ar: z.string().min(1, "Arabic name required"),
  name_en: z.string().optional(),
  type: z.enum(["earning", "deduction", "employer_contribution"]),
  category: z.string().optional(),
  calculation_type: z.enum(["fixed", "percentage", "formula", "bracket"]).default("fixed"),
  calculation_value: z.string().optional(),
  condition_formula: z.string().optional(),
  depends_on_components: z.array(z.string()).optional(),
  display_order: z.coerce.number().int().nonnegative().default(0),
  is_taxable: z.coerce.number().int().min(0).max(1).default(1),
  is_gosi_applicable: z.coerce.number().int().min(0).max(1).default(0),
});

// ============================================
// ATTENDANCE SCHEMAS
// ============================================

export const attendanceCheckInSchema = z.object({
  device_token: z.string().min(1, "Device token required"),
  employee_id: z.coerce.number().int().positive(),
  method: z.enum(["face", "fingerprint", "manual"]).default("manual"),
  latitude: z.coerce.number().optional(),
  longitude: z.coerce.number().optional(),
  device_fingerprint: z.string().min(1, "Device fingerprint required"),
});

export const attendanceCheckOutSchema = z.object({
  device_token: z.string().min(1, "Device token required"),
  employee_id: z.coerce.number().int().positive(),
  latitude: z.coerce.number().optional(),
  longitude: z.coerce.number().optional(),
  device_fingerprint: z.string().min(1, "Device fingerprint required"),
});

export const devicePairSchema = z.object({
  device_token: z.string().min(1, "Device token required"),
  pairing_pin: z.string().length(6, "PIN must be 6 digits"),
  latitude: z.coerce.number(),
  longitude: z.coerce.number(),
  device_fingerprint: z.string().min(1, "Device fingerprint required"),
});

// ============================================
// DOCUMENT SCHEMAS
// ============================================

export const documentUploadSchema = z.object({
  employee_id: z.coerce.number().int().positive(),
  doc_type: z.string().optional(),
  doc_number: z.string().optional(),
  issue_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  expiry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  data_uri: z.string().optional(),
  notes: z.string().optional(),
}).refine(data => data.data_uri, {
  message: "data_uri is required",
  path: ["data_uri"],
});

// ============================================
// LEAVE SCHEMAS
// ============================================

export const leaveCreateSchema = z.object({
  employee_id: z.coerce.number().int().positive(),
  type: z.enum(["annual", "sick", "maternity", "paternity", "unpaid", "emergency", "other"]),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  days: z.coerce.number().positive(),
  reason: z.string().optional(),
}).refine(data => new Date(data.end_date) >= new Date(data.start_date), {
  message: "End date must be after or equal to start date",
  path: ["end_date"],
});

export const leaveUpdateSchema = z.object({
  status: z.enum(["pending", "approved", "rejected", "cancelled"]).optional(),
  approver_id: z.coerce.number().int().positive().optional(),
});

// ============================================
// BRANCH SCHEMAS
// ============================================

export const branchCreateSchema = z.object({
  name: z.string().min(1, "Branch name required"),
  name_en: z.string().optional(),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
  geofence_radius_m: z.coerce.number().int().positive().default(200),
  work_start_time: z.string().regex(/^\d{2}:\d{2}$/).default("08:00"),
  work_end_time: z.string().regex(/^\d{2}:\d{2}$/).default("17:00"),
  entity_id: z.coerce.number().int().positive().default(1),
});

export const branchUpdateSchema = z.object({
  name: z.string().optional(),
  name_en: z.string().optional(),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
  geofence_radius_m: z.coerce.number().int().positive().optional(),
  work_start_time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  work_end_time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  is_active: z.coerce.number().int().min(0).max(1).optional(),
});

// ============================================
// DEPARTMENT SCHEMAS
// ============================================

export const departmentCreateSchema = z.object({
  name: z.string().min(1, "Department name required"),
  name_en: z.string().optional(),
  manager_id: z.coerce.number().int().positive().optional(),
  entity_id: z.coerce.number().int().positive().default(1),
});

export const departmentUpdateSchema = z.object({
  name: z.string().optional(),
  name_en: z.string().optional(),
  manager_id: z.coerce.number().int().positive().optional(),
  is_active: z.coerce.number().int().min(0).max(1).optional(),
});

// ============================================
// ALLOWANCE TYPE SCHEMAS
// ============================================

export const allowanceTypeCreateSchema = z.object({
  code: z.string().min(1, "Code required"),
  name: z.string().min(1, "Name required"),
  name_ar: z.string().optional(),
  type: z.enum(["allowance", "deduction", "both"]).default("allowance"),
  is_taxable: z.coerce.number().int().min(0).max(1).default(1),
  is_active: z.coerce.number().int().min(0).max(1).default(1),
});

// ============================================
// SETTINGS SCHEMA
// ============================================

export const settingsUpdateSchema = z.object({
  org_name: z.string().optional(),
  country: z.string().optional(),
  currency: z.string().optional(),
  tax_rate: z.coerce.number().nonnegative().optional(),
  insurance_emp_rate: z.coerce.number().nonnegative().optional(),
  insurance_comp_rate: z.coerce.number().nonnegative().optional(),
  cr_number: z.string().optional(),
  unified_number_700: z.string().optional(),
  mol_establishment_id: z.string().optional(),
  gosi_establishment_id: z.string().optional(),
  cchi_policy_number: z.string().optional(),
  nitaqat_category: z.enum(["platinum", "high_green", "mid_green", "low_green", "red"]).optional(),
  saudi_gosi_emp_rate: z.coerce.number().nonnegative().optional(),
  saudi_gosi_comp_rate: z.coerce.number().nonnegative().optional(),
  expat_gosi_comp_rate: z.coerce.number().nonnegative().optional(),
  work_permit_annual_fee: z.coerce.number().nonnegative().optional(),
  iqama_renewal_fee: z.coerce.number().nonnegative().optional(),
});

export const bonusPenaltyCreateSchema = z.object({
  employee_id: z.coerce.number().int().positive(),
  type: z.enum(["bonus", "penalty"]),
  amount: z.coerce.number().nonnegative("المبلغ لا يكون سالباً"),
  reason: z.string().min(2).max(500),
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2000).max(2100),
});

export const loanCreateSchema = z.object({
  employee_id: z.coerce.number().int().positive(),
  total_amount: z.coerce.number().positive("قيمة السلفة يجب أن تكون أكبر من صفر"),
  monthly_installment: z.coerce.number().positive("الخصم الشهري يجب أن يكون أكبر من صفر"),
  deduction_start_month: z.coerce.number().int().min(1).max(12).optional().nullable(),
  deduction_start_year: z.coerce.number().int().min(2000).max(2100).optional().nullable(),
  deduction_months: z.coerce.number().int().min(1).max(240).optional().nullable(),
});

export const loanStatusUpdateSchema = z.object({
  status: z.enum(["active", "rejected"]),
  comments: z.string().max(500).optional(),
});

export const payrollRecalculateSchema = z.object({
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2000).max(2100),
  employee_id: z.coerce.number().int().positive(),
  // The net shown in the preview; guards against applying a stale diff.
  expected_net: z.coerce.number().optional(),
});

export const expenseStatusUpdateSchema = z.object({
  status: z.enum(["approved", "rejected", "pending"]),
  note: z.string().max(500).optional(),
  payment_status: z.enum(["unpaid", "paid"]).optional(),
});

export const leaveStatusUpdateSchema = z.object({
  status: z.enum(["pending", "approved", "rejected", "cancelled"]),
});

export const taxExemptionCreateSchema = z.object({
  employee_id: z.coerce.number().int().positive(),
  exemption_type: z.string().min(1).max(60),
  amount: z.coerce.number().nonnegative(),
  certificate_number: z.string().max(60).optional(),
  expiry_after: z.string().max(60).optional(),
  proof_file: z.string().max(255).optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
});

export const taxExemptionVerifySchema = z.object({
  status: z.enum(["verified", "rejected", "pending"]),
});

export const departmentBudgetUpdateSchema = z.object({
  allocated_salaries: z.coerce.number().nonnegative().optional(),
  allocated_gosi: z.coerce.number().nonnegative().optional(),
  allocated_medical: z.coerce.number().nonnegative().optional(),
  allocated_work_permits: z.coerce.number().nonnegative().optional(),
  allocated_flight_tickets: z.coerce.number().nonnegative().optional(),
  allocated_end_of_service: z.coerce.number().nonnegative().optional(),
  allocated_training_rewards: z.coerce.number().nonnegative().optional(),
  headcount_cap: z.coerce.number().int().nonnegative().optional(),
});

export const payrollCorrectSchema = z.object({
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2000).max(2100),
  employee_id: z.coerce.number().int().positive(),
  // Spliced into SQL as a column name, so it is constrained to the exact set the
  // route whitelists. Never widen this without changing CORRECTABLE_PAYROLL_FIELDS.
  field: z.enum(["allowances", "deductions", "bonuses", "penalties"]),
  new_value: z.coerce.number().nonnegative(),
  reason: z.string().min(3, "سبب التصحيح مطلوب").max(500),
});

// ============================================
// VALIDATION MIDDLEWARE
// ============================================

import { Request, Response, NextFunction } from "express";
import { ZodError, ZodObject } from "zod";

export const validate = (schema: ZodObject<any>) => 
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      // Write the parsed result back onto the request.
      //
      // Without this the middleware only *checked* the input and then threw the
      // result away: handlers kept reading the raw req.body, so every
      // z.coerce.number() in the schemas was decorative — "42" stayed a string
      // and could still reach a numeric column or an arithmetic expression.
      // Reassigning is what makes coercion (and .default()) actually apply.
      if (parsed && typeof parsed === "object") {
        const { body, query, params } = parsed as Record<string, unknown>;
        if (body !== undefined) req.body = body;
        if (query !== undefined) {
          // req.query has only a getter in Express 5; assign per-key instead.
          const target = req.query as Record<string, unknown>;
          for (const [k, v] of Object.entries(query as Record<string, unknown>)) {
            target[k] = v as never;
          }
        }
        if (params !== undefined) {
          for (const [k, v] of Object.entries(params as Record<string, unknown>)) {
            (req.params as Record<string, unknown>)[k] = v;
          }
        }
      }
      return next();
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({
          error: "Validation failed",
          details: error.issues.map(e => ({
            field: e.path.join("."),
            message: e.message,
          })),
        });
      }
      return res.status(500).json({ error: "Validation error" });
    }
  };

// Convenience helpers
export const validateBody = (schema: ZodObject<any>) => validate(z.object({ body: schema }));
export const validateQuery = (schema: ZodObject<any>) => validate(z.object({ query: schema }));
export const validateParams = (schema: ZodObject<any>) => validate(z.object({ params: schema }));