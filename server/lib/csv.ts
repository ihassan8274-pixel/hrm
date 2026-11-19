// RFC 4180 CSV serialization for the Excel "Get Data from Web" endpoints.
// The old exporter joined raw values with commas, so any name or position
// containing a comma, quote or newline silently shifted every following column.
const FORMULA_LEAD = /^[=+\-@\t\r]/;

export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let s = String(value);
  // Spreadsheet formula injection: a text cell starting with = + - @ (or a
  // control character) executes when the file is opened. Numbers are left
  // untouched so negative amounts stay numeric in Excel.
  if (typeof value === 'string' && FORMULA_LEAD.test(s)) s = `'${s}`;
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function csvRow(values: unknown[]): string {
  return values.map(csvCell).join(',');
}

export function csvDocument(headers: string[], rows: unknown[][]): string {
  return [csvRow(headers), ...rows.map(csvRow)].join('\r\n');
}