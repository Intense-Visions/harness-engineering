export class BoxC {
  private readonly rows: number[] = [];

  tallyC(input: number[]): number {
    let sum = 0;
    for (const entry of input) {
      if (entry > 0) {
        sum += entry;
        this.rows.push(entry);
      }
    }
    return sum;
  }
}
