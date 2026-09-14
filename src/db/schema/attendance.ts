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
// ATTENDANCE DEVICES & LOGS (KIOSK)
// ============================================

export const attendanceDevices = sqliteTable('attendance_devices', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  branchId: integer('branch_id').notNull().references(() => branches.id, { onDelete: 'cascade' }),
  deviceName: text('device_name'),
  deviceToken: text('device_token').unique().notNull(),
  lastLatitude: real('last_latitude'),
  lastLongitude: real('last_longitude'),
  lastVerifiedAt: text('last_verified_at'),
  status: text('status').default('active'),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
}, (table) => ({
  branchIdIdx: index('attendance_devices_branch_id_idx').on(table.branchId),
  deviceTokenIdx: uniqueIndex('attendance_devices_token_idx').on(table.deviceToken),
  statusIdx: index('attendance_devices_status_idx').on(table.status),
}));

export const attendanceLogs = sqliteTable('attendance_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  employeeId: integer('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
  branchId: integer('branch_id').notNull().references(() => branches.id),
  deviceId: integer('device_id').references(() => attendanceDevices.id),
  checkInTime: text('check_in_time'),
  checkOutTime: text('check_out_time'),
  checkInLat: real('check_in_lat'),
  checkInLng: real('check_in_lng'),
  checkOutLat: real('check_out_lat'),
  checkOutLng: real('check_out_lng'),
  method: text('method').default('manual'),
  status: text('status').default('present'),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
}, (table) => ({
  employeeIdIdx: index('attendance_logs_employee_id_idx').on(table.employeeId),
  branchIdIdx: index('attendance_logs_branch_id_idx').on(table.branchId),
  deviceIdIdx: index('attendance_logs_device_id_idx').on(table.deviceId),
  checkInTimeIdx: index('attendance_logs_check_in_time_idx').on(table.checkInTime),
}));

// ============================================
// EMPLOYEE DOCUMENTS
// ============================================

export const employeeDocuments = sqliteTable('employee_documents', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  employeeId: integer('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
  docType: text('doc_type'),
  docNumber: text('doc_number'),
  issueDate: text('issue_date'),
  expiryDate: text('expiry_date'),
  filePath: text('file_path'),
  notes: text('notes'),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
}, (table) => ({
  employeeIdIdx: index('employee_documents_employee_id_idx').on(table.employeeId),
  docTypeIdx: index('employee_documents_doc_type_idx').on(table.docType),
  expiryDateIdx: index('employee_documents_expiry_date_idx').on(table.expiryDate),
}));

// ============================================
// EMPLOYEE TRANSFERS
// ============================================

export const employeeTransfers = sqliteTable('employee_transfers', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  employeeId: integer('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
  fromBranchId: integer('from_branch_id').references(() => branches.id),
  toBranchId: integer('to_branch_id').notNull().references(() => branches.id),
  effectiveDate: text('effective_date'),
  reason: text('reason'),
  createdBy: text('created_by').default('User'),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
}, (table) => ({
  employeeIdIdx: index('employee_transfers_employee_id_idx').on(table.employeeId),
  fromBranchIdx: index('employee_transfers_from_branch_idx').on(table.fromBranchId),
  toBranchIdx: index('employee_transfers_to_branch_idx').on(table.toBranchId),
}));

// ============================================
// RELATIONS
// ============================================

export const attendanceDevicesRelations = relations(attendanceDevices, ({ one, many }) => ({
  branch: one(branches, { fields: [attendanceDevices.branchId], references: [branches.id] }),
  attendanceLogs: many(attendanceLogs),
}));

export const attendanceLogsRelations = relations(attendanceLogs, ({ one }) => ({
  employee: one(employees, { fields: [attendanceLogs.employeeId], references: [employees.id] }),
  branch: one(branches, { fields: [attendanceLogs.branchId], references: [branches.id] }),
  device: one(attendanceDevices, { fields: [attendanceLogs.deviceId], references: [attendanceDevices.id] }),
}));

export const employeeDocumentsRelations = relations(employeeDocuments, ({ one }) => ({
  employee: one(employees, { fields: [employeeDocuments.employeeId], references: [employees.id] }),
}));

export const employeeTransfersRelations = relations(employeeTransfers, ({ one }) => ({
  employee: one(employees, { fields: [employeeTransfers.employeeId], references: [employees.id] }),
  fromBranch: one(branches, { fields: [employeeTransfers.fromBranchId], references: [branches.id], relationName: 'fromBranch' }),
  toBranch: one(branches, { fields: [employeeTransfers.toBranchId], references: [branches.id], relationName: 'toBranch' }),
}));