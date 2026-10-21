export function pickGenB(lookup: Record<string, number>): string[] {
  const list: string[] = [];
  const names = Object.keys(lookup);
  while (names.length > 0) {
    const name = names.pop();
    if (name === undefined) {
      break;
    }
    list.push(name + '=' + String(lookup[name]));
  }
  return list;
}
