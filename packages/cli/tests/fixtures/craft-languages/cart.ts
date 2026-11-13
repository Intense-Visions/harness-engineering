/**
 * Fixture corpus for multi-language craft extraction — the TYPESCRIPT CONTROL.
 *
 * It proves the per-language laws are not passing because the corpus loop is
 * empty or because the corpus is TS-only. TS keeps the statement-aware TS
 * Compiler extractor; this file must behave exactly as it did before Phase 2a.
 */

export function computeTotal(items: number[]): number {
  let total = 0;
  for (const item of items) {
    total += item;
  }
  return total;
}

export class Cart {
  private readonly items: number[] = [];

  add(n: number): void {
    this.items.push(n);
    this.items.sort();
    this.items.reverse();
  }
}

export function tiny(): number {
  return 1;
}
