import Database from 'better-sqlite3';
import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { ScopeError } from '../organization-scope';
import { csvDocument } from '../csv';
import {
  buildAttendanceDutyReport, buildPayrollOvertimeReport, buildExpiryAlertsReport,
  buildKsaComplianceReport, buildTrainingPromotionsReport, buildServiceTerminationReport,
} from '../extended-reports';

let db: Database.Database;
const now = new Date('2026-11-10T12:00:00Z');
const all = { entityId: null, branchId: null, employeeId: null };
const entity1 = { entityId: 1, branchId: null, employeeId: null };
const branch1 = { entityId: 1, branchId: 1, employeeId: null };
const ess1 = { entityId: 1, branchId: 1, employeeId: 1 };
const oct = { month: '10', year: '2026' };

beforeEach(() => {
  db = new Database(':memory:');
  db.exec(`
    CREATE TABLE branches (id INTEGER PRIMARY KEY, entity_id INTEGER, name TEXT);
    CREATE TABLE employees (
      id INTEGER PRIMARY KEY, entity_id INTEGER, branch_id INTEGER, name TEXT, position TEXT,
      is_saudi INTEGER, nationality TEXT, status TEXT, end_service_date TEXT, end_service_reason TEXT,
      gosi_number TEXT, gosi_registered_salary REAL, gosi_exempt INTEGER DEFAULT 0,
      basic_salary REAL, housing_allowance REAL, transport_allowance REAL, other_allowances REAL,
      saudi_iban TEXT, iqama_expiry_gregorian TEXT, work_permit_expiry TEXT, work_permit_number TEXT,
      medical_insurance_expiry TEXT, medical_insurance_policy TEXT, passport_expiry TEXT, passport_number TEXT,
      health_cert_expiry TEXT, health_cert_required INTEGER DEFAULT 0,
      contract_type TEXT, contract_end_date TEXT, national_id_iqama TEXT
    );
    CREATE TABLE settings (key TEXT, value TEXT);
    CREATE TABLE attendance_logs (employee_id INTEGER, branch_id INTEGER, check_in_time TEXT, check_out_time TEXT, status TEXT);
    CREATE TABLE attendance (employee_id INTEGER, month INTEGER, year INTEGER, absence_days REAL, overtime_hours REAL);
    CREATE TABLE attendance_devices (id INTEGER PRIMARY KEY, branch_id INTEGER);
    CREATE TABLE kiosk_security_logs (device_id INTEGER, reason TEXT, created_at TEXT);
    CREATE TABLE approval_requests (requester_id INTEGER, entity_type TEXT, request_type TEXT, status TEXT);
    CREATE TABLE payroll (employee_id INTEGER, month INTEGER, year INTEGER, basic_salary REAL, allowances REAL,
      deductions REAL, net_salary REAL, approval_status TEXT, payment_status TEXT, is_final_settlement INTEGER);
    CREATE TABLE overtime_records (employee_id INTEGER, month INTEGER, year INTEGER, hours REAL, total_overtime_pay REAL, status TEXT);
    CREATE TABLE appraisals (id INTEGER PRIMARY KEY, employee_id INTEGER, rating REAL, appraisal_date TEXT);
    CREATE TABLE training_enrollments (id INTEGER PRIMARY KEY, employee_id INTEGER, status TEXT, certificate_number TEXT);
    CREATE TABLE promotions (employee_id INTEGER, appraisal_id INTEGER, training_enrollment_id INTEGER, approval_status TEXT);
    CREATE TABLE health_certificates (employee_id INTEGER, certificate_number TEXT, expiry_date TEXT, status TEXT);
    CREATE TABLE visas (employee_id INTEGER, visa_number TEXT, expiry_date TEXT, status TEXT);
    CREATE TABLE qiwa_contracts (employee_id INTEGER, contract_number TEXT, end_date TEXT);
    CREATE TABLE government_renewals (employee_id INTEGER, identifier TEXT, expiry_date TEXT, status TEXT);
    CREATE TABLE employee_clearances (employee_id INTEGER, overall_status TEXT, final_settlement_amount REAL, last_working_day TEXT);
    CREATE TABLE eos_calculations (employee_id INTEGER, net_payable TEXT, settlement_status TEXT);

    INSERT INTO branches VALUES (1,1,'الدمام'), (2,1,'الخبر'), (3,2,'فرع ب');
    INSERT INTO employees VALUES
      (1,1,1,'أحمد','مهندس',1,'سعودي','active',NULL,NULL,'G1',10000,0,8000,1000,500,0,'IBAN1',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,'fixed',NULL,'N1'),
      (2,1,2,'باسم','فني',0,'وافد','active',NULL,NULL,'G2',8000,0,6000,1000,400,0,'IBAN2','2026-11-15',NULL,'WP2','2026-12-20','POL2','2027-01-10','P2',NULL,0,'fixed','2026-12-15','N2'),
      (3,2,3,'خالد','محاسب',0,'وافد','active',NULL,NULL,'G3',5000,0,4000,500,200,0,'IBAN3',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,'fixed',NULL,'N3'),
      (4,1,1,'سالم','مدير',1,'سعودي','terminated','2026-10-31','إنهاء العقد','G4',0,1,5000,1000,300,0,'IBAN4',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,'fixed',NULL,'N4');
    INSERT INTO settings VALUES ('saudi_gosi_emp_rate','9.75'),('saudi_gosi_comp_rate','11.75'),('expat_gosi_comp_rate','2');
    INSERT INTO attendance_logs VALUES
      (1,1,'2026-10-01 08:00:00','2026-10-01 17:00:00','present'),
      (1,1,'2026-10-02 09:00:00',NULL,'late'),
      (2,2,'2026-10-01 08:00:00','2026-10-01 16:00:00','present'),
      (1,1,'2026-09-30 08:00:00','2026-09-30 17:00:00','present');
    INSERT INTO attendance VALUES (1,10,2026,0,8), (2,10,2026,1,3);
    INSERT INTO attendance_devices VALUES (1,1);
    INSERT INTO kiosk_security_logs VALUES (1,'geofence','2026-10-03 10:00:00'), (1,'geofence','2026-10-04 10:00:00'),
      (1,'geofence','2026-09-04 10:00:00');
    INSERT INTO approval_requests VALUES (1,'exit_permission',NULL,'rejected'), (1,'exit_permission',NULL,'approved');
    INSERT INTO payroll VALUES
      (1,10,2026,5000,500,500,5000,'approved','paid',0),
      (2,10,2026,6000,0,0,0,NULL,'pending',0),
      (4,10,2026,5000,0,0,1000,'approved','paid',1),
      (1,9,2026,5000,0,0,4500,'approved','paid',0);
    INSERT INTO overtime_records VALUES
      (1,10,2026,10,500,'approved'), (1,10,2026,4,200,'pending'), (2,10,2026,5,200,'pending');
    INSERT INTO appraisals VALUES (1,1,4,'2026-09-30'), (2,2,2,'2026-09-30');
    INSERT INTO training_enrollments VALUES (1,1,'completed','CERT-1'), (2,2,'recommended',NULL);
    INSERT INTO promotions VALUES (1,1,1,'approved'), (2,NULL,NULL,'pending');
    INSERT INTO health_certificates VALUES (1,'BAL1','2026-11-20','active');
    INSERT INTO visas VALUES (2,'V2','2026-10-01','active');
    INSERT INTO qiwa_contracts VALUES (1,'Q1','2026-12-01');
    INSERT INTO government_renewals VALUES (1,'R1','2027-02-01','pending');
    INSERT INTO employee_clearances VALUES (4,'completed',9000,'2026-10-31');
    INSERT INTO eos_calculations VALUES (4,'9000','draft');
    ALTER TABLE employees ADD COLUMN health_cert_number TEXT;
    ALTER TABLE employee_clearances ADD COLUMN id INTEGER;
    UPDATE employee_clearances SET id = 1;
    ALTER TABLE eos_calculations ADD COLUMN id INTEGER;
    UPDATE eos_calculations SET id = 1;
  `);
});
afterEach(() => db.close());

describe('attendance and duty report', () => {
  it('aggregates inside hours, lateness and device geofence events for the period', async () => {
    const r = await buildAttendanceDutyReport(db, all, oct, now);
    const ahmed = r.rows.find(row => row[0] === 'أحمد')!;
    expect(ahmed).toEqual(['أحمد', 'الدمام', 2, 1, 1, 9, 2, 1, 0, 8]);
    expect(r.rows.find(row => row[0] === 'سالم')![6]).toBe(2);
    expect(r.summary.find(s => s.label === 'ساعات داخل العمل')!.value).toBe(17);
  });
  it('never exposes branch-level device events or another employee to ESS', async () => {
    const r = await buildAttendanceDutyReport(db, ess1, oct, now);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0][6]).toBe(0);
    expect(r.rows[0][7]).toBe(1);
  });
  it('restricts the report by entity and branch', async () => {
    expect((await buildAttendanceDutyReport(db, entity1, oct, now)).rows).toHaveLength(3);
    expect((await buildAttendanceDutyReport(db, branch1, oct, now)).rows.map(r => r[0])).toEqual(['أحمد', 'سالم']);
  });
});

describe('payroll and overtime report', () => {
  it('uses only approved overtime records and suppresses attendance-derived hours', async () => {
    const r = await buildPayrollOvertimeReport(db, all, oct, now);
    const ahmed = r.rows.find(row => row[0] === 'أحمد')!;
    expect(ahmed[1]).toBe(5000);
    expect(ahmed[2]).toBe(4500);
    expect(ahmed[3]).toBe(500);
    expect(ahmed[9]).toBe(10);
    expect(ahmed[10]).toBe(500);
    expect(ahmed[11]).toBe(0);
    const basem = r.rows.find(row => row[0] === 'باسم')!;
    expect(basem[6]).toBe(1); // legacy NULL approval stays exportable
    expect(basem[11]).toBe(3); // no approved record, so raw hours remain
  });
  it('separates final settlements from the regular payroll rows', async () => {
    const r = await buildPayrollOvertimeReport(db, all, oct, now);
    expect(r.rows.find(row => row[0] === 'سالم')![8]).toBe(1);
    expect(r.summary.find(s => s.label === 'صفوف معتمدة')!.value).toBe(2);
  });
});

describe('expiry alerts report', () => {
  it('reports expired and critical documents without leaking another entity', async () => {
    const r = await buildExpiryAlertsReport(db, all, {}, now);
    expect(r.rows.some(row => row[0] === 'أحمد' && row[2] === 'إقامة')).toBe(false); // Saudi has no iqama
    const iqama = r.rows.find(row => row[2] === 'إقامة')!;
    expect(iqama[5]).toBe(5);
    expect(iqama[6]).toBe('حرج');
    const visa = r.rows.find(row => row[2] === 'تأشيرة/خروج')!;
    expect(visa[6]).toBe('منتهي');
    expect(r.summary.find(s => s.label === 'منتهي')!.value).toBe(1);
    expect((await buildExpiryAlertsReport(db, entity1, {}, now)).rows.every(row => row[1] !== 'فرع ب')).toBe(true);
  });
  it('honors the window and rejects malformed input', async () => {
    expect((await buildExpiryAlertsReport(db, all, { days: '5' }, now)).rows.every(r => Number(r[5]) <= 5)).toBe(true);
    await expect(buildExpiryAlertsReport(db, all, { days: 'x' }, now)).rejects.toBeInstanceOf(ScopeError);
  });
});

describe('GOSI and KSA compliance report', () => {
  it('applies the wage cap, Saudi shares, exemption and expat hazard rate', async () => {
    const r = await buildKsaComplianceReport(db, all, oct, now);
    const ahmed = r.rows.find(row => row[0] === 'أحمد')!;
    expect(ahmed[4]).toBe(10000);
    expect(ahmed[5]).toBe(975);
    expect(ahmed[6]).toBe(1175);
    const salem = r.rows.find(row => row[0] === 'سالم')!;
    expect(salem[5]).toBe(0);
    expect(salem[6]).toBe(1290);
    const basem = r.rows.find(row => row[0] === 'باسم')!;
    expect(basem[5]).toBe(0);
    expect(basem[6]).toBe(160);
    expect(r.summary.find(s => s.label === 'نسبة التوطين %')!.value).toBe(50);
    expect(r.summary.find(s => s.label === 'نطاقات')!.value).toBe('النطاق البلاتيني');
  });
  it('flags zero-net payroll rows and counts Qiwa contracts due inside 90 days', async () => {
    const r = await buildKsaComplianceReport(db, all, oct, now);
    expect(r.rows.find(row => row[0] === 'باسم')![9]).toBe(1);
    expect(r.rows.find(row => row[0] === 'أحمد')![12]).toBe(1);
    await expect(buildKsaComplianceReport(db, all, { month: '13', year: '2026' }, now)).rejects.toBeInstanceOf(ScopeError);
  });
});

describe('training and promotions report', () => {
  it('distinguishes evidenced promotions from undocumented ones', async () => {
    const r = await buildTrainingPromotionsReport(db, all, {}, now);
    const ahmed = r.rows.find(row => row[0] === 'أحمد')!;
    expect(ahmed[2]).toBe(4);
    expect(ahmed[5]).toBe(1);
    expect(ahmed[7]).toBe(1);
    expect(ahmed[9]).toBe('—');
    const basem = r.rows.find(row => row[0] === 'باسم')!;
    expect(basem[9]).toBe('توثيق ناقص');
    expect(r.summary.find(s => s.label === 'فجوات')!.value).toBe(1);
  });
});

describe('service termination report', () => {
  it('shows the terminated employee with clearance, settlement and payroll link', async () => {
    const r = await buildServiceTerminationReport(db, all, {}, now);
    expect(r.rows).toHaveLength(1);
    const salem = r.rows[0];
    expect(salem[0]).toBe('سالم');
    expect(salem[4]).toBe('2026-10-31');
    expect(salem[6]).toBe('completed');
    expect(salem[8]).toBe(9000);
    expect(salem[10]).toBe(1);
    expect(salem[12]).toBe('نعم');
  });
  it('does not report active employees', async () => {
    expect((await buildServiceTerminationReport(db, entity1, {}, now)).rows).toHaveLength(1);
  });
});

describe('CSV parity', () => {
  it('serializes the same scoped columns and rows shown on screen', async () => {
    const r = await buildAttendanceDutyReport(db, ess1, oct, now);
    const csv = csvDocument(r.columns, r.rows);
    expect(csv.split('\r\n')[0]).toBe(r.columns.join(','));
    expect(csv.split('\r\n')).toHaveLength(r.rows.length + 1);
  });
});
