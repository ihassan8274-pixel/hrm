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
// PAYROLL TABLES
// ============================================

export const payroll = sqliteTable('payroll', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  employeeId: integer('employee_id').notNull().references(() => employees.id),
  month: integer('month').notNull(),
  year: integer('year').notNull(),
  basicSalary: real('basic_salary'),
  allowances: real('allowances'),
  deductions: real('deductions'),
  taxAmount: real('tax_amount').default(0),
  insuranceEmpShare: real('insurance_emp_share').default(0),
  insuranceCompShare: real('insurance_comp_share').default(0),
  bonuses: real('bonuses').default(0),
  penalties: real('penalties').default(0),
  netSalary: real('net_salary'),
  processedAt: text('processed_at').default('CURRENT_TIMESTAMP'),
  // Saudi Specific
  nationalIdIqama: text('national_id_iqama'),
  isSaudi: integer('is_saudi').default(1),
  housingAllowance: real('housing_allowance').default(0),
  transportAllowance: real('transport_allowance').default(0),
  gosiNumber: text('gosi_number'),
  gosiSalary: real('gosi_salary').default(0),
  saudiIban: text('saudi_iban'),
  bankName: text('bank_name'),
  paymentMethod: text('payment_method').default('bank'),
  countryCode: text('country_code').default('SA'),
}, (table) => ({
  empMonthYearIdx: uniqueIndex('payroll_emp_month_year_idx').on(table.employeeId, table.month, table.year),
  monthYearIdx: index('payroll_month_year_idx').on(table.month, table.year),
}));

export const attendance = sqliteTable('attendance', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  employeeId: integer('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
  month: integer('month').notNull(),
  year: integer('year').notNull(),
  absenceDays: integer('absence_days').default(0),
  overtimeHours: integer('overtime_hours').default(0),
}, (table) => ({
  empMonthYearIdx: uniqueIndex('attendance_emp_month_year_idx').on(table.employeeId, table.month, table.year),
}));

export const loans = sqliteTable('loans', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  employeeId: integer('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
  totalAmount: real('total_amount'),
  remainingAmount: real('remaining_amount'),
  monthlyInstallment: real('monthly_installment'),
  status: text('status').default('active'),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
}, (table) => ({
  employeeIdIdx: index('loans_employee_id_idx').on(table.employeeId),
  statusIdx: index('loans_status_idx').on(table.status),
}));

export const bonusesPenalties = sqliteTable('bonuses_penalties', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  employeeId: integer('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
  type: text('type').notNull(), // 'bonus' or 'penalty'
  amount: real('amount'),
  reason: text('reason'),
  month: integer('month'),
  year: integer('year'),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
}, (table) => ({
  employeeIdIdx: index('bonuses_penalties_employee_id_idx').on(table.employeeId),
  monthYearIdx: index('bonuses_penalties_month_year_idx').on(table.month, table.year),
}));

// ============================================
// RELATIONS
// ============================================

export const payrollRelations = relations(payroll, ({ one }) => ({
  employee: one(employees, { fields: [payroll.employeeId], references: [employees.id] }),
}));

export const attendanceRelations = relations(attendance, ({ one }) => ({
  employee: one(employees, { fields: [attendance.employeeId], references: [employees.id] }),
}));

export const loansRelations = relations(loans, ({ one }) => ({
  employee: one(employees, { fields: [loans.employeeId], references: [employees.id] }),
}));

export const bonusesPenaltiesRelations = relations(bonusesPenalties, ({ one }) => ({
  employee: one(employees, { fields: [bonusesPenalties.employeeId], references: [employees.id] }),
}));