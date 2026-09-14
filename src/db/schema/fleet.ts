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
// FLEET VEHICLES & TRAFFIC FINES
// ============================================

export const fleetVehicles = sqliteTable('fleet_vehicles', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  plateNumber: text('plate_number').unique().notNull(),
  makeModel: text('make_model').notNull(),
  year: integer('year').default(2024),
  vinNumber: text('vin_number'),
  assignedEmployeeId: integer('assigned_employee_id').references(() => employees.id, { onDelete: 'set null' }),
  assignmentDate: text('assignment_date'),
  istimaraExpiry: text('istimara_expiry'),
  insuranceExpiry: text('insurance_expiry'),
  periodicInspectionExpiry: text('periodic_inspection_expiry'),
  status: text('status').default('assigned'), // 'assigned', 'available', 'maintenance', 'impounded'
  currentOdometer: integer('current_odometer').default(0),
  fuelCardNumber: text('fuel_card_number'),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
}, (table) => ({
  plateNumberIdx: uniqueIndex('fleet_vehicles_plate_idx').on(table.plateNumber),
  assignedEmployeeIdx: index('fleet_vehicles_assigned_emp_idx').on(table.assignedEmployeeId),
  statusIdx: index('fleet_vehicles_status_idx').on(table.status),
}));

export const trafficFines = sqliteTable('traffic_fines', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  vehicleId: integer('vehicle_id').notNull().references(() => fleetVehicles.id, { onDelete: 'cascade' }),
  employeeId: integer('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
  fineNumber: text('fine_number').unique().notNull(),
  violationType: text('violation_type'),
  amount: real('amount').default(300),
  fineDate: text('fine_date').notNull(),
  deductedFromPayroll: integer('deducted_from_payroll').default(0),
  payrollMonth: integer('payroll_month'),
  payrollYear: integer('payroll_year'),
  status: text('status').default('pending'), // 'pending', 'deducted', 'waived'
  createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
}, (table) => ({
  vehicleIdIdx: index('traffic_fines_vehicle_id_idx').on(table.vehicleId),
  employeeIdIdx: index('traffic_fines_employee_id_idx').on(table.employeeId),
  fineNumberIdx: uniqueIndex('traffic_fines_number_idx').on(table.fineNumber),
  statusIdx: index('traffic_fines_status_idx').on(table.status),
}));

// ============================================
// RELATIONS
// ============================================

export const fleetVehiclesRelations = relations(fleetVehicles, ({ one, many }) => ({
  assignedEmployee: one(employees, { fields: [fleetVehicles.assignedEmployeeId], references: [employees.id] }),
  trafficFines: many(trafficFines),
}));

export const trafficFinesRelations = relations(trafficFines, ({ one }) => ({
  vehicle: one(fleetVehicles, { fields: [trafficFines.vehicleId], references: [fleetVehicles.id] }),
  employee: one(employees, { fields: [trafficFines.employeeId], references: [employees.id] }),
}));