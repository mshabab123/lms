/** Dates are stored in UTC and displayed in Asia/Riyadh, Gregorian with optional Hijri. */
export function formatDateTime(
  value: string | Date | null | undefined,
  locale: string,
  opts: { hijri?: boolean } = {},
): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  const base = locale === 'ar' ? 'ar-SA' : 'en-GB';
  const tag = opts.hijri ? `${base}-u-ca-islamic-umalqura-nu-latn` : `${base}-u-ca-gregory-nu-latn`;
  return new Intl.DateTimeFormat(tag, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Riyadh',
  }).format(date);
}
