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
// EARNED WAGE ACCESS (EWA)
// ============================================

export const ewaWithdrawals = sqliteTable('ewa_withdrawals', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  employeeId: integer('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
  requestDate: text('request_date').notNull(),
  earnedSalarySoFar: real('earned_salary_so_far').notNull(),
  requestedAmount: real('requested_amount').notNull(),
  fee: real('fee').default(15),
  netDisbursed: real('net_disbursed').notNull(),
  status: text('status').default('approved'), // 'pending', 'approved', 'paid', 'deducted', 'rejected'
  disbursementMethod: text('disbursement_method').default('instant_iban'),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
}, (table) => ({
  employeeIdIdx: index('ewa_withdrawals_employee_id_idx').on(table.employeeId),
  requestDateIdx: index('ewa_withdrawals_request_date_idx').on(table.requestDate),
  statusIdx: index('ewa_withdrawals_status_idx').on(table.status),
}));

// ============================================
// RELATIONS
// ============================================

export const ewaWithdrawalsRelations = relations(ewaWithdrawals, ({ one }) => ({
  employee: one(employees, { fields: [ewaWithdrawals.employeeId], references: [employees.id] }),
}));