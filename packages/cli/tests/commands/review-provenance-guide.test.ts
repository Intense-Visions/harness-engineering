// The two example stamps in docs/guides/review-provenance.md are real output of
// `harness review-provenance render`. This test rebuilds the two fixture sessions they were
// rendered from (a real repository, fixed identities and dates, so the shas are the same on every
// run) and compares the command's output with the text pasted in the guide.

import { describe, it, expect, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runReviewProvenanceRender } from '../../src/commands/review-provenance';

const GUIDE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../docs/guides/review-provenance.md'
);
const MARKER = '<!-- harness:review-provenance -->';
const CORE = ['compliance', 'bug', 'security', 'architecture'];
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'provenance-guide-'));
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

/** The stamps pasted in the guide, in order: every `text` block that opens with the marker. */
function pastedStamps(): string[] {
  const guide = fs.readFileSync(GUIDE, 'utf-8');
  return [...guide.matchAll(/```text\n([\s\S]*?)\n```/g)]
    .map((m) => m[1] ?? '')
    .filter((block) => block.startsWith(MARKER));
}

function repo(name: string) {
  const dir = path.join(root, name);
  fs.mkdirSync(dir, { recursive: true });
  let clock = 0;
  const git = (...args: string[]) => {
    const date = `2026-11-01T00:00:${String(clock).padStart(2, '0')}Z`;
    return execFileSync(
      'git',
      ['-c', 'core.autocrlf=false', '-c', 'commit.gpgsign=false', ...args],
      {
        cwd: dir,
        encoding: 'utf8',
        env: {
          ...process.env,
          GIT_AUTHOR_NAME: 'Fixture',
          GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
          GIT_COMMITTER_NAME: 'Fixture',
          GIT_COMMITTER_EMAIL: 'fixture@example.invalid',
          GIT_AUTHOR_DATE: date,
          GIT_COMMITTER_DATE: date,
          GIT_CONFIG_GLOBAL: '/dev/null',
          GIT_CONFIG_SYSTEM: '/dev/null',
        },
      }
    ).trim();
  };
  git('init', '-q', '-b', 'feature');
  const commit = (message: string, files: string[]) => {
    for (const f of files) {
      fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
      fs.writeFileSync(path.join(dir, f), `// ${f}: ${message}\n`);
      git('add', f);
    }
    clock += 1;
    git('commit', '-q', '-m', message);
    return git('rev-parse', 'HEAD');
  };
  return { dir, git, commit };
}

interface ReviewOf {
  tier: 'light' | 'full';
  base: string;
  head: string;
  files: string[];
  findings?: Record<string, unknown[]>;
  receipt?: Record<string, unknown>;
  notRun?: string[];
}
function review(sessionDir: string, label: string, r: ReviewOf) {
  const dir = path.join(sessionDir, 'reviews', label);
  fs.mkdirSync(dir, { recursive: true });
  const notRun = r.notRun ?? [];
  const ids = r.tier === 'light' ? ['compliance-bug'] : [...CORE, ...notRun];
  let blocking = 0;
  for (const id of ids.filter((i) => !notRun.includes(i))) {
    const own = r.findings?.[id] ?? [];
    blocking += own.length;
    const file = {
      schemaVersion: 1,
      reviewerId: id,
      base: r.base,
      head: r.head,
      examinedFiles: r.files,
    };
    fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify({ ...file, findings: own }));
  }
  const receipt = {
    schemaVersion: 1,
    moment: label === 'final-all' ? 'final' : 'phase',
    tier: r.tier,
    backend: 'agent',
    diff: { base: r.base, head: r.head },
    coldContext: true,
    priorFindingsSupplied: false,
    reviewers: ids.map((id) =>
      notRun.includes(id)
        ? { id, required: true, ran: false }
        : { id, required: true, ran: true, findingsPath: `${id}.json` }
    ),
    blocking,
    advisory: 0,
    ...r.receipt,
  };
  fs.writeFileSync(path.join(dir, 'receipt.json'), JSON.stringify(receipt));
}
const finding = (id: string, file: string, findingClass: string, escapedFrom: string) => ({
  id,
  file,
  lineRange: [1, 1],
  severity: 'important',
  title: id,
  findingClass,
  escapedFrom,
});
const phase = (index: number, name: string) => ({
  index,
  name,
  status: 'complete',
  planPath: null,
});
function session(dir: string, state: Record<string, unknown>): string {
  const sessionDir = path.join(dir, '.harness', 'sessions', 'demo');
  fs.mkdirSync(sessionDir, { recursive: true });
  fs.writeFileSync(path.join(sessionDir, 'autopilot-state.json'), JSON.stringify(state));
  return sessionDir;
}
function render(dir: string): string {
  const out = runReviewProvenanceRender({ session: 'demo', cwd: dir });
  if (!out.ok) throw out.error;
  return out.value.block;
}

/** Two phases and the final review, nothing wrong. */
function cleanSession(): string {
  const r = repo('clean');
  const c0 = r.commit('base', ['README.md']);
  r.git('update-ref', 'refs/remotes/origin/main', c0);
  const c1 = r.commit('phase 0: core', ['src/a.ts', 'src/b.ts', 'src/c.ts']);
  const c2 = r.commit('phase 1: cli', ['src/d.ts']);
  const s = session(r.dir, {
    startingCommit: c0,
    phases: [phase(0, 'Core'), phase(1, 'CLI')],
    decisions: [],
  });
  const core = ['src/a.ts', 'src/b.ts', 'src/c.ts'];
  review(s, 'phase-0', { tier: 'full', base: c0, head: c1, files: core });
  review(s, 'phase-1', { tier: 'light', base: c1, head: c2, files: ['src/d.ts'] });
  review(s, 'final-all', { tier: 'full', base: c0, head: c2, files: [...core, 'src/d.ts'] });
  return r.dir;
}

/** The decisions of the session with trouble: two rounds on phase 0, three kinds on phase 1. */
const TROUBLE_DECISIONS = [
  {
    state: 'REVIEW',
    phase: 0,
    round: 1,
    kind: 'dismissed',
    findingIds: ['bug-stale-comment'],
    rationale: 'the comment was already removed by the fix for bug-empty-input',
    decidedBy: 'human',
  },
  {
    state: 'REVIEW',
    phase: 0,
    round: 2,
    kind: 'dismissed',
    findingIds: ['bug-empty-input'],
    rationale: 'the only caller passes a literal; VALIDATE discarded it and the human agreed',
    decidedBy: 'human',
  },
  {
    state: 'REVIEW',
    phase: 1,
    kind: 'gate',
    codes: ['REQUIRED_REVIEWER_NOT_RUN'],
    rationale: 'the adversarial reviewer timed out twice; accepted for this phase',
    decidedBy: 'human',
  },
  {
    state: 'REVIEW',
    phase: 1,
    kind: 'findings',
    rationale: 'architecture-flag-name ships as is; renaming the flag is tracked as a follow-up',
    decidedBy: 'human',
  },
  {
    state: 'REVIEW',
    phase: 1,
    kind: 'dismissed',
    findingIds: ['bug-help-text'],
    rationale: 'the help text is generated; the generator already prints the default',
    decidedBy: 'human',
  },
];

/** Round 4, fix 10: a round 2 receipt has its round 1 archived beside it (head c1, 3 blocking). */
function archiveRound1(sessionDir: string, base: string, head: string): void {
  const dir = path.join(sessionDir, 'reviews', 'phase-0');
  const current = JSON.parse(fs.readFileSync(path.join(dir, 'receipt.json'), 'utf-8'));
  delete current.round;
  delete current.priorRounds;
  fs.mkdirSync(path.join(dir, 'round-1'));
  const archived = { ...current, diff: { base, head }, blocking: 3 };
  fs.writeFileSync(path.join(dir, 'round-1', 'receipt.json'), JSON.stringify(archived));
}

/**
 * A round 2 row, an overridden gate with an override and a dismissal, a MISSING row, a directory
 * without a receipt, and a commit after the final review.
 */
function troubleSession(): string {
  const r = repo('trouble');
  const c0 = r.commit('base', ['README.md']);
  r.git('update-ref', 'refs/remotes/origin/main', c0);
  const core = ['src/a.ts', 'src/b.ts', 'src/c.ts'];
  const c1 = r.commit('phase 0: core', core);
  const c1f = r.commit('phase 0: fix review findings', ['src/a.ts']);
  const c2 = r.commit('phase 1: cli', ['src/d.ts']);
  const c3 = r.commit('phases 2 and 3: docs and release notes', ['docs/e.md']);
  const s = session(r.dir, {
    startingCommit: c0,
    phases: [phase(0, 'Core'), phase(1, 'CLI'), phase(2, 'Docs'), phase(3, 'Release notes')],
    decisions: TROUBLE_DECISIONS,
  });
  review(s, 'phase-0', {
    tier: 'full',
    base: c0,
    head: c1f,
    files: core,
    findings: { bug: [finding('bug-empty-input', 'src/a.ts', 'edge-case', 'plan')] },
    receipt: { round: 2, priorRounds: [{ round: 1, head: c1, blocking: 3 }] },
  });
  archiveRound1(s, c0, c1);
  review(s, 'phase-1', {
    tier: 'full',
    base: c1f,
    head: c2,
    files: ['src/d.ts'],
    notRun: ['adversarial'],
    findings: {
      bug: [finding('bug-help-text', 'src/d.ts', 'stale-claim', 'execution')],
      architecture: [finding('architecture-flag-name', 'src/d.ts', 'design', 'plan')],
    },
  });
  // phase-2 has no directory at all; phase-3 has a directory the review never wrote a receipt into.
  fs.mkdirSync(path.join(s, 'reviews', 'phase-3'), { recursive: true });
  review(s, 'final-all', {
    tier: 'full',
    base: c0,
    head: c3,
    files: [...core, 'src/d.ts', 'docs/e.md'],
  });
  r.commit('fix a typo after the final review', ['docs/e.md']);
  return r.dir;
}

describe.skipIf(process.platform === 'win32')(
  'the example stamps in the review-provenance guide are what the command prints',
  () => {
    it('the guide pastes exactly two stamps', () => {
      expect(pastedStamps()).toHaveLength(2);
    });
    it('the first is the clean two-phase session, character for character', () => {
      expect(pastedStamps()[0]).toBe(render(cleanSession()));
    });
    it('the second is the session with trouble, character for character', () => {
      const stamp = render(troubleSession());
      expect(pastedStamps()[1]).toBe(stamp);
      // What the guide says this example shows is in it.
      for (const cell of [
        '| phase-2 | - | - | - | - | - | - | MISSING | - | - | - | - |',
        '| phase-3 | - | - | - | - | - | - | receipt missing | - | - | - | - |',
        'FAIL: REQUIRED_REVIEWER_NOT_RUN (overridden)',
        '1 (1 dismissed); round 2; round 1: 3 blocking',
        '0 overrides, 1 dismissal, 1 from other rounds: dismissed bug-empty-input (human):',
        '2 overrides, 1 dismissal: gate (REQUIRED_REVIEWER_NOT_RUN) (human):',
        '; findings (human):',
        'dismissed bug-help-text (human):',
        ', +1 commit not reviewed |',
      ]) {
        expect(stamp, cell).toContain(cell);
      }
    });
  }
);

/**
 * Round 4: the guide's table of notes is the renderer's own list. Every template of STAMP_NOTES
 * (read from stamp-grammar.ts, where the renderer and the parser take it from) appears in the
 * table with its slots written as the guide writes them, and the table lists nothing else.
 */
describe("the note table in the review-provenance guide is the renderer's note list", () => {
  const GRAMMAR = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../../core/src/receipts/stamp-grammar.ts'
  );
  const SLOT_AS_WRITTEN: Record<string, string> = {
    '{n}': 'N',
    '{label}': '<review>',
    '{kind}': '<kind>',
    '{state}': '<STATE>',
  };
  function templates(): string[] {
    const code = fs.readFileSync(GRAMMAR, 'utf-8');
    const block = /export const STAMP_NOTES = \{([\s\S]*?)\n\} as const;/.exec(code)?.[1] ?? '';
    return [...block.matchAll(/'[a-z-]+':\s*'([^']*)'/g)].map((m) =>
      (m[1] ?? '').replace(/\{[a-z]+\}/g, (slot) => SLOT_AS_WRITTEN[slot] ?? slot)
    );
  }
  function tableNotes(): string[] {
    const guide = fs.readFileSync(GUIDE, 'utf-8');
    const start = guide.indexOf('| Note ');
    const end = guide.indexOf('\n\n', start);
    return [...guide.slice(start, end).matchAll(/^\| `([^`]+)` +\|/gm)].map((m) => m[1] ?? '');
  }
  it('reads every template from the code (a guard against a regex that reads nothing)', () => {
    expect(templates()).toHaveLength(10);
  });
  it("lists exactly the renderer's notes, no more and no fewer", () => {
    expect([...tableNotes()].sort()).toEqual([...templates()].sort());
  });
});
