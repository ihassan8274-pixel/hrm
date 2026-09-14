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
// MEDICAL INSURANCE & CCHI
// ============================================

export const medicalPolicies = sqliteTable('medical_policies', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  policyNumber: text('policy_number').unique().notNull(),
  insuranceCompany: text('insurance_company').notNull(),
  startDate: text('start_date').notNull(),
  expiryDate: text('expiry_date').notNull(),
  totalMembers: integer('total_members').default(0),
  totalPremium: real('total_premium').default(0),
  cchiApprovalNumber: text('cchi_approval_number'),
  status: text('status').default('active'), // 'active', 'expiring_soon', 'expired'
  createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
}, (table) => ({
  policyNumberIdx: uniqueIndex('medical_policies_number_idx').on(table.policyNumber),
  expiryDateIdx: index('medical_policies_expiry_date_idx').on(table.expiryDate),
  statusIdx: index('medical_policies_status_idx').on(table.status),
}));

export const medicalDependents = sqliteTable('medical_dependents', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  employeeId: integer('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  relationship: text('relationship').default('spouse'), // 'spouse', 'son', 'daughter', 'parent'
  nationalIdIqama: text('national_id_iqama'),
  birthDate: text('birth_date'),
  gender: text('gender').default('male'), // 'male', 'female'
  category: text('category').default('Class A'), // 'VIP', 'Class A', 'Class B', 'Class C'
  cardNumber: text('card_number'),
  annualPremium: real('annual_premium').default(2500),
  status: text('status').default('active'), // 'active', 'cancelled', 'pending'
  createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
}, (table) => ({
  employeeIdIdx: index('medical_dependents_employee_id_idx').on(table.employeeId),
  statusIdx: index('medical_dependents_status_idx').on(table.status),
}));

export const insuranceEndorsements = sqliteTable('insurance_endorsements', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  employeeId: integer('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
  type: text('type').default('addition'), // 'addition', 'deletion', 'upgrade'
  endorsementDate: text('endorsement_date'),
  premiumAdjustment: real('premium_adjustment').default(0),
  cchiReference: text('cchi_reference'),
  status: text('status').default('processed'), // 'processed', 'submitted'
  createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
}, (table) => ({
  employeeIdIdx: index('insurance_endorsements_employee_id_idx').on(table.employeeId),
  typeIdx: index('insurance_endorsements_type_idx').on(table.type),
}));

// ============================================
// RELATIONS
// ============================================

export const medicalPoliciesRelations = relations(medicalPolicies, ({ many }) => ({
  // No direct relations to employees in this schema
}));

export const medicalDependentsRelations = relations(medicalDependents, ({ one }) => ({
  employee: one(employees, { fields: [medicalDependents.employeeId], references: [employees.id] }),
}));

export const insuranceEndorsementsRelations = relations(insuranceEndorsements, ({ one }) => ({
  employee: one(employees, { fields: [insuranceEndorsements.employeeId], references: [employees.id] }),
}));