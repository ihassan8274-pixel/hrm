import {
  sqliteTable,
  integer,
  text,
  real,
  index,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';

// ============================================
// ORGANIZATION TABLES
// ============================================

export const branches = sqliteTable('branches', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  location: text('location'),
  latitude: real('latitude'),
  longitude: real('longitude'),
  geofenceRadiusM: integer('geofence_radius_m').default(200),
  workStartTime: text('work_start_time').default('08:00'),
  workEndTime: text('work_end_time').default('17:00'),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
}, (table) => ({
  nameIdx: index('branches_name_idx').on(table.name),
}));

export const departments = sqliteTable('departments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  managerId: integer('manager_id'),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
}, (table) => ({
  nameIdx: index('departments_name_idx').on(table.name),
}));

export const allowanceTypes = sqliteTable('allowance_types', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
}, (table) => ({
  nameIdx: uniqueIndex('allowance_types_name_idx').on(table.name),
}));

// ============================================
// EMPLOYEE TABLES
// ============================================

export const employees = sqliteTable('employees', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  branchId: integer('branch_id').references(() => branches.id),
  departmentId: integer('department_id').references(() => departments.id),
  name: text('name').notNull(),
  position: text('position'),
  jobTitle: text('job_title'),
  basicSalary: real('basic_salary').default(0),
  deductions: real('deductions').default(0),
  insuranceNumber: text('insurance_number'),
  bankAccount: text('bank_account'),
  // Saudi Compliance Fields
  nationality: text('nationality').default('سعودي'),
  isSaudi: integer('is_saudi').default(1),
  nationalIdIqama: text('national_id_iqama'),
  borderNumber: text('border_number'),
  iqamaExpiryGregorian: text('iqama_expiry_gregorian'),
  iqamaExpiryHijri: text('iqama_expiry_hijri'),
  iqamaProfession: text('iqama_profession'),
  workPermitNumber: text('work_permit_number'),
  workPermitExpiry: text('work_permit_expiry'),
  workPermitFee: real('work_permit_fee').default(9600),
  gosiNumber: text('gosi_number'),
  gosiRegisteredSalary: real('gosi_registered_salary').default(0),
  housingAllowance: real('housing_allowance').default(0),
  transportAllowance: real('transport_allowance').default(0),
  otherAllowances: real('other_allowances').default(0),
  insuranceCompany: text('insurance_company').default('التعاونية للتأمين'),
  medicalInsuranceCategory: text('medical_insurance_category').default('Class A'),
  medicalInsurancePolicy: text('medical_insurance_policy'),
  medicalInsuranceExpiry: text('medical_insurance_expiry'),
  medicalDependentsCount: integer('medical_dependents_count').default(0),
  saudiIban: text('saudi_iban'),
  bankName: text('bank_name').default('مصرف الراجحي'),
  contractType: text('contract_type').default('fixed'),
  contractStartDate: text('contract_start_date'),
  contractEndDate: text('contract_end_date'),
  passportNumber: text('passport_number'),
  passportExpiry: text('passport_expiry'),
  healthCertNumber: text('health_cert_number'),
  healthCertExpiry: text('health_cert_expiry'),
  paymentMethod: text('payment_method').default('bank'),
  faceTemplate: text('face_template'),
  countryCode: text('country_code').default('SA'),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
}, (table) => ({
  branchIdIdx: index('employees_branch_id_idx').on(table.branchId),
  departmentIdIdx: index('employees_department_id_idx').on(table.departmentId),
  nationalIdIdx: index('employees_national_id_idx').on(table.nationalIdIqama),
  isSaudiIdx: index('employees_is_saudi_idx').on(table.isSaudi),
  contractEndIdx: index('employees_contract_end_idx').on(table.contractEndDate),
}));

export const employeeAllowances = sqliteTable('employee_allowances', {
  employeeId: integer('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
  allowanceTypeId: integer('allowance_type_id').notNull().references(() => allowanceTypes.id, { onDelete: 'cascade' }),
  amount: real('amount').default(0),
}, (table) => ({
  pk: primaryKey({ columns: [table.employeeId, table.allowanceTypeId] }),
}));

// ============================================
// RELATIONS
// ============================================

export const branchesRelations = relations(branches, ({ many }) => ({
  employees: many(employees),
  attendanceDevices: many(attendanceDevices),
}));

export const departmentsRelations = relations(departments, ({ many }) => ({
  employees: many(employees),
}));

export const employeesRelations = relations(employees, ({ one, many }) => ({
  branch: one(branches, { fields: [employees.branchId], references: [branches.id] }),
  department: one(departments, { fields: [employees.departmentId], references: [departments.id] }),
  allowances: many(employeeAllowances),
  payroll: many(payroll),
  attendance: many(attendance),
  loans: many(loans),
  leaves: many(leaves),
  documents: many(documents),
  assets: many(assets),
  appraisals: many(appraisals),
  bonusesPenalties: many(bonusesPenalties),
  overtimeRecords: many(overtimeRecords),
  governmentRenewals: many(governmentRenewals),
  eosCalculations: many(eosCalculations),
  visas: many(visas),
  flightTickets: many(flightTickets),
  salaryCertificates: many(salaryCertificates),
  qiwaContracts: many(qiwaContracts),
  disciplinaryViolations: many(disciplinaryViolations),
  employeeClearances: many(employeeClearances),
  workInjuries: many(workInjuries),
  hrGeneratedLetters: many(hrGeneratedLetters),
  medicalDependents: many(medicalDependents),
  talentAssessments: many(talentAssessments),
  successionPlansAsHolder: many(successionPlans, { relationName: 'currentHolder' }),
  successionPlansAsPrimary: many(successionPlans, { relationName: 'primarySuccessor' }),
  successionPlansAsSecondary: many(successionPlans, { relationName: 'secondarySuccessor' }),
  fleetVehicles: many(fleetVehicles),
  trafficFines: many(trafficFines),
  flexibleWorkShifts: many(flexibleWorkShifts),
  teleworkPermits: many(teleworkPermits),
  employeeGrievances: many(employeeGrievances),
  hearingSessions: many(hearingSessions),
  officialWarnings: many(officialWarnings),
  peerKudosSent: many(peerKudos, { relationName: 'sender' }),
  peerKudosReceived: many(peerKudos, { relationName: 'recipient' }),
  rewardRedemptions: many(rewardRedemptions),
  smartAssets: many(smartAssets),
  employeeTransfersFrom: many(employeeTransfers, { relationName: 'fromBranch' }),
  employeeTransfersTo: many(employeeTransfers, { relationName: 'toBranch' }),
  employeeDocuments: many(employeeDocuments),
  attendanceLogs: many(attendanceLogs),
  ewaWithdrawals: many(ewaWithdrawals),
  exitInterviews: many(exitInterviews),
}));

export const allowanceTypesRelations = relations(allowanceTypes, ({ many }) => ({
  employeeAllowances: many(employeeAllowances),
}));

export const employeeAllowancesRelations = relations(employeeAllowances, ({ one }) => ({
  employee: one(employees, { fields: [employeeAllowances.employeeId], references: [employees.id] }),
  allowanceType: one(allowanceTypes, { fields: [employeeAllowances.allowanceTypeId], references: [allowanceTypes.id] }),
}));

// Forward references for relations
import { attendanceDevices } from './attendance';
import { payroll } from './payroll';
import { attendance } from './attendance';
import { loans } from './payroll';
import { leaves } from './leaves';
import { documents } from './documents';
import { assets } from './assets';
import { appraisals } from './appraisals';
import { bonusesPenalties } from './payroll';
import { overtimeRecords } from './overtime';
import { governmentRenewals } from './compliance';
import { eosCalculations } from './compliance';
import { visas } from './visas';
import { flightTickets } from './visas';
import { salaryCertificates } from './compliance';
import { qiwaContracts } from './qiwa';
import { disciplinaryViolations } from './disciplinary';
import { employeeClearances } from './clearance';
import { workInjuries } from './hse';
import { hrGeneratedLetters } from './ai';
import { medicalDependents } from './medical';
import { talentAssessments } from './talent';
import { successionPlans } from './talent';
import { fleetVehicles } from './fleet';
import { trafficFines } from './fleet';
import { flexibleWorkShifts } from './flexible';
import { teleworkPermits } from './flexible';
import { employeeGrievances } from './grievances';
import { hearingSessions } from './grievances';
import { officialWarnings } from './grievances';
import { peerKudos } from './rewards';
import { rewardRedemptions } from './rewards';
import { smartAssets } from './assets';
import { employeeTransfers } from './transfers';
import { employeeDocuments } from './documents';
import { attendanceLogs } from './attendance';
import { ewaWithdrawals } from './ewa';
import { exitInterviews } from './analytics';