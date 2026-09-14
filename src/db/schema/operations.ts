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
// OVERTIME RECORDS
// ============================================

export const overtimeRecords = sqliteTable('overtime_records', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  employeeId: integer('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
  date: text('date').notNull(),
  normalHours: real('normal_hours').default(0),
  weekendHours: real('weekend_hours').default(0),
  holidayHours: real('holiday_hours').default(0),
  hourlyRate: real('hourly_rate').default(0),
  totalOvertimePay: real('total_overtime_pay').default(0),
  status: text('status').default('pending'), // 'pending', 'approved', 'rejected', 'processed'
  reason: text('reason'),
  month: integer('month'),
  year: integer('year'),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
}, (table) => ({
  employeeIdIdx: index('overtime_employee_id_idx').on(table.employeeId),
  dateIdx: index('overtime_date_idx').on(table.date),
  statusIdx: index('overtime_status_idx').on(table.status),
  monthYearIdx: index('overtime_month_year_idx').on(table.month, table.year),
}));

// ============================================
// POLICIES
// ============================================

export const policies = sqliteTable('policies', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  key: text('key').unique().notNull(),
  value: text('value'),
}, (table) => ({
  keyIdx: uniqueIndex('policies_key_idx').on(table.key),
}));

// ============================================
// CHECKLISTS
// ============================================

export const checklists = sqliteTable('checklists', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  employeeId: integer('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
  itemName: text('item_name').notNull(),
  isCompleted: integer('is_completed').default(0),
  type: text('type'), // 'onboarding', 'offboarding'
}, (table) => ({
  employeeIdIdx: index('checklists_employee_id_idx').on(table.employeeId),
  typeIdx: index('checklists_type_idx').on(table.type),
}));

// ============================================
// SKILLS & TRAINING
// ============================================

export const skills = sqliteTable('skills', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').unique().notNull(),
}, (table) => ({
  nameIdx: uniqueIndex('skills_name_idx').on(table.name),
}));

export const employeeSkills = sqliteTable('employee_skills', {
  employeeId: integer('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
  skillId: integer('skill_id').notNull().references(() => skills.id, { onDelete: 'cascade' }),
  level: integer('level'), // 1 to 5
}, (table) => ({
  pk: primaryKey({ columns: [table.employeeId, table.skillId] }),
}));

export const trainingCourses = sqliteTable('training_courses', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  description: text('description'),
  date: text('date'),
}, (table) => ({
  dateIdx: index('training_courses_date_idx').on(table.date),
}));

export const employeeTraining = sqliteTable('employee_training', {
  employeeId: integer('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
  courseId: integer('course_id').notNull().references(() => trainingCourses.id, { onDelete: 'cascade' }),
  status: text('status').default('enrolled'), // 'enrolled', 'completed'
}, (table) => ({
  pk: primaryKey({ columns: [table.employeeId, table.courseId] }),
}));

// ============================================
// PROJECTS & TASKS
// ============================================

export const projects = sqliteTable('projects', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  departmentId: integer('department_id').references(() => departments.id),
  status: text('status').default('active'), // 'active', 'completed', 'on_hold'
  startDate: text('start_date'),
  endDate: text('end_date'),
}, (table) => ({
  departmentIdIdx: index('projects_department_id_idx').on(table.departmentId),
  statusIdx: index('projects_status_idx').on(table.status),
}));

export const tasks = sqliteTable('tasks', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  projectId: integer('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  employeeId: integer('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description'),
  status: text('status').default('pending'), // 'pending', 'in_progress', 'completed'
  dueDate: text('due_date'),
}, (table) => ({
  projectIdIdx: index('tasks_project_id_idx').on(table.projectId),
  employeeIdIdx: index('tasks_employee_id_idx').on(table.employeeId),
  statusIdx: index('tasks_status_idx').on(table.status),
}));

// ============================================
// RECRUITMENT
// ============================================

export const jobOpenings = sqliteTable('job_openings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  departmentId: integer('department_id').references(() => departments.id),
  status: text('status').default('open'), // 'open', 'closed'
  description: text('description'),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
}, (table) => ({
  departmentIdIdx: index('job_openings_department_id_idx').on(table.departmentId),
  statusIdx: index('job_openings_status_idx').on(table.status),
}));

export const candidates = sqliteTable('candidates', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  jobId: integer('job_id').notNull().references(() => jobOpenings.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  email: text('email'),
  phone: text('phone'),
  status: text('status').default('applied'), // 'applied', 'interview', 'offered', 'hired', 'rejected'
  cvUrl: text('cv_url'),
  notes: text('notes'),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
}, (table) => ({
  jobIdIdx: index('candidates_job_id_idx').on(table.jobId),
  statusIdx: index('candidates_status_idx').on(table.status),
}));

// ============================================
// EXPENSES
// ============================================

export const expenseClaims = sqliteTable('expense_claims', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  employeeId: integer('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
  amount: real('amount').notNull(),
  category: text('category').notNull(),
  description: text('description'),
  status: text('status').default('pending'), // 'pending', 'approved', 'rejected'
  date: text('date').notNull(),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
}, (table) => ({
  employeeIdIdx: index('expense_claims_employee_id_idx').on(table.employeeId),
  statusIdx: index('expense_claims_status_idx').on(table.status),
  dateIdx: index('expense_claims_date_idx').on(table.date),
}));

// ============================================
// PROMOTIONS
// ============================================

export const promotions = sqliteTable('promotions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  employeeId: integer('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
  oldPosition: text('old_position'),
  newPosition: text('new_position'),
  oldSalary: real('old_salary'),
  newSalary: real('new_salary'),
  promotionDate: text('promotion_date'),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
}, (table) => ({
  employeeIdIdx: index('promotions_employee_id_idx').on(table.employeeId),
  dateIdx: index('promotions_date_idx').on(table.promotionDate),
}));

// ============================================
// RELATIONS
// ============================================

import { departments } from './organization';

export const overtimeRecordsRelations = relations(overtimeRecords, ({ one }) => ({
  employee: one(employees, { fields: [overtimeRecords.employeeId], references: [employees.id] }),
}));

export const checklistsRelations = relations(checklists, ({ one }) => ({
  employee: one(employees, { fields: [checklists.employeeId], references: [employees.id] }),
}));

export const skillsRelations = relations(skills, ({ many }) => ({
  employeeSkills: many(employeeSkills),
}));

export const employeeSkillsRelations = relations(employeeSkills, ({ one }) => ({
  employee: one(employees, { fields: [employeeSkills.employeeId], references: [employees.id] }),
  skill: one(skills, { fields: [employeeSkills.skillId], references: [skills.id] }),
}));

export const trainingCoursesRelations = relations(trainingCourses, ({ many }) => ({
  employeeTraining: many(employeeTraining),
}));

export const employeeTrainingRelations = relations(employeeTraining, ({ one }) => ({
  employee: one(employees, { fields: [employeeTraining.employeeId], references: [employees.id] }),
  course: one(trainingCourses, { fields: [employeeTraining.courseId], references: [trainingCourses.id] }),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  department: one(departments, { fields: [projects.departmentId], references: [departments.id] }),
  tasks: many(tasks),
}));

export const tasksRelations = relations(tasks, ({ one }) => ({
  project: one(projects, { fields: [tasks.projectId], references: [projects.id] }),
  employee: one(employees, { fields: [tasks.employeeId], references: [employees.id] }),
}));

export const jobOpeningsRelations = relations(jobOpenings, ({ one, many }) => ({
  department: one(departments, { fields: [jobOpenings.departmentId], references: [departments.id] }),
  candidates: many(candidates),
}));

export const candidatesRelations = relations(candidates, ({ one }) => ({
  job: one(jobOpenings, { fields: [candidates.jobId], references: [jobOpenings.id] }),
}));

export const expenseClaimsRelations = relations(expenseClaims, ({ one }) => ({
  employee: one(employees, { fields: [expenseClaims.employeeId], references: [employees.id] }),
}));

export const promotionsRelations = relations(promotions, ({ one }) => ({
  employee: one(employees, { fields: [promotions.employeeId], references: [employees.id] }),
}));