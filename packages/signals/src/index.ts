// Public entry points (spec D6): gatherSignals + signalRegistry.
export { gatherSignals } from './gather.js';
export type { SignalsResult } from './gather.js';
export { signalRegistry } from './registry.js';
export { SignalTimelineStore } from './timeline-store.js';
export { defaultCommandRunner } from './command-runner.js';
export type { CommandRunner } from './command-runner.js';
export { computeHolidayConfidence } from './holiday-confidence.js';
export type {
  HolidayConfidenceInput,
  HolidayConfidenceResult,
  HolidayConfidenceCriteria,
  HolidayConfidenceStatus,
  OutcomeQueryStore,
} from './holiday-confidence.js';
export { ASSESSMENT_MARKER, DEFAULT_WINDOW_DAYS } from './shared.js';
export type {
  SignalId,
  SignalStatus,
  SignalPoint,
  SignalResult,
  SignalContext,
  SignalProvider,
} from './types.js';
