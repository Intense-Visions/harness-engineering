import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createOrphanedDepFixes, applyFixes } from '../../../src/entropy/fixers/safe-fixes';
import type { Fix } from '../../../src/entropy/types';
import * as fs from 'fs';
import { promisify } from 'util';
import * as path from 'path';
import * as os from 'os';

const writeFile = promisify(fs.writeFile);
const readFile = promisify(fs.readFile);
const mkdir = promisify(fs.mkdir);
const rm = promisify(fs.rm);

interface OrphanedDep {
  name: string;
  packageJsonPath: string;
  depType: 'dependencies' | 'devDependencies';
}

describe('orphaned dependency fixes', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `orphaned-dep-test-${Date.now()}`);
    await mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('should create fix for orphaned npm dependency', () => {
    const deps: OrphanedDep[] = [
      {
        name: 'moment',
        packageJsonPath: '/project/package.json',
        depType: 'dependencies',
      },
    ];

    const fixes = createOrphanedDepFixes(deps);
    expect(fixes.length).toBe(1);
    expect(fixes[0].type).toBe('orphaned-deps');
    expect(fixes[0].action).toBe('replace');
    expect(fixes[0].file).toBe('/project/package.json');
    expect(fixes[0].safe).toBe(true);
  });

  it('should remove dependency from package.json', async () => {
    const pkgPath = path.join(tempDir, 'package.json');
    const pkgContent = JSON.stringify(
      {
        name: 'test',
        dependencies: { lodash: '^4.0.0', moment: '^2.0.0' },
      },
      null,
      2
    );
    await writeFile(pkgPath, pkgContent);

    const fixes: Fix[] = [
      {
        type: 'orphaned-deps',
        file: pkgPath,
        description: 'Remove orphaned dependency: moment',
        action: 'replace',
        oldContent: pkgContent,
        newContent: JSON.stringify({ name: 'test', dependencies: { lodash: '^4.0.0' } }, null, 2),
        safe: true,
        reversible: true,
      },
    ];

    const result = await applyFixes(fixes, {
      dryRun: false,
      fixTypes: ['orphaned-deps'],
      createBackup: false,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.applied.length).toBe(1);
      const content = JSON.parse(await readFile(pkgPath, 'utf-8'));
      expect(content.dependencies).not.toHaveProperty('moment');
      expect(content.dependencies).toHaveProperty('lodash');
    }
  });
});
