import { describe, expect, it } from 'vitest';

import { detectCPU } from '../../src/hardware/cpu.js';
import type { OsModule } from '../../src/hardware/cpu.js';

function makeOs(opts: { ramGb: number; cpu: string }): OsModule {
  return {
    totalmem: () => Math.round(opts.ramGb * 1024 ** 3),
    cpus: () => [{ model: opts.cpu }],
  };
}

describe('detectCPU', () => {
  it('matches a DDR5 desktop CPU (Ryzen 7000) to ~83 GB/s', () => {
    const { profile, warnings } = detectCPU(
      makeOs({ ramGb: 64, cpu: 'AMD Ryzen 9 7950X 16-Core Processor' }),
      () => new Date('2026-05-27T00:00:00.000Z')
    );

    expect(profile.platform).toBe('cpu');
    expect(profile.vramGb).toBe(0);
    expect(profile.ramGb).toBe(64);
    expect(profile.bandwidthGbps).toBe(83);
    expect(profile.cpuName).toMatch(/Ryzen 9 7950X/);
    expect(warnings).toEqual([]);
  });

  it('matches a DDR4 desktop CPU (Ryzen 5000) to ~51 GB/s', () => {
    const { profile, warnings } = detectCPU(
      makeOs({ ramGb: 32, cpu: 'AMD Ryzen 5 5600X 6-Core Processor' }),
      () => new Date('2026-05-27T00:00:00.000Z')
    );

    expect(profile.bandwidthGbps).toBe(51);
    expect(warnings).toEqual([]);
  });

  it('classifies EPYC 9xxx as a 12-channel DDR5 server', () => {
    const { profile, warnings } = detectCPU(
      makeOs({ ramGb: 768, cpu: 'AMD EPYC 9654 96-Core Processor' }),
      () => new Date('2026-05-27T00:00:00.000Z')
    );

    expect(profile.bandwidthGbps).toBe(460);
    expect(warnings).toEqual([]);
  });

  it('falls back to 40 GB/s and warns for an unknown CPU family', () => {
    const { profile, warnings } = detectCPU(
      makeOs({ ramGb: 16, cpu: 'WeirdVendor CPU 9000' }),
      () => new Date('2026-05-27T00:00:00.000Z')
    );

    expect(profile.bandwidthGbps).toBe(40);
    expect(warnings.map((w) => w.code)).toContain('cpu_unmapped_family');
  });

  it('produces an ISO-formatted detectedAt round-tripable through Date', () => {
    const { profile } = detectCPU(
      makeOs({ ramGb: 16, cpu: 'AMD Ryzen 5 5600X' }),
      () => new Date('2026-05-27T12:34:56.789Z')
    );
    expect(new Date(profile.detectedAt).toISOString()).toBe(profile.detectedAt);
  });
});
