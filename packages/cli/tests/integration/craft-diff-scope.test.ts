// packages/cli/tests/integration/craft-diff-scope.test.ts
//
// Phase 3, criterion 4: a hook-triggered craft run critiques ONLY files in the
// diff.
//
// The obvious assertion — "every prompt file is in the changed set" — is
// VACUOUS on its own, because `[] subset-of anything` is true. The two ways a
// diff-scoped dispatch actually fails both produce an EMPTY or WRONG prompt
// set, so each law here carries a prompt-count positive control at the same
// scope.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { planCraftReviewDomains } from '@harness-engineering/core';
import { collectCodeCraftPrompts } from '../../src/code-craft';

const SOURCE = [
  'export function computeTotal(items) {',
  '  let total = 0;',
  '  for (const item of items) {',
  '    total += item;',
  '  }',
  '  return total;',
  '}',
].join('\n');

describe('a hook-triggered craft run critiques only files in the diff (criterion 4)', () => {
  let root = '';
  beforeEach(() => {
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'craft-diff-')));
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    // The OUT-OF-DIFF file is the positive control for M-FILES: without a file
    // discovery would find, dropping `files` could not change the outcome and
    // the mutant would prove nothing.
    fs.writeFileSync(path.join(root, 'src', 'in-diff.ts'), SOURCE);
    fs.writeFileSync(path.join(root, 'src', 'out-of-diff.ts'), SOURCE);
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  function promptFiles(runFile: string): string[] {
    const state = JSON.parse(fs.readFileSync(runFile, 'utf-8'));
    return [
      ...new Set((state.meta?.prompts ?? []).map((p: { file: string }) => p.file)),
    ] as string[];
  }

  it('every persisted prompt file is a member of the changed-file set', async () => {
    const changed = ['src/in-diff.ts'];
    const plan = planCraftReviewDomains(
      'harness-autopilot',
      'after:REVIEW',
      changed,
      new Set(['code-craft'])
    );
    expect(plan.files['code-craft']).toEqual(changed);

    // THE HOST CONTRACT: resolve to absolute before forwarding. A relative
    // entry is also resolved against `path` since #2571 (pinned by M-RELATIVE
    // below); before that it read nothing and reported a clean pass.
    const files = plan.files['code-craft'].map((f) => path.join(root, f));
    const out = await collectCodeCraftPrompts({ path: root, siblings: false, files });

    // POSITIVE CONTROL FIRST: `[] subset-of anything` is true, so the
    // membership assertion below is vacuous without this line.
    expect(out.pendingPrompts.length).toBeGreaterThan(0);
    expect(out.runFile).toBeTruthy();
    const seen = promptFiles(out.runFile as string);
    expect(seen.length).toBeGreaterThan(0);
    // SEPARATOR-INSENSITIVE ON PURPOSE, and it is the contract rather than a
    // test convenience. `plan.files` carries repo-relative POSIX paths, the
    // host resolves them with `path.join`/`path.resolve`, and on win32 that
    // round-trip comes back `src\\in-diff.ts` while `changed` holds
    // `src/in-diff.ts`. Criterion 4's membership claim is about WHICH FILES
    // were read, not about how a platform spells a separator. Comparing raw
    // strings made this law pass on posix and fail on win32 CI for a reason
    // that had nothing to do with diff scoping.
    const toPosix = (rel: string): string => rel.split(path.sep).join('/');
    for (const f of seen) {
      expect(changed).toContain(toPosix(path.relative(root, f)));
    }
  });

  // M-FILES is written as an ASSERTION ABOUT THE BROKEN BEHAVIOUR rather than
  // as a source mutation, because the mutation target is the HOST'S PROSE
  // INSTRUCTION — there is no production code path to mutate. It asserts the
  // exact failure a wrong host instruction produces.
  it('M-FILES: dropping the files forwarding admits an out-of-diff file', async () => {
    const out = await collectCodeCraftPrompts({ path: root, siblings: false });
    expect(out.pendingPrompts.length).toBeGreaterThan(0);
    const rel = promptFiles(out.runFile as string).map((f) => path.relative(root, f));
    expect(rel).toContain(path.join('src', 'out-of-diff.ts'));
  });

  it('M-RELATIVE: a repo-relative entry resolves against `path`, never the process cwd (#2571)', async () => {
    // This used to pin the silent zero: the collector read a relative entry
    // against process.cwd(), swallowed the ENOENT and reported status
    // "collected" with ZERO prompts. It now reads the same file the absolute
    // form does, so a host that forgets to resolve still gets a real run.
    expect(fs.existsSync(path.resolve(process.cwd(), 'src', 'in-diff.ts'))).toBe(false);
    const out = await collectCodeCraftPrompts({
      path: root,
      siblings: false,
      files: ['src/in-diff.ts'],
    });
    expect(out.status).toBe('collected');
    expect(out.pendingPrompts.length).toBeGreaterThan(0);
    const toPosix = (rel: string): string => rel.split(path.sep).join('/');
    expect(promptFiles(out.runFile as string).map((f) => toPosix(path.relative(root, f)))).toEqual([
      'src/in-diff.ts',
    ]);
  });
});
