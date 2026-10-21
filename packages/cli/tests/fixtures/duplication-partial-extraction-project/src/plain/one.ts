import { LABEL } from '../shared/labels.js';

export function sumOne(rows: { cost: number; label: string }[]) {
  let total = 0;
  const seen: string[] = [];
  const skipped: string[] = [];
  for (const row of rows) {
    if (row.cost > 0) {
      total += row.cost;
      seen.push(row.label);
    } else {
      skipped.push(row.label);
    }
  }
  return { total: total, labels: seen, skipped };
}

export function labelOne(): string {
  return LABEL;
}
