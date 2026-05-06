import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crossReferenceUndocumentedFixes } from './cross-reference';
import type { ScannedCommit } from './git-scan';

describe('crossReferenceUndocumentedFixes', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'crossref-'));
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  function seedSolution(track: string, category: string, slug: string, title: string) {
    const dir = join(tmp, 'docs', 'solutions', track, category);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, `${slug}.md`),
      `---\nmodule: x\ntags: []\nproblem_type: x\nlast_updated: '2026-05-05'\ntrack: ${track}\ncategory: ${category}\n---\n\n# ${title}\n`
    );
  }

  it('returns commits whose keywords do not match any documented title', async () => {
    seedSolution('bug-track', 'integration-issues', 'stalled-lease', 'Stalled lease cleanup');
    const commits: ScannedCommit[] = [
      {
        sha: 'a',
        subject: 'fix: stalled lease cleanup edge case',
        filesChanged: 1,
        branchIterations: 0,
      },
      {
        sha: 'b',
        subject: 'fix(parser): handle null token',
        filesChanged: 1,
        branchIterations: 0,
      },
    ];
    const result = await crossReferenceUndocumentedFixes(commits, join(tmp, 'docs', 'solutions'));
    expect(result.map((c) => c.sha)).toEqual(['b']);
  });

  it('returns all commits when solutions dir is missing', async () => {
    const commits: ScannedCommit[] = [
      { sha: 'a', subject: 'fix: anything', filesChanged: 1, branchIterations: 0 },
    ];
    const result = await crossReferenceUndocumentedFixes(commits, join(tmp, 'nope'));
    expect(result).toEqual(commits);
  });
});
