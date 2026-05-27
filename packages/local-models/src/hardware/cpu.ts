/**
 * CPU-only fallback detector.
 *
 * The detector that never fails: reads `os.cpus()[0].model` and
 * `os.totalmem()`, then assigns a bandwidth heuristic by regex-matching the
 * CPU brand string into a known family. Used whenever no GPU detector
 * applies — Linux without an NVIDIA GPU, Windows without `nvidia-smi`, Intel
 * Macs, containers without GPU passthrough — and whenever a GPU detector
 * throws (S3).
 *
 * Bandwidth heuristics are deliberately conservative. The ranker only needs
 * a ballpark figure to estimate tokens-per-second; over-promising bandwidth
 * for CPU-only hosts would make CPU-bound models look more attractive than
 * they are.
 */

import * as nodeOs from 'node:os';

import type { HardwareDetectionWarning, HardwareProfile } from './types.js';

const BYTES_PER_GIB = 1024 ** 3;

/** Minimal subset of `node:os` we depend on — keeps tests injectable. */
export interface OsModule {
  totalmem(): number;
  cpus(): ReadonlyArray<{ model: string }>;
}

/**
 * CPU family → effective dual-channel memory bandwidth in GB/s. The numbers
 * approximate "theoretical peak DRAM bandwidth a single socket can sustain"
 * for the default memory configuration shipped with that family. They are
 * not chip-specific; the ranker uses them only as a tie-breaker among
 * CPU-bound models.
 */
interface BandwidthEntry {
  match: RegExp;
  bandwidthGbps: number;
  family: string;
}

const CPU_BANDWIDTH_TABLE: ReadonlyArray<BandwidthEntry> = [
  // Server-class (octa+ channel, DDR5/DDR4) — listed first so they match
  // before the desktop regexes that would otherwise swallow "Xeon".
  { match: /EPYC\s+9\d{3}/i, bandwidthGbps: 460, family: 'AMD EPYC 9xxx (Genoa, 12-channel DDR5)' },
  {
    match: /EPYC\s+7\d{3}/i,
    bandwidthGbps: 200,
    family: 'AMD EPYC 7xxx (Milan/Rome, 8-channel DDR4)',
  },
  {
    match: /Xeon.*Platinum.*8[45]\d{2}/i,
    bandwidthGbps: 307,
    family: 'Intel Xeon Sapphire/Emerald Rapids',
  },
  { match: /Xeon.*Gold/i, bandwidthGbps: 200, family: 'Intel Xeon Gold' },
  { match: /Xeon/i, bandwidthGbps: 120, family: 'Intel Xeon (generic)' },

  // Desktop DDR5 (i9-12xxx onward, Ryzen 7xxx onward)
  { match: /Core.*i[579]-1[4-9]\d{3}/i, bandwidthGbps: 90, family: 'Intel Core 14th-gen (DDR5)' },
  { match: /Core.*i[579]-1[23]\d{3}/i, bandwidthGbps: 76, family: 'Intel Core 12/13th-gen (DDR5)' },
  { match: /Ryzen\s+9\s+9\d{3}/i, bandwidthGbps: 90, family: 'AMD Ryzen 9000 (Zen 5, DDR5)' },
  { match: /Ryzen\s+[579]\s+7\d{3}/i, bandwidthGbps: 83, family: 'AMD Ryzen 7000 (Zen 4, DDR5)' },

  // Desktop DDR4 (Ryzen 5xxx, Intel 10th–11th gen)
  { match: /Ryzen\s+[579]\s+5\d{3}/i, bandwidthGbps: 51, family: 'AMD Ryzen 5000 (Zen 3, DDR4)' },
  { match: /Core.*i[579]-11\d{3}/i, bandwidthGbps: 51, family: 'Intel Core 11th-gen (DDR4)' },
  { match: /Core.*i[579]-10\d{3}/i, bandwidthGbps: 45, family: 'Intel Core 10th-gen (DDR4)' },

  // Apple Silicon — only reachable when the macOS detector falls back to CPU.
  { match: /Apple\s+M\d/i, bandwidthGbps: 100, family: 'Apple Silicon (CPU fallback)' },
];

/** Final fallback for unmatched CPU brand strings (dual-channel DDR4 baseline). */
const UNKNOWN_CPU_BANDWIDTH_GBPS = 40;

/** Result returned by `detectCPU` — profile + any non-fatal warnings. */
export interface DetectCPUResult {
  profile: HardwareProfile;
  warnings: HardwareDetectionWarning[];
}

/**
 * CPU-only profile detector. Never throws — the worst case is the unmapped
 * brand string, which yields a profile with `UNKNOWN_CPU_BANDWIDTH_GBPS` and
 * a single warning.
 */
export function detectCPU(
  os: OsModule = nodeOs,
  now: () => Date = () => new Date()
): DetectCPUResult {
  const warnings: HardwareDetectionWarning[] = [];
  const cpuModel = os.cpus()[0]?.model?.trim() ?? 'unknown CPU';
  const ramGb = Math.round((os.totalmem() / BYTES_PER_GIB) * 10) / 10;

  const entry = CPU_BANDWIDTH_TABLE.find((e) => e.match.test(cpuModel));
  const bandwidthGbps = entry?.bandwidthGbps ?? UNKNOWN_CPU_BANDWIDTH_GBPS;

  if (!entry) {
    warnings.push({
      code: 'cpu_unmapped_family',
      message: `Unknown CPU family "${cpuModel}"; using conservative ${UNKNOWN_CPU_BANDWIDTH_GBPS} GB/s bandwidth.`,
    });
  }

  const profile: HardwareProfile = {
    platform: 'cpu',
    vramGb: 0,
    ramGb,
    bandwidthGbps,
    cpuName: cpuModel,
    detectedAt: now().toISOString(),
  };

  return { profile, warnings };
}
