import { describe, expect, it, vi } from 'vitest';

import { HardwareDetector, detectHardware } from '../../src/hardware/detector.js';
import type { OsModule as CpuOs } from '../../src/hardware/cpu.js';
import type { ShellRunner } from '../../src/hardware/shell.js';

function osWith(opts: { ramGb: number; cpu: string }): CpuOs {
  return {
    totalmem: () => Math.round(opts.ramGb * 1024 ** 3),
    cpus: () => [{ model: opts.cpu }],
  };
}

const MACOS_FIXTURE_RESPONSES: Record<string, { stdout: string; stderr: string; code: number }> = {
  system_profiler: {
    stdout: JSON.stringify({
      SPDisplaysDataType: [{ sppci_model: 'Apple M3 Max' }],
    }),
    stderr: '',
    code: 0,
  },
  sysctl: {
    stdout: '38654705664\nMac15,9\nApple M3 Max\n',
    stderr: '',
    code: 0,
  },
};

function macOSFixtureShell(): ShellRunner {
  return {
    run: vi.fn(async (cmd: string) => {
      const reply = MACOS_FIXTURE_RESPONSES[cmd];
      if (!reply) throw new Error(`unexpected ${cmd}`);
      return reply;
    }),
  };
}

describe('HardwareDetector', () => {
  it('returns the override verbatim and never invokes the shell (OT1)', async () => {
    const shell: ShellRunner = { run: vi.fn() };
    const detector = new HardwareDetector({
      override: {
        platform: 'nvidia',
        vramGb: 24,
        bandwidthGbps: 1008,
        gpuName: 'RTX 4090',
      },
      shell,
      platform: 'linux',
      now: () => new Date('2026-05-27T12:00:00.000Z'),
    });

    const result = await detector.detect();

    expect(result.source).toBe('override');
    expect(result.profile.gpuName).toBe('RTX 4090');
    expect(result.profile.bandwidthGbps).toBe(1008);
    expect(result.profile.detectedAt).toBe('2026-05-27T12:00:00.000Z');
    expect(shell.run).not.toHaveBeenCalled();
  });

  it('detects on darwin via the macOS probe (OT2)', async () => {
    const shell = macOSFixtureShell();
    const detector = new HardwareDetector({
      shell,
      platform: 'darwin',
      now: () => new Date('2026-05-27T00:00:00.000Z'),
    });

    const result = await detector.detect();

    expect(result.source).toBe('macos');
    expect(result.profile.platform).toBe('macos');
    expect(result.profile.gpuName).toBe('Apple M3 Max');
    expect(result.profile.bandwidthGbps).toBe(400);
    expect(result.warnings).toEqual([]);
  });

  it('detects on linux via the NVIDIA probe (OT3)', async () => {
    const shell: ShellRunner = {
      run: vi.fn(async () => ({
        stdout: 'NVIDIA GeForce RTX 4090, 24564\n',
        stderr: '',
        code: 0,
      })),
    };
    const detector = new HardwareDetector({
      shell,
      platform: 'linux',
      osModule: osWith({ ramGb: 64, cpu: 'AMD Ryzen 9 7950X' }),
      now: () => new Date('2026-05-27T00:00:00.000Z'),
    });

    const result = await detector.detect();

    expect(result.source).toBe('nvidia');
    expect(result.profile.platform).toBe('nvidia');
    expect(result.profile.gpuName).toBe('NVIDIA GeForce RTX 4090');
  });

  it('falls through to CPU when the darwin probe throws and surfaces a warning (OT4)', async () => {
    const shell: ShellRunner = {
      run: vi.fn(async () => {
        throw new Error('system_profiler boom');
      }),
    };
    const detector = new HardwareDetector({
      shell,
      platform: 'darwin',
      osModule: osWith({ ramGb: 32, cpu: 'Apple M3' }),
      now: () => new Date('2026-05-27T00:00:00.000Z'),
    });

    const result = await detector.detect();

    expect(result.source).toBe('cpu');
    expect(result.profile.platform).toBe('cpu');
    expect(result.warnings.map((w) => w.code)).toContain('macos_probe_failed');
    expect(result.warnings[0]?.cause).toMatch(/system_profiler boom/);
  });

  it('falls through to CPU when nvidia-smi is missing (ENOENT, OT5)', async () => {
    const shell: ShellRunner = {
      run: vi.fn(async () => {
        throw Object.assign(new Error('spawn nvidia-smi ENOENT'), { code: 'ENOENT' });
      }),
    };
    const detector = new HardwareDetector({
      shell,
      platform: 'linux',
      osModule: osWith({ ramGb: 32, cpu: 'AMD Ryzen 5 5600X' }),
      now: () => new Date('2026-05-27T00:00:00.000Z'),
    });

    const result = await detector.detect();

    expect(result.source).toBe('cpu');
    expect(result.warnings.map((w) => w.code)).toContain('nvidia_probe_failed');
    expect(result.profile.cpuName).toMatch(/Ryzen 5 5600X/);
  });

  it('caches a probe result within the TTL (OT7)', async () => {
    const shell = macOSFixtureShell();
    const detector = new HardwareDetector({
      shell,
      platform: 'darwin',
      now: () => new Date('2026-05-27T00:00:00.000Z'),
    });

    await detector.detect();
    await detector.detect();
    // The macOS detector issues two parallel shell calls per probe;
    // a cache hit must keep that count at exactly 2.
    expect((shell.run as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2);
  });

  it('re-probes after invalidate()', async () => {
    const shell = macOSFixtureShell();
    const detector = new HardwareDetector({
      shell,
      platform: 'darwin',
      now: () => new Date('2026-05-27T00:00:00.000Z'),
    });

    await detector.detect();
    detector.invalidate();
    await detector.detect();
    expect((shell.run as ReturnType<typeof vi.fn>).mock.calls.length).toBe(4);
  });

  it('produces ISO timestamps that round-trip through Date (OT8)', async () => {
    const detector = new HardwareDetector({
      platform: 'freebsd',
      osModule: osWith({ ramGb: 8, cpu: 'Intel Core i7-9700K' }),
      now: () => new Date('2026-05-27T12:34:56.789Z'),
    });

    const result = await detector.detect();
    expect(new Date(result.profile.detectedAt).toISOString()).toBe(result.profile.detectedAt);
  });

  it('dispatches to CPU directly on unknown platforms', async () => {
    const detector = new HardwareDetector({
      platform: 'aix',
      osModule: osWith({ ramGb: 16, cpu: 'Intel Xeon Gold 6248' }),
      now: () => new Date('2026-05-27T00:00:00.000Z'),
    });

    const result = await detector.detect();
    expect(result.source).toBe('cpu');
    expect(result.profile.bandwidthGbps).toBe(200);
  });
});

describe('detectHardware (one-shot)', () => {
  it('runs the dispatcher once and returns the result', async () => {
    const result = await detectHardware({
      override: {
        platform: 'cpu',
        vramGb: 0,
        bandwidthGbps: 40,
        ramGb: 16,
        cpuName: 'test',
      },
    });
    expect(result.source).toBe('override');
    expect(result.profile.cpuName).toBe('test');
  });
});
