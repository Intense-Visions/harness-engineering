# Plan: Make protect-config fail-closed in ambiguous cases

**Date:** 2026-06-27 | **Spec:** docs/changes/protect-config-fail-closed/proposal.md | **Tasks:** 2 | **Time:** ~10 min | **Integration Tier:** small

## Goal

Flip the two genuinely-ambiguous fail-open branches of the `protect-config` PreToolUse hook (missing/non-string `file_path` and the unexpected-error catch) to fail-closed (`exit 2`) with distinct, honest stderr messages, while preserving fail-open on absent/partial stdin (#1–3) to keep issue-#619 stability.

## Observable Truths (Acceptance Criteria)

1. **Event-driven:** When a well-formed request arrives with valid JSON but missing/non-string `file_path`, the hook shall `exit 2` and write a stderr line containing `could not verify the edit target` (NOT the `protected config file` message).
2. **Unwanted:** If the post-parse processing block throws, then the hook shall not exit 0 — it shall `exit 2` with a distinct fail-closed stderr line.
3. **State-driven:** While stdin is unreadable (#1), empty (#2), or unparseable JSON (#3), the hook shall continue to `exit 0` and write its existing fail-open stderr log.
4. Real protected-file write (e.g. `.eslintrc.json`) → `exit 2` with the original `protected config file` message (unchanged).
5. Normal source-file write (e.g. `src/app.ts`) → `exit 0` (unchanged).
6. The `protect-config.js` header doc comment (`:4`) describes the split policy (fail-open on absent/partial input; fail-closed on a well-formed-but-unresolvable request).
7. `packages/cli/tests/hooks/protect-config.test.ts`: the missing-`file_path` test expects `exit 2` + asserts the distinct message; the malformed-JSON and empty-stdin tests still expect `exit 0`.
8. A changeset for `@harness-engineering/cli` exists under `.changeset/` describing the behavior change.
9. `pnpm --filter @harness-engineering/cli test` is green.

## File Map

- MODIFY `packages/cli/src/hooks/protect-config.js` (header `:4`; branch #4 `:56-59` → exit 2 + new msg; branch #5 `:69-72` → exit 2 + new msg)
- MODIFY `packages/cli/tests/hooks/protect-config.test.ts` (flip missing-`file_path` test `:97-104` to exit 2 + message assertion; keep malformed-JSON `:87` and empty-stdin `:92` at exit 0)
- CREATE `.changeset/protect-config-fail-closed.md`

## Skeleton

_Not produced — task count (2) is below the standard-mode threshold (8)._

## Decisions Made (inherited + planning)

- Selective fail-closed (spec Option B): only #4 (`:56`) and #5 (`:69`) flip to `exit 2`. #1–3 (`:35/:40/:48`) stay `exit 0` with existing logs. No `exit 1` tier — two-code contract preserved (0 allow / 2 block).
- Distinct ambiguous-block message for #4/#5 — never the `protected config file` line (target is unknown, so that message would be untrue).
- **No unexpected-error test added.** Branch #5's `catch` wraps `input?.tool_input?.file_path` optional-chaining plus `basename`/regex on an already-typechecked string. Plain JSON over the `spawnSync` stdin harness cannot express a getter or a non-string `file_path` that survives the #4 `typeof` guard, so the throw is not reproducible through the test interface. Per spec criterion #6 ("add ... if reproducible"), the test is omitted and the reason documented here. Truth #2 is delivered by the implementation flip and code review, not an automated test.
- No change to `PROTECTED_PATTERNS`, `isProtected`, or the `Write|Edit` matcher.

## Uncertainties

- [DEFERRABLE] Exact wording of the two new stderr messages. Plan uses the spec's suggested wording; minor edits during execution are fine as long as the missing-`file_path` message contains `could not verify the edit target` (asserted by the test).
- [ASSUMPTION] Repo-wide `harness validate` has pre-existing, unrelated failures (graph design-token constraint tests; cli `drift` and `craft/llm` circular deps). These are not introduced by this change. The authoritative gate for this work is `pnpm --filter @harness-engineering/cli test`. If `harness validate` newly fails on a `protect-config`-related rule, stop and escalate.

## Tasks

### Task 1: Flip #4/#5 to fail-closed and update tests (TDD)

**Depends on:** none | **Files:** `packages/cli/tests/hooks/protect-config.test.ts`, `packages/cli/src/hooks/protect-config.js`

This is one TDD unit: update the test expectations (red), then change the implementation (green). One atomic commit covering the behavior flip and its test.

1. **Update the test (red step).** In `packages/cli/tests/hooks/protect-config.test.ts`, replace the `'fails open on missing file_path'` test (`:97-104`) with a fail-closed expectation:

   ```ts
   it('fails closed on missing file_path', () => {
     const input = JSON.stringify({
       tool_name: 'Write',
       tool_input: { content: '{}' },
     });
     const { exitCode, stderr } = runHook(input);
     expect(exitCode).toBe(2);
     expect(stderr).toContain('could not verify the edit target');
   });
   ```

   Leave `'fails open on malformed JSON'` (`:87-90`) and `'fails open on empty stdin'` (`:92-95`) unchanged — both still `expect(exitCode).toBe(0)`. Do NOT add an unexpected-error test (not reproducible via stdin — see Decisions Made).

2. **Run the suite — observe failure:**

   ```bash
   pnpm --filter @harness-engineering/cli test -- protect-config
   ```

   Expect the `fails closed on missing file_path` test to FAIL (current code exits 0).

3. **Update the implementation header (`:4`).** In `packages/cli/src/hooks/protect-config.js`, replace the single line:

   ```js
   // Fail-open: parse errors and unexpected exceptions log to stderr and exit 0.
   ```

   with the split-policy comment:

   ```js
   // Fail policy is split by failure mode:
   //   - Absent/partial stdin (unreadable / empty / unparseable JSON): fail-OPEN (exit 0),
   //     logged to stderr. These are the environmental/partial-stdin glitches issue #619
   //     documents; blocking them would self-DoS legitimate writes.
   //   - Well-formed request whose edit target is unresolvable (missing/non-string file_path,
   //     or an unexpected processing error): fail-CLOSED (exit 2) — refuse rather than allow a
   //     potentially unprotected config edit.
   ```

4. **Flip branch #4 (`:56-59`).** Replace:

   ```js
   if (typeof filePath !== 'string' || !filePath) {
     process.stderr.write(
       '[protect-config] Missing file_path in tool input — allowing (fail-open)\n'
     );
     process.exit(0);
   }
   ```

   with:

   ```js
   if (typeof filePath !== 'string' || !filePath) {
     process.stderr.write(
       'BLOCKED: protect-config could not verify the edit target (missing file_path) — refusing to allow a potentially unprotected config edit.\n'
     );
     process.exit(2);
   }
   ```

5. **Flip branch #5 (`:69-72`).** Replace the final `catch` block:

   ```js
   } catch {
     process.stderr.write('[protect-config] Unexpected error — allowing (fail-open)\n');
     process.exit(0);
   }
   ```

   with:

   ```js
   } catch {
     process.stderr.write(
       'BLOCKED: protect-config hit an unexpected error verifying the edit target — refusing fail-closed.\n'
     );
     process.exit(2);
   }
   ```

   Do NOT touch branches #1 (`:35`), #2 (`:40`), or #3 (`:48`) — they keep `exit 0` and their existing stderr logs.

6. **Run the suite — observe pass:**

   ```bash
   pnpm --filter @harness-engineering/cli test -- protect-config
   ```

   All `protect-config` tests green: protected-file blocks (exit 2), normal/tsconfig/pyproject writes allow (exit 0), malformed-JSON and empty-stdin fail open (exit 0), missing-`file_path` fails closed (exit 2 + message).

7. **Run:** `harness validate` (expect only the pre-existing graph/cli-circular-dep noise documented in Uncertainties; no new `protect-config`-related failure).

8. **Commit:** `fix(cli): protect-config fails closed on unresolvable edit target (#619)`

### Task 2: Add changeset and verify full cli suite

**Depends on:** Task 1 | **Files:** `.changeset/protect-config-fail-closed.md` | **Category:** integration

1. **Create** `.changeset/protect-config-fail-closed.md`:

   ```md
   ---
   '@harness-engineering/cli': patch
   ---

   `protect-config` (PreToolUse:Write|Edit hook) now fails CLOSED (exit 2) in two
   ambiguous cases instead of failing open: a well-formed request with a missing/non-string
   `file_path`, and any unexpected error in the post-parse processing block. Both emit a
   distinct stderr line ("could not verify the edit target …") rather than the
   "protected config file" message, since the target is unknown. Absent/partial stdin
   (unreadable, empty, or unparseable JSON) still fails OPEN (exit 0) with its existing log,
   preserving the issue-#619 stability under v8 coverage. Closes the silent-yield security gap
   without re-introducing the self-DoS.
   ```

2. **Run the full cli suite:**

   ```bash
   pnpm --filter @harness-engineering/cli test
   ```

   Expect green.

3. **Run:** `harness validate`

4. `[checkpoint:human-verify]` — Show the green `protect-config` suite output and the two new stderr messages. Confirm the security-posture flip (hook now blocks on unresolvable targets) is the intended behavior before finalizing.

5. **Commit:** `chore(cli): changeset for protect-config fail-closed`

## Sequencing

- Task 1 (test + implementation flip, TDD) → Task 2 (changeset + full-suite verify + human checkpoint). Strictly sequential; no parallelism (single hook, single test file).

## Validation Trace

| Observable Truth                           | Delivered by                                                            |
| ------------------------------------------ | ----------------------------------------------------------------------- |
| 1 (missing file_path → exit 2 + message)   | Task 1 steps 1, 4, 6                                                    |
| 2 (unexpected error → exit 2)              | Task 1 step 5 (code review; not reproducible via stdin)                 |
| 3 (#1–3 stay exit 0 + log)                 | Task 1 steps 5–6 (branches untouched; malformed/empty tests stay green) |
| 4 (real protected file → exit 2 unchanged) | Task 1 step 6 (existing protectedFiles tests)                           |
| 5 (normal write → exit 0 unchanged)        | Task 1 step 6 (existing source/tsconfig/pyproject tests)                |
| 6 (header split policy)                    | Task 1 step 3                                                           |
| 7 (test expectations)                      | Task 1 steps 1, 6                                                       |
| 8 (changeset)                              | Task 2 step 1                                                           |
| 9 (cli suite green)                        | Task 2 step 2                                                           |
