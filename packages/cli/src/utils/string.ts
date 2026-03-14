export function toKebabCase(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-');
}
