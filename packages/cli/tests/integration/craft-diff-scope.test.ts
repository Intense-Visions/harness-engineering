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

    // THE HOST CONTRACT: resolve to absolute before forwarding. Measured: the
    // relative form yields status "collected" with ZERO prompts — a clean
    // report from a run that read nothing (pinned by M-RELATIVE below).
    const files = plan.files['code-craft'].map((f) => path.join(root, f));
    const out = await collectCodeCraftPrompts({ path: root, siblings: false, files });

    // POSITIVE CONTROL FIRST: `[] subset-of anything` is true, so the
    // membership assertion below is vacuous without this line.
    expect(out.pendingPrompts.length).toBeGreaterThan(0);
    expect(out.runFile).toBeTruthy();
    const seen = promptFiles(out.runFile as string);
    expect(seen.length).toBeGreaterThan(0);
    for (const f of seen) {
      expect(changed).toContain(path.relative(root, f));
    }
  });

  // M-FILES and M-RELATIVE are written as ASSERTIONS ABOUT THE BROKEN
  // BEHAVIOUR rather than as source mutations, because the mutation target is
  // the HOST'S PROSE INSTRUCTION — there is no production code path to mutate.
  // Each asserts the exact failure a wrong host instruction produces, so each
  // goes red if the collector's behaviour changes under it.
  it('M-FILES: dropping the files forwarding admits an out-of-diff file', async () => {
    const out = await collectCodeCraftPrompts({ path: root, siblings: false });
    expect(out.pendingPrompts.length).toBeGreaterThan(0);
    const rel = promptFiles(out.runFile as string).map((f) => path.relative(root, f));
    expect(rel).toContain(path.join('src', 'out-of-diff.ts'));
  });

  it('M-RELATIVE: forwarding repo-relative paths unresolved reads nothing', async () => {
    const out = await collectCodeCraftPrompts({
      path: root,
      siblings: false,
      files: ['src/in-diff.ts'],
    });
    // The shape of the silent zero this phase's host contract exists to
    // prevent: a confident clean pass from a run that opened no file.
    expect(out.status).toBe('collected');
    expect(out.pendingPrompts.length).toBe(0);
  });
});
