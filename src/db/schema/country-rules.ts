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
// COUNTRY RULES & TAX BRACKETS
// ============================================

export const countryRules = sqliteTable('country_rules', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  countryCode: text('country_code').unique().notNull(),
  countryName: text('country_name').notNull(),
  currency: text('currency').default('SAR'),
  insuranceEmpRate: real('insurance_emp_rate').default(0),
  insuranceCompRate: real('insurance_comp_rate').default(0),
  taxType: text('tax_type').default('none'), // 'none', 'progressive', 'flat'
  eosbMonthsPerYear: real('eosb_months_per_year').default(0.5),
  annualLeaveDays: integer('annual_leave_days').default(21),
  workingHours: integer('working_hours').default(8),
  notes: text('notes'),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
}, (table) => ({
  countryCodeIdx: uniqueIndex('country_rules_code_idx').on(table.countryCode),
}));

export const taxBrackets = sqliteTable('tax_brackets', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  countryCode: text('country_code').notNull().references(() => countryRules.countryCode),
  lowerBound: real('lower_bound').notNull(),
  upperBound: real('upper_bound'),
  rate: real('rate').notNull(),
}, (table) => ({
  countryCodeIdx: index('tax_brackets_country_code_idx').on(table.countryCode),
}));

// ============================================
// RELATIONS
// ============================================

export const countryRulesRelations = relations(countryRules, ({ many }) => ({
  taxBrackets: many(taxBrackets),
}));

export const taxBracketsRelations = relations(taxBrackets, ({ one }) => ({
  countryRule: one(countryRules, { fields: [taxBrackets.countryCode], references: [countryRules.countryCode] }),
}));