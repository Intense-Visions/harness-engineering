import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  saveLastBatch,
  loadLastBatch,
  hashContent,
  LAST_BATCH_PATH,
} from '../../../src/align/revert/state';
import type { FixOutcome } from '../../../src/align/findings/outcome';
import type { DriftFinding } from '../../../src/drift/findings/finding';

function finding(file: string, line: number): DriftFinding {
  return {
    code: 'DRIFT-T001',
    severity: 'error',
    file,
    line,
    message: 'Hardcoded color "#ff0000" is not in the design token palette',
    evidence: { snippet: 'color: "#ff0000"' },
    rule: { id: 'DRIFT-T001', category: 'token-bypass' },
    fix: { kind: 'codemod-todo', description: '' },
  };
}

function applied(file: string, line: number, before: string, after: string): FixOutcome {
  return {
    kind: 'applied',
    finding: finding(file, line),
    diff: { file, line, before, after },
  };
}

describe('align revert state', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'align-revert-state-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('round-trips applied outcomes through save + load', () => {
    const file = path.join(tmpDir, 'a.ts');
    const postContent = 'const x = tokens.color.brand.primary;\n';
    fs.writeFileSync(file, postContent);

    const outcomes: FixOutcome[] = [
      applied(file, 1, 'const x = "#ff0000";', 'const x = tokens.color.brand.primary;'),
    ];
    saveLastBatch(tmpDir, outcomes, 'standalone', (f) => fs.readFileSync(f, 'utf-8'));

    const loaded = loadLastBatch(tmpDir);
    expect(loaded).not.toBeNull();
    if (loaded === null) return;
    expect(loaded.version).toBe(1);
    expect(loaded.mode).toBe('standalone');
    expect(loaded.entries).toHaveLength(1);
    expect(loaded.entries[0]!.postApplySha256).toBe(hashContent(postContent));
  });

  it('skips non-applied outcomes when saving', () => {
    const outcomes: FixOutcome[] = [
      {
        kind: 'suggestion',
        finding: finding('x.ts', 1),
        suggestion: { description: '', preview: '' },
      },
      { kind: 'skipped-unsafe', finding: finding('y.ts', 1), reason: 'irrelevant' },
      { kind: 'failed', finding: finding('z.ts', 1), error: 'oops' },
    ];
    saveLastBatch(tmpDir, outcomes, 'standalone', () => '');
    expect(fs.existsSync(path.join(tmpDir, LAST_BATCH_PATH))).toBe(false);
  });

  it('does not write last-batch.json when no applied outcomes exist', () => {
    saveLastBatch(tmpDir, [], 'standalone', () => '');
    expect(fs.existsSync(path.join(tmpDir, LAST_BATCH_PATH))).toBe(false);
  });

  it('hashes each file at most once across multiple entries', () => {
    const file = path.join(tmpDir, 'multi.ts');
    fs.writeFileSync(file, 'A\nB\nC\n');
    let reads = 0;
    saveLastBatch(
      tmpDir,
      [applied(file, 1, 'a', 'A'), applied(file, 2, 'b', 'B'), applied(file, 3, 'c', 'C')],
      'standalone',
      (f) => {
        reads++;
        return fs.readFileSync(f, 'utf-8');
      }
    );
    expect(reads).toBe(1);

    const loaded = loadLastBatch(tmpDir);
    expect(loaded?.entries).toHaveLength(3);
    expect(new Set(loaded?.entries.map((e) => e.postApplySha256))).toHaveProperty('size', 1);
  });

  it('returns null when no batch file exists', () => {
    expect(loadLastBatch(tmpDir)).toBeNull();
  });

  it('returns null when batch file is malformed', () => {
    const full = path.join(tmpDir, LAST_BATCH_PATH);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, '{not valid json');
    expect(loadLastBatch(tmpDir)).toBeNull();
  });

  it('returns null when the batch version is unsupported', () => {
    const full = path.join(tmpDir, LAST_BATCH_PATH);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, JSON.stringify({ version: 99, entries: [] }));
    expect(loadLastBatch(tmpDir)).toBeNull();
  });

  it('overwrites a prior batch on a fresh save (single-shot history)', () => {
    const file = path.join(tmpDir, 'a.ts');
    fs.writeFileSync(file, 'one\n');
    saveLastBatch(tmpDir, [applied(file, 1, 'old', 'one')], 'standalone', (f) =>
      fs.readFileSync(f, 'utf-8')
    );
    const first = loadLastBatch(tmpDir);

    fs.writeFileSync(file, 'two\n');
    saveLastBatch(tmpDir, [applied(file, 1, 'old', 'two')], 'pipeline', (f) =>
      fs.readFileSync(f, 'utf-8')
    );
    const second = loadLastBatch(tmpDir);

    expect(first?.entries[0]!.postApplySha256).not.toBe(second?.entries[0]!.postApplySha256);
    expect(second?.mode).toBe('pipeline');
  });
});
