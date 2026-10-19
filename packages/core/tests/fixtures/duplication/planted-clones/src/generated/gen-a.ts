export function pickGenA(table: Record<string, number>): string[] {
  const out: string[] = [];
  const keys = Object.keys(table);
  while (keys.length > 0) {
    const key = keys.pop();
    if (key === undefined) {
      break;
    }
    out.push(key + '=' + String(table[key]));
  }
  return out;
}
