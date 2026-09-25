/**
 * Sequential probability ratio test — public surface of the instrument (spec
 * "SPRT", D10). Build a test with `createSprt`, feed it with `observe`, read
 * `state`; `waldBounds` exposes A and B for reports. Only the Bernoulli
 * likelihood ships; a Gaussian variant lands with its first consumer.
 */
export { validateSprtConfig } from './config.js';
export { InvalidSprtConfigError } from './errors.js';
export {
  createSprt,
  waldBounds,
  type Sprt,
  type SprtObservation,
  type SprtState,
  type WaldBounds,
} from './sprt.js';
