export interface Row {
  cost: number;
  label: string;
}

export function addBeta(rows: Row[]): { total: number; labels: string[] } {
  let acc = 0;
  const seen: string[] = [];
  for (const row of rows) {
    if (row.cost > 0) {
      acc += row.cost;
      seen.push(row.label);
    }
  }
  return { total: acc, labels: seen };
}
