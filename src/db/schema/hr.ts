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
// LEAVES & DOCUMENTS
// ============================================

export const leaves = sqliteTable('leaves', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  employeeId: integer('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
  type: text('type').notNull(), // 'annual', 'sick', 'unpaid', 'emergency'
  startDate: text('start_date').notNull(),
  endDate: text('end_date').notNull(),
  days: integer('days').notNull(),
  status: text('status').default('pending'), // 'pending', 'approved', 'rejected'
  isPaid: integer('is_paid').default(1),
  reason: text('reason'),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
}, (table) => ({
  employeeIdIdx: index('leaves_employee_id_idx').on(table.employeeId),
  statusIdx: index('leaves_status_idx').on(table.status),
  dateRangeIdx: index('leaves_date_range_idx').on(table.startDate, table.endDate),
}));

export const leaveBalances = sqliteTable('leave_balances', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  employeeId: integer('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
  year: integer('year').notNull(),
  annualEntitlementDays: integer('annual_entitlement_days').default(21),
  carryForwardDays: integer('carry_forward_days').default(0),
  takenDays: integer('taken_days').default(0),
  remainingDays: integer('remaining_days').default(21),
  encashedDays: integer('encashed_days').default(0),
  updatedAt: text('updated_at').default('CURRENT_TIMESTAMP'),
}, (table) => ({
  empYearIdx: uniqueIndex('leave_balances_emp_year_idx').on(table.employeeId, table.year),
}));

export const documents = sqliteTable('documents', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  employeeId: integer('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  type: text('type'),
  expiryDate: text('expiry_date'),
  status: text('status').default('active'),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
}, (table) => ({
  employeeIdIdx: index('documents_employee_id_idx').on(table.employeeId),
  expiryDateIdx: index('documents_expiry_date_idx').on(table.expiryDate),
}));

// ============================================
// ASSETS
// ============================================

export const assets = sqliteTable('assets', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  type: text('type'),
  serialNumber: text('serial_number'),
  assignedTo: integer('assigned_to').references(() => employees.id),
  assignedAt: text('assigned_at'),
  status: text('status').default('available'), // 'available', 'assigned', 'maintenance'
  createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
}, (table) => ({
  assignedToIdx: index('assets_assigned_to_idx').on(table.assignedTo),
  serialNumberIdx: index('assets_serial_number_idx').on(table.serialNumber),
}));

// ============================================
// APPRAISALS
// ============================================

export const appraisals = sqliteTable('appraisals', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  employeeId: integer('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
  rating: integer('rating'), // 1 to 5
  comments: text('comments'),
  period: text('period'), // 'Q1', 'Q2', 'Annual', etc.
  appraisalDate: text('appraisal_date'),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
}, (table) => ({
  employeeIdIdx: index('appraisals_employee_id_idx').on(table.employeeId),
  periodIdx: index('appraisals_period_idx').on(table.period),
}));

// ============================================
// RELATIONS
// ============================================

export const leavesRelations = relations(leaves, ({ one }) => ({
  employee: one(employees, { fields: [leaves.employeeId], references: [employees.id] }),
}));

export const leaveBalancesRelations = relations(leaveBalances, ({ one }) => ({
  employee: one(employees, { fields: [leaveBalances.employeeId], references: [employees.id] }),
}));

export const documentsRelations = relations(documents, ({ one }) => ({
  employee: one(employees, { fields: [documents.employeeId], references: [employees.id] }),
}));

export const assetsRelations = relations(assets, ({ one }) => ({
  employee: one(employees, { fields: [assets.assignedTo], references: [employees.id] }),
}));

export const appraisalsRelations = relations(appraisals, ({ one }) => ({
  employee: one(employees, { fields: [appraisals.employeeId], references: [employees.id] }),
}));