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
import { departments } from './organization';

// ============================================
// TALENT ASSESSMENTS & SUCCESSION
// ============================================

export const talentAssessments = sqliteTable('talent_assessments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  employeeId: integer('employee_id').unique().notNull().references(() => employees.id, { onDelete: 'cascade' }),
  performanceScore: integer('performance_score').default(2), // 1, 2, 3
  potentialScore: integer('potential_score').default(2), // 1, 2, 3
  boxCategory: text('box_category').default('core_player'),
  keyStrengths: text('key_strengths'),
  developmentNeeds: text('development_needs'),
  readinessTimeline: text('readiness_timeline').default('ready_1_year'),
  assessedBy: text('assessed_by').default('لجنة الموارد البشرية'),
  assessedAt: text('assessed_at').default('CURRENT_TIMESTAMP'),
}, (table) => ({
  employeeIdIdx: uniqueIndex('talent_assessments_employee_id_idx').on(table.employeeId),
  boxCategoryIdx: index('talent_assessments_box_category_idx').on(table.boxCategory),
}));

export const successionPlans = sqliteTable('succession_plans', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  criticalRoleTitle: text('critical_role_title').notNull(),
  departmentId: integer('department_id').references(() => departments.id),
  currentHolderId: integer('current_holder_id').notNull().references(() => employees.id),
  riskLevel: text('risk_level').default('high'), // 'critical', 'high', 'medium'
  primarySuccessorId: integer('primary_successor_id').references(() => employees.id),
  secondarySuccessorId: integer('secondary_successor_id').references(() => employees.id),
  readinessStatus: text('readiness_status').default('in_development'), // 'ready_now', 'in_development', 'no_successor'
  developmentActionPlan: text('development_action_plan'),
  isSaudizationTarget: integer('is_saudization_target').default(1),
  updatedAt: text('updated_at').default('CURRENT_TIMESTAMP'),
}, (table) => ({
  departmentIdIdx: index('succession_plans_department_id_idx').on(table.departmentId),
  riskLevelIdx: index('succession_plans_risk_level_idx').on(table.riskLevel),
}));

// ============================================
// RELATIONS
// ============================================

export const talentAssessmentsRelations = relations(talentAssessments, ({ one }) => ({
  employee: one(employees, { fields: [talentAssessments.employeeId], references: [employees.id] }),
}));

export const successionPlansRelations = relations(successionPlans, ({ one }) => ({
  department: one(departments, { fields: [successionPlans.departmentId], references: [departments.id] }),
  currentHolder: one(employees, { fields: [successionPlans.currentHolderId], references: [employees.id], relationName: 'currentHolder' }),
  primarySuccessor: one(employees, { fields: [successionPlans.primarySuccessorId], references: [employees.id], relationName: 'primarySuccessor' }),
  secondarySuccessor: one(employees, { fields: [successionPlans.secondarySuccessorId], references: [employees.id], relationName: 'secondarySuccessor' }),
}));