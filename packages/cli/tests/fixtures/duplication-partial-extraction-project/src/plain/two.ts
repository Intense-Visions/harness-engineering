import { LABEL } from '../shared/labels.js';

export function sumTwo(entries: { cost: number; label: string }[]) {
  let acc = 0;
  const seen: string[] = [];
  const skipped: string[] = [];
  for (const row of entries) {
    if (row.cost > 0) {
      acc += row.cost;
      seen.push(row.label);
    } else {
      skipped.push(row.label);
    }
  }
  return { total: acc, labels: seen, skipped };
}

export function labelTwo(): string {
  return LABEL;
}
