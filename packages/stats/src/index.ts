/**
 * @harness-engineering/stats
 *
 * Statistical instruments for decisions the harness makes repeatedly under
 * uncertainty. Each instrument is one directory exported as ONE namespace, so
 * `stats.bandit.choose` and `stats.sprt.test` can never collide (spec D6).
 * Later instruments (irt/, kelly/, kalman/) land as sibling namespaces with
 * their own consumer specs (spec D10).
 */
export * as bandit from './bandit/index.js';
