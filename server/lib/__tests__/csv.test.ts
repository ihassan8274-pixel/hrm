import { describe, expect, it } from 'vitest';
import { csvCell, csvRow, csvDocument } from '../csv';

describe('csvCell', () => {
  it('passes plain text and numbers through untouched', () => {
    expect(csvCell('أحمد')).toBe('أحمد');
    expect(csvCell(1500.5)).toBe('1500.5');
    expect(csvCell(-5)).toBe('-5');
    expect(csvCell(0)).toBe('0');
  });
  it('renders null and undefined as empty cells', () => {
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
  });
  it.each(['=SUM(A1:A9)', '+1+1', '-cmd|calc', '@import', '\tfoo'])('neutralizes formula-leading text %s', (value) => {
    expect(csvCell(value).startsWith("'")).toBe(true);
  });
  it('neutralizes a CR-leading cell inside its RFC 4180 quotes', () => {
    expect(csvCell('\rfoo')).toBe("\"'\rfoo\"");
  });
  it('quotes commas, quotes and newlines per RFC 4180', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('line1\nline2')).toBe('"line1\nline2"');
    expect(csvCell('a\rb')).toBe('"a\rb"');
  });
  it('prefixes then quotes a formula cell that also needs quoting', () => {
    expect(csvCell('=1,2')).toBe("\"'=1,2\"");
  });
});

describe('csvRow / csvDocument', () => {
  it('joins cells with commas and rows with CRLF', () => {
    expect(csvRow(['الاسم', 3000, null])).toBe('الاسم,3000,');
    expect(csvDocument(['الاسم', 'الراتب'], [['أحمد', 3000], ['باسم, مدير', 2000]]))
      .toBe('الاسم,الراتب\r\nأحمد,3000\r\n"باسم, مدير",2000');
  });
  it('produces a header-only document for empty exports', () => {
    expect(csvDocument(['a', 'b'], [])).toBe('a,b');
  });
});