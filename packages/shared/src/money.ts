/** Money is always stored as integer halalas (1 SAR = 100 halalas). */
export type Halalas = number;

export function assertHalalas(value: number): asserts value is Halalas {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`Money must be an integer number of halalas: ${value}`);
  }
}

/**
 * VAT on a net amount using basis points (1500 = 15%), rounded half-up to the halala.
 * The rate is configuration (tax treatment depends on supply/entity status) — never
 * hard-code it in business logic.
 */
export function vatOnNet(net: Halalas, rateBasisPoints: number): Halalas {
  assertHalalas(net);
  if (!Number.isInteger(rateBasisPoints) || rateBasisPoints < 0)
    throw new RangeError('Invalid VAT rate');
  return Math.round((net * rateBasisPoints) / 10_000);
}

export function formatSar(amount: Halalas, locale: 'ar' | 'en' = 'ar'): string {
  return new Intl.NumberFormat(locale === 'ar' ? 'ar-SA' : 'en-SA', {
    style: 'currency',
    currency: 'SAR',
    minimumFractionDigits: 2,
  }).format(amount / 100);
}
