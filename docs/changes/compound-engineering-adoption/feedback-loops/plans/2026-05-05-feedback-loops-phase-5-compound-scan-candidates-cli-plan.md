# Plan: Feedback Loops — Phase 5: harness compound scan-candidates CLI

**Date:** 2026-05-05
**Spec:** [docs/changes/compound-engineering-adoption/feedback-loops/proposal.md](../proposal.md)
**Phase:** 5 of 8 (harness compound scan-candidates CLI, complexity: medium)
**Tasks:** 11
**Time:** ~37 min
**Integration Tier:** medium
**Rigor:** fast

## Goal

Provide a non-interactive `harness compound scan-candidates` CLI subcommand that, given a lookback window, scans recent git history for undocumented learnings, computes file-churn hotspots, cross-references against existing `docs/solutions/<track>/<category>/` docs, and writes a week-keyed candidate list to `docs/solutions/.candidates/YYYY-WW.md` with suggested categories and `/harness:compound` prompts. Designed to be invoked by the `compound-candidates` maintenance task wired in Phase 6.

## Observable Truths (Acceptance Criteria)

1. `harness compound scan-candidates --lookback 7d` against a fixture repo with 3 recent `fix:` commits not yet in `docs/solutions/` writes a file matching `docs/solutions/.candidates/\d{4}-W\d{2}\.md` and exits 0.
2. The same invocation against a fixture repo where every recent fix is already documented under `docs/solutions/<track>/<category>/` writes a file with two empty sections and emits `{"status":"no-issues",...}` JSON line in non-interactive mode.
3. With `--lookback` omitted, the default `7d` is used. Verified by unit test on the option parser.
4. ISO week computation: `isoWeek(new Date('2026-01-01'))` returns `{year: 2026, week: 1}`; `isoWeek(new Date('2025-12-29'))` returns `{year: 2026, week: 1}` (cross-year ISO week boundary). Verified by unit test.
5. `gitScan({since: '7d', cwd})` returns commits whose subject starts with `fix:`/`fix(`, with fields `{sha, subject, filesChanged, branchIterations}`. Verified by unit test against a fixture git repo.
6. `computeHotspots({since: '7d', cwd, threshold: N})` returns files modified `>threshold` times in the lookback window, sorted by churn descending. Verified by unit test.
7. `crossReferenceUndocumentedFixes(commits, solutionsDir)` returns the subset of input commits whose subject keywords do not appear in any `docs/solutions/<track>/<category>/*.md` title or `# heading`. Reuses Phase 1's positive-walk pattern (track-category enums) — same shape as `validateSolutionsDir`.
8. `assembleCandidateReport({undocumentedFixes, hotspotCandidates, isoWeek})` produces Markdown with: H1 `# Compound candidates — week YYYY-WNN`, H2 `## Undocumented fixes (from git log past <window>)`, H2 `## Pattern candidates (from churn + hotspot analysis)`, and a bulleted entry for each candidate with `Suggested category:` and `Run: \`/harness:compound "<descriptor>"\`` lines.
9. Suggested category for an undocumented `fix:` commit follows a deterministic mapping table (e.g., `fix: ... test ...` → `bug-track/test-failures`, `fix: ... perf ...` → `bug-track/performance-issues`). Default is `bug-track/logic-errors` when no keyword matches. Categories suggested are always drawn from `BUG_TRACK_CATEGORIES` or `KNOWLEDGE_TRACK_CATEGORIES` enums (Phase 1) — never invented.
10. Non-interactive mode (`--non-interactive` flag OR `!process.stdout.isTTY`): emits single-line JSON `{status, path, candidatesFound, lookback, durationMs}` to stdout. Status is `success` when ≥1 candidate, `no-issues` when 0 candidates.
11. CLI flags supported: `--lookback <window>` (default `7d`), `--non-interactive`, `--config <path>` (default `harness.config.json`), `--output-path <path>` (default `docs/solutions/.candidates/<YYYY-WW>.md`), `--solutions-dir <path>` (default `docs/solutions/`).
12. `harness validate` and `harness check-deps` pass after the phase.
13. `pnpm -F @harness-engineering/core test scan-candidates && pnpm -F @harness-engineering/cli test compound-scan-candidates` passes.

## File Map

### Modify

- `packages/cli/src/commands/_registry.ts` — auto-regenerated to include `createCompoundCommand` import and registration (DO NOT hand-edit; run the generator).
- `packages/core/src/solutions/index.ts` — re-export the new `scan-candidates` module barrel.

### Create

- `packages/core/src/solutions/scan-candidates/index.ts` — module barrel: `gitScan`, `computeHotspots`, `crossReferenceUndocumentedFixes`, `assembleCandidateReport`, `isoWeek`, `suggestCategory`, types.
- `packages/core/src/solutions/scan-candidates/iso-week.ts` — pure `isoWeek(date: Date): {year: number, week: number}` (no new dep).
- `packages/core/src/solutions/scan-candidates/iso-week.test.ts`
- `packages/core/src/solutions/scan-candidates/git-scan.ts` — `gitScan(opts): Promise<ScannedCommit[]>` shells `git log --since=<lookback> --format=...` and parses; computes `branchIterations` heuristic (count of commits on the issue branch via `git log --first-parent` lookup; for v1 use commit count touching the same files within lookback as a proxy).
- `packages/core/src/solutions/scan-candidates/git-scan.test.ts`
- `packages/core/src/solutions/scan-candidates/hotspot.ts` — `computeHotspots(opts)`: simple churn-based heuristic (file modification count in lookback). Reads from `git log --name-only --since=<lookback>` and aggregates.
- `packages/core/src/solutions/scan-candidates/hotspot.test.ts`
- `packages/core/src/solutions/scan-candidates/cross-reference.ts` — `crossReferenceUndocumentedFixes(commits, solutionsDir)` walks `docs/solutions/<track>/<category>/*.md` (mirroring Phase 1's positive-walk pattern), extracts titles + first H1, returns commits whose keyword footprint does not match any existing doc.
- `packages/core/src/solutions/scan-candidates/cross-reference.test.ts`
- `packages/core/src/solutions/scan-candidates/assemble.ts` — `assembleCandidateReport(input): string` produces the Markdown output. Includes `suggestCategory(commit)` keyword-mapping helper.
- `packages/core/src/solutions/scan-candidates/assemble.test.ts`
- `packages/cli/src/commands/compound/index.ts` — top-level `harness compound` command group; hosts `scan-candidates` subcommand. Mirrors `commands/pulse/index.ts` exactly.
- `packages/cli/src/commands/compound/scan-candidates.ts` — `runCompoundScanCandidatesCommand(opts)` core function + `createScanCandidatesCommand()` Commander factory. Mirrors `commands/pulse/run.ts` shape.
- `packages/cli/tests/commands/compound-scan-candidates.test.ts` — CLI integration tests (mirrors `pulse-run.test.ts` style).

## Tasks

### Task 1: ISO week utility (TDD)

**Depends on:** none | **Files:** `packages/core/src/solutions/scan-candidates/iso-week.ts`, `packages/core/src/solutions/scan-candidates/iso-week.test.ts`

1. Create `packages/core/src/solutions/scan-candidates/iso-week.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { isoWeek, formatIsoWeek } from './iso-week';

describe('isoWeek', () => {
  it.each([
    ['2026-01-01', { year: 2026, week: 1 }],
    ['2025-12-29', { year: 2026, week: 1 }], // Monday of W1 2026
    ['2024-12-30', { year: 2025, week: 1 }],
    ['2024-01-01', { year: 2024, week: 1 }],
    ['2026-05-05', { year: 2026, week: 19 }],
    ['2020-12-31', { year: 2020, week: 53 }], // 53-week year
  ])('isoWeek(%s) -> %o', (iso, expected) => {
    expect(isoWeek(new Date(iso + 'T12:00:00Z'))).toEqual(expected);
  });
});

describe('formatIsoWeek', () => {
  it('zero-pads week number', () => {
    expect(formatIsoWeek({ year: 2026, week: 1 })).toBe('2026-W01');
    expect(formatIsoWeek({ year: 2026, week: 19 })).toBe('2026-W19');
    expect(formatIsoWeek({ year: 2020, week: 53 })).toBe('2020-W53');
  });
});
```

2. Create `packages/core/src/solutions/scan-candidates/iso-week.ts`:

```typescript
export interface IsoWeek {
  year: number;
  week: number;
}

/**
 * Compute ISO 8601 week number for a date. Uses the standard algorithm:
 * the week-of-year of the Thursday in the same week as `date`.
 */
export function isoWeek(date: Date): IsoWeek {
  // Copy and align to UTC midnight to avoid TZ drift.
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  // Thursday in current week determines the year.
  const dayNum = d.getUTCDay() || 7; // Sun=0 -> 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const year = d.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return { year, week };
}

export function formatIsoWeek(w: IsoWeek): string {
  return `${w.year}-W${String(w.week).padStart(2, '0')}`;
}
```

3. Run: `pnpm -F @harness-engineering/core test scan-candidates/iso-week` — observe pass.
4. Run: `harness validate`.
5. Commit: `feat(core): ISO week utility for compound scan-candidates`.

### Task 2: Git scan tests (TDD)

**Depends on:** none | **Files:** `packages/core/src/solutions/scan-candidates/git-scan.test.ts`

1. Create `packages/core/src/solutions/scan-candidates/git-scan.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { gitScan } from './git-scan';

function gitInit(cwd: string) {
  execSync('git init -q', { cwd });
  execSync('git config user.email "t@t" && git config user.name "T"', { cwd, shell: '/bin/bash' });
}
function commit(cwd: string, file: string, content: string, message: string) {
  writeFileSync(join(cwd, file), content);
  execSync(`git add . && git commit -q -m "${message}"`, { cwd, shell: '/bin/bash' });
}

describe('gitScan', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'git-scan-'));
    gitInit(tmp);
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it('returns only fix: commits within the lookback window', async () => {
    commit(tmp, 'a.ts', 'a', 'feat: initial');
    commit(tmp, 'b.ts', 'b', 'fix: handle null in parser');
    commit(tmp, 'c.ts', 'c', 'fix(orchestrator): retry logic');
    commit(tmp, 'd.ts', 'd', 'chore: bump version');
    const result = await gitScan({ since: '30d', cwd: tmp });
    expect(result.map((c) => c.subject)).toEqual([
      'fix(orchestrator): retry logic',
      'fix: handle null in parser',
    ]);
  });

  it('reports filesChanged count per commit', async () => {
    mkdirSync(join(tmp, 'src'));
    writeFileSync(join(tmp, 'src/x.ts'), 'x');
    writeFileSync(join(tmp, 'src/y.ts'), 'y');
    execSync('git add . && git commit -q -m "fix: two-file fix"', { cwd: tmp, shell: '/bin/bash' });
    const result = await gitScan({ since: '30d', cwd: tmp });
    expect(result[0]?.filesChanged).toBe(2);
  });

  it('returns empty array on a fresh repo with no fix commits', async () => {
    commit(tmp, 'a.ts', 'a', 'feat: only feature');
    const result = await gitScan({ since: '30d', cwd: tmp });
    expect(result).toEqual([]);
  });
});
```

2. Run: `pnpm -F @harness-engineering/core test scan-candidates/git-scan` — observe failure.
3. Commit: `test(core): failing tests for compound git-scan`.

### Task 3: Implement git scan

**Depends on:** Task 2 | **Files:** `packages/core/src/solutions/scan-candidates/git-scan.ts`

1. Create `packages/core/src/solutions/scan-candidates/git-scan.ts`:

```typescript
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface GitScanOptions {
  since: string; // e.g. '7d', '30d' — passed to git --since=
  cwd: string;
}

export interface ScannedCommit {
  sha: string;
  subject: string;
  filesChanged: number;
  /**
   * Heuristic proxy for "branches that took multiple iterations". For v1: count
   * of commits in the lookback window whose changed file set overlaps this
   * commit's. Higher value implies repeated work in the same area.
   */
  branchIterations: number;
}

const FIX_RE = /^fix(\([^)]+\))?:/i;

interface RawCommit {
  sha: string;
  subject: string;
  files: string[];
}

async function readCommits(opts: GitScanOptions): Promise<RawCommit[]> {
  // %x1f = unit separator, %x1e = record separator. --name-only after --format
  // emits files on subsequent lines.
  const { stdout } = await execFileAsync(
    'git',
    ['log', `--since=${opts.since}`, '--name-only', '--format=%x1e%H%x1f%s'],
    { cwd: opts.cwd, maxBuffer: 16 * 1024 * 1024 }
  );
  const records = stdout.split('\x1e').filter((r) => r.trim().length > 0);
  return records.map((rec) => {
    const [header, ...fileLines] = rec.split('\n');
    const [sha, subject] = (header ?? '').split('\x1f');
    const files = fileLines.map((l) => l.trim()).filter((l) => l.length > 0);
    return { sha: sha ?? '', subject: subject ?? '', files };
  });
}

export async function gitScan(opts: GitScanOptions): Promise<ScannedCommit[]> {
  const all = await readCommits(opts);
  const fixes = all.filter((c) => FIX_RE.test(c.subject));

  // branchIterations: for each fix commit, count other commits in the window
  // touching at least one of the same files.
  return fixes.map((c) => {
    const overlap = all.filter(
      (other) => other.sha !== c.sha && other.files.some((f) => c.files.includes(f))
    ).length;
    return {
      sha: c.sha,
      subject: c.subject,
      filesChanged: c.files.length,
      branchIterations: overlap,
    };
  });
}
```

2. Run: `pnpm -F @harness-engineering/core test scan-candidates/git-scan` — observe pass.
3. Run: `harness validate`.
4. Commit: `feat(core): gitScan reads fix: commits and computes iteration heuristic`.

### Task 4: Hotspot computation tests + impl (TDD)

**Depends on:** Task 3 | **Files:** `packages/core/src/solutions/scan-candidates/hotspot.test.ts`, `packages/core/src/solutions/scan-candidates/hotspot.ts`

1. Create `packages/core/src/solutions/scan-candidates/hotspot.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { computeHotspots } from './hotspot';

describe('computeHotspots', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'hotspot-'));
    execSync('git init -q && git config user.email "t@t" && git config user.name "T"', {
      cwd: tmp,
      shell: '/bin/bash',
    });
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it('returns files modified more than threshold times, sorted desc', async () => {
    for (let i = 0; i < 5; i++) {
      writeFileSync(join(tmp, 'hot.ts'), `// v${i}`);
      execSync(`git add . && git commit -q -m "edit ${i}"`, { cwd: tmp, shell: '/bin/bash' });
    }
    writeFileSync(join(tmp, 'cold.ts'), 'x');
    execSync('git add . && git commit -q -m "cold"', { cwd: tmp, shell: '/bin/bash' });

    const result = await computeHotspots({ since: '30d', cwd: tmp, threshold: 2 });
    expect(result[0]?.path).toBe('hot.ts');
    expect(result[0]?.churn).toBe(5);
    expect(result.find((r) => r.path === 'cold.ts')).toBeUndefined();
  });

  it('returns empty list on empty repo', async () => {
    const result = await computeHotspots({ since: '30d', cwd: tmp, threshold: 1 });
    expect(result).toEqual([]);
  });
});
```

2. Create `packages/core/src/solutions/scan-candidates/hotspot.ts`:

```typescript
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface HotspotOptions {
  since: string;
  cwd: string;
  threshold: number; // file appears more than `threshold` times in window
}

export interface Hotspot {
  path: string;
  churn: number;
}

export async function computeHotspots(opts: HotspotOptions): Promise<Hotspot[]> {
  let stdout = '';
  try {
    const r = await execFileAsync(
      'git',
      ['log', `--since=${opts.since}`, '--name-only', '--format='],
      { cwd: opts.cwd, maxBuffer: 16 * 1024 * 1024 }
    );
    stdout = r.stdout;
  } catch {
    return [];
  }
  const counts = new Map<string, number>();
  for (const line of stdout.split('\n')) {
    const path = line.trim();
    if (path.length === 0) continue;
    counts.set(path, (counts.get(path) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, c]) => c > opts.threshold)
    .map(([path, churn]) => ({ path, churn }))
    .sort((a, b) => b.churn - a.churn);
}
```

3. Run: `pnpm -F @harness-engineering/core test scan-candidates/hotspot` — observe pass.
4. Run: `harness validate`.
5. Commit: `feat(core): churn-based hotspot computation for compound scan-candidates`.

### Task 5: Cross-reference tests + impl (TDD)

**Depends on:** Tasks 3, 4 | **Files:** `packages/core/src/solutions/scan-candidates/cross-reference.test.ts`, `packages/core/src/solutions/scan-candidates/cross-reference.ts`

1. Create `packages/core/src/solutions/scan-candidates/cross-reference.test.ts`:

```typescript
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
      { sha: 'b', subject: 'fix(parser): handle null token', filesChanged: 1, branchIterations: 0 },
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
```

2. Create `packages/core/src/solutions/scan-candidates/cross-reference.ts`:

```typescript
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { BUG_TRACK_CATEGORIES, KNOWLEDGE_TRACK_CATEGORIES } from '../schema';
import type { ScannedCommit } from './git-scan';

const TRACK_CATEGORIES: ReadonlyArray<readonly [string, ReadonlyArray<string>]> = [
  ['bug-track', BUG_TRACK_CATEGORIES],
  ['knowledge-track', KNOWLEDGE_TRACK_CATEGORIES],
];

const STOPWORDS = new Set([
  'fix',
  'the',
  'a',
  'an',
  'in',
  'on',
  'of',
  'and',
  'or',
  'to',
  'for',
  'with',
  'is',
  'be',
  'when',
  'if',
  'this',
  'that',
  'edge',
  'case',
  'handle',
]);

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 2 && !STOPWORDS.has(t))
  );
}

async function* walk(dir: string): AsyncGenerator<string> {
  let entries: import('node:fs').Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (e.isFile() && e.name.endsWith('.md')) yield p;
  }
}

async function readDocumentedTokens(solutionsDir: string): Promise<Array<Set<string>>> {
  const docs: Array<Set<string>> = [];
  for (const [track, categories] of TRACK_CATEGORIES) {
    for (const category of categories) {
      const dir = path.join(solutionsDir, track, category);
      for await (const file of walk(dir)) {
        const raw = await fs.readFile(file, 'utf-8');
        // Title = first H1; fall back to filename.
        const m = /^#\s+(.+)$/m.exec(raw);
        const title = m?.[1] ?? path.basename(file, '.md');
        docs.push(tokenize(title));
      }
    }
  }
  return docs;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

export async function crossReferenceUndocumentedFixes(
  commits: ScannedCommit[],
  solutionsDir: string
): Promise<ScannedCommit[]> {
  const documented = await readDocumentedTokens(solutionsDir);
  const OVERLAP_THRESHOLD = 0.4;
  return commits.filter((c) => {
    const tokens = tokenize(c.subject);
    return !documented.some((d) => jaccard(tokens, d) >= OVERLAP_THRESHOLD);
  });
}
```

3. Run: `pnpm -F @harness-engineering/core test scan-candidates/cross-reference` — observe pass.
4. Run: `harness validate && harness check-deps`.
5. Commit: `feat(core): cross-reference undocumented fixes against existing solutions`.

### Task 6: Assemble report tests + impl (TDD)

**Depends on:** Tasks 1, 3, 4, 5 | **Files:** `packages/core/src/solutions/scan-candidates/assemble.test.ts`, `packages/core/src/solutions/scan-candidates/assemble.ts`

1. Create `packages/core/src/solutions/scan-candidates/assemble.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { assembleCandidateReport, suggestCategory } from './assemble';
import type { ScannedCommit } from './git-scan';
import type { Hotspot } from './hotspot';

describe('suggestCategory', () => {
  it.each([
    ['fix: flaky test in pulse runner', 'bug-track/test-failures'],
    ['fix(perf): slow startup', 'bug-track/performance-issues'],
    ['fix: SQL injection in query builder', 'bug-track/security-issues'],
    ['fix: button color contrast', 'bug-track/ui-bugs'],
    ['fix(orchestrator): handle stalled lease', 'bug-track/integration-issues'],
    ['fix: null pointer in parser', 'bug-track/logic-errors'],
  ])('maps %p -> %s', (subject, expected) => {
    expect(suggestCategory(subject)).toBe(expected);
  });
});

describe('assembleCandidateReport', () => {
  const fixes: ScannedCommit[] = [
    {
      sha: 'abc1234',
      subject: 'fix(orchestrator): stalled lease',
      filesChanged: 3,
      branchIterations: 4,
    },
    { sha: 'def5678', subject: 'fix: flaky retry test', filesChanged: 1, branchIterations: 1 },
  ];
  const hotspots: Hotspot[] = [{ path: 'packages/orchestrator/src/state-machine.ts', churn: 12 }];

  it('produces the documented section structure', () => {
    const out = assembleCandidateReport({
      undocumentedFixes: fixes,
      hotspotCandidates: hotspots,
      isoWeek: { year: 2026, week: 18 },
      lookback: '7d',
    });
    expect(out).toMatch(/^# Compound candidates — week 2026-W18$/m);
    expect(out).toContain('## Undocumented fixes (from `git log` past 7d)');
    expect(out).toContain('## Pattern candidates (from churn + hotspot analysis)');
    expect(out).toContain('Run: `/harness:compound "stalled lease"`');
    expect(out).toContain('Suggested category: bug-track/integration-issues');
    expect(out).toContain('packages/orchestrator/src/state-machine.ts');
    expect(out).toContain('12 commits in 7d');
  });

  it('writes empty sections when no candidates', () => {
    const out = assembleCandidateReport({
      undocumentedFixes: [],
      hotspotCandidates: [],
      isoWeek: { year: 2026, week: 1 },
      lookback: '7d',
    });
    expect(out).toContain('## Undocumented fixes');
    expect(out).toContain('_(none this week)_');
    expect(out).toContain('## Pattern candidates');
  });
});
```

2. Create `packages/core/src/solutions/scan-candidates/assemble.ts`:

```typescript
import type { ScannedCommit } from './git-scan';
import type { Hotspot } from './hotspot';
import type { IsoWeek } from './iso-week';
import { formatIsoWeek } from './iso-week';

const KEYWORD_TO_CATEGORY: ReadonlyArray<readonly [RegExp, string]> = [
  [/\b(test|flaky|spec)\b/i, 'bug-track/test-failures'],
  [/\b(perf|slow|latency|throughput)\b/i, 'bug-track/performance-issues'],
  [/\b(security|sqli|xss|auth|crypt)\b/i, 'bug-track/security-issues'],
  [/\b(ui|css|color|contrast|layout|render)\b/i, 'bug-track/ui-bugs'],
  [/\b(build|compile|tsc|webpack|tsup)\b/i, 'bug-track/build-errors'],
  [/\b(db|database|sql|query|migration)\b/i, 'bug-track/database-issues'],
  [/\b(runtime|crash|exception|panic)\b/i, 'bug-track/runtime-errors'],
  [/\(orchestrator\)|\bintegrat|\blease\b|\brace\b|\bconcurren/i, 'bug-track/integration-issues'],
];

export function suggestCategory(subject: string): string {
  for (const [re, cat] of KEYWORD_TO_CATEGORY) if (re.test(subject)) return cat;
  return 'bug-track/logic-errors';
}

function descriptor(subject: string): string {
  // Strip the conventional-commit prefix; trim.
  return subject.replace(/^fix(\([^)]+\))?:\s*/i, '').trim();
}

export interface AssembleInput {
  undocumentedFixes: ScannedCommit[];
  hotspotCandidates: Hotspot[];
  isoWeek: IsoWeek;
  lookback: string;
}

export function assembleCandidateReport(input: AssembleInput): string {
  const week = formatIsoWeek(input.isoWeek);
  const lines: string[] = [];
  lines.push(`# Compound candidates — week ${week}`, '');
  lines.push(`## Undocumented fixes (from \`git log\` past ${input.lookback})`, '');
  if (input.undocumentedFixes.length === 0) {
    lines.push('_(none this week)_', '');
  } else {
    for (const c of input.undocumentedFixes) {
      const d = descriptor(c.subject);
      const cat = suggestCategory(c.subject);
      lines.push(
        `- **${c.subject}** (commit ${c.sha.slice(0, 7)}, ${c.filesChanged} file(s), ${c.branchIterations} related commits)`
      );
      lines.push(`  - Suggested category: ${cat}`);
      lines.push(`  - Run: \`/harness:compound "${d}"\``);
    }
    lines.push('');
  }
  lines.push('## Pattern candidates (from churn + hotspot analysis)', '');
  if (input.hotspotCandidates.length === 0) {
    lines.push('_(none this week)_', '');
  } else {
    for (const h of input.hotspotCandidates) {
      lines.push(
        `- File \`${h.path}\` has ${h.churn} commits in ${input.lookback}; no docs/solutions/ entry`
      );
      lines.push('  - Suggested category: knowledge-track/architecture-patterns');
      lines.push(`  - Run: \`/harness:compound "${h.path} pattern"\``);
    }
    lines.push('');
  }
  return lines.join('\n');
}
```

3. Run: `pnpm -F @harness-engineering/core test scan-candidates/assemble` — observe pass.
4. Run: `harness validate`.
5. Commit: `feat(core): assemble candidate report with category suggestions`.

### Task 7: Module barrel + core re-export

**Depends on:** Tasks 1, 3, 4, 5, 6 | **Files:** `packages/core/src/solutions/scan-candidates/index.ts`, `packages/core/src/solutions/index.ts`

1. Create `packages/core/src/solutions/scan-candidates/index.ts`:

```typescript
export { isoWeek, formatIsoWeek } from './iso-week';
export type { IsoWeek } from './iso-week';
export { gitScan } from './git-scan';
export type { ScannedCommit, GitScanOptions } from './git-scan';
export { computeHotspots } from './hotspot';
export type { Hotspot, HotspotOptions } from './hotspot';
export { crossReferenceUndocumentedFixes } from './cross-reference';
export { assembleCandidateReport, suggestCategory } from './assemble';
export type { AssembleInput } from './assemble';
```

2. Open `packages/core/src/solutions/index.ts`. Append:

```typescript
export * from './scan-candidates';
```

3. Run: `pnpm -F @harness-engineering/core build && pnpm -F @harness-engineering/core typecheck`.
4. Run: `harness validate`.
5. Commit: `feat(core): re-export scan-candidates module from @harness-engineering/core`.

### Task 8: CLI subcommand tests (TDD)

**Depends on:** Task 7 | **Files:** `packages/cli/tests/commands/compound-scan-candidates.test.ts`

1. Create `packages/cli/tests/commands/compound-scan-candidates.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { runCompoundScanCandidatesCommand } from '../../src/commands/compound/scan-candidates';

function gitInit(cwd: string) {
  execSync('git init -q && git config user.email "t@t" && git config user.name "T"', {
    cwd,
    shell: '/bin/bash',
  });
}
function commitFile(cwd: string, file: string, content: string, msg: string) {
  writeFileSync(join(cwd, file), content);
  execSync(`git add . && git commit -q -m "${msg}"`, { cwd, shell: '/bin/bash' });
}

describe('harness compound scan-candidates', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'compound-scan-'));
    gitInit(tmp);
    writeFileSync(
      join(tmp, 'harness.config.json'),
      JSON.stringify({ version: 1, name: 'test', layers: [], forbiddenImports: [] }, null, 2)
    );
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it('writes a candidate file with undocumented fixes and returns success', async () => {
    commitFile(tmp, 'a.ts', 'a', 'fix: handle null in parser');
    commitFile(tmp, 'b.ts', 'b', 'fix(orchestrator): retry budget');
    commitFile(tmp, 'c.ts', 'c', 'fix: button contrast');

    const status = await runCompoundScanCandidatesCommand({
      cwd: tmp,
      lookback: '30d',
      configPath: join(tmp, 'harness.config.json'),
      outputPath: join(tmp, 'docs/solutions/.candidates/auto.md'),
      solutionsDir: join(tmp, 'docs/solutions'),
      nonInteractive: true,
    });
    expect(status.status).toBe('success');
    expect(status.candidatesFound).toBeGreaterThanOrEqual(3);
    expect(status.path).toBeDefined();
    const out = readFileSync(status.path!, 'utf-8');
    expect(out).toContain('## Undocumented fixes');
    expect(out).toContain('Run: `/harness:compound');
  });

  it('returns no-issues when every fix is documented', async () => {
    commitFile(tmp, 'a.ts', 'a', 'fix: handle null in parser');
    // Seed a documented solution that overlaps the fix.
    const dir = join(tmp, 'docs/solutions/bug-track/logic-errors');
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'null-parser.md'),
      `---\nmodule: x\ntags: []\nproblem_type: x\nlast_updated: '2026-05-05'\ntrack: bug-track\ncategory: logic-errors\n---\n\n# Handle null parser\n`
    );

    const status = await runCompoundScanCandidatesCommand({
      cwd: tmp,
      lookback: '30d',
      configPath: join(tmp, 'harness.config.json'),
      outputPath: join(tmp, 'docs/solutions/.candidates/auto.md'),
      solutionsDir: join(tmp, 'docs/solutions'),
      nonInteractive: true,
    });
    expect(status.status).toBe('no-issues');
    expect(status.candidatesFound).toBe(0);
  });

  it('uses default 7d lookback when not provided', async () => {
    commitFile(tmp, 'a.ts', 'a', 'fix: recent thing');
    const status = await runCompoundScanCandidatesCommand({
      cwd: tmp,
      configPath: join(tmp, 'harness.config.json'),
      outputPath: join(tmp, 'docs/solutions/.candidates/auto.md'),
      solutionsDir: join(tmp, 'docs/solutions'),
      nonInteractive: true,
    });
    expect(status.lookback).toBe('7d');
  });
});
```

2. Run: `pnpm -F @harness-engineering/cli test compound-scan-candidates` — observe failure.
3. Commit: `test(cli): failing tests for compound scan-candidates command`.

### Task 9: Implement CLI subcommand

**Depends on:** Task 8 | **Files:** `packages/cli/src/commands/compound/index.ts`, `packages/cli/src/commands/compound/scan-candidates.ts`

1. Create `packages/cli/src/commands/compound/scan-candidates.ts`:

```typescript
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { Command } from 'commander';
import {
  gitScan,
  computeHotspots,
  crossReferenceUndocumentedFixes,
  assembleCandidateReport,
  isoWeek,
  formatIsoWeek,
} from '@harness-engineering/core';

export interface ScanCandidatesOptions {
  cwd?: string;
  lookback?: string;
  configPath: string;
  outputPath?: string;
  solutionsDir: string;
  nonInteractive: boolean;
}

export interface ScanCandidatesStatus {
  status: 'success' | 'no-issues' | 'failure';
  path?: string;
  candidatesFound?: number;
  lookback?: string;
  durationMs?: number;
  reason?: string;
}

const HOTSPOT_THRESHOLD = 7;

export async function runCompoundScanCandidatesCommand(
  opts: ScanCandidatesOptions
): Promise<ScanCandidatesStatus> {
  const startedAt = Date.now();
  const cwd = opts.cwd ?? process.cwd();
  const lookback = opts.lookback ?? '7d';

  let undocumented: Awaited<ReturnType<typeof gitScan>>;
  let hotspots: Awaited<ReturnType<typeof computeHotspots>>;
  try {
    const fixes = await gitScan({ since: lookback, cwd });
    undocumented = await crossReferenceUndocumentedFixes(fixes, opts.solutionsDir);
    hotspots = await computeHotspots({ since: lookback, cwd, threshold: HOTSPOT_THRESHOLD });
  } catch (err) {
    return emit(
      { status: 'failure', reason: err instanceof Error ? err.message : String(err), lookback },
      opts.nonInteractive
    );
  }

  const week = isoWeek(new Date());
  const report = assembleCandidateReport({
    undocumentedFixes: undocumented,
    hotspotCandidates: hotspots,
    isoWeek: week,
    lookback,
  });

  const outputPath =
    opts.outputPath ?? join(cwd, 'docs/solutions/.candidates', `${formatIsoWeek(week)}.md`);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, report);

  const candidatesFound = undocumented.length + hotspots.length;
  const status: ScanCandidatesStatus = {
    status: candidatesFound === 0 ? 'no-issues' : 'success',
    path: outputPath,
    candidatesFound,
    lookback,
    durationMs: Date.now() - startedAt,
  };
  return emit(status, opts.nonInteractive);
}

function emit(status: ScanCandidatesStatus, nonInteractive: boolean): ScanCandidatesStatus {
  if (nonInteractive) {
    process.stdout.write(JSON.stringify(status) + '\n');
  } else if (status.status === 'failure') {
    process.stderr.write(`scan-candidates failed: ${status.reason}\n`);
  } else {
    process.stdout.write(
      `${status.candidatesFound} candidate(s) over ${status.lookback}\n→ ${status.path}\n`
    );
  }
  return status;
}

export function createScanCandidatesCommand(): Command {
  return new Command('scan-candidates')
    .description(
      'Scan recent fixes and hotspots for undocumented learnings; write candidate prompts'
    )
    .option('--lookback <window>', 'Lookback window (e.g. 7d, 14d).', '7d')
    .option(
      '--non-interactive',
      'Emit single-line JSON status on stdout. Auto-detected when stdout is not a TTY.'
    )
    .option('--config <path>', 'Path to harness.config.json', 'harness.config.json')
    .option(
      '--output-path <path>',
      'Override output file path (default: docs/solutions/.candidates/<YYYY-WW>.md)'
    )
    .option('--solutions-dir <path>', 'Solutions directory to cross-reference', 'docs/solutions')
    .action(
      async (options: {
        lookback: string;
        nonInteractive?: boolean;
        config: string;
        outputPath?: string;
        solutionsDir: string;
      }) => {
        const nonInteractive = options.nonInteractive === true || !process.stdout.isTTY;
        const status = await runCompoundScanCandidatesCommand({
          lookback: options.lookback,
          configPath: resolve(process.cwd(), options.config),
          outputPath: options.outputPath ? resolve(process.cwd(), options.outputPath) : undefined,
          solutionsDir: resolve(process.cwd(), options.solutionsDir),
          nonInteractive,
        });
        if (status.status === 'failure') process.exitCode = 1;
      }
    );
}
```

2. Create `packages/cli/src/commands/compound/index.ts`:

```typescript
import { Command } from 'commander';
import { createScanCandidatesCommand } from './scan-candidates';

/**
 * Top-level `harness compound` command group. Currently hosts only
 * `scan-candidates`; future phases may add `migrate-learnings`, etc.
 */
export function createCompoundCommand(): Command {
  const command = new Command('compound').description('Compound (post-mortem playbook) commands');
  command.addCommand(createScanCandidatesCommand());
  return command;
}
```

3. Run: `pnpm -F @harness-engineering/cli test compound-scan-candidates` — observe pass.
4. Run: `pnpm -F @harness-engineering/cli typecheck`.
5. Commit: `feat(cli): compound scan-candidates subcommand`.

### Task 10: Regenerate \_registry.ts and verify wiring

**Depends on:** Task 9 | **Files:** `packages/cli/src/commands/_registry.ts` (auto-regenerated) | **Category:** integration

1. Run the barrel-export generator: `pnpm run generate-barrel-exports` (or the project-specific equivalent — verify the script name in `package.json` if `generate-barrel-exports` is not present; the comment at the top of `_registry.ts` documents the canonical command).
2. Verify `_registry.ts` now contains `import { createCompoundCommand } from './compound';` and registers it in the program.
3. Run: `pnpm -F @harness-engineering/cli build && pnpm -F @harness-engineering/cli typecheck`.
4. Manual smoke test from this repo root:
   - Build CLI: `pnpm -F @harness-engineering/cli build`.
   - Run: `node packages/cli/dist/bin/harness.js compound scan-candidates --lookback 7d --non-interactive --output-path /tmp/compound-test.md`. Expect: JSON status line on stdout; file at `/tmp/compound-test.md` with the documented section structure. Delete `/tmp/compound-test.md` after.
5. Run: `harness validate && harness check-deps`.
6. Commit: `chore(cli): regenerate command registry to include compound group`.

### Task 11: End-to-end integration test

**Depends on:** Tasks 1-10 | **Files:** `packages/cli/tests/commands/compound-scan-candidates.test.ts` (extend)

1. Append an integration test that:
   - Builds a temp git repo with 5 commits: 3 `fix:` (one with keyword "test", one with "perf", one orchestrator-related), 1 `feat:`, 1 `chore:`.
   - Seeds `docs/solutions/bug-track/test-failures/already-doc.md` with overlapping title for the test-related fix.
   - Invokes `runCompoundScanCandidatesCommand` end-to-end.
   - Asserts: output file contains the perf and orchestrator fixes (`bug-track/performance-issues`, `bug-track/integration-issues` suggested), does NOT contain the test fix (already documented), JSON status `success` with `candidatesFound = 2`, `lookback = '30d'`.

2. Run: `pnpm -F @harness-engineering/core test scan-candidates && pnpm -F @harness-engineering/cli test compound-scan-candidates` — all pass.
3. Run: `harness validate && harness check-deps`.
4. Commit: `test(cli): end-to-end integration test for compound scan-candidates`.

## Integration Tasks (derived from spec's Integration Points)

Per the spec's Integration Points section, items applying to Phase 5:

- **Entry Points → "New CLI subcommand: `harness compound scan-candidates`"**: covered by Tasks 9 + 10.
- **Registrations Required → "Slash command regeneration"**: not applicable here (no slash command added in Phase 5; `/harness:compound` is the skill from Phase 2).
- **Registrations Required → "BUILT_IN_TASKS registry entries"**: deferred to Phase 6.
- **Registrations Required → "Compound categories registered with `BusinessKnowledgeIngestor`"**: deferred to Phase 7.
- **Documentation Updates → AGENTS.md, conventions doc**: deferred to Phase 8.
- **Architectural Decisions**: 5 ADRs deferred to Phase 8.
- **Knowledge Impact → `docs/solutions/.candidates/` becomes a tracked surface for the maintenance dashboard**: deferred to Phase 6.

No additional integration tasks required for this phase beyond Task 10's registry regeneration.

## Uncertainties

- [ASSUMPTION] The barrel-export generator script is `pnpm run generate-barrel-exports` (per the comment at the top of `_registry.ts`). Verify the actual script name in `packages/cli/package.json` during Task 10 execution; substitute the correct command if different.
- [ASSUMPTION] `git log --since=7d` accepts the `7d` shorthand. Git natively supports `7.days.ago`/`7 days ago` and most shorthand variants; confirm during Task 3 — if the shorthand is rejected, translate `<N>d` → `<N> days ago` and `<N>h` → `<N> hours ago` inside `gitScan`.
- [ASSUMPTION] No existing hotspot data source is wired up for compound scanning. The spec's "hotspot analysis" line is open-ended; v1 ships the simple churn-based heuristic per the user's guidance. If a hotspot report file shows up under `.harness/` in this codebase, prefer reading it; otherwise the churn heuristic stands. Quick check during Task 4: `ls .harness/` for any `hotspot*.json` or `hotspot*.md` artifact.
- [ASSUMPTION] "Branches that took multiple iterations" (spec line 138) is interpreted as the `branchIterations` heuristic (overlapping-file commit count) per the user's scoping. More sophisticated branch-iteration analysis is deferred to Phase 5.5.
- [ASSUMPTION] "Debug-resolved sessions" surfacing (spec line 138) is deferred. Quick check during execution: search for `debug_session: true` markers in `.harness/sessions/<slug>/state.json` shapes; if absent, this signal is genuinely not yet wired in harness sessions and v1 omits it without loss.
- [DEFERRABLE] Exact set of category-mapping keywords in `suggestCategory`. The mapping in `assemble.ts` is a starter; refinements during execution (e.g., adding `fix(cli)` → `bug-track/build-errors`) are welcome but not required to ship Phase 5.
- [DEFERRABLE] Whether to read `harness.config.json` at all in the scanner. Phase 5 currently only requires the path for symmetry with `pulse run`; no config keys are read. If Phase 6 adds a `compound:` config block, integrate then.

## Concerns

- The git-history dependency: tests in Tasks 2, 4, 5, 8, 11 spawn `git` subprocesses on temp repos. CI must have `git` available (it does; harness CI already runs git commands). Tests should be tolerant of leading/trailing whitespace and CRLF on Windows runners — use `trim()` on parsed output where applicable.
- The cross-reference Jaccard threshold (0.4) and the stopword list are heuristics. False negatives (undocumented fix wrongly suppressed) are worse than false positives (already-documented fix surfaced again). If the test in Task 11 reveals tuning is needed, lower threshold to 0.3 — do not invert the bias.
- The hotspot threshold (`HOTSPOT_THRESHOLD = 7`) is a magic number. Surface in a follow-up as a config option if maintenance task usage shows poor signal.
- No new npm dependencies are introduced. ISO week is computed inline (no `date-fns`), git is shelled out via `node:child_process` (already in scope), and the cross-reference walk reuses Phase 1's pattern (no new fs primitives). This keeps the dependency surface minimal — confirmed by Task 5's `harness check-deps` run.
- The `compound-candidates` task itself (Phase 6) will set `checkCommand: ['compound', 'scan-candidates', '--lookback', '7d']` against this CLI; the JSON status shape defined in Task 9 (`{status, path, candidatesFound, lookback, durationMs}`) is the public contract. Any change to this shape after Phase 6 lands is a breaking change to the maintenance system — lock it in during Task 9.
