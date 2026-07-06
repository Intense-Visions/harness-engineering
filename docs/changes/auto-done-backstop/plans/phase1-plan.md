# Plan: Auto-Done Backstop — resilient merge-triggered roadmap auto-done

**Date:** 2026-07-02 | **Branch:** `fix/auto-done-backstop` (off `main`) | **Tasks:** 9 | **Time:** ~40 min | **Integration Tier:** medium

## Goal

When a merged PR fails to formally close its linked issue (malformed/missing closing keyword), the roadmap auto-done workflow still flips the matching roadmap row to `done` by falling back to issue references parsed from the PR body+title — and the autopilot skill now instructs agents to emit a well-formed `Closes #<N>` line so the malformed-keyword cause is prevented.

## Root Cause (verified — do not re-derive)

`.github/workflows/roadmap-auto-done.yml` flips rows only from the PR's GitHub `closingIssuesReferences`. A malformed closing keyword (e.g. `Closes roadmap #569`) leaves that list empty, so the workflow logs "nothing to reconcile" and the row stays `planned`. Observed twice (harness-pm #566/PR#660, senior-accountability #569/PR#734).

## Observable Truths (Acceptance Criteria)

1. **[ADDED]** A pure exported function `parseReferencedIssues(text: string): number[]` (in `packages/core`) extracts issue numbers from `#123`, `Closes/Fixes/Resolves #123`, and `owner/repo#123`; dedupes; and ignores bare numbers without `#`. Verified by `packages/core/tests/roadmap/referenced-issues.test.ts` (table-driven, all pass on Node 22).
2. **[ADDED]** `harness roadmap referenced-issues` reads text from stdin and prints the parsed issue numbers (one per line). Verified by `packages/cli/tests/commands/roadmap/referenced-issues.test.ts`.
3. **[MODIFIED]** `.github/workflows/roadmap-auto-done.yml` contains a fallback step that runs ONLY when `steps.closing.outputs.refs == ''`: it parses the merged PR body+title via `harness roadmap referenced-issues`, filters each referenced issue to `state==CLOSED && stateReason∈{COMPLETED, null/unknown}` via `gh issue view`, builds `owner/repo#<n>` refs against this repo, and passes them to `harness roadmap reconcile --from-refs`.
4. **[MODIFIED]** The regen, commit-and-push (rebase-retry loop), and aggregate-staging steps run for BOTH the primary and the fallback path (their `if:` guards fire when either `closing.outputs.refs` OR the new fallback refs are non-empty).
5. **[UNMODIFIED]** When neither the primary nor the fallback produces refs, the workflow no-ops (no commit). No full offline sweep is triggered.
6. **[MODIFIED]** `packages/cli/tests/ci/roadmap-auto-done-workflow.test.ts` asserts the fallback step exists, is gated on empty primary refs, filters on closed+completed, and feeds `reconcile --from-refs`.
7. **[MODIFIED]** All 4 `harness-autopilot/SKILL.md` files (claude-code, gemini-cli, codex, cursor) instruct: when opening a feature PR at DONE, include a bare `Closes #<N>` line (N from the roadmap row's `External-ID`) with the keyword IMMEDIATELY before the ref, and carry a Rationalizations-to-Reject entry for the malformed-keyword failure mode. The 4 files remain byte-identical.
8. The platform-parity test (`agents/skills/tests/platform-parity.test.ts`) passes.
9. `harness validate` passes at the same baseline as before this change (no NEW failures introduced by these files).

## File Map

```
CREATE packages/core/src/roadmap/referenced-issues.ts
CREATE packages/core/tests/roadmap/referenced-issues.test.ts
MODIFY packages/core/src/roadmap/index.ts                       (export parseReferencedIssues)
CREATE packages/cli/src/commands/roadmap/referenced-issues.ts
CREATE packages/cli/tests/commands/roadmap/referenced-issues.test.ts
MODIFY packages/cli/src/commands/roadmap/index.ts               (register subcommand)
MODIFY .github/workflows/roadmap-auto-done.yml                  (fallback step + broadened if: guards)
MODIFY packages/cli/tests/ci/roadmap-auto-done-workflow.test.ts (assert fallback behavior)
MODIFY agents/skills/claude-code/harness-autopilot/SKILL.md     (PR-body guidance + rationalization)
MODIFY agents/skills/gemini-cli/harness-autopilot/SKILL.md      (identical mirror)
MODIFY agents/skills/codex/harness-autopilot/SKILL.md           (identical mirror)
MODIFY agents/skills/cursor/harness-autopilot/SKILL.md          (identical mirror)
REGEN  slash commands / catalog (derived from skill edits)
```

## Design Decisions (decided — do not re-open)

- **Parser location:** `packages/core/src/roadmap/referenced-issues.ts`, exported from the core roadmap barrel. Pure and unit-tested in isolation.
- **Workflow invocation:** a thin `harness roadmap referenced-issues` CLI subcommand (reads stdin, prints numbers) rather than an inline `node -e`. Rationale: the workflow already runs `pnpm build`; a real subcommand avoids fragile inline-JS shell quoting and is directly unit-testable. (Chosen per the prompt's "planner chooses the more testable option".)
- **Reconciler core is unchanged.** `--from-refs` already matches against row External-IDs and safely ignores unmatched refs. The fallback only _supplies_ refs; matching stays as-is.
- **No full offline sweep.** Fallback is scoped to issues THIS PR references. A periodic full-sweep reconcile is a **possible future follow-up — NOT implemented here** (see Deferred Follow-ups).
- **Self-correcting risk (documented in the workflow comment):** a PR that merely mentions an unrelated closed-completed issue whose number matches a roadmap row's External-ID could flip that row. This requires BOTH a matching External-ID AND a closed-completed issue; acceptable and self-correcting.

## Uncertainties

- **[DEFERRABLE]** `harness validate` currently exits non-zero due to PRE-EXISTING design-token warnings in `packages/graph/tests/constraints/DesignConstraintAdapter.test.ts` (unrelated fixtures this plan does not touch). Baseline is "no NEW failures", not "green". Verify per-task via targeted test runs; the final validate compares against this known baseline.
- **[ASSUMPTION]** `gh issue view <n> --json state,stateReason` is available on the GitHub Actions runner (it uses the same `gh`/`GH_TOKEN` already present in the workflow). If unavailable, Task 6 needs a `gh api` fallback.
- **[ASSUMPTION]** Slash-command/catalog regeneration for skill edits is `harness generate-slash-commands` (or repo-standard regen). Task 9 confirms the exact command from repo scripts before running.

## Skeleton

1. Core parser with TDD (~2 tasks, ~9 min)
2. CLI subcommand wrapper with TDD (~2 tasks, ~9 min)
3. Workflow fallback step + workflow test (~3 tasks, ~13 min)
4. Autopilot skill prevention guidance across 4 mirrors + regen (~2 tasks, ~9 min)

**Estimated total:** 9 tasks, ~40 minutes. _Skeleton approval requested below (standard rigor, 9 tasks ≥ 8 threshold)._

---

## Tasks

### Task 1: Write failing table-driven tests for `parseReferencedIssues`

**Depends on:** none | **Files:** `packages/core/tests/roadmap/referenced-issues.test.ts`

1. Create `packages/core/tests/roadmap/referenced-issues.test.ts`:

   ```ts
   import { describe, it, expect } from 'vitest';
   import { parseReferencedIssues } from '../../src/roadmap/referenced-issues';

   describe('parseReferencedIssues', () => {
     const cases: Array<{ name: string; input: string; expected: number[] }> = [
       { name: 'bare hash ref', input: 'see #123', expected: [123] },
       { name: 'closing keyword immediately before ref', input: 'Closes #569', expected: [569] },
       { name: 'fixes keyword', input: 'Fixes #7', expected: [7] },
       { name: 'resolves keyword', input: 'Resolves #42', expected: [42] },
       {
         name: 'malformed keyword still yields the ref',
         input: 'Closes roadmap #569',
         expected: [569],
       },
       { name: 'owner/repo#n form', input: 'closes acme/widgets#88', expected: [88] },
       { name: 'dedupes repeats', input: '#5 and Closes #5', expected: [5] },
       { name: 'ignores bare numbers without hash', input: 'issue 123 and PR 456', expected: [] },
       {
         name: 'multiple distinct refs preserve first-seen order',
         input: '#3 then #1 then #2',
         expected: [3, 1, 2],
       },
       { name: 'empty text', input: '', expected: [] },
       {
         name: 'ignores markdown headings that look numeric',
         input: '## 12 things\n#34',
         expected: [34],
       },
     ];
     it.each(cases)('$name', ({ input, expected }) => {
       expect(parseReferencedIssues(input)).toEqual(expected);
     });
   });
   ```

2. Run (Node 22): `export PATH="$HOME/.nvm/versions/node/v22.20.0/bin:$PATH" && pnpm --filter @harness-engineering/core exec vitest run tests/roadmap/referenced-issues.test.ts` — observe failure (module not found).
3. Commit: `test(roadmap): failing tests for parseReferencedIssues parser`

### Task 2: Implement `parseReferencedIssues` and export it

**Depends on:** Task 1 | **Files:** `packages/core/src/roadmap/referenced-issues.ts`, `packages/core/src/roadmap/index.ts`

1. Create `packages/core/src/roadmap/referenced-issues.ts`:
   ```ts
   /**
    * Extract GitHub issue references from arbitrary PR text (body + title).
    *
    * Backstop for the roadmap auto-done workflow: when a PR's malformed closing
    * keyword (e.g. `Closes roadmap #569`) leaves GitHub's `closingIssuesReferences`
    * empty, the workflow parses references from raw text instead. Matches `#123`,
    * `Closes/Fixes/Resolves #123`, and `owner/repo#123`; dedupes preserving
    * first-seen order; ignores bare numbers with no leading `#` (noise).
    */
   export function parseReferencedIssues(text: string): number[] {
     if (!text) return [];
     // A `#` optionally preceded by `owner/repo`, then the digits. The `#` is
     // mandatory, so a bare number (e.g. "issue 123") never matches.
     const re = /(?:[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)?#(\d+)/g;
     const seen = new Set<number>();
     const out: number[] = [];
     for (const m of text.matchAll(re)) {
       const n = Number.parseInt(m[1]!, 10);
       if (Number.isInteger(n) && n > 0 && !seen.has(n)) {
         seen.add(n);
         out.push(n);
       }
     }
     return out;
   }
   ```
2. Add to `packages/core/src/roadmap/index.ts` (near the other roadmap exports):
   ```ts
   export { parseReferencedIssues } from './referenced-issues';
   ```
3. Run (Node 22): `export PATH="$HOME/.nvm/versions/node/v22.20.0/bin:$PATH" && pnpm --filter @harness-engineering/core exec vitest run tests/roadmap/referenced-issues.test.ts` — observe all pass.
4. Run (Node 22): `export PATH="$HOME/.nvm/versions/node/v22.20.0/bin:$PATH" && node packages/cli/dist/bin/harness.js check-deps` — confirm no dependency violations from the new module.
5. Commit: `feat(roadmap): add parseReferencedIssues PR-text parser`

### Task 3: Write failing test for `harness roadmap referenced-issues` subcommand

**Depends on:** Task 2 | **Files:** `packages/cli/tests/commands/roadmap/referenced-issues.test.ts`

1. Create `packages/cli/tests/commands/roadmap/referenced-issues.test.ts` — test the exported action/handler directly (capture printed output; do NOT spawn a shell). Mirror the existing reconcile-test invocation style in `packages/cli/tests/commands/roadmap/reconcile.test.ts`:

   ```ts
   import { describe, it, expect, vi } from 'vitest';
   import { runReferencedIssues } from '../../../src/commands/roadmap/referenced-issues';

   describe('roadmap referenced-issues', () => {
     it('prints one issue number per line for well-formed and malformed refs', () => {
       const lines: string[] = [];
       runReferencedIssues('Closes roadmap #569\nsee #12', (l) => lines.push(l));
       expect(lines).toEqual(['569', '12']);
     });
     it('prints nothing when no refs are present', () => {
       const lines: string[] = [];
       runReferencedIssues('no refs here, issue 123', (l) => lines.push(l));
       expect(lines).toEqual([]);
     });
   });
   ```

2. Run (Node 22): `export PATH="$HOME/.nvm/versions/node/v22.20.0/bin:$PATH" && pnpm --filter @harness-engineering/cli exec vitest run tests/commands/roadmap/referenced-issues.test.ts` — observe failure.
3. Commit: `test(roadmap): failing test for referenced-issues subcommand`

### Task 4: Implement `harness roadmap referenced-issues` and register it

**Depends on:** Task 3 | **Files:** `packages/cli/src/commands/roadmap/referenced-issues.ts`, `packages/cli/src/commands/roadmap/index.ts`

1. Create `packages/cli/src/commands/roadmap/referenced-issues.ts`:

   ```ts
   import { Command } from 'commander';
   import { parseReferencedIssues } from '@harness-engineering/core';

   /** Testable core: parse `text` and emit each issue number via `print`. */
   export function runReferencedIssues(text: string, print: (line: string) => void): void {
     for (const n of parseReferencedIssues(text)) print(String(n));
   }

   /** `harness roadmap referenced-issues` — reads PR text from stdin, prints issue numbers (one per line). */
   export function createRoadmapReferencedIssuesCommand(): Command {
     return new Command('referenced-issues')
       .description(
         'Parse issue references (#N, Closes/Fixes/Resolves #N, owner/repo#N) from stdin ' +
           'text (PR body + title) and print each issue number on its own line. Backstop ' +
           "for auto-done when a PR's closing keyword is malformed."
       )
       .action(async () => {
         const chunks: Buffer[] = [];
         for await (const c of process.stdin) chunks.push(c as Buffer);
         const text = Buffer.concat(chunks).toString('utf8');
         runReferencedIssues(text, (line) => process.stdout.write(line + '\n'));
       });
   }
   ```

2. Register in `packages/cli/src/commands/roadmap/index.ts`:
   - Add import: `import { createRoadmapReferencedIssuesCommand } from './referenced-issues';`
   - Add `roadmap.addCommand(createRoadmapReferencedIssuesCommand());` after the reconcile registration.
3. Run (Node 22): `export PATH="$HOME/.nvm/versions/node/v22.20.0/bin:$PATH" && pnpm --filter @harness-engineering/cli exec vitest run tests/commands/roadmap/referenced-issues.test.ts` — observe pass.
4. Run (Node 22): `export PATH="$HOME/.nvm/versions/node/v22.20.0/bin:$PATH" && pnpm build && printf 'Closes roadmap #569\nsee #12' | node packages/cli/dist/bin/harness.js roadmap referenced-issues` — observe `569` then `12`.
5. Commit: `feat(roadmap): add referenced-issues CLI subcommand`

### Task 5: Write failing workflow-contract assertions for the fallback path

**Depends on:** Task 4 | **Files:** `packages/cli/tests/ci/roadmap-auto-done-workflow.test.ts`

1. Add a new `describe`/`it` block to `packages/cli/tests/ci/roadmap-auto-done-workflow.test.ts` (keep existing tests intact). Assert against the parsed workflow (`raw`, `stepRuns`, `job.steps`):
   ```ts
   describe('roadmap-auto-done fallback (malformed closing keyword)', () => {
     it('has a fallback step gated on the primary closing refs being empty', () => {
       const fallback = job.steps.find((s) => (s.run ?? '').includes('roadmap referenced-issues'));
       expect(fallback).toBeDefined();
       // Runs ONLY when the authoritative closingIssuesReferences list is empty.
       expect(fallback!.if ?? '').toMatch(/steps\.closing\.outputs\.refs\s*==\s*''/);
     });
     it('filters referenced issues to closed + completed via gh before reconciling', () => {
       expect(stepRuns).toMatch(/gh issue view/);
       expect(stepRuns).toMatch(/state/);
       expect(stepRuns).toMatch(/CLOSED/);
     });
     it('feeds the fallback refs into reconcile --from-refs', () => {
       // Both primary and fallback ultimately drive `reconcile --from-refs`.
       expect(stepRuns).toMatch(/roadmap reconcile --from-refs/);
     });
     it('runs regen and commit-push for the fallback path too (guards include fallback refs)', () => {
       const commitStep = job.steps.find((s) => (s.run ?? '').includes('git push'));
       expect(commitStep).toBeDefined();
       // The commit/regen guards must fire when EITHER primary or fallback refs exist.
       expect(commitStep!.if ?? '').toMatch(/fallback/);
     });
   });
   ```
2. Run (Node 22): `export PATH="$HOME/.nvm/versions/node/v22.20.0/bin:$PATH" && pnpm --filter @harness-engineering/cli exec vitest run tests/ci/roadmap-auto-done-workflow.test.ts` — observe the new block failing.
3. Commit: `test(ci): failing assertions for auto-done fallback path`

### Task 6: Add the fallback step to the workflow and broaden the downstream guards

**Depends on:** Task 5 | **Files:** `.github/workflows/roadmap-auto-done.yml`

1. Insert a fallback step AFTER the "Reconcile auto-done" step and BEFORE "Regenerate the aggregate when sharded". Set `id: fallback` and gate it on empty primary refs. The step:
   - Fetches the merged PR body+title via `gh pr view <n> --json body,title`.
   - Pipes `body + '\n' + title` into `node packages/cli/dist/bin/harness.js roadmap referenced-issues` to get candidate issue numbers.
   - For each number, runs `gh issue view <n> --json state,stateReason` and keeps it only when `state == "CLOSED"` and `stateReason` is `COMPLETED` OR empty/null (mirror `isCompletedClose`).
   - Builds `owner/repo#<n>` refs against `${{ github.repository }}` and writes them to `$GITHUB_OUTPUT` as `refs=...`.
   - Includes a comment documenting the self-correcting risk (a PR merely mentioning an unrelated closed-completed issue whose number collides with a row External-ID could flip that row; requires both a matching External-ID and a closed-completed issue; acceptable).

   ```yaml
   - name: Fallback — parse referenced issues when no formal closing refs
     id: fallback
     if: steps.closing.outputs.refs == ''
     env:
       GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
     run: |
       # The primary path (closingIssuesReferences) was empty — usually a
       # malformed closing keyword in the PR body (e.g. "Closes roadmap #569":
       # the intervening word breaks GitHub's parser). Fall back to references
       # PARSED from the raw PR body+title, then keep only issues this repo
       # closed as completed. SELF-CORRECTING RISK: a PR that merely mentions an
       # unrelated closed-completed issue whose number matches a roadmap row's
       # External-ID can flip that row. Requires BOTH a matching External-ID AND
       # a closed-completed issue — an acceptable, scoped, self-correcting risk.
       # We deliberately do NOT trigger a full offline sweep here.
       PR=${{ github.event.pull_request.number }}
       TEXT=$(gh pr view "$PR" --json body,title --jq '.body + "\n" + .title')
       NUMS=$(printf '%s' "$TEXT" | node packages/cli/dist/bin/harness.js roadmap referenced-issues)
       REFS=""
       for n in $NUMS; do
         STATE=$(gh issue view "$n" --json state --jq '.state' 2>/dev/null || echo "")
         REASON=$(gh issue view "$n" --json stateReason --jq '.stateReason' 2>/dev/null || echo "")
         if [ "$STATE" = "CLOSED" ] && { [ "$REASON" = "COMPLETED" ] || [ -z "$REASON" ] || [ "$REASON" = "null" ]; }; then
           REF="${{ github.repository }}#$n"
           REFS="${REFS:+$REFS,}$REF"
         fi
       done
       echo "refs=$REFS" >> "$GITHUB_OUTPUT"
       if [ -z "$REFS" ]; then
         echo "Fallback found no closed-completed referenced issues; nothing to reconcile."
       else
         echo "Fallback closing issue refs: $REFS"
       fi

   - name: Reconcile auto-done (fallback)
     if: steps.closing.outputs.refs == '' && steps.fallback.outputs.refs != ''
     run: node packages/cli/dist/bin/harness.js roadmap reconcile --from-refs "${{ steps.fallback.outputs.refs }}"
   ```

2. Broaden the `if:` guards on the "Regenerate the aggregate when sharded" and "Commit and push the shard flip" steps so they fire for EITHER path. Replace `if: steps.closing.outputs.refs != ''` with:
   ```yaml
   if: steps.closing.outputs.refs != '' || steps.fallback.outputs.refs != ''
   ```
   (The token `fallback` in these guards satisfies the Task 5 assertion.)
3. Run (Node 22): `export PATH="$HOME/.nvm/versions/node/v22.20.0/bin:$PATH" && pnpm --filter @harness-engineering/cli exec vitest run tests/ci/roadmap-auto-done-workflow.test.ts` — observe all pass (old + new block).
4. Validate YAML parses: `export PATH="$HOME/.nvm/versions/node/v22.20.0/bin:$PATH" && node -e "require('yaml').parse(require('fs').readFileSync('.github/workflows/roadmap-auto-done.yml','utf8')); console.log('yaml ok')"`
5. Commit: `fix(ci): backstop auto-done via parsed PR refs when closing keyword is malformed`

### Task 7: Update the autopilot skill PR guidance (claude-code canonical)

**Depends on:** Task 6 | **Files:** `agents/skills/claude-code/harness-autopilot/SKILL.md`

1. In the `### DONE` section, expand step 2 ("Ask 'Create a PR? (yes / no)'") to add PR-body guidance. Replace that line with:
   ```
   2. Ask "Create a PR? (yes / no)." When creating the PR, include a bare closing line `Closes #<N>` where `<N>` is the issue number from the roadmap row's `External-ID`. The keyword MUST sit IMMEDIATELY before the ref — no intervening words (`Closes #<N>`, never `Closes roadmap #<N>`), or GitHub will not link/close the issue and roadmap auto-done will skip the row.
   ```
2. Add a row to the "Rationalizations to Reject" table:
   ```
   | "`Closes roadmap #123` reads fine, GitHub will figure out the issue" | An intervening word breaks GitHub's closing-keyword parser: `closingIssuesReferences` stays empty and auto-done leaves the row `planned`. Use a bare `Closes #123`. |
   ```
3. Do NOT remove or reorder any section (Examples / Escalation / Gates / Rationalizations / Success Criteria must remain).
4. Run (Node 22) rigid-skill/structure checks: `export PATH="$HOME/.nvm/versions/node/v22.20.0/bin:$PATH" && pnpm exec vitest run agents/skills/tests/structure.test.ts` — observe pass.
5. Commit: `docs(autopilot): require bare Closes #N line in PR body (claude-code)`

### Task 8: Mirror the skill edit to the 3 other platforms (byte-identical)

**Depends on:** Task 7 | **Files:** `agents/skills/gemini-cli/harness-autopilot/SKILL.md`, `agents/skills/codex/harness-autopilot/SKILL.md`, `agents/skills/cursor/harness-autopilot/SKILL.md`

1. Copy the canonical file to each mirror so all 4 are byte-identical:
   ```bash
   export PATH="$HOME/.nvm/versions/node/v22.20.0/bin:$PATH"
   for p in gemini-cli codex cursor; do
     cp agents/skills/claude-code/harness-autopilot/SKILL.md "agents/skills/$p/harness-autopilot/SKILL.md"
   done
   ```
2. Run (Node 22) the parity test: `export PATH="$HOME/.nvm/versions/node/v22.20.0/bin:$PATH" && pnpm exec vitest run agents/skills/tests/platform-parity.test.ts` — observe pass.
3. Commit: `docs(autopilot): mirror PR-body guidance across gemini-cli/codex/cursor`

### Task 9: Regenerate derived skill artifacts

**Depends on:** Task 8 | **Files:** derived slash-command / catalog artifacts | **Category:** integration

1. Confirm the repo's regen command (check `package.json` scripts and `packages/cli/src/commands/generate-slash-commands.ts`). Likely: `export PATH="$HOME/.nvm/versions/node/v22.20.0/bin:$PATH" && node packages/cli/dist/bin/harness.js generate-slash-commands` (or the repo-standard `pnpm` script).
2. Run the regen command. Inspect `git status` for regenerated slash-command/catalog files.
3. `[checkpoint:human-verify]` — Show the diff of regenerated artifacts. Confirm only expected autopilot-derived files changed (no unrelated skills churned).
4. Run (Node 22): `export PATH="$HOME/.nvm/versions/node/v22.20.0/bin:$PATH" && node packages/cli/dist/bin/harness.js validate` — confirm no NEW failures vs. the pre-existing design-token baseline noted in Uncertainties.
5. Commit: `chore(autopilot): regenerate slash commands after PR-body guidance`

---

## Sequencing & Dependencies

- Tasks 1→2 (core parser) before 3→4 (CLI wrapper depends on the core export).
- Tasks 3→4 before 5→6 (workflow calls the built subcommand).
- Task 6 (workflow) is independent of 7-9 (skill) but sequenced after for a clean linear history.
- Tasks 7→8→9 (skill edit → mirror → regen) are strictly ordered; parity requires the mirror before regen.
- No cycles. Parser (core) → CLI → workflow, and skill → mirror → regen are two independent chains; both land on `harness validate`.

## Deferred Follow-ups (NOT in this plan)

- **Periodic full-sweep reconcile** (scheduled workflow running `harness roadmap reconcile` with no refs to catch rows missed by both the primary and fallback paths). Deliberately out of scope — this fix stays scoped to issues the merged PR references.

## Traceability

| Observable Truth                    | Tasks                |
| ----------------------------------- | -------------------- |
| 1 (core parser)                     | 1, 2                 |
| 2 (CLI subcommand)                  | 3, 4                 |
| 3 (workflow fallback step)          | 5, 6                 |
| 4 (guards broadened for fallback)   | 5, 6                 |
| 5 (no full sweep)                   | 6 (design), Deferred |
| 6 (workflow test)                   | 5, 6                 |
| 7 (skill guidance across 4 mirrors) | 7, 8                 |
| 8 (parity test)                     | 8                    |
| 9 (validate baseline)               | 9                    |
