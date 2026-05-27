import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { detectNVIDIA } from '../../src/hardware/nvidia.js';
import type { OsModule } from '../../src/hardware/nvidia.js';
import type { ShellRunner } from '../../src/hardware/shell.js';

const FIXTURES = path
  .dirname(fileURLToPath(import.meta.url))
  .replace(/tests\/hardware$/, 'tests/fixtures');

function makeShell(impl: ShellRunner['run']): ShellRunner {
  return { run: impl };
}

function makeOs(opts: { ramGb: number; cpu?: string }): OsModule {
  return {
    totalmem: () => Math.round(opts.ramGb * 1024 ** 3),
    cpus: () => [{ model: opts.cpu ?? 'AMD Ryzen 9 7950X 16-Core Processor' }],
  };
}

describe('detectNVIDIA', () => {
  it('parses an RTX 4090 row from the canonical fixture', async () => {
    const fixture = await readFile(path.join(FIXTURES, 'nvidia-smi.rtx-4090.txt'), 'utf8');
    const shell = makeShell(async () => ({ stdout: fixture, stderr: '', code: 0 }));
    const now = new Date('2026-05-27T12:00:00.000Z');
    const os = makeOs({ ramGb: 64 });

    const { profile, warnings } = await detectNVIDIA(shell, () => now, os);

    expect(profile.platform).toBe('nvidia');
    expect(profile.gpuName).toBe('NVIDIA GeForce RTX 4090');
    expect(profile.vramGb).toBeCloseTo(23.99, 1);
    expect(profile.bandwidthGbps).toBe(1008);
    expect(profile.ramGb).toBe(64);
    expect(profile.cpuName).toMatch(/Ryzen 9 7950X/);
    expect(profile.detectedAt).toBe('2026-05-27T12:00:00.000Z');
    expect(warnings).toEqual([]);
  });

  it('selects the highest-VRAM GPU on a multi-GPU host and emits a warning', async () => {
    const shell = makeShell(async () => ({
      stdout: ['NVIDIA GeForce RTX 3060, 12288', 'NVIDIA GeForce RTX 4090, 24564'].join('\n'),
      stderr: '',
      code: 0,
    }));

    const { profile, warnings } = await detectNVIDIA(
      shell,
      () => new Date('2026-05-27T00:00:00.000Z'),
      makeOs({ ramGb: 32 })
    );

    expect(profile.gpuName).toBe('NVIDIA GeForce RTX 4090');
    expect(warnings.map((w) => w.code)).toContain('nvidia_multi_gpu_ignored');
  });

  it('falls back to the conservative bandwidth and warns for unmapped GPUs', async () => {
    const shell = makeShell(async () => ({
      stdout: 'NVIDIA GeForce RTX 5090, 32768\n',
      stderr: '',
      code: 0,
    }));

    const { profile, warnings } = await detectNVIDIA(
      shell,
      () => new Date('2026-05-27T00:00:00.000Z'),
      makeOs({ ramGb: 128 })
    );

    expect(profile.bandwidthGbps).toBe(300);
    expect(warnings.map((w) => w.code)).toContain('nvidia_unmapped_gpu');
  });

  it('throws when nvidia-smi is unavailable (ENOENT)', async () => {
    const shell = makeShell(async () => {
      throw Object.assign(new Error('spawn nvidia-smi ENOENT'), { code: 'ENOENT' });
    });

    await expect(detectNVIDIA(shell, () => new Date(), makeOs({ ramGb: 16 }))).rejects.toThrow(
      /ENOENT/
    );
  });

  it('throws when nvidia-smi returns an empty body', async () => {
    const shell = makeShell(async () => ({ stdout: '\n\n', stderr: '', code: 0 }));

    await expect(detectNVIDIA(shell, () => new Date(), makeOs({ ramGb: 16 }))).rejects.toThrow(
      /no GPUs/
    );
  });
});
