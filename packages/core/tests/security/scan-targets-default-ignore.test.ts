import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { glob } from 'glob';
import { SECURITY_SCAN_DEFAULT_IGNORE, SECURITY_SCAN_GLOB } from '../../src/security/scan-targets';
import { DEFAULT_SECURITY_CONFIG } from '../../src/security/types';
import { parseSecurityConfig } from '../../src/security/config';

/**
 * #2391: the dashboard scanned with a four-entry ignore list while the CLI and
 * CI used the walker skip-list, so the three scanners read different files on
 * the same repo. One default now feeds all of them.
 */
describe('security scan default ignore (#2391)', () => {
  let root: string;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'sec-scan-ignore-'));
    const files = [
      'src/main.rs',
      'src/app.ts',
      'target/debug/build/gen.rs',
      'vendor/dep/lib.rs',
      'build/classes/Gen.java',
      'node_modules/pkg/index.js',
    ];
    for (const f of files) {
      mkdirSync(join(root, f, '..'), { recursive: true });
      writeFileSync(join(root, f), '// x\n');
    }
  });

  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it('skips build and vendor output, and scans source', async () => {
    const scanned = (
      await glob(SECURITY_SCAN_GLOB, {
        cwd: root,
        absolute: true,
        ignore: [...SECURITY_SCAN_DEFAULT_IGNORE],
      })
    )
      .map((f) => relative(root, f).split('\\').join('/'))
      .sort();
    expect(scanned).toEqual(['src/app.ts', 'src/main.rs']);
  });

  it('is the same list the config defaults resolve to', () => {
    expect(DEFAULT_SECURITY_CONFIG.exclude).toEqual([...SECURITY_SCAN_DEFAULT_IGNORE]);
    expect(parseSecurityConfig({}).exclude).toEqual([...SECURITY_SCAN_DEFAULT_IGNORE]);
    expect(parseSecurityConfig(undefined).exclude).toEqual([...SECURITY_SCAN_DEFAULT_IGNORE]);
  });
});
