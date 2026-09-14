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
import { branches } from './organization';

// ============================================
// WORK INJURIES (GOSI)
// ============================================

export const workInjuries = sqliteTable('work_injuries', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  employeeId: integer('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
  incidentDate: text('incident_date').notNull(),
  incidentTime: text('incident_time').default('09:00'),
  locationType: text('location_type').default('workplace'), // 'workplace', 'work_trip', 'commuting_traffic'
  injuryType: text('injury_type'),
  severity: text('severity').default('minor'), // 'minor', 'moderate', 'severe', 'fatal'
  description: text('description'),
  hospitalName: text('hospital_name'),
  sickLeaveDays: integer('sick_leave_days').default(0),
  gosiReported: integer('gosi_reported').default(1),
  gosiReportDate: text('gosi_report_date'),
  gosiClaimNumber: text('gosi_claim_number'),
  dailyAllowanceRate: real('daily_allowance_rate').default(0),
  totalCompensationAmount: real('total_compensation_amount').default(0),
  status: text('status').default('reported'), // 'reported', 'gosi_approved', 'under_treatment', 'closed'
  preventiveActions: text('preventive_actions'),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
}, (table) => ({
  employeeIdIdx: index('work_injuries_employee_id_idx').on(table.employeeId),
  incidentDateIdx: index('work_injuries_incident_date_idx').on(table.incidentDate),
  statusIdx: index('work_injuries_status_idx').on(table.status),
}));

// ============================================
// HSE INSPECTIONS
// ============================================

export const hseInspections = sqliteTable('hse_inspections', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  branchId: integer('branch_id').notNull().references(() => branches.id, { onDelete: 'cascade' }),
  inspectorName: text('inspector_name').notNull(),
  inspectionDate: text('inspection_date').notNull(),
  category: text('category').notNull(), // 'fire_safety', 'emergency_exits', 'electrical', 'ventilation', 'first_aid', 'ppe_compliance'
  status: text('status').default('compliant'), // 'compliant', 'needs_action', 'critical'
  score: integer('score').default(95),
  findings: text('findings'),
  correctiveActions: text('corrective_actions'),
  deadlineDate: text('deadline_date'),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
}, (table) => ({
  branchIdIdx: index('hse_inspections_branch_id_idx').on(table.branchId),
  inspectionDateIdx: index('hse_inspections_inspection_date_idx').on(table.inspectionDate),
  statusIdx: index('hse_inspections_status_idx').on(table.status),
}));

// ============================================
// HSE PPE LOGS
// ============================================

export const hsePpeLogs = sqliteTable('hse_ppe_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  employeeId: integer('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
  itemName: text('item_name').notNull(),
  itemType: text('item_type').default('helmet'), // 'helmet', 'shoes', 'vest', 'goggles', 'gloves', 'mask'
  issueDate: text('issue_date').notNull(),
  expiryDate: text('expiry_date').notNull(),
  status: text('status').default('active'), // 'active', 'renewed', 'expired', 'damaged'
  notes: text('notes'),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
}, (table) => ({
  employeeIdIdx: index('hse_ppe_logs_employee_id_idx').on(table.employeeId),
  expiryDateIdx: index('hse_ppe_logs_expiry_date_idx').on(table.expiryDate),
  statusIdx: index('hse_ppe_logs_status_idx').on(table.status),
}));

// ============================================
// RELATIONS
// ============================================

export const workInjuriesRelations = relations(workInjuries, ({ one }) => ({
  employee: one(employees, { fields: [workInjuries.employeeId], references: [employees.id] }),
}));

export const hseInspectionsRelations = relations(hseInspections, ({ one }) => ({
  branch: one(branches, { fields: [hseInspections.branchId], references: [branches.id] }),
}));

export const hsePpeLogsRelations = relations(hsePpeLogs, ({ one }) => ({
  employee: one(employees, { fields: [hsePpeLogs.employeeId], references: [employees.id] }),
}));