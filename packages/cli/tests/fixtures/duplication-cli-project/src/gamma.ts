export interface Line {
  cost: number;
  label: string;
}

export function reduceGamma(lines: Line[]): { total: number; labels: string[] } {
  let running = 0;
  const names: string[] = [];
  for (const line of lines) {
    if (line.cost > 0) {
      running += line.cost;
      names.push(line.label);
    }
  }
  return { total: running, labels: names };
}
