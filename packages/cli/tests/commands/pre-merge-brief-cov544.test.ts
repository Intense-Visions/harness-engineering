import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { Command } from 'commander';
import type { CiReviewResult } from '@harness-engineering/core';

// ── child_process stub (deterministic git + gh) ──────────────────────────────
let ghCommentsJson = '{"comments":[]}';
const execFileSyncMock = vi.fn((cmd: string, args: string[]) => {
  if (cmd === 'git') {
    if (args[0] === 'rev-parse' && args[1] === 'HEAD') return 'headsha123';
    if (args[0] === 'diff') {
      return [
        'diff --git a/src/x.ts b/src/x.ts',
        'index 000..111 100644',
        '--- a/src/x.ts',
        '+++ b/src/x.ts',
        '@@ -1,1 +1,2 @@',
        ' const a = 1;',
        '+const b = 2;',
      ].join('\n');
    }
    return '';
  }
  if (cmd === 'gh') {
    if (args.includes('view')) return ghCommentsJson;
    return '';
  }
  return '';
});
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return {
    ...actual,
    execFileSync: (...a: unknown[]) => execFileSyncMock(...(a as [string, string[]])),
  };
});

const gatherSignals = vi.fn().mockResolvedValue({ signals: [], generatedAt: '2026-01-01' });
vi.mock('@harness-engineering/signals', () => ({
  gatherSignals: (...a: unknown[]) => gatherSignals(...a),
}));

const graphLoad = vi.fn().mockResolvedValue(false);
vi.mock('@harness-engineering/graph', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@harness-engineering/graph')>();
  return {
    ...actual,
    GraphStore: class {
      load = (...a: unknown[]) => graphLoad(...a);
      findNodes = () => [];
    },
    resolveGraphDir: () => '/graph',
  };
});

import {
  BRIEF_MARKER,
  buildBriefBody,
  defaultPostBrief,
  findOutcomeVerdict,
  loadOutcomeStore,
  runPreMergeBrief,
  createPreMergeBriefCommand,
} from '../../src/commands/pre-merge-brief';

let exitCode: number | undefined;
const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
  exitCode = code;
  throw new Error('exit:' + code);
}) as never);

beforeEach(() => {
  vi.clearAllMocks();
  exitCode = undefined;
  ghCommentsJson = '{"comments":[]}';
  gatherSignals.mockResolvedValue({ signals: [], generatedAt: '2026-01-01' });
  graphLoad.mockResolvedValue(false);
});

afterAll(() => {
  stdoutSpy.mockRestore();
  stderrSpy.mockRestore();
  exitSpy.mockRestore();
});

describe('buildBriefBody residual branches (cov544)', () => {
  it('renders a skipped verdict with the default skip reason', () => {
    const verdict = {
      assessment: 'approve',
      runner: 'claude',
      findings: [],
      blockingFindings: [],
      skipped: true,
    } as unknown as CiReviewResult['verdict'];
    const body = buildBriefBody({ review: verdict });
    expect(body).toContain('A review tier was skipped.');
  });

  it('renders a null-valued signal as an em dash', () => {
    const signals = [
      {
        id: 's1',
        label: 'Pending metric',
        value: null,
        unit: undefined,
        status: 'pending',
      },
    ] as never;
    const body = buildBriefBody({ signals });
    expect(body).toContain('Pending metric');
    expect(body).toContain('—');
  });

  it('handles a NOT_SATISFIED outcome whose unmetCriteria is undefined', () => {
    const body = buildBriefBody({
      outcome: {
        verdict: 'NOT_SATISFIED',
        confidence: 'high',
        rationale: 'r',
        judgedAgainst: 'success-criteria',
        authority: 'advisory',
      } as never,
    });
    expect(body).toContain('NOT_SATISFIED');
    // No unmet bullets, but the section renders "nothing flagged".
    expect(body.slice(body.indexOf('👀'))).toMatch(/nothing flagged/i);
  });
});

describe('defaultPostBrief (cov544)', () => {
  it('posts a new sticky comment when none is marked', () => {
    ghCommentsJson = '{"comments":[{"id":1,"body":"unrelated"}]}';
    defaultPostBrief('body-text');
    const commentCall = execFileSyncMock.mock.calls.find(
      (c) => c[0] === 'gh' && (c[1] as string[]).includes('comment')
    );
    expect(commentCall).toBeDefined();
  });

  it('PATCHes the existing sticky comment when one carries the marker', () => {
    ghCommentsJson = JSON.stringify({ comments: [{ id: 42, body: `${BRIEF_MARKER}\nold` }] });
    defaultPostBrief('new-body');
    const patchCall = execFileSyncMock.mock.calls.find(
      (c) => c[0] === 'gh' && (c[1] as string[]).includes('PATCH')
    );
    expect(patchCall).toBeDefined();
    expect((patchCall![1] as string[]).join(' ')).toContain('42');
  });

  it('drops malformed comment records (missing id/body)', () => {
    ghCommentsJson = JSON.stringify({ comments: [{ id: 'x' }, { body: 5 }, {}] });
    defaultPostBrief('body');
    // Falls through to a fresh post since nothing is a valid marked comment.
    const commentCall = execFileSyncMock.mock.calls.find(
      (c) => c[0] === 'gh' && (c[1] as string[]).includes('comment')
    );
    expect(commentCall).toBeDefined();
  });
});

describe('findOutcomeVerdict defensive mapping (cov544)', () => {
  it('fills defaults for a sparse metadata node matched by headSha', () => {
    const store = {
      findNodes: () => [{ metadata: { headSha: 'abc', verdict: 'SATISFIED' } }],
    };
    const out = findOutcomeVerdict(store, 'abc');
    expect(out?.verdict).toBe('SATISFIED');
    expect(out?.confidence).toBe('low');
    expect(out?.rationale).toBe('');
    expect(out?.judgedAgainst).toBe('success-criteria');
    expect(out?.unmetCriteria).toEqual([]);
    expect(out?.authority).toBe('advisory');
  });

  it('returns undefined (catches) when findNodes throws', () => {
    const store = {
      findNodes: () => {
        throw new Error('graph broke');
      },
    };
    expect(findOutcomeVerdict(store, 'abc')).toBeUndefined();
  });
});

describe('loadOutcomeStore (cov544)', () => {
  it('returns undefined when the store fails to load', async () => {
    graphLoad.mockResolvedValue(false);
    expect(await loadOutcomeStore('/proj')).toBeUndefined();
  });

  it('returns the store when load succeeds', async () => {
    graphLoad.mockResolvedValue(true);
    expect(await loadOutcomeStore('/proj')).toBeDefined();
  });
});

describe('runPreMergeBrief with default seams (cov544)', () => {
  it('uses default cwd/runGit/resolveRaw/log and prints the brief', async () => {
    const res = await runPreMergeBrief({ gather: gatherSignals, comment: false });
    expect(res.body).toContain(BRIEF_MARKER);
    // default log writes to stdout
    expect(stdoutSpy).toHaveBeenCalled();
    // default resolveRaw ran a real (stubbed) git diff → diff summary populated
    expect(res.body).toContain('Files changed:');
  });

  it('comment path with the default poster degrades gracefully when gh errors', async () => {
    const warns: string[] = [];
    const logs: string[] = [];
    // gh 'view' returns comments, but force the poster to blow up on the post call.
    execFileSyncMock.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === 'git') return args[0] === 'rev-parse' ? 'sha' : '';
      if (cmd === 'gh' && args.includes('view')) return '{"comments":[]}';
      if (cmd === 'gh') throw new Error('no PR for branch');
      return '';
    });
    const res = await runPreMergeBrief({
      gather: gatherSignals,
      comment: true,
      warn: (m) => warns.push(m),
      log: (m) => logs.push(m),
    });
    expect(res.body).toContain(BRIEF_MARKER);
    expect(warns.join('\n')).toMatch(/could not post/i);
    expect(logs.join('\n')).toContain(BRIEF_MARKER);
  });
});

describe('createPreMergeBriefCommand action (cov544)', () => {
  function run(args: string[]): Promise<unknown> {
    const parent = new Command();
    parent.addCommand(createPreMergeBriefCommand());
    parent.exitOverride();
    return parent.parseAsync(['pre-merge-brief', ...args], { from: 'user' });
  }

  it('default head resolution runs git rev-parse and exits 0', async () => {
    await expect(run([])).rejects.toThrow('exit:0');
    expect(exitCode).toBe(0);
    const revParse = execFileSyncMock.mock.calls.find(
      (c) => c[0] === 'git' && (c[1] as string[]).join(' ') === 'rev-parse HEAD'
    );
    expect(revParse).toBeDefined();
  });

  it('explicit --head skips the git rev-parse fallback', async () => {
    await expect(run(['--head', 'deadbeef'])).rejects.toThrow('exit:0');
    const revParse = execFileSyncMock.mock.calls.find(
      (c) => c[0] === 'git' && (c[1] as string[]).join(' ') === 'rev-parse HEAD'
    );
    expect(revParse).toBeUndefined();
  });
});
