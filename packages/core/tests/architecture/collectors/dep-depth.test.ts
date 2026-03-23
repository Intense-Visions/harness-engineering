import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { DepDepthCollector } from '../../../src/architecture/collectors/dep-depth';
import type { ArchConfig } from '../../../src/architecture/types';
import { mkdtemp, writeFile, mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

let tempDir: string;

const baseConfig: ArchConfig = {
  enabled: true,
  baselinePath: '.harness/arch/baselines.json',
  thresholds: {},
  modules: {},
};

beforeAll(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'dep-depth-test-'));
  await mkdir(join(tempDir, 'src', 'services'), { recursive: true });
  // Chain: a.ts -> b.ts -> c.ts (depth 2)
  await writeFile(
    join(tempDir, 'src', 'services', 'a.ts'),
    "import { b } from './b';\nexport const a = b;\n",
    'utf-8'
  );
  await writeFile(
    join(tempDir, 'src', 'services', 'b.ts'),
    "import { c } from './c';\nexport const b = c;\n",
    'utf-8'
  );
  await writeFile(join(tempDir, 'src', 'services', 'c.ts'), 'export const c = 1;\n', 'utf-8');
});

afterAll(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe('DepDepthCollector', () => {
  const collector = new DepDepthCollector();

  it('has category "dependency-depth"', () => {
    expect(collector.category).toBe('dependency-depth');
  });

  it('returns MetricResult with longest import chain depth', async () => {
    const results = await collector.collect(baseConfig, tempDir);
    expect(results.length).toBeGreaterThanOrEqual(1);
    const servicesResult = results.find((r) => r.scope.includes('services'));
    expect(servicesResult).toBeDefined();
    expect(servicesResult!.category).toBe('dependency-depth');
    // a.ts -> b.ts -> c.ts = depth 2
    expect(servicesResult!.value).toBeGreaterThanOrEqual(2);
  });

  it('produces no violations when under threshold', async () => {
    const results = await collector.collect(baseConfig, tempDir);
    for (const r of results) {
      expect(r.violations).toHaveLength(0);
    }
  });

  it('produces violations when depth exceeds threshold', async () => {
    const configWithThreshold: ArchConfig = {
      ...baseConfig,
      thresholds: { 'dependency-depth': 1 },
    };
    const results = await collector.collect(configWithThreshold, tempDir);
    const servicesResult = results.find((r) => r.scope.includes('services'));
    expect(servicesResult).toBeDefined();
    expect(servicesResult!.violations.length).toBeGreaterThan(0);
    expect(servicesResult!.violations[0]!.severity).toBe('warning');
    expect(servicesResult!.violations[0]!.id).toMatch(/^[a-f0-9]{64}$/);
  });

  it('includes metadata with longestChain', async () => {
    const results = await collector.collect(baseConfig, tempDir);
    const servicesResult = results.find((r) => r.scope.includes('services'));
    expect(servicesResult).toBeDefined();
    expect(servicesResult!.metadata).toBeDefined();
    expect(typeof servicesResult!.metadata!.longestChain).toBe('number');
  });
});
