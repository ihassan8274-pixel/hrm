// Shared currency helper: maps currency setting values to display symbols
const CURRENCY_MAP: Record<string, string> = {
  'SAR': 'ر.س',
  'ريال': 'ر.س',
  'ر.س': 'ر.س',
  'السعودية': 'ر.س',
  'EGP': 'ج.م',
  'ج.م': 'ج.م',
  'جنيه': 'ج.م',
  'مصري': 'ج.م',
  'AED': 'د.إ',
  'د.إ': 'د.إ',
  'إمارات': 'د.إ',
  'USD': '$',
  '$': '$',
  'دولار': '$',
  'KWD': 'د.ك',
  'د.ك': 'د.ك',
  'QAR': 'ر.ق',
  'ر.ق': 'ر.ق',
  'BHD': 'د.ب',
  'د.ب': 'د.ب',
  'OMR': 'ر.ع',
  'ر.ع': 'ر.ع',
  'JOD': 'د.أ',
  'د.أ': 'د.أ',
};

export function getCurrencySymbol(currency?: string | null): string {
  if (!currency) return 'ر.س';
  const trimmed = currency.trim();
  if (CURRENCY_MAP[trimmed]) return CURRENCY_MAP[trimmed];
  // If it looks like a code (3-letter), return it as-is
  return trimmed;
}
