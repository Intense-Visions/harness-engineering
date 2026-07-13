import { describe, it, expect } from 'vitest';
import { WorkspaceManager } from './manager';
import type { WorkspaceConfig } from '@harness-engineering/types';

/**
 * AMR 4c — WorkspaceManager.getIntroducedDiff wires the right git commands
 * (merge-base, then a zero-context working-tree diff) and passes the seed paths
 * through to the parser. The `git` seam is overridden (its documented test hook).
 */

const CANNED_DIFF = [
  '+++ b/src/app.ts',
  '@@ -0,0 +1,1 @@',
  '+const r = eval(x);',
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
});
