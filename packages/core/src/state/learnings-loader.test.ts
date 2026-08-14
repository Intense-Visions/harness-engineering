import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  loadRelevantLearnings,
  clearLearningsCache,
  invalidateLearningsCacheEntry,
} from './learnings-loader';

/**
 * Unit coverage for the learnings loader (`loadRelevantLearnings`) plus its
 * mtime-based cache helpers. Runs against a real temp project using the legacy
 * `.harness/` state directory (no streams index present, so `getStateDir`
 * falls back to it).
 *
 * Behaviour pinned here:
 *  - missing learnings file yields an empty list (not an error);
 *  - dated bullets and dated headings each start a new entry block, with
 *    continuation lines folded into the current block;
 *  - the title line and `<!-- hash: -->` frontmatter are skipped;
 *  - a `skillName` filter keeps only entries tagged `[skill:<name>]`;
 *  - the cache is keyed on mtime and cleared by the exported helpers.
 */

let projectPath: string;
let learningsPath: string;

beforeEach(() => {
  clearLearningsCache();
  projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'learnings-'));
  const stateDir = path.join(projectPath, '.harness');
  fs.mkdirSync(stateDir, { recursive: true });
  learningsPath = path.join(stateDir, 'learnings.md');
});

afterEach(() => {
  clearLearningsCache();
  fs.rmSync(projectPath, { recursive: true, force: true });
});

function writeLearnings(content: string): void {
  fs.writeFileSync(learningsPath, content);
}

describe('loadRelevantLearnings — parsing', () => {
  it('returns an empty list when no learnings file exists', async () => {
    const res = await loadRelevantLearnings(projectPath);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value).toEqual([]);
  });

  it('splits dated bullets into separate entries', async () => {
    writeLearnings(
      ['# Learnings', '- **2026-08-01** first thing', '- **2026-08-02** second thing', ''].join(
        '\n'
      )
    );
    const res = await loadRelevantLearnings(projectPath);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value).toEqual(['- **2026-08-01** first thing', '- **2026-08-02** second thing']);
  });

  it('folds continuation lines into the current entry block', async () => {
    writeLearnings(
      ['- **2026-08-01** headline', '  detail line one', '  detail line two', ''].join('\n')
    );
    const res = await loadRelevantLearnings(projectPath);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value).toEqual(['- **2026-08-01** headline\n  detail line one\n  detail line two']);
  });

  it('starts a new block on a dated heading and skips title/frontmatter lines', async () => {
    writeLearnings(
      [
        '# Title',
        '<!-- hash:abc123 -->',
        '## 2026-08-01 session',
        'body of first',
        '## 2026-08-02 session',
        'body of second',
      ].join('\n')
    );
    const res = await loadRelevantLearnings(projectPath);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value).toEqual([
      '## 2026-08-01 session\nbody of first',
      '## 2026-08-02 session\nbody of second',
    ]);
  });

  it('filters entries by [skill:<name>] tag when skillName is provided', async () => {
    writeLearnings(
      [
        '- **2026-08-01** [skill:tdd] wrote a test',
        '- **2026-08-02** [skill:review] reviewed code',
        '- **2026-08-03** [skill:tdd] another test',
      ].join('\n')
    );
    const res = await loadRelevantLearnings(projectPath, 'tdd');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value).toEqual([
      '- **2026-08-01** [skill:tdd] wrote a test',
      '- **2026-08-03** [skill:tdd] another test',
    ]);
  });

  it('returns all entries when no skillName is given', async () => {
    writeLearnings(['- **2026-08-01** [skill:tdd] a', '- **2026-08-02** b'].join('\n'));
    const res = await loadRelevantLearnings(projectPath);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value).toHaveLength(2);
  });
});

describe('loadRelevantLearnings — mtime cache', () => {
  it('serves cached entries while the mtime is unchanged, and re-reads after clear', async () => {
    const fixedMtime = new Date('2026-01-01T00:00:00Z');
    writeLearnings('- **2026-08-01** original');
    fs.utimesSync(learningsPath, fixedMtime, fixedMtime);

    const first = await loadRelevantLearnings(projectPath);
    expect(first.ok && first.value).toEqual(['- **2026-08-01** original']);

    // Rewrite content but pin mtime to the same value → cache must win.
    writeLearnings('- **2026-08-01** changed');
    fs.utimesSync(learningsPath, fixedMtime, fixedMtime);
    const cached = await loadRelevantLearnings(projectPath);
    expect(cached.ok && cached.value).toEqual(['- **2026-08-01** original']);

    // Clearing the cache forces a fresh parse of the new content.
    clearLearningsCache();
    const fresh = await loadRelevantLearnings(projectPath);
    expect(fresh.ok && fresh.value).toEqual(['- **2026-08-01** changed']);
  });

  it('invalidateLearningsCacheEntry evicts a single path', async () => {
    const fixedMtime = new Date('2026-01-01T00:00:00Z');
    writeLearnings('- **2026-08-01** original');
    fs.utimesSync(learningsPath, fixedMtime, fixedMtime);
    await loadRelevantLearnings(projectPath);

    writeLearnings('- **2026-08-01** changed');
    fs.utimesSync(learningsPath, fixedMtime, fixedMtime);
    invalidateLearningsCacheEntry(learningsPath);

    const res = await loadRelevantLearnings(projectPath);
    expect(res.ok && res.value).toEqual(['- **2026-08-01** changed']);
  });
});
