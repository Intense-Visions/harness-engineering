import { LABEL } from '../shared/labels.js';

export function sumThree(items: { cost: number; label: string }[]) {
  let sum = 0;
  const seen: string[] = [];
  const skipped: string[] = [];
  for (const row of items) {
    if (row.cost > 0) {
      sum += row.cost;
      seen.push(row.label);
    } else {
      skipped.push(row.label);
    }
  }
  return { total: sum, labels: seen, skipped };
}

export function labelThree(): string {
  return LABEL;
}
