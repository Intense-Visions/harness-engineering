export interface Row {
  cost: number;
  label: string;
}

export function accumulateBeta(rows: Row[]): { total: number; labels: string[] } {
  let acc = 0;
  const kept: string[] = [];
  for (const row of rows) {
    if (row.cost > 0) {
      acc += row.cost;
      kept.push(row.label);
    }
  }
  return { total: acc, labels: kept };
}
