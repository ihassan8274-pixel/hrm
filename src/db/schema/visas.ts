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
// VISAS & MUQEEM
// ============================================

export const visas = sqliteTable('visas', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  employeeId: integer('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
  visaType: text('visa_type').notNull(), // 'exit_reentry_single', 'exit_reentry_multiple', 'final_exit', 'work_visa'
  visaNumber: text('visa_number'),
  issueDate: text('issue_date'),
  travelBeforeDate: text('travel_before_date'),
  durationDays: integer('duration_days').default(60),
  returnBeforeDate: text('return_before_date'),
  cost: real('cost').default(200),
  status: text('status').default('active'), // 'active', 'used', 'expired', 'cancelled'
  notes: text('notes'),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
}, (table) => ({
  employeeIdIdx: index('visas_employee_id_idx').on(table.employeeId),
  visaTypeIdx: index('visas_type_idx').on(table.visaType),
  statusIdx: index('visas_status_idx').on(table.status),
}));

export const flightTickets = sqliteTable('flight_tickets', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  employeeId: integer('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
  destination: text('destination'),
  tripType: text('trip_type').default('round_trip'), // 'round_trip', 'one_way'
  departureDate: text('departure_date'),
  returnDate: text('return_date'),
  cost: real('cost').default(2500),
  allowanceType: text('allowance_type').default('ticket_issued'), // 'ticket_issued', 'cash_allowance'
  dependentsIncluded: integer('dependents_included').default(0),
  status: text('status').default('approved'), // 'pending', 'approved', 'issued', 'rejected'
  notes: text('notes'),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
}, (table) => ({
  employeeIdIdx: index('flight_tickets_employee_id_idx').on(table.employeeId),
  statusIdx: index('flight_tickets_status_idx').on(table.status),
}));

export const salaryCertificates = sqliteTable('salary_certificates', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  employeeId: integer('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
  certificateNumber: text('certificate_number').unique().notNull(),
  addressedTo: text('addressed_to'),
  purpose: text('purpose').default('general'), // 'bank_loan', 'credit_card', 'embassy_visa', 'real_estate_rental', 'government_agency', 'general'
  includeAllowances: integer('include_allowances').default(1),
  includeBankIban: integer('include_bank_iban').default(1),
  qrVerificationCode: text('qr_verification_code'),
  issueDate: text('issue_date'),
  validUntil: text('valid_until'),
  status: text('status').default('issued'),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
}, (table) => ({
  employeeIdIdx: index('salary_certificates_employee_id_idx').on(table.employeeId),
  certNumberIdx: uniqueIndex('salary_certificates_number_idx').on(table.certificateNumber),
  qrCodeIdx: uniqueIndex('salary_certificates_qr_idx').on(table.qrVerificationCode),
}));

// ============================================
// RELATIONS
// ============================================

export const visasRelations = relations(visas, ({ one }) => ({
  employee: one(employees, { fields: [visas.employeeId], references: [employees.id] }),
}));

export const flightTicketsRelations = relations(flightTickets, ({ one }) => ({
  employee: one(employees, { fields: [flightTickets.employeeId], references: [employees.id] }),
}));

export const salaryCertificatesRelations = relations(salaryCertificates, ({ one }) => ({
  employee: one(employees, { fields: [salaryCertificates.employeeId], references: [employees.id] }),
}));