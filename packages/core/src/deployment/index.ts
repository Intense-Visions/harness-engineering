export { detectDeploymentSurface } from './detect';
export { evaluateDeploymentGate } from './evaluate';
// Aliased on the public surface: the core barrel already re-exports a
// `deriveExitCode` from `./review/ci` (verdict-schema). Exposing the deployment
// one under a distinct name avoids the `export *` ambiguity (TS2308) while the
// module-internal name stays `deriveExitCode` (see ./exit-code).
export { deriveExitCode as deriveDeploymentExitCode } from './exit-code';
export type {
  DeploymentFsPort,
  DeploymentSurface,
  DeploymentFile,
  DeploymentFinding,
  DeploymentSeverity,
  DeploymentGateResult,
  DeploymentGateConfig,
  DeploymentExitCode,
} from './types';
