export function pickGenC(map: Record<string, number>): string[] {
  const acc: string[] = [];
  const fields = Object.keys(map);
  while (fields.length > 0) {
    const field = fields.pop();
    if (field === undefined) {
      break;
    }
    acc.push(field + '=' + String(map[field]));
  }
  return acc;
}
