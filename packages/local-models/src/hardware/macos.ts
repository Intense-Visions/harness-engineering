/**
 * Apple Silicon detection.
 *
 * Combines two probes:
 *  - `system_profiler SPDisplaysDataType -json` for the GPU chip string
 *    (`"Apple M3 Max"`) and any external displays attached.
 *  - `sysctl -n hw.memsize hw.model machdep.cpu.brand_string` for unified
 *    memory size + the model identifier + CPU brand string.
 *
 * Memory bandwidth is derived from a static chip → GB/s table because
 * neither `system_profiler` nor `sysctl` reports memory bandwidth directly.
 * Unmapped chips fall back to a conservative figure and surface a warning so
 * the operator knows the heuristic is approximate.
 *
 * @see docs/changes/local-model-lifecycle-manager/proposal.md (Phase 1, F1)
 */

import type { ShellRunner } from './shell.js';
import type { HardwareDetectionWarning, HardwareProfile } from './types.js';

/**
 * Published Apple Silicon memory bandwidths (GB/s). Source: Apple's chip-
 * launch press releases and technical briefs. Numbers are the headline
 * unified-memory bandwidth — adequate for the speed estimator's bandwidth-
 * bound throughput model.
 */
const APPLE_SILICON_BANDWIDTH_GBPS: Readonly<Record<string, number>> = {
  'Apple M1': 68,
  'Apple M1 Pro': 200,
  'Apple M1 Max': 400,
  'Apple M1 Ultra': 800,
  'Apple M2': 100,
  'Apple M2 Pro': 200,
  'Apple M2 Max': 400,
  'Apple M2 Ultra': 800,
  'Apple M3': 100,
  'Apple M3 Pro': 150,
  'Apple M3 Max': 400,
  'Apple M3 Ultra': 819,
  'Apple M4': 120,
  'Apple M4 Pro': 273,
  'Apple M4 Max': 546,
};

/** Conservative fallback for unknown Apple Silicon variants (matches the M-series base). */
const UNKNOWN_APPLE_SILICON_BANDWIDTH_GBPS = 100;

const BYTES_PER_GIB = 1024 ** 3;

/** Result returned by `detectMacOS` — profile + any non-fatal warnings. */
export interface DetectMacOSResult {
  profile: HardwareProfile;
  warnings: HardwareDetectionWarning[];
}

interface SPDisplaysEntry {
  sppci_model?: string;
  _name?: string;
}

interface SPDisplaysPayload {
  SPDisplaysDataType?: ReadonlyArray<SPDisplaysEntry>;
}

/** Best display name available on an entry; empty string if neither field is set. */
function entryModel(entry: SPDisplaysEntry): string {
  return entry.sppci_model ?? entry._name ?? '';
}

/**
 * Read the GPU chip string from `system_profiler SPDisplaysDataType -json`.
 * Apple Silicon Macs report the chip in `sppci_model` (e.g., `"Apple M3 Max"`);
 * Intel Macs and eGPUs report a non-Apple model and trigger the Intel-Mac warning.
 */
function parseChipFromSPDisplays(stdout: string): string {
  const parsed = JSON.parse(stdout) as SPDisplaysPayload;
  const entries = parsed.SPDisplaysDataType ?? [];
  const appleEntry = entries.find((e) => entryModel(e).startsWith('Apple M'));
  if (appleEntry) return entryModel(appleEntry);
  const first = entries[0];
  return first ? entryModel(first) : '';
}

/**
 * Parse the three-line `sysctl -n hw.memsize hw.model machdep.cpu.brand_string`
 * output into a tuple of (bytes, hw.model, cpu brand string).
 */
function parseSysctl(stdout: string): {
  memBytes: number;
  hwModel: string;
  cpuBrand: string;
} {
  const lines = stdout
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const [memStr, hwModel = '', cpuBrand = ''] = lines;
  const memBytes = Number(memStr);
  if (!Number.isFinite(memBytes) || memBytes <= 0) {
    throw new Error(`sysctl hw.memsize returned a non-numeric value: ${memStr}`);
  }
  return { memBytes, hwModel, cpuBrand };
}

/**
 * Detect Apple Silicon hardware.
 *
 * Throws on any unrecoverable probe failure (JSON parse error, missing
 * binaries, non-numeric memory). The dispatcher (`HardwareDetector`)
 * catches the throw and falls through to the CPU profile with a warning (S3).
 */
export async function detectMacOS(
  shell: ShellRunner,
  now: () => Date = () => new Date()
): Promise<DetectMacOSResult> {
  const [displays, sysctlOut] = await Promise.all([
    shell.run('system_profiler', ['SPDisplaysDataType', '-json']),
    shell.run('sysctl', ['-n', 'hw.memsize', 'hw.model', 'machdep.cpu.brand_string']),
  ]);

  const warnings: HardwareDetectionWarning[] = [];

  const chip = parseChipFromSPDisplays(displays.stdout);
  const { memBytes, hwModel, cpuBrand } = parseSysctl(sysctlOut.stdout);
  const ramGb = Math.round((memBytes / BYTES_PER_GIB) * 10) / 10;

  if (!chip.startsWith('Apple M')) {
    // Intel Mac or eGPU — caller should treat this as a CPU-only host.
    throw new Error(
      `unsupported macOS GPU "${chip || 'unknown'}"; only Apple Silicon is supported in v1`
    );
  }

  const bandwidthGbps = APPLE_SILICON_BANDWIDTH_GBPS[chip] ?? UNKNOWN_APPLE_SILICON_BANDWIDTH_GBPS;
  if (!(chip in APPLE_SILICON_BANDWIDTH_GBPS)) {
    warnings.push({
      code: 'macos_unmapped_chip',
      message: `Unknown Apple Silicon chip "${chip}"; using conservative ${UNKNOWN_APPLE_SILICON_BANDWIDTH_GBPS} GB/s bandwidth.`,
    });
  }

  const profile: HardwareProfile = {
    platform: 'macos',
    vramGb: ramGb,
    ramGb,
    bandwidthGbps,
    gpuName: chip,
    cpuName: cpuBrand || hwModel || 'Apple Silicon',
    detectedAt: now().toISOString(),
  };

  return { profile, warnings };
}
