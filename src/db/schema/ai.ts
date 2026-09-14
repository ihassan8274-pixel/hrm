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
// AI HR LETTERS & COPILOT
// ============================================

export const hrGeneratedLetters = sqliteTable('hr_generated_letters', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  letterId: text('letter_id').unique().notNull(),
  employeeId: integer('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
  letterType: text('letter_type').notNull(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
}, (table) => ({
  employeeIdIdx: index('hr_letters_employee_id_idx').on(table.employeeId),
  letterIdIdx: uniqueIndex('hr_letters_letter_id_idx').on(table.letterId),
  letterTypeIdx: index('hr_letters_type_idx').on(table.letterType),
}));

// ============================================
// RELATIONS
// ============================================

export const hrGeneratedLettersRelations = relations(hrGeneratedLetters, ({ one }) => ({
  employee: one(employees, { fields: [hrGeneratedLetters.employeeId], references: [employees.id] }),
}));