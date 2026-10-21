export interface Entry {
  cost: number;
  label: string;
}

export function totalAlpha(entries: Entry[]): { total: number; labels: string[] } {
  let total = 0;
  const seen: string[] = [];
  for (const entry of entries) {
    if (entry.cost > 0) {
      total += entry.cost;
      seen.push(entry.label);
    }
  }
  return { total: total, labels: seen };
}
