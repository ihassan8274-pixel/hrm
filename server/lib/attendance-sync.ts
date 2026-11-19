type AttendanceLog = { check_in_time: string; check_out_time: string | null };

export async function syncAttendanceFromLogs(
  db: any,
  month: number,
  year: number,
  now = new Date(),
  employeeIds?: number[] | null
): Promise<{ workdays: number; expected: number }> {
  const days = new Date(year, month, 0).getDate();
  const current = now.getFullYear() === year && now.getMonth() + 1 === month;
  const daysElapsed = current ? now.getDate() : days;
  let workdays = 0;
  let expected = 0;
  for (let day = 1; day <= days; day++) {
    const weekday = new Date(year, month - 1, day).getDay();
    if (weekday !== 5 && weekday !== 6) {
      workdays++;
      if (day <= daysElapsed) expected++;
    }
  }
  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  const employees = await db.prepare('SELECT id FROM employees').all() as { id: number }[];
  // An explicit list is the caller's scope. An empty list means "nobody is in
  // scope" — it must not fall back to every employee.
  const allowed = Array.isArray(employeeIds) ? new Set(employeeIds) : null;
  for (const employee of employees) {
    if (allowed && !allowed.has(employee.id)) continue;
    const logs = await db.prepare(`
      SELECT check_in_time, check_out_time FROM attendance_logs
      WHERE employee_id = ? AND substr(CAST(check_in_time AS TEXT), 1, 7) = ?
    `).all(employee.id, prefix) as AttendanceLog[];
    // Missing device records are not evidence that a manual summary is wrong.
    if (logs.length === 0) continue;
    const dates = new Set(logs.map(log => log.check_in_time.slice(0, 10)));
    let overtime = 0;
    for (const log of logs) {
      if (log.check_out_time) {
        const hours = (new Date(log.check_out_time).getTime() - new Date(log.check_in_time).getTime()) / 3600000;
        if (hours > 8) overtime += hours - 8;
      }
    }
    const absence = Math.max(0, expected - dates.size);
    const existing = await db.prepare('SELECT id FROM attendance WHERE employee_id = ? AND month = ? AND year = ?')
      .get(employee.id, month, year) as { id: number } | undefined;
    if (existing) {
      await db.prepare('UPDATE attendance SET absence_days = ?, overtime_hours = ? WHERE id = ?')
        .run(absence, Math.round(overtime), existing.id);
    } else {
      await db.prepare('INSERT INTO attendance (employee_id, month, year, absence_days, overtime_hours) VALUES (?, ?, ?, ?, ?)')
        .run(employee.id, month, year, absence, Math.round(overtime));
    }
  }
  return { workdays, expected };
}
