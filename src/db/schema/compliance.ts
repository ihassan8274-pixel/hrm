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
// GOVERNMENT RENEWALS & COMPLIANCE
// ============================================

export const governmentRenewals = sqliteTable('government_renewals', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  employeeId: integer('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
  type: text('type').notNull(), // 'iqama', 'work_permit', 'medical_insurance', 'exit_reentry'
  durationMonths: integer('duration_months').default(12),
  cost: real('cost').default(0),
  status: text('status').default('completed'), // 'pending', 'paid', 'completed', 'cancelled'
  sadadNumber: text('sadad_number'),
  referenceNumber: text('reference_number'),
  expiryBefore: text('expiry_before'),
  expiryAfter: text('expiry_after'),
  notes: text('notes'),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
}, (table) => ({
  employeeIdIdx: index('government_renewals_employee_id_idx').on(table.employeeId),
  typeIdx: index('government_renewals_type_idx').on(table.type),
}));

export const eosCalculations = sqliteTable('eos_calculations', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  employeeId: integer('employee_id').references(() => employees.id),
  employeeName: text('employee_name'),
  nationalIdIqama: text('national_id_iqama'),
  startDate: text('start_date'),
  endDate: text('end_date'),
  basicSalary: real('basic_salary'),
  allowances: real('allowances'),
  totalSalary: real('total_salary'),
  reason: text('reason'),
  reasonText: text('reason_text'),
  totalServiceYears: real('total_service_years'),
  entitlementPercentage: real('entitlement_percentage'),
  finalAmount: real('final_amount'),
  leaveBalanceCompensation: real('leave_balance_compensation').default(0),
  otherEntitlements: real('other_entitlements').default(0),
  deductions: real('deductions').default(0),
  netPayable: real('net_payable'),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
}, (table) => ({
  employeeIdIdx: index('eos_calculations_employee_id_idx').on(table.employeeId),
}));

// ============================================
// RELATIONS
// ============================================

export const governmentRenewalsRelations = relations(governmentRenewals, ({ one }) => ({
  employee: one(employees, { fields: [governmentRenewals.employeeId], references: [employees.id] }),
}));

export const eosCalculationsRelations = relations(eosCalculations, ({ one }) => ({
  employee: one(employees, { fields: [eosCalculations.employeeId], references: [employees.id] }),
}));