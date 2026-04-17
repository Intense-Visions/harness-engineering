// packages/cli/tests/commands/audit-protected.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGlobResult: string[] = [];
const mockFileContents: Record<string, string> = {};

vi.mock('glob', () => ({
  glob: vi.fn().mockImplementation(async () => mockGlobResult),
}));

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    readFileSync: vi.fn().mockImplementation((filePath: string) => {
      // Resolve the file path to just the relative part for lookup
      for (const [key, content] of Object.entries(mockFileContents)) {
        if ((filePath as string).endsWith(key)) {
          return content;
        }
      }
      throw new Error(`ENOENT: ${filePath}`);
    }),
    existsSync: actual.existsSync,
  };
});

vi.mock('../../src/config/loader', () => ({
  resolveConfig: vi.fn().mockReturnValue({
    ok: true,
    value: {
      version: 1,
      rootDir: '.',
      docsDir: './docs',
      entropy: { excludePatterns: ['**/node_modules/**'] },
    },
  }),
}));

import { createAuditProtectedCommand, runAuditProtected } from '../../src/commands/audit-protected';
import { resolveConfig } from '../../src/config/loader';

describe('audit-protected command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGlobResult.length = 0;
    for (const key of Object.keys(mockFileContents)) {
      delete mockFileContents[key];
    }
  });

  describe('runAuditProtected', () => {
    it('returns regions found in scanned files', async () => {
      mockGlobResult.push('src/compliance.ts');
      mockFileContents['src/compliance.ts'] = [
        '// harness-ignore-start entropy: SOX audit',
        'export function audit() {}',
        '// harness-ignore-end',
      ].join('\n');

      const result = await runAuditProtected({ cwd: '/tmp/test' });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.regions).toHaveLength(1);
      expect(result.value.regions[0].file).toBe('src/compliance.ts');
      expect(result.value.regions[0].scopes).toEqual(['entropy']);
      expect(result.value.regions[0].reason).toBe('SOX audit');
      expect(result.value.issues).toHaveLength(0);
    });

    it('returns validation issues for malformed annotations', async () => {
      mockGlobResult.push('src/bad.ts');
      mockFileContents['src/bad.ts'] = [
        '// harness-ignore-start entropy: never closed',
        'function orphan() {}',
      ].join('\n');

      const result = await runAuditProtected({ cwd: '/tmp/test' });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.regions).toHaveLength(1);
      expect(result.value.issues).toHaveLength(1);
      expect(result.value.issues[0].type).toBe('unclosed-block');
    });

    it('returns empty results when no files contain annotations', async () => {
      mockGlobResult.push('src/clean.ts');
      mockFileContents['src/clean.ts'] = 'const a = 1;\n';

      const result = await runAuditProtected({ cwd: '/tmp/test' });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.regions).toHaveLength(0);
      expect(result.value.issues).toHaveLength(0);
    });

    it('returns error when config loading fails', async () => {
      vi.mocked(resolveConfig).mockReturnValueOnce({
        ok: false,
        error: { message: 'Config not found', exitCode: 2 },
      } as never);

      const result = await runAuditProtected({ cwd: '/tmp/test' });
      expect(result.ok).toBe(false);
    });

    it('scans multiple files and aggregates results', async () => {
      mockGlobResult.push('src/a.ts', 'src/b.ts');
      mockFileContents['src/a.ts'] = [
        '// harness-ignore entropy: reason A',
        'export const a = 1;',
      ].join('\n');
      mockFileContents['src/b.ts'] = [
        '// harness-ignore-start architecture: reason B',
        'import { x } from "y";',
        '// harness-ignore-end',
      ].join('\n');

      const result = await runAuditProtected({ cwd: '/tmp/test' });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.regions).toHaveLength(2);
      expect(result.value.fileCount).toBe(2);
    });
  });

  describe('createAuditProtectedCommand', () => {
    it('creates command with correct name', () => {
      const cmd = createAuditProtectedCommand();
      expect(cmd.name()).toBe('audit-protected');
    });

    it('has correct description', () => {
      const cmd = createAuditProtectedCommand();
      expect(cmd.description()).toContain('protected');
    });
  });
});
