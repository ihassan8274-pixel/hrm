export interface Leave {
  id: number;
  employee_id: number;
  employee_name?: string;
  type: 'annual' | 'sick' | 'unpaid' | 'emergency';
  start_date: string;
  end_date: string;
  days: number;
  status: 'pending' | 'approved' | 'rejected';
  is_paid: number;
  reason: string;
  created_at: string;
}

export interface EmployeeDocument {
  id: number;
  employee_id: number;
  employee_name?: string;
  name: string;
  type: string;
  expiry_date: string;
  status: string;
}

export interface Asset {
  id: number;
  name: string;
  type: string;
  serial_number: string;
  assigned_to?: number;
  assigned_to_name?: string;
  assigned_at?: string;
  status: 'available' | 'assigned' | 'maintenance';
}

export interface Appraisal {
  id: number;
  employee_id: number;
  employee_name?: string;
  rating: number;
  comments: string;
  period: string;
  appraisal_date: string;
}

export interface AppNotification {
  id: number;
  title: string;
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
  is_read: number;
  created_at: string;
}

export interface Department {
  id: number;
  name: string;
  manager_id?: number;
}

export interface BonusPenalty {
  id: number;
  employee_id: number;
  employee_name?: string;
  type: 'bonus' | 'penalty';
  amount: number;
  reason: string;
  month: number;
  year: number;
  created_at: string;
}

export interface Branch {
  id: number;
  name: string;
  location: string;
  latitude?: number | null;
  longitude?: number | null;
  geofence_radius_m?: number;
  work_start_time?: string;
  work_end_time?: string;
}

export interface AllowanceType {
  id: number;
  name: string;
}

export interface EmployeeAllowance {
  type_id: number;
  name?: string;
  amount: number;
}

export interface Employee {
  id: number;
  branch_id: number;
  branch_name?: string;
  department_id?: number;
  department_name?: string;
  name: string;
  position: string;
  job_title?: string;
  basic_salary: number;
  allowances: number;
  deductions: number;
  insurance_number?: string;
  bank_account?: string;
  allowances_details?: EmployeeAllowance[];

  // Saudi Arabia Labor & Compliance Fields
  nationality?: string; // 'سعودي' or any other nationality
  is_saudi?: number; // 1 for Saudi national, 0 for expat
  national_id_iqama?: string; // National ID for Saudis (starts with 1) or Iqama ID for expats (starts with 2)
  border_number?: string; // رقم الحدود
  iqama_expiry_gregorian?: string; // YYYY-MM-DD
  iqama_expiry_hijri?: string; // e.g. 1447/09/15
  iqama_profession?: string; // المهنة المعتمدة في الإقامة / منصة قوى
  work_permit_number?: string; // رقم رخصة العمل
  work_permit_expiry?: string; // تاريخ انتهاء رخصة العمل
  work_permit_fee?: number; // المقابل المالي السنوي أو الشهري
  
  // GOSI (التأمينات الاجتماعية)
  gosi_number?: string; // رقم المشترك في التأمينات
  gosi_registered_salary?: number; // أجر الاشتراك الخاضع للتأمينات (الأساسي + السكن)
  gosi_exempt?: number | boolean; // 1 = معفى من الخصم؛ المنشأة تتحمل حصتي العامل والمنشأة
  housing_allowance?: number; // بدل السكن
  transport_allowance?: number; // بدل النقل
  other_allowances?: number; // بدلات أخرى
  
  // Medical Insurance (التأمين الطبي - مجلس الضمان الصحي CCHI)
  insurance_company?: string; // شركة التأمين: بوبا، التعاونية، ميدغلف، تكافل الراجحي، سلامة، الصقر...
  medical_insurance_category?: 'VIP' | 'Class A' | 'Class B' | 'Class C' | 'Class D';
  medical_insurance_policy?: string; // رقم وثيقة التأمين
  medical_insurance_expiry?: string; // تاريخ انتهاء وثيقة التأمين
  medical_dependents_count?: number; // عدد التابعين المشمولين
  
  // Banking & Saudi Wage Protection (WPS / مدد)
  saudi_iban?: string; // IBAN format e.g. SA... (24 chars)
  bank_name?: string; // اسم البنك (مصرف الراجحي، الأهلي SNB، الإنماء، الرياض...)
  payment_method?: 'cash' | 'bank' | 'split'; // طريقة صرف الراتب
  
  // Contract Details
  contract_type?: 'fixed' | 'unlimited'; // محدد المدة / غير محدد المدة
  contract_start_date?: string;
  contract_end_date?: string;
  join_date?: string; // تاريخ الالتحاق (مرادف contract_start_date في بعض المسارات)
  hire_date?: string; // تاريخ التعيين الكامل؛ أساس تنبيه الزيادة السنوية
  hire_month?: number; // شهر التعيين عند عدم توفر اليوم
  sponsorship_type?: 'saudi' | 'company_sponsored' | 'leased'; // فئة الكفالة

  // Passport & health certificate (compliance documents)
  passport_number?: string;
  passport_expiry?: string; // YYYY-MM-DD
  health_cert_number?: string;
  health_cert_expiry?: string; // YYYY-MM-DD
  health_cert_required?: number | boolean; // 1 = خاضع لإلزام الشهادة الصحية (تداول الطعام)

  // Employment lifecycle — 'terminated' employees are excluded from new payroll runs
  status?: string;
  end_service_date?: string;
  end_service_reason?: string;

  // ESS / self-service derived fields
  annual_leave_balance?: number;
  iban?: string;
}

export interface AuditLog {
  id: number;
  action: string;
  entity_type: string;
  entity_id: number;
  details: string;
  created_by: string;
  created_at: string;
}

export interface Notification {
  id: number;
  title: string;
  message: string;
  type: 'info' | 'error' | 'success';
  is_read: number;
  created_at: string;
}

export interface AppSettings {
  org_name: string;
  country: string;
  currency: string;
  tax_rate: number;
  insurance_emp_rate?: number; // نسبة التأمينات على الموظف
  insurance_comp_rate?: number; // نسبة التأمينات على صاحب العمل
  
  // Saudi Specific Settings
  cr_number?: string; // السجل التجاري
  unified_number_700?: string; // الرقم الموحد 700
  mol_establishment_id?: string; // رقم المنشأة في وزارة الموارد البشرية / قوى
  gosi_establishment_id?: string; // رقم اشتراك المنشأة في التأمينات
  cchi_policy_number?: string; // رقم وثيقة مجلس الضمان الصحي
  nitaqat_category?: 'platinum' | 'high_green' | 'mid_green' | 'low_green' | 'red'; // نطاق المنشأة
  saudi_gosi_emp_rate?: number; // 9.75% (9% معاشات + 0.75% ساند)
  saudi_gosi_comp_rate?: number; // 11.75% (9% معاشات + 2% أخطار مهنية + 0.75% ساند)
  expat_gosi_comp_rate?: number; // 2% أخطار مهنية
  work_permit_annual_fee?: number; // 9600 SAR
  iqama_renewal_fee?: number; // 650 SAR
}

export interface PayrollRecord {
  id: number;
  employee_id: number;
  employee_name: string;
  branch_name: string;
  department_name?: string;
  month: number;
  year: number;
  basic_salary: number;
  allowances: number;
  deductions: number;
  tax_amount: number;
  insurance_emp_share: number;
  insurance_comp_share: number;
  bonuses: number;
  penalties: number;
  net_salary: number;
  processed_at: string;
  
  // Saudi Specific Payroll fields
  national_id_iqama?: string;
  is_saudi?: number;
  housing_allowance?: number;
  transport_allowance?: number;
  gosi_number?: string;
  gosi_salary?: number;
  saudi_iban?: string;
  bank_account?: string;
  bank_name?: string;
  payment_method?: string;
  cash_amount?: number;
  bank_amount?: number;
  approval_status?: 'draft' | 'approved' | 'rejected' | null;
  approved_by?: string;
  approved_at?: string;
  payment_status?: 'pending' | 'paid';
  paid_at?: string;
  eos_amount?: number;
  is_final_settlement?: number;
  final_settlement_id?: number;
}

export interface SaudiComplianceSummary {
  totalEmployees: number;
  saudiEmployees: number;
  expatEmployees: number;
  saudizationRate: number; // percentage e.g. 35.5%
  nitaqatStatus: 'platinum' | 'high_green' | 'mid_green' | 'low_green' | 'red';
  nitaqatLabel: string;
  
  // Expiry alerts
  expiredIqamas: number;
  iqamasExpiring30Days: number;
  iqamasExpiring60Days: number;
  iqamasExpiring90Days: number;
  
  expiredWorkPermits: number;
  workPermitsExpiring30Days: number;
  
  expiredMedicalInsurance: number;
  medicalExpiring30Days: number;
  
  // Monthly GOSI Stats
  monthlyGosiSaudiShare: number;
  monthlyGosiExpatShare: number;
  monthlyGosiTotalEmployer: number;
  monthlyGosiTotalEmployee: number;
  monthlyGosiGrandTotal: number;
}

export interface SaudiGovernmentRenewal {
  id: number;
  employee_id: number;
  employee_name?: string;
  type: 'iqama' | 'work_permit' | 'medical_insurance' | 'exit_reentry';
  duration_months: number;
  cost: number;
  status: 'pending' | 'paid' | 'completed' | 'cancelled';
  sadad_number?: string;
  reference_number?: string;
  expiry_before?: string;
  expiry_after?: string;
  notes?: string;
  created_at: string;
}

export interface EndOfServiceCalculation {
  id?: number;
  employee_name: string;
  national_id_iqama?: string;
  start_date: string;
  end_date: string;
  basic_salary: number;
  allowances: number;
  total_salary: number; // الأجر الفعلي
  reason: 'resignation' | 'employer_termination' | 'contract_expiry' | 'mutual_agreement' | 'force_majeure';
  reason_text: string;
  years: number;
  months: number;
  days: number;
  total_service_years: number;
  entitlement_percentage: number; // 0%, 33.33%, 66.67%, 100%
  base_gratuity: number; // المستحق الإجمالي قبل نسبة الاستقالة
  final_amount: number; // المبلغ الصافي المستحق لمكافأة نهاية الخدمة
  leave_balance_compensation?: number; // تعويض رصيد الإجازات
  other_entitlements?: number; // مستحقات أخرى
  deductions?: number; // استقطاعات أو سلف
  net_payable: number; // صافي المبلغ للدفع
}

export interface Loan {
  id: number;
  employee_id: number;
  employee_name?: string;
  total_amount: number;
  remaining_amount: number;
  monthly_installment: number;
  deduction_start_month?: number | null;
  deduction_start_year?: number | null;
  deduction_months?: number | null;
  deduction_applied_months?: number;
  status: 'pending' | 'active' | 'rejected' | 'completed';
  created_at: string;
  workflow_status?: string | null;
  workflow_title?: string | null;
  workflow_level?: number | null;
  workflow_max_levels?: number | null;
  workflow_history?: Array<{ level: number; actor_name: string; action: string; action_date: string; comments?: string }>;
}

export interface VisaRecord {
  id: number;
  employee_id: number;
  employee_name?: string;
  nationality?: string;
  national_id_iqama?: string;
  visa_type: 'exit_reentry_single' | 'exit_reentry_multiple' | 'final_exit' | 'work_visa';
  visa_number?: string;
  issue_date: string;
  travel_before_date?: string;
  duration_days: number;
  return_before_date?: string;
  cost: number;
  status: 'active' | 'used' | 'expired' | 'cancelled';
  notes?: string;
  created_at: string;
}

export interface FlightTicketRecord {
  id: number;
  employee_id: number;
  employee_name?: string;
  destination: string;
  trip_type: 'round_trip' | 'one_way';
  departure_date: string;
  return_date?: string;
  cost: number;
  allowance_type: 'ticket_issued' | 'cash_allowance';
  dependents_included: number;
  status: 'pending' | 'approved' | 'issued' | 'rejected';
  notes?: string;
  created_at: string;
}

export interface SalaryCertificateRecord {
  id: number;
  employee_id: number;
  employee_name?: string;
  national_id_iqama?: string;
  job_title?: string;
  department_name?: string;
  basic_salary?: number;
  housing_allowance?: number;
  transport_allowance?: number;
  other_allowances?: number;
  total_salary?: number;
  contract_start_date?: string;
  saudi_iban?: string;
  bank_name?: string;
  certificate_number: string;
  addressed_to: string;
  purpose: 'bank_loan' | 'credit_card' | 'embassy_visa' | 'real_estate_rental' | 'government_agency' | 'general';
  include_allowances: number;
  include_bank_iban: number;
  qr_verification_code: string;
  issue_date: string;
  valid_until: string;
  status: string;
  created_at: string;
}

export interface OvertimeRecord {
  id: number;
  employee_id: number;
  employee_name?: string;
  date: string;
  normal_hours: number;
  weekend_hours: number;
  holiday_hours: number;
  hourly_rate: number;
  total_overtime_pay: number;
  status: 'pending' | 'approved' | 'rejected' | 'processed';
  reason: string;
  month: number;
  year: number;
  created_at: string;
}

export interface EmployeeProvision {
  employee_id: number;
  employee_name: string;
  national_id_iqama?: string;
  is_saudi: number;
  start_date: string;
  service_years: number;
  service_months: number;
  basic_salary: number;
  housing_allowance: number;
  total_wage: number;
  monthly_eosb_provision: number;
  cumulative_eosb_provision: number;
  annual_leave_accrued_days: number;
  leave_provision_amount: number;
  annual_ticket_provision: number;
  total_monthly_provisions: number;
}

export interface AccountingProvisionSummary {
  totalMonthlyEOSB: number;
  totalCumulativeEOSB: number;
  totalLeaveProvision: number;
  totalAnnualTicketProvision: number;
  totalMonthlyAllProvisions: number;
  provisions: EmployeeProvision[];
}

export interface TotalCostOfEmployment {
  employee_id: number;
  employee_name: string;
  department_name?: string;
  branch_name?: string;
  is_saudi: number;
  monthly_direct_salary: number;
  monthly_gosi_employer: number;
  monthly_medical_insurance: number;
  monthly_government_fees: number; // Work permit 9600/12 + Iqama 650/12
  monthly_eosb_provision: number;
  monthly_leave_provision: number;
  monthly_ticket_provision: number;
  monthly_total_cost: number;
  annual_total_cost: number;
  cost_multiplier: number; // monthly_total_cost / monthly_direct_salary
}

export type TotalCostEmploymentRecord = TotalCostOfEmployment;

export interface GovernmentBudgetPlan {
  totalEmployees: number;
  saudiCount: number;
  expatCount: number;
  annualWorkPermitFees: number; // 9600 * expatCount
  annualIqamaRenewalFees: number; // 650 * expatCount
  annualMedicalInsuranceEstimate: number;
  annualGosiEmployerContribution: number;
  annualVisasEstimate: number;
  annualTotalGovernmentCost: number;
  monthlyAverageGovernmentCost: number;
  branchBreakdown: {
    branch_name: string;
    saudi_count: number;
    expat_count: number;
    total_cost: number;
  }[];
}

export interface Stats {
  totalBranches: number;
  totalEmployees: number;
  totalMonthlyPayroll: number;
}

// ==========================================
// 1. QIWA CONTRACTS & NOTICE PERIODS (منصة قوى)
// ==========================================
export interface QiwaContract {
  id: number;
  employee_id: number;
  employee_name?: string;
  national_id_iqama?: string;
  nationality?: string;
  department_name?: string;
  branch_name?: string;
  contract_number: string;
  contract_type: 'fixed_term' | 'indefinite' | 'flexible' | 'remote' | 'part_time';
  job_title: string;
  work_location: string;
  start_date: string;
  end_date?: string;
  probation_days: number;
  notice_period_days: number;
  basic_salary: number;
  housing_allowance: number;
  transport_allowance: number;
  other_allowances: number;
  weekly_working_hours: number;
  annual_leave_days: number;
  auto_renew: number;
  qiwa_status: 'authenticated' | 'pending_approval' | 'draft' | 'expired' | 'terminated';
  qiwa_reference?: string;
  clauses_json?: string;
  days_until_expiry?: number;
  days_until_notice_deadline?: number;
  created_at: string;
}

// ==========================================
// 2. DISCIPLINARY MATRIX & VIOLATIONS (لائحة الجزاءات والتحقيق)
// ==========================================
export interface DisciplinaryViolation {
  id: number;
  employee_id: number;
  employee_name?: string;
  department_name?: string;
  national_id_iqama?: string;
  incident_date: string;
  category: 'attendance_absence' | 'delay_departure' | 'insubordination' | 'negligence' | 'behavioral_ethics' | 'safety_breach' | 'art80_gross_misconduct';
  description: string;
  investigation_date?: string;
  investigator_name?: string;
  employee_statement?: string;
  committee_decision?: string;
  penalty_level: 'verbal_notice' | 'written_warning_1' | 'written_warning_2' | 'salary_deduction_1day' | 'salary_deduction_3days' | 'suspension_5days' | 'termination_art80';
  deduction_days: number;
  deduction_amount: number;
  payroll_applied: number;
  status: 'under_investigation' | 'approved' | 'appealed' | 'closed';
  created_at: string;
}

// ==========================================
// 3. MULTI-DEPARTMENT EXIT & CLEARANCE (إخلاء الطرف وإبراء الذمة)
// ==========================================
export interface EmployeeClearance {
  id: number;
  employee_id: number;
  employee_name?: string;
  job_title?: string;
  department_name?: string;
  national_id_iqama?: string;
  request_date: string;
  last_working_day: string;
  reason: 'resignation' | 'contract_end' | 'art77_termination' | 'art80_termination' | 'retirement';
  
  // IT Department Clearance
  it_status: 'pending' | 'cleared';
  it_notes?: string;
  it_cleared_by?: string;
  
  // Finance Department Clearance
  finance_status: 'pending' | 'cleared';
  finance_loans_settled: number;
  finance_custody_settled: number;
  finance_notes?: string;
  
  // Operations & Assets Clearance
  operations_status: 'pending' | 'cleared';
  operations_assets_returned: number;
  operations_notes?: string;
  
  // HR Department Clearance
  hr_status: 'pending' | 'cleared';
  hr_medical_cancelled: number;
  hr_gosi_deregistered: number;
  hr_service_cert_issued: number;
  
  overall_status: 'in_progress' | 'completed' | 'rejected';
  final_settlement_amount: number;
  clearance_slip_number: string;
  created_at: string;
}

// ==========================================
// 4. GOSI WORK INJURIES & OH&S (إصابات العمل والسلامة المهنية)
// ==========================================
export interface WorkInjury {
  id: number;
  employee_id: number;
  employee_name?: string;
  department_name?: string;
  national_id_iqama?: string;
  job_title?: string;
  incident_date: string;
  incident_time?: string;
  location_type: 'workplace' | 'work_trip' | 'commuting_traffic';
  incident_location?: string;
  injury_type: string;
  injury_nature?: string;
  severity: 'minor' | 'moderate' | 'severe' | 'fatal';
  description: string;
  hospital_name?: string;
  sick_leave_days: number;
  gosi_reported: number; // must be reported within 7 days
  gosi_report_date?: string;
  gosi_claim_number?: string;
  daily_allowance_rate: number; // 100% covered by GOSI
  total_compensation_amount: number;
  gosi_compensation_amount?: number;
  status: 'reported' | 'gosi_approved' | 'under_treatment' | 'closed';
  preventive_actions?: string;
  created_at: string;
}

// ==========================================
// 5. NITAQAT & SAUDIZATION SIMULATOR
// ==========================================
export type NitaqatTier = 'platinum' | 'high_green' | 'mid_green' | 'low_green' | 'red';

/** Headcount scenario as computed by the Nitaqat band calculator. */
export interface NitaqatScenario {
  saudiCount: number;
  expatCount: number;
  totalEmployees: number;
  saudiSpecialWeightsCount: number; // 4x weight for disabled Saudis (Mowaamah)
  saudizationPercentage: number;
  weightedSaudizationPercentage: number;
  tier: NitaqatTier;
  saudisNeededForNextTier: number;
  expatsAllowedBeforeDowngrade: number;
  availableVisasToIssue: number;
}

export interface NitaqatSimulationResult extends NitaqatScenario {
  currentTier: NitaqatTier;
  currentSaudizationPercentage: number;
  simulated: NitaqatScenario;
  simulatedTier: NitaqatTier;
  simulatedSaudizationPercentage: number;
  sectorName: string;
  tierThresholds: {
    platinum: number;
    high_green: number;
    mid_green: number;
    low_green: number;
  };
  restrictedProfessions: {
    profession: string;
    targetPercentage: number;
    currentSaudis: number;
    currentExpats: number;
    currentPercentage: number;
    isCompliant: boolean;
  }[];
}

// ==========================================
// 6. AI HR LETTERS & OFFICIAL NOTICES
// ==========================================
export interface HrLetterRequest {
  employee_id: number;
  letter_type: 'promotion' | 'warning' | 'termination_art77' | 'termination_art80' | 'contract_non_renewal' | 'salary_increment' | 'experience_certificate' | 'delegation';
  custom_notes?: string;
  effective_date?: string;
  target_role?: string;
  salary_increase_amount?: number;
  addressed_to?: string;
}

export interface GeneratedHrLetter {
  id?: number;
  letter_id: string;
  title: string;
  content: string;
  created_at: string;
  employee_name: string;
  employee_id: number;
  letter_type: string;
}

// ==========================================
// 7. MEDICAL INSURANCE & CCHI (التأمين الطبي والضمان الصحي)
// ==========================================
export interface MedicalDependent {
  id: number;
  employee_id: number;
  employee_name?: string;
  name: string;
  relationship: 'spouse' | 'son' | 'daughter' | 'parent';
  national_id_iqama: string;
  birth_date: string;
  gender: 'male' | 'female';
  category: 'VIP' | 'Class A' | 'Class B' | 'Class C';
  card_number: string;
  annual_premium: number;
  status: 'active' | 'cancelled' | 'pending';
  created_at: string;
}

export interface MedicalPolicy {
  id: number;
  policy_number: string;
  insurance_company: string;
  start_date: string;
  expiry_date: string;
  total_members: number;
  total_premium: number;
  cchi_approval_number: string;
  status: 'active' | 'expiring_soon' | 'expired';
}

export interface HealthCertificate {
  id: number;
  employee_id: number;
  certificate_number?: string;
  profession_on_cert?: string;
  issue_date?: string;
  expiry_date: string;
  issuing_authority: string;
  status: 'active' | 'replaced' | 'revoked';
  notes?: string;
  created_at?: string;
  updated_at?: string;
  employee_name?: string;
  employee_position?: string;
  employee_nationality?: string;
  employee_is_saudi?: number;
  employee_national_id?: string;
  cert_status?: 'valid' | 'expiring' | 'expired';
  days_left?: number;
}

export interface InsuranceEndorsement {
  id: number;
  employee_id: number;
  employee_name?: string;
  type: 'addition' | 'deletion' | 'upgrade';
  endorsement_date: string;
  premium_adjustment: number;
  cchi_reference: string;
  status: 'processed' | 'submitted';
  created_at: string;
}

// ==========================================
// 8. WPS & SAMA SIF FILE AUDIT (محرك حماية الأجور وتدقيق SIF)
// ==========================================
export interface WpsAuditResult {
  payrollMonth: number;
  payrollYear: number;
  totalEmployees: number;
  compliantCount: number;
  violationCount: number;
  complianceScore: number;
  totalDisbursed: number;
  sifFileName: string | null;
  /** True when every precondition for a bank file is met. */
  exportReady: boolean;
  /** Human-readable reasons the bank file cannot be produced yet. */
  exportBlockers: string[];
  bankProfile: {
    crNumber: string | null;
    settlementBankCode: string | null;
    mappedBanks: string[];
  };
  /** True when no payroll run exists for the period and master data was read instead. */
  simulated: boolean;
  dataSource: 'payroll_run' | 'employees_master_data';
  /** Explains a simulated audit so the numbers are not mistaken for an approved run. */
  note: string | null;
  violations: {
    employee_id: number;
    employee_name: string;
    national_id_iqama: string;
    bank_name: string;
    iban: string;
    basic_salary: number;
    net_salary: number;
    deduction_ratio: number;
    violation_type: 'excessive_deduction' | 'gosi_salary_mismatch' | 'invalid_iban' | 'zero_salary' | 'delay_in_disbursement';
    details: string;
  }[];
  gosiReconciliation: {
    matched: number;
    mismatched: number;
    totalAmountGosi: number;
    totalAmountPayroll: number;
  };
}

// ==========================================
// 9. 9-BOX TALENT MATRIX & SUCCESSION (مصفوفة المواهب والتعاقب)
// ==========================================
export interface TalentAssessment {
  id: number;
  employee_id: number;
  employee_name?: string;
  department_name?: string;
  job_title?: string;
  nationality?: string;
  is_saudi?: number;
  performance_score: 1 | 2 | 3; // 1: Low, 2: Medium, 3: High
  potential_score: 1 | 2 | 3; // 1: Low, 2: Medium, 3: High
  box_category: 'star' | 'high_potential' | 'high_performer' | 'core_player' | 'solid_performer' | 'inconsistent' | 'effective' | 'dilemma' | 'underperformer';
  key_strengths: string;
  development_needs: string;
  readiness_timeline: 'ready_now' | 'ready_1_year' | 'ready_2_years' | 'future_talent';
  assessed_by: string;
  assessed_at: string;
}

export interface SuccessionPlanItem {
  id: number;
  critical_role_title: string;
  department_id: number;
  department_name?: string;
  current_holder_id: number;
  current_holder_name?: string;
  risk_level: 'critical' | 'high' | 'medium';
  primary_successor_id?: number;
  primary_successor_name?: string;
  primary_successor_position?: string;
  secondary_successor_id?: number;
  secondary_successor_name?: string;
  readiness_status: 'ready_now' | 'in_development' | 'no_successor';
  development_action_plan: string;
  is_saudization_target: number;
  updated_at: string;
}

// ==========================================
// 10. FLEET & CUSTODY VEHICLES (إدارة أسطول السيارات والمخالفات)
// ==========================================
export interface FleetVehicle {
  id: number;
  plate_number: string;
  make_model: string;
  year: number;
  vin_number: string;
  assigned_employee_id?: number;
  assigned_employee_name?: string;
  department_name?: string;
  assignment_date?: string;
  istimara_expiry: string;
  insurance_expiry: string;
  periodic_inspection_expiry: string; // الفحص الدوري (MVPI)
  /** Days remaining before expiry; negative means already expired. Computed server-side. */
  days_to_istimara?: number;
  days_to_insurance?: number;
  days_to_mvpi?: number;
  status: 'assigned' | 'available' | 'maintenance' | 'impounded';
  current_odometer: number;
  fuel_card_number?: string;
  created_at: string;
}

export interface TrafficFineLog {
  id: number;
  vehicle_id: number;
  plate_number?: string;
  employee_id: number;
  employee_name?: string;
  fine_number: string;
  violation_type: string;
  amount: number;
  fine_date: string;
  deducted_from_payroll: number;
  payroll_month?: number;
  payroll_year?: number;
  status: 'pending' | 'deducted' | 'waived';
  created_at: string;
}

// ==========================================
// 11. FLEXIBLE WORK & TELEWORK (العمل المرن والعمل عن بعد)
// ==========================================
export interface FlexibleWorkShift {
  id: number;
  employee_id: number;
  employee_name?: string;
  department_name?: string;
  date: string;
  hours_worked: number;
  hourly_rate: number;
  total_pay: number;
  mowaamah_hours_accumulated: number; // 168 hours equals 1/3 nationalization point
  qiwa_contract_ref: string;
  supervisor_approved: number;
  notes?: string;
  created_at: string;
}

export interface TeleworkPermit {
  id: number;
  employee_id: number;
  employee_name?: string;
  department_name?: string;
  position?: string;
  job_title?: string;
  permit_type: 'full_time_remote' | 'hybrid' | 'temporary';
  remote_days_per_week: number;
  contract_start: string;
  contract_end: string;
  telework_platform_registered: number; // منصة العمل عن بعد المعتمدة
  productivity_score: number;
  status: 'active' | 'pending_approval' | 'suspended';
  created_at: string;
}

// ==========================================
// 12. RETENTION RISK & ATTRITION PREDICTOR (محلل مخاطر التسرب AI)
// ==========================================
export interface RetentionRiskAssessment {
  employee_id: number;
  employee_name: string;
  job_title: string;
  department_name: string;
  nationality: string;
  is_saudi: number;
  years_in_company: number;
  months_since_last_promotion: number;
  salary_competitiveness: 'below_market' | 'market_average' | 'above_market';
  recent_sick_leaves_days: number;
  risk_score: number; // 0 to 100%
  risk_level: 'critical' | 'high' | 'medium' | 'low';
  top_risk_factors: string[];
  recommended_actions: string[];
}

// ==========================================
// 13. EARNED WAGE ACCESS (EWA سحب الراتب عند الطلب)
// ==========================================
export interface EwaWithdrawal {
  id: number;
  employee_id: number;
  employee_name?: string;
  department_name?: string;
  request_date: string;
  earned_salary_so_far: number;
  requested_amount: number;
  fee: number;
  net_disbursed: number;
  status: 'pending' | 'approved' | 'paid' | 'deducted' | 'rejected';
  disbursement_method: string;
  iban?: string;
  created_at: string;
}

export interface EwaEligibility {
  employee_id: number;
  employee_name: string;
  total_monthly_salary: number;
  days_in_month: number;
  days_worked_so_far: number;
  earned_so_far: number;
  already_withdrawn: number;
  available_limit: number; // max 50% of earned so far minus withdrawn
  max_withdrawal_percentage: number;
  can_withdraw: boolean;
}

// ==========================================
// 14. HEALTH, SAFETY & ENVIRONMENT (HSE السلامة المهنية)
// ==========================================
export interface HseInspection {
  id: number;
  branch_id: number;
  branch_name?: string;
  inspector_name: string;
  inspection_date: string;
  category: 'fire_safety' | 'emergency_exits' | 'electrical' | 'ventilation' | 'first_aid' | 'ppe_compliance';
  category_ar?: string;
  status: 'compliant' | 'needs_action' | 'critical';
  score: number; // 0 - 100
  findings: string;
  corrective_actions: string;
  deadline_date: string;
  created_at: string;
}

export interface HsePpeLog {
  id: number;
  employee_id: number;
  employee_name?: string;
  department_name?: string;
  item_name: string;
  item_type: 'helmet' | 'shoes' | 'vest' | 'goggles' | 'gloves' | 'mask';
  issue_date: string;
  expiry_date: string;
  status: 'active' | 'renewed' | 'expired' | 'damaged';
  notes?: string;
}

export interface HseStats {
  complianceRate: number;
  openViolations: number;
  criticalIssues: number;
  activePpeCount: number;
  inspectionsCount: number;
}

// ==========================================
// 15. EXECUTIVE BOARDROOM & HR ROI (لوحة مجالس الإدارة)
// ==========================================
export interface ExecutiveAnalytics {
  totalEmployees: number;
  saudizationRate: number;
  totalMonthlyPayroll: number;
  annualizedWageBill: number;
  // null = no data source in this system (revenue lives elsewhere; no
  // termination dates are recorded). The screen must render "غير متاح".
  estimatedRevenue: number | null;
  humanCapitalRoi: number | null;
  costPerEmployee: number;
  turnoverRateAnnual: number | null;
  averageTenureYears: number | null; // measured from recorded contract start dates
  departmentsBreakdown: {
    department_id: number;
    department_name: string;
    employee_count: number;
    total_salary: number;
    avg_salary: number;
    saudization_rate: number;
  }[];
  quarterlyTrends: {
    quarter: string;
    payroll_cost: number;
    headcount: number;
    growth_pct: number | null; // quarter-over-quarter; null for the first quarter
  }[];
  complianceSummary: {
    // null = verified against the government portal, not computable here.
    gosi_compliant: boolean | null;
    wps_compliant: boolean | null;
    cchi_compliant: boolean | null;
    qiwa_contracts_rate: number | null;
  };
}

// ==========================================
// 16. EXIT INTERVIEW & TURNOVER ANALYTICS (مقابلات الخروج)
// ==========================================
export interface ExitInterview {
  id: number;
  employee_id: number;
  employee_name?: string;
  department_name?: string;
  job_title?: string;
  hire_date?: string;
  departure_date: string;
  primary_reason: 'salary' | 'management' | 'career_growth' | 'work_life_balance' | 'relocation' | 'toxic_culture' | 'health_personal';
  primary_reason_ar?: string;
  reason_details: string;
  manager_rating: number; // 1 - 5
  culture_rating: number; // 1 - 5
  benefits_rating: number; // 1 - 5
  would_recommend_score: number; // 1 - 10
  retention_feedback: string;
  estimated_replacement_cost: number;
  ai_sentiment: 'negative' | 'neutral' | 'positive';
  ai_summary?: string;
  created_at: string;
}

export interface ExitInterviewAnalytics {
  totalExits: number;
  topReasons: { reason: string; count: number; percentage: number }[];
  departmentHotspots: { department: string; count: number; turnoverRate: number }[];
  totalReplacementCost: number;
  avgCultureRating: number;
  avgManagerRating: number;
  aiStrategicInsights: string[];
}

// ==========================================
// 17. VISUAL MULTI-LEVEL APPROVAL WORKFLOWS (مسارات الاعتماد)
// ==========================================
export interface WorkflowStep {
  level: number;
  approver_role: 'direct_manager' | 'department_head' | 'hr_manager' | 'finance_director' | 'ceo';
  approver_role_ar: string;
  require_attachment?: boolean;
  sla_hours?: number;
}

export interface ApprovalWorkflow {
  id: number;
  workflow_type: 'leave_request' | 'loan_advance' | 'promotion' | 'expense_claim' | 'ewa_withdrawal' | 'hiring_requisition';
  title: string;
  description: string;
  conditions: {
    min_amount?: number;
    max_amount?: number;
    department_id?: number;
  };
  levels: WorkflowStep[];
  is_active: number;
  created_at: string;
}

export interface WorkflowActionRecord {
  level: number;
  actor_name: string;
  action: 'approved' | 'rejected' | 'delegated';
  action_date: string;
  comments: string;
}

export interface ApprovalRequest {
  id: number;
  workflow_id: number;
  workflow_title?: string;
  requester_id: number;
  requester_name?: string;
  requester_department?: string;
  request_type: string;
  request_title: string;
  amount?: number;
  details: string;
  current_level: number;
  max_levels: number;
  current_approver_role: string;
  status: 'pending' | 'approved' | 'rejected';
  history: WorkflowActionRecord[];
  created_at: string;
}

// ==========================================
// 18. AI HR COPILOT & QUICK ACTIONS (المساعد الذكي)
// ==========================================
export interface SalaryCertificateData {
  cert_number: string;
  employee_name: string;
  national_id: string;
  job_title: string;
  department: string;
  hire_date: string;
  basic_salary: number;
  housing_allowance: number;
  transport_allowance: number;
  other_allowances: number;
  total_salary: number;
  issue_date: string;
  directed_to: string;
  purpose: string;
  company_name: string;
  gosi_registered: boolean;
}

export interface CopilotMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  suggestedActions?: {
    label: string;
    actionType: 'navigate' | 'download_cert' | 'calculate' | 'query';
    payload?: any;
  }[];
  quickCard?: {
    type: 'salary_cert' | 'labor_law' | 'employee_card' | 'stats';
    data: any;
  };
}

// ==========================================
// 19. EMPLOYEE GRIEVANCES & HEARINGS (التظلمات ولجان التحقيق)
// ==========================================
export interface EmployeeGrievance {
  id: number;
  ticket_number: string;
  employee_id: number;
  employee_name?: string;
  department_name?: string;
  category: 'work_environment' | 'appraisal_dispute' | 'harassment_mistreatment' | 'unpaid_dues' | 'transfer_demotion' | 'other';
  subject: string;
  details: string;
  is_confidential: number;
  against_person?: string;
  status: 'submitted' | 'under_review' | 'committee_assigned' | 'hearing_scheduled' | 'resolved' | 'rejected';
  committee_notes?: string;
  resolution_summary?: string;
  created_at: string;
  resolved_at?: string;
}

export interface HearingSession {
  id: number;
  grievance_id?: number;
  session_title: string;
  session_date: string;
  location: string;
  committee_chair: string;
  hr_representative: string;
  legal_counsel: string;
  employee_name: string;
  witnesses?: string;
  statements_minutes: string;
  committee_verdict: string;
  recommended_sanction?: 'none' | 'written_notice' | 'first_warning' | 'second_warning' | 'final_warning' | 'salary_deduction' | 'termination_art80';
  deduction_days?: number;
  status: 'scheduled' | 'completed' | 'adjourned';
  created_at: string;
}

export interface OfficialWarningNotice {
  id: number;
  notice_number: string;
  employee_id: number;
  employee_name?: string;
  national_id?: string;
  job_title?: string;
  department_name?: string;
  warning_type: 'attention_notice' | 'first_warning' | 'second_warning' | 'final_warning' | 'salary_deduction';
  violation_clause: string; // e.g. "المادة 12 من لائحة العمل والجزاءات: التأخر المتكرر"
  violation_date: string;
  investigation_ref?: string;
  penalty_details: string;
  deduction_amount?: number;
  issued_by: string;
  issue_date: string;
  acknowledgement_status: 'acknowledged' | 'refused_to_sign' | 'pending';
}

// ==========================================
// 20. HR BUDGETING & HEADCOUNT FORECASTING (ميزانية الموارد البشرية)
// ==========================================
export interface DepartmentBudget {
  id: number;
  department_id: number;
  department_name: string;
  fiscal_year: number;
  allocated_salaries: number;
  allocated_gosi: number;
  allocated_medical: number;
  allocated_work_permits: number; // 9600 SAR/expat
  allocated_flight_tickets: number;
  allocated_end_of_service: number;
  allocated_training_rewards: number;
  total_allocated: number;
  actual_spent: number;
  committed_remaining: number;
  headcount_cap: number;
  current_headcount: number;
}

export interface BudgetForecastScenario {
  id: string;
  title: string;
  new_saudi_hires: number;
  avg_saudi_salary: number;
  new_expat_hires: number;
  avg_expat_salary: number;
  annual_incremental_cost: number;
  projected_saudization_rate: number;
  nitaqat_tier_forecast: string;
}

// ==========================================
// 21. RECOGNITION, REWARDS & ENPS (التقدير والمكافآت والارتباط)
// ==========================================
export interface PeerKudos {
  id: number;
  sender_id: number;
  sender_name: string;
  recipient_id: number;
  recipient_name: string;
  recipient_job?: string;
  core_value: 'teamwork' | 'innovation' | 'customer_delight' | 'safety_first' | 'leadership' | 'excellence';
  message: string;
  points_awarded: number;
  likes_count: number;
  created_at: string;
}

export interface RewardCatalogItem {
  id: number;
  title: string;
  description: string;
  category: 'gift_card' | 'extra_leave' | 'fuel_card' | 'wellness' | 'tech';
  points_required: number;
  stock_quantity: number;
  icon_name: string;
  image_url?: string;
}

export interface RewardRedemption {
  id: number;
  employee_id: number;
  employee_name: string;
  reward_id: number;
  reward_title: string;
  points_spent: number;
  redemption_code: string;
  status: 'approved' | 'delivered' | 'pending';
  created_at: string;
}

export interface PulseSurveyScore {
  id?: number;
  category: string;
  score_percentage: number;
  respondents_count: number;
  sentiment: 'positive' | 'neutral' | 'negative';
}

// ==========================================
// 22. SMART ASSETS & QR HANDOVER (الأصول والعهد وبراءة الذمة)
// ==========================================
export interface SmartAssetRecord {
  id: number;
  asset_code: string;
  name: string;
  category: 'laptop' | 'smartphone' | 'tablet' | 'fuel_card' | 'access_key' | 'vehicle' | 'specialized_tool';
  brand_model: string;
  serial_number: string;
  purchase_date: string;
  purchase_value: number;
  current_assigned_to?: number;
  assigned_employee_name?: string;
  assigned_department?: string;
  assigned_date?: string;
  handover_qr_code: string;
  condition: 'new' | 'good' | 'fair' | 'needs_maintenance';
  status: 'assigned' | 'in_stock' | 'maintenance' | 'scrapped';
}

export interface AssetClearanceCheck {
  employee_id: number;
  employee_name: string;
  department_name: string;
  total_assets_assigned: number;
  assets_returned: number;
  pending_assets: string[];
  clearance_status: 'cleared' | 'blocked_pending_handover';
}



