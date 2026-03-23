import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ModuleSizeCollector } from '../../../src/architecture/collectors/module-size';
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
  tempDir = await mkdtemp(join(tmpdir(), 'module-size-test-'));
  // Create module structure
  await mkdir(join(tempDir, 'src', 'services'), { recursive: true });
  await mkdir(join(tempDir, 'src', 'api'), { recursive: true });
  await writeFile(
    join(tempDir, 'src', 'services', 'user.ts'),
    'export class User {}\n// line 2\n// line 3\n',
    'utf-8'
  );
  await writeFile(
    join(tempDir, 'src', 'services', 'auth.ts'),
    'export function auth() {}\n// line 2\n',
    'utf-8'
  );
  await writeFile(join(tempDir, 'src', 'api', 'routes.ts'), 'export const routes = [];\n', 'utf-8');
});

afterAll(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe('ModuleSizeCollector', () => {
  const collector = new ModuleSizeCollector();

  it('has category "module-size"', () => {
    expect(collector.category).toBe('module-size');
  });

  it('returns one MetricResult per discovered module directory', async () => {
    const results = await collector.collect(baseConfig, tempDir);
    // Should find src/services and src/api as modules
    expect(results.length).toBeGreaterThanOrEqual(2);
    const categories = results.map((r) => r.category);
    expect(categories.every((c) => c === 'module-size')).toBe(true);
  });

  it('includes metadata with fileCount and totalLoc', async () => {
    const results = await collector.collect(baseConfig, tempDir);
    const servicesResult = results.find((r) => r.scope.includes('services'));
    expect(servicesResult).toBeDefined();
    expect(servicesResult!.metadata).toBeDefined();
    expect(servicesResult!.metadata!.fileCount).toBe(2);
    expect(typeof servicesResult!.metadata!.totalLoc).toBe('number');
    expect(servicesResult!.metadata!.totalLoc as number).toBeGreaterThan(0);
  });

  it('value equals totalLoc for the module', async () => {
    const results = await collector.collect(baseConfig, tempDir);
    const apiResult = results.find((r) => r.scope.includes('api'));
    expect(apiResult).toBeDefined();
    expect(apiResult!.value).toBe(apiResult!.metadata!.totalLoc);
  });

  it('produces no violations when under threshold', async () => {
    const results = await collector.collect(baseConfig, tempDir);
    for (const r of results) {
      // With no thresholds set, no violations expected
      expect(r.violations).toHaveLength(0);
    }
  });

  it('produces violations when module exceeds threshold', async () => {
    const configWithThreshold: ArchConfig = {
      ...baseConfig,
      thresholds: { 'module-size': { maxLoc: 2, maxFiles: 1 } },
    };
    const results = await collector.collect(configWithThreshold, tempDir);
    const servicesResult = results.find((r) => r.scope.includes('services'));
    expect(servicesResult).toBeDefined();
    expect(servicesResult!.violations.length).toBeGreaterThan(0);
    expect(servicesResult!.violations[0]!.id).toMatch(/^[a-f0-9]{64}$/);
  });
});
