/**
 * Saudi / expatriate classification of an employee row.
 *
 * Every Saudi compliance route asks the same two questions about an employee:
 * is this person Saudi, and is this person an expatriate. The answers used to
 * be written out at each call site, so the rule lived in a dozen places and a
 * change to it had to be hunted down in a dozen places.
 *
 * The rules are copied exactly as they were; this module only names them.
 */
export interface EmployeeNationality {
  is_saudi?: number | null;
  nationality?: string | null;
}

/**
 * A row is Saudi when the flag says so, or when the nationality says so.
 *
 * The flag is compared to 1 exactly as before: a boolean true coming from the
 * database is not 1, so such a row stays non-Saudi unless its nationality says
 * otherwise.
 */
export function isSaudiEmployee(emp: EmployeeNationality): boolean {
  return emp.is_saudi === 1 || emp.nationality === 'سعودي';
}

/**
 * A row is expatriate when the flag says 0 and the nationality is not Saudi.
 *
 * This is deliberately not `!isSaudiEmployee(emp)`: a row with no flag at all
 * is neither Saudi nor expatriate, and the two rules have to stay apart.
 */
export function isExpatEmployee(emp: EmployeeNationality): boolean {
  return emp.is_saudi === 0 && emp.nationality !== 'سعودي';
}
