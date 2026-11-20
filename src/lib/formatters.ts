// ============================================================
// Formatters — Currency, Date, Expiry helpers
// ============================================================

/**
 * Format number to Indonesian Rupiah string
 * e.g. 45000 → "Rp 45.000"
 */
export function formatRupiah(amount: number): string {
  return 'Rp ' + amount.toLocaleString('id-ID');
}

/**
 * Format number with dot thousand separators (Indonesian locale)
 * e.g. 10000 → "10.000", 1000 → "1.000"
 */
export function formatNumberDots(value: number | string): string {
  if (value === '' || value === null || value === undefined) return '';
  const cleanNumber = typeof value === 'number' ? value : parseInt(value.toString().replace(/\D/g, ''), 10);
  if (isNaN(cleanNumber) || cleanNumber === 0) return '';
  return cleanNumber.toLocaleString('id-ID');
}

/**
 * Parse string with dots or any non-digits to pure number
 * e.g. "10.000" → 10000
 */
export function parseNumberDots(value: string): number {
  const clean = value.replace(/\D/g, '');
  return clean ? parseInt(clean, 10) : 0;
}

/**
 * Format ISO date string to readable Indonesian format
 * e.g. "2026-09-07" → "7 Sep 2026"
 */
export function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Format date for HTML date input (YYYY-MM-DD)
 */
export function formatDateInput(dateStr: string): string {
  const d = new Date(dateStr);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Get today's date as YYYY-MM-DD
 */
export function today(): string {
  return formatDateInput(new Date().toISOString());
}

/**
 * Calculate days until expiry from today
 * Returns negative if already expired
 */
export function daysUntilExpiry(expiryDateStr: string): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const exp = new Date(expiryDateStr);
  exp.setHours(0, 0, 0, 0);
  const diff = exp.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export type ExpiryStatus = 'SAFE' | 'WARNING' | 'CRITICAL' | 'EXPIRED';

/**
 * Get expiry status based on days remaining
 * - EXPIRED: <= 0 days
 * - CRITICAL: 1-30 days
 * - WARNING: 31-90 days
 * - SAFE: > 90 days
 */
export function getExpiryStatus(expiryDateStr: string): ExpiryStatus {
  const days = daysUntilExpiry(expiryDateStr);
  if (days <= 0) return 'EXPIRED';
  if (days <= 30) return 'CRITICAL';
  if (days <= 90) return 'WARNING';
  return 'SAFE';
}

/**
 * Generate a simple unique ID (timestamp + random)
 */
export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
}

/**
 * Nomor berurutan harian, mis. generateDailyNumber('INV', …) → "INV-20260907-001".
 * Seq = max seq yang sudah ada dengan prefix & tanggal sama, + 1 (bukan jumlah total),
 * sehingga tidak bentrok saat data dihapus atau hari berganti.
 */
export function generateDailyNumber(prefix: string, existing: string[], date: Date = new Date()): string {
  const dateStr =
    date.getFullYear().toString() +
    String(date.getMonth() + 1).padStart(2, '0') +
    String(date.getDate()).padStart(2, '0');
  const head = `${prefix}-${dateStr}-`;
  let max = 0;
  for (const ref of existing) {
    if (!ref || !ref.startsWith(head)) continue;
    const n = parseInt(ref.slice(head.length), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return head + String(max + 1).padStart(3, '0');
}
