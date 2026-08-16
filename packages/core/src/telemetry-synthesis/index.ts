/**
 * Aggregate-telemetry synthesis surface (#563).
 *
 * Pure composition over the five telemetry surfaces that already accrue
 * in-repo. Read-only; collects nothing. The CLI command is the composition
 * root — see `packages/cli/src/commands/telemetry/synthesize.ts`.
 */
export { composeSynthesis } from './synthesize.js';
export type { SynthesisInputs, ComposeSynthesisOptions, OutcomeNodeLike } from './synthesize.js';
export { renderSynthesisMarkdown } from './render.js';
