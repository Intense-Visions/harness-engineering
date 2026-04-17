import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  handleCodeOutline,
  handleCodeSearch,
  handleCodeUnfold,
  codeSearchDefinition,
  codeUnfoldDefinition,
} from '../../../src/mcp/tools/code-nav';

describe('code_search definition', () => {
  it('has correct name and required fields', () => {
    expect(codeSearchDefinition.name).toBe('code_search');
    expect(codeSearchDefinition.inputSchema.required).toContain('query');
    expect(codeSearchDefinition.inputSchema.required).toContain('directory');
  });
});

describe('code_unfold definition', () => {
  it('has correct name and required fields', () => {
    expect(codeUnfoldDefinition.name).toBe('code_unfold');
    expect(codeUnfoldDefinition.inputSchema.required).toContain('path');
    expect(codeUnfoldDefinition.inputSchema.properties).toHaveProperty('symbol');
    expect(codeUnfoldDefinition.inputSchema.properties).toHaveProperty('startLine');
    expect(codeUnfoldDefinition.inputSchema.properties).toHaveProperty('endLine');
  });
});

describe('handleCodeOutline error paths', () => {
  it('returns error for filesystem root path', async () => {
    const result = await handleCodeOutline({ path: '/' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Error');
  });

  it('returns error for nonexistent path', async () => {
    const result = await handleCodeOutline({ path: '/nonexistent/path/xyz/abc' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Path not found');
  });
});

describe('handleCodeSearch', () => {
  it('returns error for filesystem root path', async () => {
    const result = await handleCodeSearch({ query: 'test', directory: '/' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Error');
  });

  it('searches symbols in a real directory', async () => {
    const { resolve, join } = await import('path');
    const repoRoot = resolve(__dirname, '..', '..', '..', '..', '..');
    const testDir = join(repoRoot, 'packages', 'core', 'src', 'code-nav');

    const result = await handleCodeSearch({ query: 'getOutline', directory: testDir });
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('Search:');
  });

  it('returns search results with match count', async () => {
    const { resolve, join } = await import('path');
    const repoRoot = resolve(__dirname, '..', '..', '..', '..', '..');
    const testDir = join(repoRoot, 'packages', 'core', 'src', 'code-nav');

    const result = await handleCodeSearch({ query: 'zzz_nonexistent_symbol', directory: testDir });
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('0 matches');
  });
});

describe('handleCodeUnfold', () => {
  it('returns error for filesystem root path', async () => {
    const result = await handleCodeUnfold({ path: '/', symbol: 'test' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Error');
  });

  it('returns error when neither symbol nor line range provided', async () => {
    const result = await handleCodeUnfold({ path: '/tmp/some-file.ts' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Provide either');
  });

  it('extracts a symbol from a real file', async () => {
    const { resolve, join } = await import('path');
    const repoRoot = resolve(__dirname, '..', '..', '..', '..', '..');
    const testFile = join(repoRoot, 'packages', 'core', 'src', 'code-nav', 'types.ts');

    const result = await handleCodeUnfold({ path: testFile, symbol: 'EXTENSION_MAP' });
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('EXTENSION_MAP');
  });

  it('extracts a line range from a real file', async () => {
    const { resolve, join } = await import('path');
    const repoRoot = resolve(__dirname, '..', '..', '..', '..', '..');
    const testFile = join(repoRoot, 'packages', 'core', 'src', 'code-nav', 'types.ts');

    const result = await handleCodeUnfold({ path: testFile, startLine: 1, endLine: 3 });
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain(':1-3');
  });

  it('handles nonexistent symbol gracefully', async () => {
    const { resolve, join } = await import('path');
    const repoRoot = resolve(__dirname, '..', '..', '..', '..', '..');
    const testFile = join(repoRoot, 'packages', 'core', 'src', 'code-nav', 'types.ts');

    const result = await handleCodeUnfold({
      path: testFile,
      symbol: 'zzz_nonexistent_symbol_xyz',
    });
    // May return fallback content or error — either way should have content
    expect(result.content).toHaveLength(1);
    expect(result.content[0].text.length).toBeGreaterThan(0);
  });
});
