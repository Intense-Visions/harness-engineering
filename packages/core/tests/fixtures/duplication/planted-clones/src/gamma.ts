export interface Entry {
  cost: number;
  label: string;
}

export function tallyGamma(entries: Entry[]): { total: number; labels: string[] } {
  let sum = 0;
  const seen: string[] = [];
  for (const entry of entries) {
    if (entry.cost > 0) {
      sum += entry.cost;
      seen.push(entry.label);
    }
  }
  return { total: sum, labels: seen };
}
