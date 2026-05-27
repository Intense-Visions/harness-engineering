/**
 * NVIDIA GPU detection.
 *
 * Invokes `nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits`,
 * parses the CSV output, and looks up the GPU's memory bandwidth in a static
 * table seeded from NVIDIA's published datasheets. Multi-GPU hosts pick the
 * card with the most VRAM and emit a warning so the operator knows the other
 * cards are being ignored (multi-GPU support lands in v2).
 *
 * @see docs/changes/local-model-lifecycle-manager/proposal.md (Phase 1, F2)
 */

import * as nodeOs from 'node:os';

import type { ShellRunner } from './shell.js';
import type { HardwareDetectionWarning, HardwareProfile } from './types.js';

const BYTES_PER_GIB = 1024 ** 3;

/** Minimal subset of `node:os` consumed by the detector — keeps tests injectable. */
export interface OsModule {
  totalmem(): number;
  cpus(): ReadonlyArray<{ model: string }>;
}

/**
 * Published memory bandwidths (GB/s) per GPU marketing name. Sourced from
 * NVIDIA datasheet pages for the consumer Ada/Ampere lines and the Hopper /
 * Ada-server lines most operators ship with. Keys match the strings
 * `nvidia-smi` returns verbatim so lookups stay exact.
 */
const NVIDIA_BANDWIDTH_GBPS: Readonly<Record<string, number>> = {
  // Ada — consumer
  'NVIDIA GeForce RTX 4090': 1008,
  'NVIDIA GeForce RTX 4080 SUPER': 736,
  'NVIDIA GeForce RTX 4080': 716,
  'NVIDIA GeForce RTX 4070 Ti SUPER': 672,
  'NVIDIA GeForce RTX 4070 Ti': 504,
  'NVIDIA GeForce RTX 4070 SUPER': 504,
  'NVIDIA GeForce RTX 4070': 504,
  'NVIDIA GeForce RTX 4060 Ti': 288,
  'NVIDIA GeForce RTX 4060': 272,
  // Ampere — consumer
  'NVIDIA GeForce RTX 3090 Ti': 1008,
  'NVIDIA GeForce RTX 3090': 936,
  'NVIDIA GeForce RTX 3080 Ti': 912,
  'NVIDIA GeForce RTX 3080': 760,
  'NVIDIA GeForce RTX 3070 Ti': 608,
  'NVIDIA GeForce RTX 3070': 448,
  'NVIDIA GeForce RTX 3060 Ti': 448,
  'NVIDIA GeForce RTX 3060': 360,
  // Ada / Hopper / Ampere — datacenter
  'NVIDIA L40S': 864,
  'NVIDIA L40': 864,
  'NVIDIA L4': 300,
  'NVIDIA A100-PCIE-40GB': 1555,
  'NVIDIA A100-SXM4-40GB': 1555,
  'NVIDIA A100-PCIE-80GB': 1935,
  'NVIDIA A100-SXM4-80GB': 2039,
  'NVIDIA H100 PCIe': 2000,
  'NVIDIA H100 80GB HBM3': 3350,
};

/** Conservative fallback for unmapped NVIDIA GPUs. */
const UNKNOWN_NVIDIA_BANDWIDTH_GBPS = 300;

/** Result returned by `detectNVIDIA` — profile + any non-fatal warnings. */
export interface DetectNVIDIAResult {
  profile: HardwareProfile;
  warnings: HardwareDetectionWarning[];
}

interface NvidiaSmiRow {
  name: string;
  vramMiB: number;
}

/**
 * Parse the `nvidia-smi --format=csv,noheader,nounits` body. Each row is
 * `"<name>, <memory.total>"` (MiB). Empty or malformed rows are skipped.
 */
function parseNvidiaSmi(stdout: string): NvidiaSmiRow[] {
  const rows: NvidiaSmiRow[] = [];
  for (const raw of stdout.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const [name, vram] = line.split(',').map((s) => s.trim());
    if (!name) continue;
    const vramMiB = Number(vram);
    if (!Number.isFinite(vramMiB) || vramMiB <= 0) continue;
    rows.push({ name, vramMiB });
  }
  return rows;
}

/**
 * Detect an NVIDIA GPU. Throws on missing binary or empty output so the
 * dispatcher can fall through to the CPU profile (S3).
 */
export async function detectNVIDIA(
  shell: ShellRunner,
  now: () => Date = () => new Date(),
  os: OsModule = nodeOs
): Promise<DetectNVIDIAResult> {
  const result = await shell.run('nvidia-smi', [
    '--query-gpu=name,memory.total',
    '--format=csv,noheader,nounits',
  ]);

  const rows = parseNvidiaSmi(result.stdout);
  if (rows.length === 0) {
    throw new Error('nvidia-smi returned no GPUs');
  }

  // Pick the GPU with the most VRAM — the one most likely to host the model.
  const primary = rows.reduce((best, row) => (row.vramMiB > best.vramMiB ? row : best));

  const warnings: HardwareDetectionWarning[] = [];
  if (rows.length > 1) {
    warnings.push({
      code: 'nvidia_multi_gpu_ignored',
      message: `Detected ${rows.length} NVIDIA GPUs; selecting "${primary.name}" with the most VRAM. Multi-GPU support arrives in v2.`,
    });
  }

  const bandwidthGbps = NVIDIA_BANDWIDTH_GBPS[primary.name] ?? UNKNOWN_NVIDIA_BANDWIDTH_GBPS;
  if (!(primary.name in NVIDIA_BANDWIDTH_GBPS)) {
    warnings.push({
      code: 'nvidia_unmapped_gpu',
      message: `Unknown NVIDIA GPU "${primary.name}"; using conservative ${UNKNOWN_NVIDIA_BANDWIDTH_GBPS} GB/s bandwidth. Add it to NVIDIA_BANDWIDTH_GBPS for an accurate estimate.`,
    });
  }

  const vramGb = Math.round((primary.vramMiB / 1024) * 10) / 10;
  const ramGb = Math.round((os.totalmem() / BYTES_PER_GIB) * 10) / 10;
  const cpuName = os.cpus()[0]?.model ?? 'unknown';

  const profile: HardwareProfile = {
    platform: 'nvidia',
    vramGb,
    ramGb,
    bandwidthGbps,
    gpuName: primary.name,
    cpuName,
    detectedAt: now().toISOString(),
  };

  return { profile, warnings };
}
