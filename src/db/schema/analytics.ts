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
// EXIT INTERVIEWS & ANALYTICS
// ============================================

export const exitInterviews = sqliteTable('exit_interviews', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  employeeId: integer('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
  departmentName: text('department_name'),
  jobTitle: text('job_title'),
  hireDate: text('hire_date'),
  departureDate: text('departure_date').notNull(),
  primaryReason: text('primary_reason').notNull(), // 'salary', 'management', 'career_growth', 'work_life_balance', 'relocation', 'toxic_culture', 'health_personal'
  primaryReasonAr: text('primary_reason_ar'),
  reasonDetails: text('reason_details'),
  managerRating: integer('manager_rating'), // 1 - 5
  cultureRating: integer('culture_rating'), // 1 - 5
  benefitsRating: integer('benefits_rating'), // 1 - 5
  wouldRecommendScore: integer('would_recommend_score'), // 1 - 10
  retentionFeedback: text('retention_feedback'),
  estimatedReplacementCost: real('estimated_replacement_cost').default(0),
  aiSentiment: text('ai_sentiment'), // 'negative', 'neutral', 'positive'
  aiSummary: text('ai_summary'),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
}, (table) => ({
  employeeIdIdx: index('exit_interviews_employee_id_idx').on(table.employeeId),
  departureDateIdx: index('exit_interviews_departure_date_idx').on(table.departureDate),
  primaryReasonIdx: index('exit_interviews_reason_idx').on(table.primaryReason),
}));

// ============================================
// APPROVAL WORKFLOWS
// ============================================

export const approvalWorkflows = sqliteTable('approval_workflows', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  workflowType: text('workflow_type').notNull(), // 'leave_request', 'loan_advance', 'promotion', 'expense_claim', 'ewa_withdrawal', 'hiring_requisition'
  title: text('title').notNull(),
  description: text('description'),
  conditions: text('conditions'), // JSON string
  levels: text('levels').notNull(), // JSON string
  isActive: integer('is_active').default(1),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
}, (table) => ({
  workflowTypeIdx: index('approval_workflows_type_idx').on(table.workflowType),
  isActiveIdx: index('approval_workflows_active_idx').on(table.isActive),
}));

export const approvalRequests = sqliteTable('approval_requests', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  workflowId: integer('workflow_id').notNull().references(() => approvalWorkflows.id),
  requesterId: integer('requester_id').notNull().references(() => employees.id),
  requestType: text('request_type').notNull(),
  requestTitle: text('request_title').notNull(),
  amount: real('amount'),
  details: text('details'),
  currentLevel: integer('current_level').default(1),
  maxLevels: integer('max_levels').notNull(),
  currentApproverRole: text('current_approver_role'),
  status: text('status').default('pending'), // 'pending', 'approved', 'rejected'
  history: text('history'), // JSON string
  createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
}, (table) => ({
  workflowIdIdx: index('approval_requests_workflow_id_idx').on(table.workflowId),
  requesterIdIdx: index('approval_requests_requester_id_idx').on(table.requesterId),
  statusIdx: index('approval_requests_status_idx').on(table.status),
}));

// ============================================
// DEPARTMENT BUDGETS
// ============================================

export const departmentBudgets = sqliteTable('department_budgets', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  departmentId: integer('department_id').references(() => departments.id, { onDelete: 'cascade' }),
  fiscalYear: integer('fiscal_year').default(2026),
  allocatedSalaries: real('allocated_salaries').default(0),
  allocatedGosi: real('allocated_gosi').default(0),
  allocatedMedical: real('allocated_medical').default(0),
  allocatedWorkPermits: real('allocated_work_permits').default(0),
  allocatedFlightTickets: real('allocated_flight_tickets').default(0),
  allocatedEndOfService: real('allocated_end_of_service').default(0),
  allocatedTrainingRewards: real('allocated_training_rewards').default(0),
  totalAllocated: real('total_allocated').default(0),
  actualSpent: real('actual_spent').default(0),
  committedRemaining: real('committed_remaining').default(0),
  headcountCap: integer('headcount_cap').default(10),
  currentHeadcount: integer('current_headcount').default(0),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
}, (table) => ({
  departmentYearIdx: uniqueIndex('department_budgets_dept_year_idx').on(table.departmentId, table.fiscalYear),
}));

// ============================================
// RELATIONS
// ============================================

import { departments } from './organization';

export const exitInterviewsRelations = relations(exitInterviews, ({ one }) => ({
  employee: one(employees, { fields: [exitInterviews.employeeId], references: [employees.id] }),
}));

export const approvalWorkflowsRelations = relations(approvalWorkflows, ({ many }) => ({
  requests: many(approvalRequests),
}));

export const approvalRequestsRelations = relations(approvalRequests, ({ one }) => ({
  workflow: one(approvalWorkflows, { fields: [approvalRequests.workflowId], references: [approvalWorkflows.id] }),
  requester: one(employees, { fields: [approvalRequests.requesterId], references: [employees.id] }),
}));

export const departmentBudgetsRelations = relations(departmentBudgets, ({ one }) => ({
  department: one(departments, { fields: [departmentBudgets.departmentId], references: [departments.id] }),
}));