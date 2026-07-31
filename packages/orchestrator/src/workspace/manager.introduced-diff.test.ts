import { describe, it, expect } from 'vitest';
import { WorkspaceManager } from './manager';
import type { WorkspaceConfig } from '@harness-engineering/types';

/**
 * AMR 4c — WorkspaceManager.getIntroducedDiff wires the right git commands
 * (merge-base, then a zero-context working-tree diff) and passes the seed paths
 * through to the parser. The `git` seam is overridden (its documented test hook).
 */

const CANNED_DIFF = [
  'diff --git a/src/app.ts b/src/app.ts',
  '--- a/src/app.ts',
  '+++ b/src/app.ts',
  '@@ -0,0 +1,1 @@',
  '+const r = eval(x);',
  'diff --git a/docs/roadmap.md b/docs/roadmap.md',
  '--- a/docs/roadmap.md',
  '+++ b/docs/roadmap.md',
  '@@ -0,0 +1,1 @@',
  '+seeded prose',
].join('\n');

class StubWM extends WorkspaceManager {
  public readonly calls: string[][] = [];
  protected async git(args: string[], _cwd: string): Promise<string> {
    this.calls.push(args);
    if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return '/repo\n';
    if (args[0] === 'merge-base') return 'basesha123\n';
    if (args[0] === 'diff') return CANNED_DIFF;
    // refExists / rev-parse --verify etc. — non-throwing ⇒ ref resolves.
    return 'ok\n';
  }
}

const RAW_DIFF_TEXT = [
  'diff --git a/src/app.ts b/src/app.ts',
  '@@ -1,2 +1,3 @@',
  ' unchanged context',
  '+const r = eval(x);',
].join('\n');

class RawStubWM extends WorkspaceManager {
  public readonly calls: string[][] = [];
  protected async git(args: string[], _cwd: string): Promise<string> {
    this.calls.push(args);
    if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return '/repo\n';
    if (args[0] === 'merge-base') return 'basesha123\n';
    if (args[0] === 'diff') return RAW_DIFF_TEXT;
    return 'ok\n';
  }
}

const config = (over: Partial<WorkspaceConfig> = {}): WorkspaceConfig =>
  ({ root: '/tmp/ws', baseRef: 'origin/main', ...over }) as WorkspaceConfig;

describe('WorkspaceManager.getIntroducedDiff', () => {
  it('diffs the working tree against merge-base(HEAD, baseRef) and parses added lines', async () => {
    const wm = new StubWM(config());
    const hunks = await wm.getIntroducedDiff('ISS-1');

    // Uses merge-base, not the raw base ref (robust to a moving base branch).
    expect(
      wm.calls.some((c) => c[0] === 'merge-base' && c.includes('HEAD') && c.includes('origin/main'))
    ).toBe(true);
    // Zero-context working-tree diff against the merge-base sha.
    const diffCall = wm.calls.find((c) => c[0] === 'diff');
    expect(diffCall).toEqual(['diff', '--unified=0', 'basesha123', '--', '.']);

    // Parsed the agent's added line; the default-seeded roadmap.md is excluded.
    expect(hunks).toEqual([
      { file: 'src/app.ts', addedContent: 'const r = eval(x);', startLine: 1 },
    ]);
  });

  it('honors a custom seedPaths exclusion', async () => {
    const wm = new StubWM(config({ seedPaths: ['src'] })); // exclude everything under src/
    const hunks = await wm.getIntroducedDiff('ISS-1');
    // src/app.ts now excluded; roadmap.md is no longer a seed ⇒ it comes through.
    expect(hunks.map((h) => h.file)).toEqual(['docs/roadmap.md']);
  });

  it('marks untracked files intent-to-add BEFORE the diff (so NEW files are captured)', async () => {
    const wm = new StubWM(config());
    await wm.getIntroducedDiff('ISS-1');
    const addIdx = wm.calls.findIndex((c) => c[0] === 'add' && c.includes('--intent-to-add'));
    const diffIdx = wm.calls.findIndex((c) => c[0] === 'diff');
    // git diff omits untracked files; `add --intent-to-add` (run first) makes a
    // brand-new file show up as an addition instead of being silently invisible.
    expect(addIdx).toBeGreaterThanOrEqual(0);
    expect(addIdx).toBeLessThan(diffIdx);
  });
});

describe('WorkspaceManager.getIntroducedDiffText (4c v2 — raw diff for the eval)', () => {
  it('returns the RAW unified diff (with context) vs merge-base, seed paths excluded via pathspec', async () => {
    const wm = new RawStubWM(config()); // DEFAULT_SEED_PATHS = .harness/proposals, docs/roadmap.md
    const text = await wm.getIntroducedDiffText('ISS-1');

    // Merge-base relative (robust to a moving base branch).
    expect(
      wm.calls.some((c) => c[0] === 'merge-base' && c.includes('HEAD') && c.includes('origin/main'))
    ).toBe(true);
    // Full-context diff (NOT --unified=0) with git `:(exclude)` pathspecs for the
    // seeded handoff overlay, so the judge never reads pre-seeded content.
    const diffCall = wm.calls.find((c) => c[0] === 'diff');
    expect(diffCall).toEqual([
      'diff',
      'basesha123',
      '--',
      '.',
      ':(exclude).harness/proposals',
      ':(exclude)docs/roadmap.md',
      // Process artifacts (design proposal/plan, roadmap shards, pnpm store) are
      // excluded so they don't bury/confuse the spec-vs-diff judge.
      ':(exclude)docs/changes',
      ':(exclude)docs/roadmap.d',
      ':(exclude).pnpm-store',
    ]);
    // Raw text is returned verbatim (unparsed) — context + removed lines preserved.
    expect(text).toBe(RAW_DIFF_TEXT);
    expect(text).toContain(' unchanged context'); // context line survives (no --unified=0)
  });

  it('relativizes an absolute seed path against the repo root before excluding it', async () => {
    // repoRoot is '/repo' (rev-parse --show-toplevel stub). An absolute in-repo
    // seed must become a repo-relative pathspec so `:(exclude)` actually matches.
    const wm = new RawStubWM(config({ seedPaths: ['/repo/docs/roadmap.md'] }));
    await wm.getIntroducedDiffText('ISS-1');
    const diffCall = wm.calls.find((c) => c[0] === 'diff');
    expect(diffCall).toEqual([
      'diff',
      'basesha123',
      '--',
      '.',
      ':(exclude)docs/roadmap.md',
      ':(exclude)docs/changes',
      ':(exclude)docs/roadmap.d',
      ':(exclude).pnpm-store',
    ]);
  });

  it('marks untracked files intent-to-add BEFORE the diff, so a NEW file the agent created is in the judged diff', async () => {
    const wm = new RawStubWM(config());
    await wm.getIntroducedDiffText('ISS-1');
    const addIdx = wm.calls.findIndex((c) => c[0] === 'add' && c.includes('--intent-to-add'));
    const diffIdx = wm.calls.findIndex((c) => c[0] === 'diff');
    // Without this, a brand-new rule module (untracked) is invisible to the
    // spec-vs-diff judge, which then wrongly reports the work as missing.
    expect(addIdx).toBeGreaterThanOrEqual(0);
    expect(addIdx).toBeLessThan(diffIdx);
  });
});
