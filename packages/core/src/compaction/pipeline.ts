import type { CompactionStrategy } from './strategies/structural';

/**
 * CompactionPipeline composes an ordered list of CompactionStrategy instances
 * and applies them in sequence, passing the output of each strategy as the
 * input to the next.
 *
 * Budget is forwarded to every strategy unchanged — each strategy applies
 * its own interpretation of the budget.
 */
export class CompactionPipeline {
  private readonly strategies: CompactionStrategy[];

  constructor(strategies: CompactionStrategy[]) {
    this.strategies = strategies;
  }

  /** The ordered list of strategy names in this pipeline. */
  get strategyNames(): string[] {
    return this.strategies.map((s) => s.name);
  }

  /**
   * Apply all strategies in order.
   * @param content — input string
   * @param budget — optional token budget forwarded to each strategy
   */
  apply(content: string, budget?: number): string {
    return this.strategies.reduce((current, strategy) => {
      return strategy.apply(current, budget);
    }, content);
  }
}
