import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

import { runUninstallConstraints } from '../../src/commands/uninstall-constraints';

describe('runUninstallConstraints', () => {
  let tmpDir: string;
  let configPath: string;
  let lockfilePath: string;

  // Config state after installing "test-bundle" with layers + security.rules
  const installedConfig = {
    version: 1,
    name: 'test-project',
    layers: [
      { name: 'domain', pattern: 'src/domain/**', allowedDependencies: [] },
      { name: 'infra', pattern: 'src/infra/**', allowedDependencies: ['domain'] },
    ],
    security: {
      rules: { 'SEC-CRY-001': 'error', 'SEC-INJ-002': 'warning' },
    },
  };

  const lockfileWithPackage = {
    version: 1 as const,
    packages: {
      'test-bundle': {
        version: '1.0.0',
        source: '/some/path/test-bundle.harness-constraints.json',
        installedAt: '2026-03-25T12:00:00Z',
        contributions: {
          layers: ['infra'],
          'security.rules': ['SEC-CRY-001'],
        },
      },
    },
  };

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-uninstall-test-'));
    configPath = path.join(tmpDir, 'harness.config.json');
    lockfilePath = path.join(tmpDir, '.harness', 'constraints.lock.json');

    await fs.mkdir(path.join(tmpDir, '.harness'), { recursive: true });
    await fs.writeFile(configPath, JSON.stringify(installedConfig, null, 2));
    await fs.writeFile(lockfilePath, JSON.stringify(lockfileWithPackage, null, 2));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('removes contributed rules and updates config and lockfile', async () => {
    const result = await runUninstallConstraints({
      packageName: 'test-bundle',
      configPath,
      lockfilePath,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.removed).toBe(true);
    expect(result.value.packageName).toBe('test-bundle');
    expect(result.value.sectionsRemoved).toContain('layers');
    expect(result.value.sectionsRemoved).toContain('security.rules');

    // Verify config: infra layer removed, domain remains
    const updatedConfig = JSON.parse(await fs.readFile(configPath, 'utf-8'));
    const layers = updatedConfig.layers as Array<{ name: string }>;
    expect(layers).toHaveLength(1);
    expect(layers[0].name).toBe('domain');

    // Verify config: SEC-CRY-001 removed, SEC-INJ-002 remains
    expect(updatedConfig.security.rules['SEC-CRY-001']).toBeUndefined();
    expect(updatedConfig.security.rules['SEC-INJ-002']).toBe('warning');

    // Verify lockfile: package entry removed
    const updatedLockfile = JSON.parse(await fs.readFile(lockfilePath, 'utf-8'));
    expect(updatedLockfile.packages['test-bundle']).toBeUndefined();
  });

  it('returns error when package is not installed', async () => {
    const result = await runUninstallConstraints({
      packageName: 'nonexistent',
      configPath,
      lockfilePath,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('not installed');
  });

  it('returns error when lockfile does not exist', async () => {
    await fs.rm(lockfilePath, { force: true });

    const result = await runUninstallConstraints({
      packageName: 'test-bundle',
      configPath,
      lockfilePath,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('No lockfile');
  });

  it('handles package with no contributions gracefully', async () => {
    const lockfileNoContribs = {
      version: 1 as const,
      packages: {
        'empty-pkg': {
          version: '1.0.0',
          source: '/some/path.json',
          installedAt: '2026-03-25T12:00:00Z',
          contributions: null,
        },
      },
    };
    await fs.writeFile(lockfilePath, JSON.stringify(lockfileNoContribs, null, 2));

    const result = await runUninstallConstraints({
      packageName: 'empty-pkg',
      configPath,
      lockfilePath,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.removed).toBe(true);
    expect(result.value.sectionsRemoved).toEqual([]);
  });

  it('round-trip: install then uninstall restores original config', async () => {
    // Start with a clean config (only domain layer, only SEC-INJ-002)
    const originalConfig = {
      version: 1,
      name: 'test-project',
      layers: [{ name: 'domain', pattern: 'src/domain/**', allowedDependencies: [] }],
      security: {
        rules: { 'SEC-INJ-002': 'warning' },
      },
    };
    await fs.writeFile(configPath, JSON.stringify(originalConfig, null, 2));

    // Simulate that test-bundle added infra + SEC-CRY-001 on top
    await fs.writeFile(configPath, JSON.stringify(installedConfig, null, 2));
    await fs.writeFile(lockfilePath, JSON.stringify(lockfileWithPackage, null, 2));

    // Uninstall
    const result = await runUninstallConstraints({
      packageName: 'test-bundle',
      configPath,
      lockfilePath,
    });

    expect(result.ok).toBe(true);
    const updatedConfig = JSON.parse(await fs.readFile(configPath, 'utf-8'));
    expect(updatedConfig.layers).toEqual(originalConfig.layers);
    expect(updatedConfig.security.rules).toEqual(originalConfig.security.rules);
  });
});
