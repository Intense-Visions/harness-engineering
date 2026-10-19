export function pickPairOne(table: Record<string, number>): string[] {
  const out: string[] = [];
  for (const key of Object.keys(table)) {
    const value = table[key];
    if (value !== undefined && value > 10) {
      out.push(key + ':' + String(value));
    }
  }
  out.sort();
  return out;
}
