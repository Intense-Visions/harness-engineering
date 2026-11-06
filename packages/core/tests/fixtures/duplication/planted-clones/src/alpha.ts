export interface Item {
  cost: number;
  label: string;
}

export function sumAlpha(items: Item[]): { total: number; labels: string[] } {
  let total = 0;
  const seen: string[] = [];
  for (const item of items) {
    if (item.cost > 0) {
      total += item.cost;
      seen.push(item.label);
    }
  }
  return { total: total, labels: seen };
}
