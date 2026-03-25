import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

// We test the exported runInstallConstraints function directly
import { runInstallConstraints } from '../../src/commands/install-constraints';

describe('runInstallConstraints', () => {
  let tmpDir: string;
  let configPath: string;
  let lockfilePath: string;
  let bundlePath: string;

  const minimalBundle = {
    name: 'test-bundle',
    version: '1.0.0',
    manifest: {
      name: 'test-bundle',
      version: '1.0.0',
      include: ['layers'],
    },
    constraints: {
      layers: [{ name: 'shared', pattern: 'src/shared/**', allowedDependencies: [] }],
    },
  };

  const minimalConfig = {
    version: 1,
    name: 'test-project',
    layers: [],
  };

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-install-test-'));
    configPath = path.join(tmpDir, 'harness.config.json');
    lockfilePath = path.join(tmpDir, '.harness', 'constraints.lock.json');
    bundlePath = path.join(tmpDir, 'test-bundle.harness-constraints.json');

    await fs.mkdir(path.join(tmpDir, '.harness'), { recursive: true });
    await fs.writeFile(configPath, JSON.stringify(minimalConfig, null, 2));
    await fs.writeFile(bundlePath, JSON.stringify(minimalBundle, null, 2));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('installs a bundle into an empty config', async () => {
    const result = await runInstallConstraints({
      source: bundlePath,
      configPath,
      lockfilePath,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.installed).toBe(true);
    expect(result.value.packageName).toBe('test-bundle');
    expect(result.value.contributionsCount).toBeGreaterThan(0);

    // Verify config was written
    const updatedConfig = JSON.parse(await fs.readFile(configPath, 'utf-8'));
    expect(updatedConfig.layers).toContainEqual(expect.objectContaining({ name: 'shared' }));

    // Verify lockfile was created
    const lockfile = JSON.parse(await fs.readFile(lockfilePath, 'utf-8'));
    expect(lockfile.version).toBe(1);
    expect(lockfile.packages['test-bundle']).toBeDefined();
    expect(lockfile.packages['test-bundle'].version).toBe('1.0.0');
    expect(lockfile.packages['test-bundle'].source).toBe(bundlePath);
  });

  it('returns error when bundle file does not exist', async () => {
    const result = await runInstallConstraints({
      source: path.join(tmpDir, 'nonexistent.json'),
      configPath,
      lockfilePath,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('not found');
  });

  it('returns error when bundle has invalid JSON', async () => {
    await fs.writeFile(bundlePath, '{ invalid json !!!');
    const result = await runInstallConstraints({
      source: bundlePath,
      configPath,
      lockfilePath,
    });

    expect(result.ok).toBe(false);
  });

  it('returns error when bundle fails schema validation', async () => {
    await fs.writeFile(bundlePath, JSON.stringify({ notABundle: true }));
    const result = await runInstallConstraints({
      source: bundlePath,
      configPath,
      lockfilePath,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('schema');
  });

  describe('conflict handling', () => {
    const conflictBundle = {
      name: 'conflict-bundle',
      version: '1.0.0',
      manifest: {
        name: 'conflict-bundle',
        version: '1.0.0',
        include: ['layers'],
      },
      constraints: {
        layers: [{ name: 'shared', pattern: 'src/shared/**', allowedDependencies: ['core'] }],
      },
    };

    const configWithExistingLayer = {
      version: 1,
      name: 'test-project',
      layers: [{ name: 'shared', pattern: 'src/shared/**', allowedDependencies: [] }],
    };

    it('returns error with conflict details when no resolution flag is provided', async () => {
      await fs.writeFile(configPath, JSON.stringify(configWithExistingLayer, null, 2));
      await fs.writeFile(bundlePath, JSON.stringify(conflictBundle, null, 2));

      const result = await runInstallConstraints({
        source: bundlePath,
        configPath,
        lockfilePath,
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toContain('conflict');
      expect(result.error).toContain('shared');
    });

    it('resolves conflicts with --force-local by keeping local values', async () => {
      await fs.writeFile(configPath, JSON.stringify(configWithExistingLayer, null, 2));
      await fs.writeFile(bundlePath, JSON.stringify(conflictBundle, null, 2));

      const result = await runInstallConstraints({
        source: bundlePath,
        configPath,
        lockfilePath,
        forceLocal: true,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.installed).toBe(true);
      expect(result.value.conflicts).toHaveLength(1);

      // Config should keep local value (empty allowedDependencies)
      const updatedConfig = JSON.parse(await fs.readFile(configPath, 'utf-8'));
      const sharedLayer = updatedConfig.layers.find((l: { name: string }) => l.name === 'shared');
      expect(sharedLayer.allowedDependencies).toEqual([]);
    });

    it('resolves conflicts with --force-package by using package values', async () => {
      await fs.writeFile(configPath, JSON.stringify(configWithExistingLayer, null, 2));
      await fs.writeFile(bundlePath, JSON.stringify(conflictBundle, null, 2));

      const result = await runInstallConstraints({
        source: bundlePath,
        configPath,
        lockfilePath,
        forcePackage: true,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.installed).toBe(true);
      expect(result.value.conflicts).toHaveLength(1);

      // Config should use package value (allowedDependencies: ['core'])
      const updatedConfig = JSON.parse(await fs.readFile(configPath, 'utf-8'));
      const sharedLayer = updatedConfig.layers.find((l: { name: string }) => l.name === 'shared');
      expect(sharedLayer.allowedDependencies).toEqual(['core']);
    });

    it('resolves security rule conflicts with --force-package', async () => {
      const configWithRules = {
        version: 1,
        name: 'test-project',
        security: { rules: { 'SEC-CRY-001': 'warning' } },
      };
      const bundleWithRules = {
        name: 'sec-bundle',
        version: '1.0.0',
        manifest: {
          name: 'sec-bundle',
          version: '1.0.0',
          include: ['security.rules'],
        },
        constraints: {
          security: { rules: { 'SEC-CRY-001': 'error' } },
        },
      };
      await fs.writeFile(configPath, JSON.stringify(configWithRules, null, 2));
      await fs.writeFile(bundlePath, JSON.stringify(bundleWithRules, null, 2));

      const result = await runInstallConstraints({
        source: bundlePath,
        configPath,
        lockfilePath,
        forcePackage: true,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const updatedConfig = JSON.parse(await fs.readFile(configPath, 'utf-8'));
      expect(updatedConfig.security.rules['SEC-CRY-001']).toBe('error');
    });
  });

  describe('dry-run mode', () => {
    it('reports what would change without writing files', async () => {
      const configBefore = await fs.readFile(configPath, 'utf-8');

      const result = await runInstallConstraints({
        source: bundlePath,
        configPath,
        lockfilePath,
        dryRun: true,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.dryRun).toBe(true);
      expect(result.value.installed).toBe(false);
      expect(result.value.contributionsCount).toBeGreaterThan(0);

      // Config should be unchanged
      const configAfter = await fs.readFile(configPath, 'utf-8');
      expect(configAfter).toBe(configBefore);

      // Lockfile should not exist
      const lockfileExists = await fs
        .access(lockfilePath)
        .then(() => true)
        .catch(() => false);
      expect(lockfileExists).toBe(false);
    });

    it('reports conflicts in dry-run without requiring resolution flags', async () => {
      const configWithLayer = {
        version: 1,
        name: 'test-project',
        layers: [{ name: 'shared', pattern: 'src/shared/**', allowedDependencies: [] }],
      };
      const conflictBundle = {
        name: 'conflict-bundle',
        version: '1.0.0',
        manifest: {
          name: 'conflict-bundle',
          version: '1.0.0',
          include: ['layers'],
        },
        constraints: {
          layers: [{ name: 'shared', pattern: 'src/shared/**', allowedDependencies: ['core'] }],
        },
      };
      await fs.writeFile(configPath, JSON.stringify(configWithLayer, null, 2));
      await fs.writeFile(bundlePath, JSON.stringify(conflictBundle, null, 2));

      const result = await runInstallConstraints({
        source: bundlePath,
        configPath,
        lockfilePath,
        dryRun: true,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.dryRun).toBe(true);
      expect(result.value.conflicts).toHaveLength(1);
    });
  });

  describe('version compatibility', () => {
    it('rejects bundle requiring a higher harness version', async () => {
      const futureBundle = {
        name: 'future-bundle',
        version: '1.0.0',
        minHarnessVersion: '99.0.0',
        manifest: {
          name: 'future-bundle',
          version: '1.0.0',
          include: ['layers'],
          minHarnessVersion: '99.0.0',
        },
        constraints: {
          layers: [{ name: 'future', pattern: 'src/future/**', allowedDependencies: [] }],
        },
      };
      await fs.writeFile(bundlePath, JSON.stringify(futureBundle, null, 2));

      const result = await runInstallConstraints({
        source: bundlePath,
        configPath,
        lockfilePath,
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toContain('version');
      expect(result.error).toContain('99.0.0');
    });

    it('accepts bundle with no minHarnessVersion', async () => {
      // minimalBundle has no minHarnessVersion -- should work fine
      const result = await runInstallConstraints({
        source: bundlePath,
        configPath,
        lockfilePath,
      });

      expect(result.ok).toBe(true);
    });
  });

  describe('idempotency', () => {
    it('reports already installed when same package+version exists in lockfile', async () => {
      // First install
      const first = await runInstallConstraints({
        source: bundlePath,
        configPath,
        lockfilePath,
      });
      expect(first.ok).toBe(true);

      // Second install -- same bundle
      const second = await runInstallConstraints({
        source: bundlePath,
        configPath,
        lockfilePath,
      });

      expect(second.ok).toBe(true);
      if (!second.ok) return;
      expect(second.value.alreadyInstalled).toBe(true);
      expect(second.value.installed).toBe(false);
    });
  });

  describe('empty bundle', () => {
    it('rejects a bundle with empty constraints', async () => {
      const emptyBundle = {
        name: 'empty-bundle',
        version: '1.0.0',
        manifest: {
          name: 'empty-bundle',
          version: '1.0.0',
          include: ['layers'],
        },
        constraints: {},
      };
      await fs.writeFile(bundlePath, JSON.stringify(emptyBundle, null, 2));

      const result = await runInstallConstraints({
        source: bundlePath,
        configPath,
        lockfilePath,
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toContain('no constraints');
    });
  });

  describe('lockfile management', () => {
    it('creates lockfile with version:1 when no lockfile exists', async () => {
      // Ensure no lockfile exists
      await fs.rm(lockfilePath, { force: true });

      const result = await runInstallConstraints({
        source: bundlePath,
        configPath,
        lockfilePath,
      });

      expect(result.ok).toBe(true);

      const lockfile = JSON.parse(await fs.readFile(lockfilePath, 'utf-8'));
      expect(lockfile.version).toBe(1);
      expect(lockfile.packages['test-bundle']).toBeDefined();
      expect(lockfile.packages['test-bundle'].contributions).toBeDefined();
    });

    it('preserves existing lockfile entries when adding new package', async () => {
      // Pre-populate lockfile with an existing entry
      const existingLockfile = {
        version: 1,
        packages: {
          'other-bundle': {
            version: '2.0.0',
            source: '/some/path.json',
            installedAt: '2026-01-01T00:00:00Z',
            contributions: { layers: ['other'] },
          },
        },
      };
      await fs.writeFile(lockfilePath, JSON.stringify(existingLockfile, null, 2));

      const result = await runInstallConstraints({
        source: bundlePath,
        configPath,
        lockfilePath,
      });

      expect(result.ok).toBe(true);

      const lockfile = JSON.parse(await fs.readFile(lockfilePath, 'utf-8'));
      expect(lockfile.packages['other-bundle']).toBeDefined();
      expect(lockfile.packages['other-bundle'].version).toBe('2.0.0');
      expect(lockfile.packages['test-bundle']).toBeDefined();
    });
  });

  describe('upgrade detection', () => {
    it('upgrades when same package name is installed at different version', async () => {
      // First install v1
      const v1Bundle = {
        name: 'upgrade-bundle',
        version: '1.0.0',
        manifest: { name: 'upgrade-bundle', version: '1.0.0', include: ['layers'] },
        constraints: {
          layers: [{ name: 'old-layer', pattern: 'src/old/**', allowedDependencies: [] }],
        },
      };
      const v1Path = path.join(tmpDir, 'v1-bundle.json');
      await fs.writeFile(v1Path, JSON.stringify(v1Bundle, null, 2));

      const firstResult = await runInstallConstraints({
        source: v1Path,
        configPath,
        lockfilePath,
      });
      expect(firstResult.ok).toBe(true);

      // Verify v1 was installed
      let config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
      expect(config.layers).toContainEqual(expect.objectContaining({ name: 'old-layer' }));

      // Now install v2 with different layers
      const v2Bundle = {
        name: 'upgrade-bundle',
        version: '2.0.0',
        manifest: { name: 'upgrade-bundle', version: '2.0.0', include: ['layers'] },
        constraints: {
          layers: [{ name: 'new-layer', pattern: 'src/new/**', allowedDependencies: [] }],
        },
      };
      const v2Path = path.join(tmpDir, 'v2-bundle.json');
      await fs.writeFile(v2Path, JSON.stringify(v2Bundle, null, 2));

      const upgradeResult = await runInstallConstraints({
        source: v2Path,
        configPath,
        lockfilePath,
      });

      expect(upgradeResult.ok).toBe(true);
      if (!upgradeResult.ok) return;
      expect(upgradeResult.value.installed).toBe(true);
      expect(upgradeResult.value.version).toBe('2.0.0');

      // Verify: old-layer removed, new-layer present
      config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
      const layerNames = (config.layers as Array<{ name: string }>).map((l) => l.name);
      expect(layerNames).not.toContain('old-layer');
      expect(layerNames).toContain('new-layer');

      // Verify lockfile updated to v2
      const lockfile = JSON.parse(await fs.readFile(lockfilePath, 'utf-8'));
      expect(lockfile.packages['upgrade-bundle'].version).toBe('2.0.0');
    });

    it('upgrade removes old security rules and adds new ones', async () => {
      // Install v1 with security rules
      const v1Bundle = {
        name: 'sec-upgrade',
        version: '1.0.0',
        manifest: { name: 'sec-upgrade', version: '1.0.0', include: ['security.rules'] },
        constraints: {
          security: { rules: { 'SEC-OLD-001': 'error' } },
        },
      };
      const v1Path = path.join(tmpDir, 'sec-v1.json');
      await fs.writeFile(v1Path, JSON.stringify(v1Bundle, null, 2));
      await runInstallConstraints({ source: v1Path, configPath, lockfilePath });

      // Install v2 with different security rules
      const v2Bundle = {
        name: 'sec-upgrade',
        version: '2.0.0',
        manifest: { name: 'sec-upgrade', version: '2.0.0', include: ['security.rules'] },
        constraints: {
          security: { rules: { 'SEC-NEW-001': 'warning' } },
        },
      };
      const v2Path = path.join(tmpDir, 'sec-v2.json');
      await fs.writeFile(v2Path, JSON.stringify(v2Bundle, null, 2));
      const result = await runInstallConstraints({ source: v2Path, configPath, lockfilePath });

      expect(result.ok).toBe(true);

      const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
      expect(config.security?.rules?.['SEC-OLD-001']).toBeUndefined();
      expect(config.security?.rules?.['SEC-NEW-001']).toBe('warning');
    });
  });
});
