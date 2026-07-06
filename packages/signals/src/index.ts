// Public entry points (spec D6): gatherSignals + signalRegistry.
export { gatherSignals } from './gather.js';
export type { SignalsResult } from './gather.js';
export { signalRegistry } from './registry.js';
export { SignalTimelineStore } from './timeline-store.js';
export { defaultCommandRunner } from './command-runner.js';
export type { CommandRunner } from './command-runner.js';
export type {
  SignalId,
  SignalStatus,
  SignalPoint,
  SignalResult,
  SignalContext,
  SignalProvider,
} from './types.js';
