import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createCommentedCodeFixes, applyFixes } from '../../../src/entropy/fixers/safe-fixes';
import type { Fix } from '../../../src/entropy/types';
import * as fs from 'fs';
import { promisify } from 'util';
import * as path from 'path';
import * as os from 'os';

const writeFile = promisify(fs.writeFile);
const readFile = promisify(fs.readFile);
const mkdir = promisify(fs.mkdir);
const rm = promisify(fs.rm);

interface CommentedCodeBlock {
  file: string;
  startLine: number;
  endLine: number;
  content: string;
}

describe('commented code fixes', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `commented-code-test-${Date.now()}`);
    await mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('should create fix for commented-out code block', () => {
    const blocks: CommentedCodeBlock[] = [
      {
        file: '/project/src/service.ts',
        startLine: 5,
        endLine: 10,
        content: '// function oldHandler() {\n//   return null;\n// }',
      },
    ];

    const fixes = createCommentedCodeFixes(blocks);
    expect(fixes.length).toBe(1);
    expect(fixes[0].type).toBe('commented-code');
    expect(fixes[0].action).toBe('replace');
    expect(fixes[0].safe).toBe(true);
  });

  it('should remove commented block from file', async () => {
    const testFile = path.join(tempDir, 'service.ts');
    await writeFile(
      testFile,
      'const active = 1;\n// function old() {\n//   return null;\n// }\nconst active2 = 2;\n'
    );

    const fixes: Fix[] = [
      {
        type: 'commented-code',
        file: testFile,
        description: 'Remove commented-out code block',
        action: 'replace',
        oldContent: '// function old() {\n//   return null;\n// }\n',
        newContent: '',
        safe: true,
        reversible: true,
      },
    ];

    const result = await applyFixes(fixes, {
      dryRun: false,
      fixTypes: ['commented-code'],
      createBackup: false,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.applied.length).toBe(1);
      const content = await readFile(testFile, 'utf-8');
      expect(content).not.toContain('function old');
      expect(content).toContain('const active = 1');
      expect(content).toContain('const active2 = 2');
    }
  });
});
