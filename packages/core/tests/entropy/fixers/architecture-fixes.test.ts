import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createForbiddenImportFixes } from '../../../src/entropy/fixers/architecture-fixes';
import { applyFixes } from '../../../src/entropy/fixers/safe-fixes';
import type { Fix } from '../../../src/entropy/types';
import * as fs from 'fs';
import { promisify } from 'util';
import * as path from 'path';
import * as os from 'os';

const writeFile = promisify(fs.writeFile);
const readFile = promisify(fs.readFile);
const mkdir = promisify(fs.mkdir);
const rm = promisify(fs.rm);

describe('forbidden import replacement fixes', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `arch-fixes-test-${Date.now()}`);
    await mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('should create fix when alternative is configured', () => {
    const violations = [
      {
        file: '/project/packages/core/src/service.ts',
        line: 3,
        forbiddenImport: 'node:fs',
        alternative: './utils/fs',
      },
    ];

    const fixes = createForbiddenImportFixes(violations);
    expect(fixes.length).toBe(1);
    expect(fixes[0].type).toBe('forbidden-import-replacement');
    expect(fixes[0].action).toBe('replace');
    expect(fixes[0].oldContent).toContain('node:fs');
    expect(fixes[0].newContent).toContain('./utils/fs');
  });

  it('should not create fix when no alternative is configured', () => {
    const violations = [
      {
        file: '/project/packages/core/src/service.ts',
        line: 3,
        forbiddenImport: '../mcp-server',
        alternative: undefined,
      },
    ];

    const fixes = createForbiddenImportFixes(violations);
    expect(fixes.length).toBe(0);
  });

  it('should replace forbidden import path in file', async () => {
    const testFile = path.join(tempDir, 'service.ts');
    await writeFile(
      testFile,
      "import { readFile } from 'node:fs';\nimport { join } from 'path';\n\nconst data = readFile('test');\n"
    );

    const fixes: Fix[] = [
      {
        type: 'forbidden-import-replacement',
        file: testFile,
        description: "Replace forbidden import 'node:fs' with './utils/fs'",
        action: 'replace',
        oldContent: "from 'node:fs'",
        newContent: "from './utils/fs'",
        safe: true,
        reversible: true,
      },
    ];

    const result = await applyFixes(fixes, {
      dryRun: false,
      fixTypes: ['forbidden-import-replacement'],
      createBackup: false,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.applied.length).toBe(1);
      const content = await readFile(testFile, 'utf-8');
      expect(content).toContain("from './utils/fs'");
      expect(content).not.toContain("from 'node:fs'");
    }
  });
});
