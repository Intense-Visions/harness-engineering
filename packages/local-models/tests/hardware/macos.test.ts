import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { detectMacOS } from '../../src/hardware/macos.js';
import type { ShellRunner } from '../../src/hardware/shell.js';

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');

function makeShell(impl: ShellRunner['run']): ShellRunner {
  return { run: impl };
}

async function loadFixture(name: string): Promise<string> {
  return readFile(path.join(FIXTURES, name), 'utf8');
}

describe('detectMacOS', () => {
  it('parses an M3 Max + 36GB unified-memory host from real fixtures', async () => {
    const spdisplays = await loadFixture('system_profiler.m3-max-36gb.json');
    const shell = makeShell(async (cmd) => {
      if (cmd === 'system_profiler') {
        return { stdout: spdisplays, stderr: '', code: 0 };
      }
      if (cmd === 'sysctl') {
        // 36 GiB = 38_654_705_664 bytes
        return {
          stdout: '38654705664\nMac15,9\nApple M3 Max\n',
          stderr: '',
          code: 0,
        };
      }
      throw new Error(`unexpected shell invocation: ${cmd}`);
    });

    const now = new Date('2026-05-27T12:00:00.000Z');
    const { profile, warnings } = await detectMacOS(shell, () => now);

    expect(profile.platform).toBe('macos');
    expect(profile.gpuName).toBe('Apple M3 Max');
    expect(profile.cpuName).toBe('Apple M3 Max');
    expect(profile.vramGb).toBeCloseTo(36, 0);
    expect(profile.ramGb).toBeCloseTo(36, 0);
    expect(profile.bandwidthGbps).toBe(400);
    expect(profile.detectedAt).toBe('2026-05-27T12:00:00.000Z');
    expect(warnings).toEqual([]);
  });

  it('returns a warning for an unmapped Apple Silicon chip but still resolves a profile', async () => {
    const shell = makeShell(async (cmd) => {
      if (cmd === 'system_profiler') {
        return {
          stdout: JSON.stringify({
            SPDisplaysDataType: [{ sppci_model: 'Apple M9 Ultra' }],
          }),
          stderr: '',
          code: 0,
        };
      }
      return { stdout: '17179869184\nMacUnknown\nApple M9\n', stderr: '', code: 0 };
    });

    const { profile, warnings } = await detectMacOS(shell);

    expect(profile.gpuName).toBe('Apple M9 Ultra');
    expect(profile.bandwidthGbps).toBe(100);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.code).toBe('macos_unmapped_chip');
  });

  it('throws when running on an Intel Mac (non-Apple-Silicon GPU)', async () => {
    const shell = makeShell(async (cmd) => {
      if (cmd === 'system_profiler') {
        return {
          stdout: JSON.stringify({
            SPDisplaysDataType: [{ sppci_model: 'AMD Radeon Pro 5500M' }],
          }),
          stderr: '',
          code: 0,
        };
      }
      return { stdout: '17179869184\nMacBookPro16,1\nIntel\n', stderr: '', code: 0 };
    });

    await expect(detectMacOS(shell)).rejects.toThrow(/unsupported macOS GPU/);
  });

  it('throws when sysctl returns a non-numeric memory size', async () => {
    const shell = makeShell(async (cmd) => {
      if (cmd === 'system_profiler') {
        return {
          stdout: JSON.stringify({
            SPDisplaysDataType: [{ sppci_model: 'Apple M2' }],
          }),
          stderr: '',
          code: 0,
        };
      }
      return { stdout: 'not-a-number\nMac\nApple M2\n', stderr: '', code: 0 };
    });

    await expect(detectMacOS(shell)).rejects.toThrow(/hw\.memsize/);
  });

  it('throws when system_profiler returns invalid JSON', async () => {
    const shell = makeShell(async (cmd) => {
      if (cmd === 'system_profiler') {
        return { stdout: 'not json', stderr: '', code: 0 };
      }
      return { stdout: '0\n\n\n', stderr: '', code: 0 };
    });

    await expect(detectMacOS(shell)).rejects.toThrow();
  });
});
