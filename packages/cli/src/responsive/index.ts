// packages/cli/src/responsive/index.ts
//
// Barrel for the mechanical responsive gate (floor-layer detector consumed
// by the design-craft award-bar verdict).

export type {
  ResponsiveDefectKind,
  ResponsiveDefect,
  ResponsiveStatus,
  ResponsiveGateResult,
  ResponsiveMetrics,
  ResponsiveGateConfig,
} from './probe.js';
export {
  computeResponsiveGate,
  resolveResponsiveGateConfig,
  DEFAULT_RESPONSIVE_GATE_CONFIG,
  NOT_EVALUATED_RESPONSIVE,
} from './probe.js';
