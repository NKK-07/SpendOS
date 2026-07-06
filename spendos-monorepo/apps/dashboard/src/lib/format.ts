/**
 * lib/format.ts
 * Centralized financial formatting utility.
 * 
 * LAW: All amounts are stored in PAISE (integers).
 * NEVER operate on floats directly.
 * This file is the single source of truth for how money appears in the UI.
 */

export type CurrencyFormat = 'indian' | 'international';

/**
 * Formats a paise integer to a display string.
 * @param paise - Amount in paise (integer)
 * @param format - 'indian' (default: ₹1,23,456.78) or 'international' (₹1,234.56)
 * @param options - Overrides for minimumFractionDigits etc.
 */
export function formatINR(
  paise: number | string | null | undefined,
  format: CurrencyFormat = 'indian',
  options: Intl.NumberFormatOptions = {}
): string {
  if (paise === null || paise === undefined || paise === '') return '₹—';
  
  const raw = typeof paise === 'string' ? parseInt(paise, 10) : paise;
  if (isNaN(raw)) return '₹—';

  const rupees = raw / 100;
  const locale = format === 'indian' ? 'en-IN' : 'en-US';

  return '₹' + rupees.toLocaleString(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
    ...options,
  });
}

/**
 * Formats paise as rupees with always-shown decimals (for ledger precision).
 */
export function formatINRPrecise(
  paise: number | string | null | undefined,
  format: CurrencyFormat = 'indian'
): string {
  if (paise === null || paise === undefined || paise === '') return '₹—';
  const raw = typeof paise === 'string' ? parseInt(paise, 10) : paise;
  if (isNaN(raw)) return '₹—';
  const rupees = raw / 100;
  const locale = format === 'indian' ? 'en-IN' : 'en-US';
  return '₹' + rupees.toLocaleString(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Returns paise as a short readable value for KPI cards (e.g. ₹4.2L, ₹1.2Cr).
 */
export function formatINRCompact(paise: number | string | null | undefined): string {
  if (paise === null || paise === undefined || paise === '') return '₹—';
  const raw = typeof paise === 'string' ? parseInt(paise, 10) : paise;
  if (isNaN(raw)) return '₹—';
  const rupees = raw / 100;
  
  if (rupees >= 10_000_000) {
    return `₹${(rupees / 10_000_000).toFixed(2)}Cr`;
  }
  if (rupees >= 100_000) {
    return `₹${(rupees / 100_000).toFixed(2)}L`;
  }
  if (rupees >= 1_000) {
    return `₹${(rupees / 1_000).toFixed(1)}K`;
  }
  return `₹${rupees.toFixed(0)}`;
}

/**
 * Converts rupee string input to paise integer.
 * Safe: strips ₹, commas, spaces before parsing.
 */
export function rupeesToPaise(rupeeStr: string): number {
  const cleaned = rupeeStr.replace(/[₹,\s]/g, '');
  const val = parseFloat(cleaned);
  if (isNaN(val)) return 0;
  return Math.round(val * 100);
}

/**
 * Truncates a hash/UUID for display: "a1b2c3d4-..." → "a1b2c3d4"
 */
export function truncateHash(hash: string, length = 8): string {
  if (!hash) return '—';
  return hash.replace(/-/g, '').slice(0, length).toUpperCase();
}

/**
 * Formats a date for display consistently across the app.
 */
export function formatDate(
  date: string | Date | null | undefined,
  style: 'short' | 'long' | 'relative' = 'short'
): string {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '—';

  if (style === 'relative') {
    const diffMs = Date.now() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1)  return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24)  return `${diffHr}h ago`;
    const diffDay = Math.floor(diffHr / 24);
    if (diffDay < 7)  return `${diffDay}d ago`;
  }

  if (style === 'long') {
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Formats a datetime for the audit stream (compact + precise).
 */
export function formatDateTime(date: string | Date | null | undefined): string {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
}
