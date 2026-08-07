/** Truthy env-flag test (`1`/`true`/`yes`/`on`, case-insensitive). */
export function envEnabled(value: string | undefined): boolean {
  if (!value) return false;
  const v = value.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}
