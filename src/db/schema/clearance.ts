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
// EMPLOYEE CLEARANCE (EXIT)
// ============================================

export const employeeClearances = sqliteTable('employee_clearances', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  employeeId: integer('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
  requestDate: text('request_date').notNull(),
  lastWorkingDay: text('last_working_day').notNull(),
  reason: text('reason').notNull(), // 'resignation', 'contract_end', 'art77_termination', 'art80_termination', 'retirement'
  // IT Department
  itStatus: text('it_status').default('pending'), // 'pending', 'cleared'
  itNotes: text('it_notes'),
  itClearedBy: text('it_cleared_by'),
  // Finance Department
  financeStatus: text('finance_status').default('pending'),
  financeLoansSettled: integer('finance_loans_settled').default(1),
  financeCustodySettled: integer('finance_custody_settled').default(1),
  financeNotes: text('finance_notes'),
  // Operations & Assets
  operationsStatus: text('operations_status').default('pending'),
  operationsAssetsReturned: integer('operations_assets_returned').default(1),
  operationsNotes: text('operations_notes'),
  // HR Department
  hrStatus: text('hr_status').default('pending'),
  hrMedicalCancelled: integer('hr_medical_cancelled').default(1),
  hrGosiDeregistered: integer('hr_gosi_deregistered').default(1),
  hrServiceCertIssued: integer('hr_service_cert_issued').default(1),
  // Overall
  overallStatus: text('overall_status').default('in_progress'), // 'in_progress', 'completed', 'rejected'
  finalSettlementAmount: real('final_settlement_amount').default(0),
  clearanceSlipNumber: text('clearance_slip_number').unique(),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
}, (table) => ({
  employeeIdIdx: index('clearances_employee_id_idx').on(table.employeeId),
  slipNumberIdx: uniqueIndex('clearances_slip_number_idx').on(table.clearanceSlipNumber),
  overallStatusIdx: index('clearances_overall_status_idx').on(table.overallStatus),
}));

// ============================================
// RELATIONS
// ============================================

export const employeeClearancesRelations = relations(employeeClearances, ({ one }) => ({
  employee: one(employees, { fields: [employeeClearances.employeeId], references: [employees.id] }),
}));