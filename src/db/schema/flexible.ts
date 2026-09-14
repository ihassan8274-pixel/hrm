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
// FLEXIBLE WORK & TELEWORK
// ============================================

export const flexibleWorkShifts = sqliteTable('flexible_work_shifts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  employeeId: integer('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
  date: text('date').notNull(),
  hoursWorked: real('hours_worked').default(4),
  hourlyRate: real('hourly_rate').default(40),
  totalPay: real('total_pay').default(160),
  mowaamahHoursAccumulated: real('mowaamah_hours_accumulated').default(4),
  qiwaContractRef: text('qiwa_contract_ref'),
  supervisorApproved: integer('supervisor_approved').default(1),
  notes: text('notes'),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
}, (table) => ({
  employeeIdIdx: index('flexible_shifts_employee_id_idx').on(table.employeeId),
  dateIdx: index('flexible_shifts_date_idx').on(table.date),
}));

export const teleworkPermits = sqliteTable('telework_permits', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  employeeId: integer('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
  permitType: text('permit_type').default('hybrid'), // 'full_time_remote', 'hybrid', 'temporary'
  remoteDaysPerWeek: integer('remote_days_per_week').default(2),
  contractStart: text('contract_start'),
  contractEnd: text('contract_end'),
  teleworkPlatformRegistered: integer('telework_platform_registered').default(1),
  productivityScore: real('productivity_score').default(95),
  status: text('status').default('active'), // 'active', 'pending_approval', 'suspended'
  createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
}, (table) => ({
  employeeIdIdx: uniqueIndex('telework_permits_employee_id_idx').on(table.employeeId),
  statusIdx: index('telework_permits_status_idx').on(table.status),
}));

// ============================================
// RELATIONS
// ============================================

export const flexibleWorkShiftsRelations = relations(flexibleWorkShifts, ({ one }) => ({
  employee: one(employees, { fields: [flexibleWorkShifts.employeeId], references: [employees.id] }),
}));

export const teleworkPermitsRelations = relations(teleworkPermits, ({ one }) => ({
  employee: one(employees, { fields: [teleworkPermits.employeeId], references: [employees.id] }),
}));