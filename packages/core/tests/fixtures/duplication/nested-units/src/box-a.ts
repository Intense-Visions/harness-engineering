export class BoxA {
  private readonly rows: number[] = [];

  tallyA(input: number[]): number {
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
