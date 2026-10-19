// Half of a deliberate first-party import cycle: a -> b -> a.
// No `layers` block in harness.config.json, which is the configuration
// `check-deps` used to return a clean `valid: true` for without looking (#2098).
import { b } from './b.js';
export const a = (): string => b();
