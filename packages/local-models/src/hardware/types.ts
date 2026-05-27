/**
 * Hardware detection — public types.
 *
 * Surfaces the `HardwareProfile` shape consumed by later phases (ranker, pool,
 * scheduler, HTTP) and the structured warning envelope the dispatcher emits
 * when a platform-specific probe fails and the detector falls through to the
 * CPU profile (S3).
 *
 * @see docs/changes/local-model-lifecycle-manager/proposal.md (lines 115–123, S3)
 */

import type { LocalModelsPlatform } from '@harness-engineering/types';

/**
 * Hardware profile snapshot. Identical shape across detectors so downstream
 * consumers (ranker, dashboard, HTTP) don't have to branch on platform.
 */
export interface HardwareProfile {
  /** Discriminator — `'macos'` covers Apple Silicon unified memory; `'cpu'` is the fallback. */
  platform: LocalModelsPlatform;
  /** GPU VRAM in gibibytes for NVIDIA; unified memory for Apple Silicon; `0` for CPU-only hosts. */
  vramGb: number;
  /** Total system RAM in gibibytes. */
  ramGb: number;
  /** Effective memory bandwidth in GB/s used by the speed estimator. */
  bandwidthGbps: number;
  /** Marketing name from `SPDisplaysDataType` or `nvidia-smi`; absent on CPU-only hosts. */
  gpuName?: string;
  /** Marketing name from `sysctl`/`os.cpus()[0].model`. Always populated. */
  cpuName: string;
  /** ISO timestamp the profile was produced. Used by the dispatcher cache. */
  detectedAt: string;
}

/**
 * Structured warning attached to a detection result. Surfaced via the
 * eventual `harness models status` CLI and the dashboard hardware card.
 */
export interface HardwareDetectionWarning {
  /** Stable machine code (`'macos_probe_failed'`, `'nvidia_unmapped_gpu'`, ...). */
  code: string;
  /** Operator-facing one-liner. */
  message: string;
  /** Optional underlying error message — only set when a probe threw. */
  cause?: string;
}

/**
 * Provenance of the returned profile. The dispatcher tags each call so
 * observers can tell whether the detector shelled out or short-circuited.
 */
export type HardwareDetectionSource = 'override' | 'cache' | 'macos' | 'nvidia' | 'cpu';

/**
 * Bundle returned by `HardwareDetector.detect()`. Always includes a profile
 * — detection never throws (S3); failures attach a warning and fall through
 * to the CPU profile.
 */
export interface HardwareDetectionResult {
  profile: HardwareProfile;
  warnings: HardwareDetectionWarning[];
  source: HardwareDetectionSource;
}
