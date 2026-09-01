/**
 * Rate-distortion context compaction — report-only ablation harness (issue #1633).
 *
 * Replays recorded runs with an information class ablated and fits a
 * task-conditioned distortion model (sensitivity matrix) from the measured
 * error/rework delta. Measurement only: this module does NOT wire the model into
 * the live compaction dial (deferred). It is the reusable substrate MDL pruning
 * (#1630) later consumes.
 */

export {
  INFORMATION_CLASSES,
  BASELINE,
  type InformationClass,
  type Ablation,
  type ReplayOutcome,
  type ReplayRun,
  type ReplayObservation,
  type ReplayRunner,
} from './types';

export { applyAblation, ablationSuite, runAblationSuite } from './ablation';

export {
  fitDistortionModel,
  classifySensitivity,
  DEFAULT_SENSITIVITY_THRESHOLD,
  DEFAULT_MODEL_VERSION,
  type Sensitivity,
  type CellSensitivity,
  type DistortionModel,
  type FitOptions,
} from './distortion-model';

export { serializeDistortionModel } from './serialize';
