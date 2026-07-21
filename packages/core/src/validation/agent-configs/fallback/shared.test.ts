import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  relPath,
  makeFinding,
  readTextSafe,
  safeFileSize,
  extractFrontmatter,
  parseFrontmatterFields,
} from './shared';

// Hermetic: node:fs is fully mocked so readTextSafe / safeFileSize never touch a real
// filesystem. Every call routes through these controllable mocks.
const readFileSyncMock = vi.fn();
const statSyncMock = vi.fn();
vi.mock('node:fs', () => ({
  readFileSync: (...args: unknown[]) => readFileSyncMock(...args),
  statSync: (...args: unknown[]) => statSyncMock(...args),
}));

beforeEach(() => {
  readFileSyncMock.mockReset();
  statSyncMock.mockReset();
});

describe('relPath', () => {
  it('strips the cwd prefix from an absolute path under cwd', () => {
    expect(relPath('/repo', '/repo/src/index.ts')).toBe('src/index.ts');
  });

  it('normalizes backslashes in both cwd and path before comparing', () => {
    expect(relPath('C:\\repo', 'C:\\repo\\src\\index.ts')).toBe('src/index.ts');
  });

  it('returns the normalized absolute path when it is not under cwd', () => {
    expect(relPath('/repo', '/other/place/file.ts')).toBe('/other/place/file.ts');
  });

  it('does not strip a sibling directory that merely shares a name prefix', () => {
    // '/repo-extra/...' is not under '/repo/' because the boundary slash is required.
    expect(relPath('/repo', '/repo-extra/file.ts')).toBe('/repo-extra/file.ts');
  });
});

describe('makeFinding', () => {
  it('builds a finding with only the required fields when optionals are omitted', () => {
    const finding = makeFinding({
      file: 'AGENTS.md',
      ruleId: 'HARNESS-AC-001',
      severity: 'error',
      message: 'boom',
    });
    expect(finding).toEqual({
      file: 'AGENTS.md',
      ruleId: 'HARNESS-AC-001',
      severity: 'error',
      message: 'boom',
    });
    expect(finding).not.toHaveProperty('line');
    expect(finding).not.toHaveProperty('column');
    expect(finding).not.toHaveProperty('suggestion');
  });

  it('includes line, column, and suggestion when provided', () => {
    const finding = makeFinding({
      file: 'AGENTS.md',
      ruleId: 'HARNESS-AC-002',
      severity: 'warning',
      message: 'watch out',
      line: 12,
      column: 3,
      suggestion: 'fix it',
    });
    expect(finding).toEqual({
      file: 'AGENTS.md',
      ruleId: 'HARNESS-AC-002',
      severity: 'warning',
      message: 'watch out',
      line: 12,
      column: 3,
      suggestion: 'fix it',
    });
  });

  it('retains a zero line/column since typeof number is the guard, not truthiness', () => {
    const finding = makeFinding({
      file: 'f',
      ruleId: 'r',
      severity: 'info',
      message: 'm',
      line: 0,
      column: 0,
    });
    expect(finding.line).toBe(0);
    expect(finding.column).toBe(0);
  });

  it('omits an empty-string suggestion because the guard is truthiness', () => {
    const finding = makeFinding({
      file: 'f',
      ruleId: 'r',
      severity: 'info',
      message: 'm',
      suggestion: '',
    });
    expect(finding).not.toHaveProperty('suggestion');
  });
});

describe('readTextSafe', () => {
  it('returns file contents read as utf-8', () => {
    readFileSyncMock.mockReturnValue('hello world');
    expect(readTextSafe('/x/file.md')).toBe('hello world');
    expect(readFileSyncMock).toHaveBeenCalledWith('/x/file.md', 'utf-8');
  });

  it('returns null when the read throws', () => {
    readFileSyncMock.mockImplementation(() => {
      throw new Error('ENOENT');
    });
    expect(readTextSafe('/missing')).toBeNull();
  });
});

describe('safeFileSize', () => {
  it('returns the byte size reported by statSync', () => {
    const expectedSize = 4096;
    statSyncMock.mockReturnValue({ size: expectedSize });
    expect(safeFileSize('/x/file.md')).toBe(expectedSize);
    expect(statSyncMock).toHaveBeenCalledWith('/x/file.md');
  });

  it('returns null when statSync throws', () => {
    statSyncMock.mockImplementation(() => {
      throw new Error('ENOENT');
    });
    expect(safeFileSize('/missing')).toBeNull();
  });
});

describe('extractFrontmatter', () => {
  it('returns the body between fences and the number of lines consumed', () => {
    const content = '---\nname: agent\ndesc: thing\n---\nbody text\nmore';
    // Fences at lines 0 and 3 → body is lines 1..2, and lineCount is closing index + 1.
    expect(extractFrontmatter(content)).toEqual({
      body: 'name: agent\ndesc: thing',
      lineCount: 4,
    });
  });

  it('handles CRLF line endings', () => {
    const content = '---\r\nname: agent\r\n---\r\nbody';
    expect(extractFrontmatter(content)).toEqual({ body: 'name: agent', lineCount: 3 });
  });

  it('returns null when the document does not open with a fence', () => {
    expect(extractFrontmatter('name: agent\n---\n')).toBeNull();
  });

  it('returns null when the opening fence is never closed', () => {
    expect(extractFrontmatter('---\nname: agent\nno closing fence')).toBeNull();
  });

  it('returns an empty body for an immediately-closed fence pair', () => {
    expect(extractFrontmatter('---\n---\nrest')).toEqual({ body: '', lineCount: 2 });
  });
});

describe('parseFrontmatterFields', () => {
  it('parses top-level scalar key/value pairs', () => {
    expect(parseFrontmatterFields('name: agent\ndesc: does things')).toEqual({
      name: 'agent',
      desc: 'does things',
    });
  });

  it('strips matching double and single quotes from values', () => {
    expect(parseFrontmatterFields('a: "quoted"\nb: \'single\'')).toEqual({
      a: 'quoted',
      b: 'single',
    });
  });

  it('skips comment lines and blank lines', () => {
    expect(parseFrontmatterFields('# a comment\n\nname: agent')).toEqual({ name: 'agent' });
  });

  it('ignores lines without a colon and lines whose colon is at position zero', () => {
    expect(parseFrontmatterFields('novalue\n: leadingcolon\nname: agent')).toEqual({
      name: 'agent',
    });
  });

  it('drops list-item values (leading dash) and keys with empty values', () => {
    expect(parseFrontmatterFields('tags: - a\nempty:\nname: agent')).toEqual({ name: 'agent' });
  });

  it('trims surrounding whitespace and honors leading indentation via trimStart', () => {
    expect(parseFrontmatterFields('   name:    agent   ')).toEqual({ name: 'agent' });
  });

  it('leaves mismatched quotes untouched', () => {
    expect(parseFrontmatterFields('a: "unterminated')).toEqual({ a: '"unterminated' });
  });
});
