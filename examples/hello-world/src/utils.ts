/**
 * Capitalize the first letter of a name.
 */
export function formatName(name: string): string {
  if (!name) return '';
  return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
}
