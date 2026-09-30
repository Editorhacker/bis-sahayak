export function isDate(value: unknown): value is Date {
  return value instanceof Date;
}

export function formatDate(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (isDate(value)) {
    return value.toISOString().split('T')[0];
  }
  return String(value).split('T')[0];
}