export function pickPairTwo(lookup: Record<string, number>): string[] {
  const list: string[] = [];
  for (const name of Object.keys(lookup)) {
    const amount = lookup[name];
    if (amount !== undefined && amount > 10) {
      list.push(name + ':' + String(amount));
    }
  }
  list.sort();
  return list;
}
