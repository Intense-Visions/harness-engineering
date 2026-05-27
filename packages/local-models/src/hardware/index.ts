/**
 * Hardware detection — public barrel.
 *
 * Surfaces the dispatcher (`HardwareDetector`, `detectHardware`), the
 * individual platform probes, and the shared types so consumers in later
 * phases (ranker, scheduler, HTTP, dashboard) can import a single namespace.
 */

export { HardwareDetector, detectHardware } from './detector.js';
export type { HardwareDetectorOptions } from './detector.js';

export { detectMacOS } from './macos.js';
export type { DetectMacOSResult } from './macos.js';

export { detectNVIDIA } from './nvidia.js';
export type { DetectNVIDIAResult, OsModule as NvidiaOsModule } from './nvidia.js';

export { detectCPU } from './cpu.js';
export type { DetectCPUResult, OsModule as CpuOsModule } from './cpu.js';

export { defaultShellRunner } from './shell.js';
export type { ShellRunner, ShellResult } from './shell.js';

export type {
  HardwareDetectionResult,
  HardwareDetectionSource,
  HardwareDetectionWarning,
  HardwareProfile,
} from './types.js';
