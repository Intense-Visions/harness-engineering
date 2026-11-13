/**
 * Windows device names. A file whose base name (before the first dot) is one of these refers to
 * the device, not a file, on win32, so `CON.json` or `.harness/sessions/NUL` would be unusable.
 */
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/**
 * The single session-slug rule (S2): used by the state session resolver and the autonomy
 * override store. A slug becomes one path segment, so it must be a non-empty string with no
 * path or drive characters and must not be a Windows reserved device name.
 *
 * Returns the reason the slug is invalid, or null when it is valid. Deliberately a leaf (no
 * imports) so sharing it adds no dependency depth; callers wrap the message in a Result.
 */
export function sessionSlugError(slug: unknown): string | null {
  if (typeof slug !== 'string') return `Session slug must be a string (got ${typeof slug})`;
  if (slug.trim() === '') return 'Session slug must not be empty';
  if (/\.\.|[/\\:]/.test(slug)) {
    return `Invalid session slug '${slug}': must not contain path characters`;
  }
  if (WINDOWS_RESERVED.test(slug.split('.')[0] ?? '')) {
    return `Invalid session slug '${slug}': reserved device name on Windows`;
  }
  return null;
}
