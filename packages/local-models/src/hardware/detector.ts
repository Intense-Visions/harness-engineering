/**
 * `HardwareDetector` — the platform-aware dispatcher.
 *
 * Resolves a `HardwareProfile` via four layers:
 *  1. Operator override (no shell-out, no cache).
 *  2. In-process cache (single TTL window; default 24h to match the
 *     scheduler's refresh cadence).
 *  3. Platform-specific probe (`detectMacOS` / `detectNVIDIA`).
 *  4. CPU fallback (always-on; never throws).
 *
 * Every layer below the override returns a `HardwareDetectionResult` that
 * carries any warnings — failures degrade gracefully (S3) rather than
 * propagating. The detector intentionally never throws after construction,
 * so callers can wire it into orchestrator startup without defensive
 * try/catch wrappers.
 */

import type { LocalModelsHardwareOverride } from '@harness-engineering/types';

import { detectCPU } from './cpu.js';
import type { OsModule } from './cpu.js';
import { detectMacOS } from './macos.js';
import { detectNVIDIA } from './nvidia.js';
import { defaultShellRunner } from './shell.js';
import type { ShellRunner } from './shell.js';
import type {
  HardwareDetectionResult,
  HardwareDetectionWarning,
  HardwareProfile,
} from './types.js';

/** Default detector cache TTL — matches the spec's 24h refresh cadence (D9). */
const DEFAULT_CACHE_TTL_MS = 86_400_000;

/** Constructor options for `HardwareDetector`. */
export interface HardwareDetectorOptions {
  /**
   * Operator-supplied override that skips autodetection. When set, `detect()`
   * returns the override verbatim and never invokes `ShellRunner.run`.
   */
  override?: LocalModelsHardwareOverride;
  /** Pluggable shell runner. Defaults to the production `execFile`-backed runner. */
  shell?: ShellRunner;
  /** Pluggable `node:os` subset. Defaults to the real module. */
  osModule?: OsModule;
  /** Platform discriminator. Defaults to `process.platform`. */
  platform?: NodeJS.Platform;
  /** Clock injection — tests pin time so `detectedAt` assertions stay deterministic. */
  now?: () => Date;
  /** Cache TTL in ms; `0` disables caching. */
  cacheTtlMs?: number;
}

/**
 * Coerce an operator override into a full `HardwareProfile`. The override
 * type only requires `platform`, `vramGb`, and `bandwidthGbps`; the
 * remaining fields default sensibly so downstream consumers don't see
 * optional surprises.
 */
function overrideToProfile(override: LocalModelsHardwareOverride, now: Date): HardwareProfile {
  const profile: HardwareProfile = {
    platform: override.platform,
    vramGb: override.vramGb,
    ramGb: override.ramGb ?? override.vramGb,
    bandwidthGbps: override.bandwidthGbps,
    cpuName: override.cpuName ?? 'override',
    detectedAt: now.toISOString(),
  };
  if (override.gpuName !== undefined) {
    profile.gpuName = override.gpuName;
  }
  return profile;
}

/**
 * Dispatcher that resolves a `HardwareProfile` for the current host. Shared
 * by Phase 2 (ranker), Phase 6 (scheduler), Phase 7 (HTTP), and Phase 8
 * (dashboard); all of them consume the same instance per orchestrator process.
 */
export class HardwareDetector {
  private readonly override?: LocalModelsHardwareOverride;
  private readonly shell: ShellRunner;
  private readonly osModule?: OsModule;
  private readonly platform: NodeJS.Platform;
  private readonly now: () => Date;
  private readonly cacheTtlMs: number;
  private cached: { result: HardwareDetectionResult; expiresAt: number } | undefined;

  constructor(opts: HardwareDetectorOptions = {}) {
    if (opts.override !== undefined) {
      this.override = opts.override;
    }
    this.shell = opts.shell ?? defaultShellRunner;
    if (opts.osModule !== undefined) {
      this.osModule = opts.osModule;
    }
    this.platform = opts.platform ?? process.platform;
    this.now = opts.now ?? (() => new Date());
    this.cacheTtlMs = opts.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  }

  /** Forget any cached result. Tests and `harness models refresh` call this. */
  invalidate(): void {
    this.cached = undefined;
  }

  /**
   * Resolve a hardware profile for the current host.
   *
   * Returns the override verbatim when configured. Otherwise tries the
   * platform-specific detector, falls through to CPU on failure, and caches
   * the result for `cacheTtlMs` milliseconds.
   */
  async detect(): Promise<HardwareDetectionResult> {
    const nowDate = this.now();
    const nowMs = nowDate.getTime();

    if (this.override) {
      return {
        profile: overrideToProfile(this.override, nowDate),
        warnings: [],
        source: 'override',
      };
    }

    if (this.cached && this.cached.expiresAt > nowMs) {
      return this.cached.result;
    }

    const result = await this.probe();
    if (this.cacheTtlMs > 0) {
      this.cached = {
        result,
        expiresAt: nowMs + this.cacheTtlMs,
      };
    }
    return result;
  }

  /** Dispatch to the platform-specific probe with CPU fallback. */
  private async probe(): Promise<HardwareDetectionResult> {
    switch (this.platform) {
      case 'darwin':
        return this.probeWithFallback('macos', () => detectMacOS(this.shell, this.now));
      case 'linux':
      case 'win32':
        return this.probeWithFallback('nvidia', () =>
          detectNVIDIA(this.shell, this.now, this.osModule)
        );
      default: {
        const cpu = detectCPU(this.osModule, this.now);
        return {
          profile: cpu.profile,
          warnings: cpu.warnings,
          source: 'cpu',
        };
      }
    }
  }

  /**
   * Try `probe`; on failure, fall back to the CPU profile and surface a
   * warning that names the probe and carries the underlying error message.
   */
  private async probeWithFallback(
    source: 'macos' | 'nvidia',
    probe: () => Promise<{
      profile: HardwareProfile;
      warnings: HardwareDetectionWarning[];
    }>
  ): Promise<HardwareDetectionResult> {
    try {
      const { profile, warnings } = await probe();
      return { profile, warnings, source };
    } catch (err) {
      const fallback = detectCPU(this.osModule, this.now);
      const cause = err instanceof Error ? err.message : String(err);
      const warnings: HardwareDetectionWarning[] = [
        {
          code: `${source}_probe_failed`,
          message: `${source.toUpperCase()} probe failed; falling back to CPU profile.`,
          cause,
        },
        ...fallback.warnings,
      ];
      return { profile: fallback.profile, warnings, source: 'cpu' };
    }
  }
}

/** Convenience wrapper for one-shot detection. */
export async function detectHardware(
  opts: HardwareDetectorOptions = {}
): Promise<HardwareDetectionResult> {
  return new HardwareDetector(opts).detect();
}
