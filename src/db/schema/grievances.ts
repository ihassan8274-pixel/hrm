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
// GRIEVANCES & HEARINGS
// ============================================

export const employeeGrievances = sqliteTable('employee_grievances', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  ticketNumber: text('ticket_number').unique().notNull(),
  employeeId: integer('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
  category: text('category').default('work_environment'), // 'work_environment', 'appraisal_dispute', 'harassment_mistreatment', 'unpaid_dues', 'transfer_demotion', 'other'
  subject: text('subject').notNull(),
  details: text('details').notNull(),
  isConfidential: integer('is_confidential').default(1),
  againstPerson: text('against_person'),
  status: text('status').default('submitted'), // 'submitted', 'under_review', 'committee_assigned', 'hearing_scheduled', 'resolved', 'rejected'
  committeeNotes: text('committee_notes'),
  resolutionSummary: text('resolution_summary'),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
  resolvedAt: text('resolved_at'),
}, (table) => ({
  employeeIdIdx: index('grievances_employee_id_idx').on(table.employeeId),
  ticketNumberIdx: uniqueIndex('grievances_ticket_number_idx').on(table.ticketNumber),
  statusIdx: index('grievances_status_idx').on(table.status),
}));

export const hearingSessions = sqliteTable('hearing_sessions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  grievanceId: integer('grievance_id').references(() => employeeGrievances.id, { onDelete: 'set null' }),
  sessionTitle: text('session_title').notNull(),
  sessionDate: text('session_date').notNull(),
  location: text('location').default('غرفة التحقيقات الإدارية والامتثال'),
  committeeChair: text('committee_chair').notNull(),
  hrRepresentative: text('hr_representative').notNull(),
  legalCounsel: text('legal_counsel').notNull(),
  employeeName: text('employee_name').notNull(),
  witnesses: text('witnesses'),
  statementsMinutes: text('statements_minutes').notNull(),
  committeeVerdict: text('committee_verdict').notNull(),
  recommendedSanction: text('recommended_sanction').default('none'), // 'none', 'written_notice', 'first_warning', 'second_warning', 'final_warning', 'salary_deduction', 'termination_art80'
  deductionDays: integer('deduction_days').default(0),
  status: text('status').default('completed'), // 'scheduled', 'completed', 'adjourned'
  createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
}, (table) => ({
  grievanceIdIdx: index('hearing_sessions_grievance_id_idx').on(table.grievanceId),
  sessionDateIdx: index('hearing_sessions_session_date_idx').on(table.sessionDate),
}));

export const officialWarnings = sqliteTable('official_warnings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  noticeNumber: text('notice_number').unique().notNull(),
  employeeId: integer('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
  warningType: text('warning_type').notNull(), // 'attention_notice', 'first_warning', 'second_warning', 'final_warning', 'salary_deduction'
  violationClause: text('violation_clause').notNull(),
  violationDate: text('violation_date').notNull(),
  investigationRef: text('investigation_ref'),
  penaltyDetails: text('penalty_details').notNull(),
  deductionAmount: real('deduction_amount').default(0),
  issuedBy: text('issued_by').notNull(),
  issueDate: text('issue_date').notNull(),
  acknowledgementStatus: text('acknowledgement_status').default('acknowledged'), // 'acknowledged', 'refused_to_sign', 'pending'
  createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
}, (table) => ({
  employeeIdIdx: index('official_warnings_employee_id_idx').on(table.employeeId),
  noticeNumberIdx: uniqueIndex('official_warnings_number_idx').on(table.noticeNumber),
  warningTypeIdx: index('official_warnings_type_idx').on(table.warningType),
}));

// ============================================
// RELATIONS
// ============================================

export const employeeGrievancesRelations = relations(employeeGrievances, ({ one, many }) => ({
  employee: one(employees, { fields: [employeeGrievances.employeeId], references: [employees.id] }),
  hearingSessions: many(hearingSessions),
}));

export const hearingSessionsRelations = relations(hearingSessions, ({ one }) => ({
  grievance: one(employeeGrievances, { fields: [hearingSessions.grievanceId], references: [employeeGrievances.id] }),
}));

export const officialWarningsRelations = relations(officialWarnings, ({ one }) => ({
  employee: one(employees, { fields: [officialWarnings.employeeId], references: [employees.id] }),
}));