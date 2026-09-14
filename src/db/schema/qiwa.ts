import {
  sqliteTable,
  integer,
  text,
  real,
  index,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';
import { employees } from './organization';

// ============================================
// QIWA CONTRACTS
// ============================================

export const qiwaContracts = sqliteTable('qiwa_contracts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  employeeId: integer('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
  contractNumber: text('contract_number').unique().notNull(),
  contractType: text('contract_type').default('fixed_term'), // 'fixed_term', 'indefinite', 'flexible', 'remote', 'part_time'
  jobTitle: text('job_title'),
  workLocation: text('work_location').default('الرياض'),
  startDate: text('start_date'),
  endDate: text('end_date'),
  probationDays: integer('probation_days').default(90),
  noticePeriodDays: integer('notice_period_days').default(60),
  basicSalary: real('basic_salary').default(0),
  housingAllowance: real('housing_allowance').default(0),
  transportAllowance: real('transport_allowance').default(0),
  otherAllowances: real('other_allowances').default(0),
  weeklyWorkingHours: real('weekly_working_hours').default(48),
  annualLeaveDays: integer('annual_leave_days').default(21),
  autoRenew: integer('auto_renew').default(1),
  qiwaStatus: text('qiwa_status').default('authenticated'), // 'authenticated', 'pending_approval', 'draft', 'expired', 'terminated'
  qiwaReference: text('qiwa_reference'),
  clausesJson: text('clauses_json'),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
}, (table) => ({
  employeeIdIdx: index('qiwa_contracts_employee_id_idx').on(table.employeeId),
  contractNumberIdx: uniqueIndex('qiwa_contracts_number_idx').on(table.contractNumber),
  statusIdx: index('qiwa_contracts_status_idx').on(table.qiwaStatus),
  endDateIdx: index('qiwa_contracts_end_date_idx').on(table.endDate),
}));

// ============================================
// DISCIPLINARY VIOLATIONS
// ============================================

export const disciplinaryViolations = sqliteTable('disciplinary_violations', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  employeeId: integer('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
  incidentDate: text('incident_date').notNull(),
  category: text('category').notNull(), // 'attendance_absence', 'delay_departure', 'insubordination', 'negligence', 'behavioral_ethics', 'safety_breach', 'art80_gross_misconduct'
  description: text('description').notNull(),
  investigationDate: text('investigation_date'),
  investigatorName: text('investigator_name'),
  employeeStatement: text('employee_statement'),
  committeeDecision: text('committee_decision'),
  penaltyLevel: text('penalty_level').notNull(), // 'verbal_notice', 'written_warning_1', 'written_warning_2', 'salary_deduction_1day', 'salary_deduction_3days', 'suspension_5days', 'termination_art80'
  deductionDays: integer('deduction_days').default(0),
  deductionAmount: real('deduction_amount').default(0),
  payrollApplied: integer('payroll_applied').default(0),
  status: text('status').default('approved'), // 'under_investigation', 'approved', 'appealed', 'closed'
  createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
}, (table) => ({
  employeeIdIdx: index('disciplinary_employee_id_idx').on(table.employeeId),
  categoryIdx: index('disciplinary_category_idx').on(table.category),
  statusIdx: index('disciplinary_status_idx').on(table.status),
}));

// ============================================
// RELATIONS
// ============================================

export const qiwaContractsRelations = relations(qiwaContracts, ({ one }) => ({
  employee: one(employees, { fields: [qiwaContracts.employeeId], references: [employees.id] }),
}));

export const disciplinaryViolationsRelations = relations(disciplinaryViolations, ({ one }) => ({
  employee: one(employees, { fields: [disciplinaryViolations.employeeId], references: [employees.id] }),
}));