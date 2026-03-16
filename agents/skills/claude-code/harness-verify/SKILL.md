# Harness Verify

> Binary pass/fail quick gate. Runs test, lint, typecheck — returns structured result. No judgment calls, no deep analysis. Pass or fail.

## When to Use

- After every task as a final sanity check
- As the final step in any code-producing skill
- When you need a fast mechanical answer: "does the code compile, lint, and pass tests?"
- NOT for deep verification or architectural review (use `harness-verification` for that)
- NOT for AI-powered code review (use `harness-code-review` for that)

## Relationship to Other Skills

| Skill | What It Does | Time |
|---|---|---|
| **harness-verify** (this) | Mechanical quick gate: typecheck, lint, test | ~30s |
| **harness-verification** | Deep audit: architecture, patterns, edge cases | ~5min |

`harness-verify` is the fast, deterministic gate. `harness-verification` is the slow, thorough audit. They serve different purposes and should not be confused.

## Process

### Phase 1: DETECT

Auto-detect project commands by inspecting the project root:

1. **package.json** — Look for `scripts.test`, `scripts.lint`, `scripts.typecheck` (or `scripts.tsc`, `scripts.type-check`)
2. **Makefile** — Look for `test`, `lint`, `typecheck` targets
3. **Conventions** — Fall back to common commands:
   - Typecheck: `npx tsc --noEmit`, `mypy .`, `go vet ./...`
   - Lint: `npx eslint .`, `ruff check .`, `golangci-lint run`
   - Test: `npm test`, `pytest`, `go test ./...`
4. **Language detection** — Use file extensions to determine which convention set applies

For each of the three checks (typecheck, lint, test), record either the detected command or `NONE` if no command can be determined.

### Phase 2: EXECUTE

Run all detected commands in this order: **typecheck -> lint -> test**.

Rules:
- Run ALL commands regardless of earlier failures. Do not short-circuit.
- Capture exit code, stdout, and stderr for each command.
- Exit code 0 = PASS. Any non-zero exit code = FAIL.
- If a command was `NONE` (not detected), mark that check as `SKIPPED`.
- Run each command from the project root directory.
- Do not modify any files. Do not install dependencies. Do not fix errors.

### Phase 3: REPORT

Output a structured result in this exact format:

```
Verification: [PASS/FAIL]
- Typecheck: [PASS/FAIL/SKIPPED]
- Lint:      [PASS/FAIL/SKIPPED]
- Test:      [PASS/FAIL/SKIPPED]
```

Rules:
- Overall `Verification: PASS` only if all non-skipped checks passed.
- If all checks are SKIPPED, overall result is `PASS` (nothing to fail).
- On FAIL, include a brief summary of what failed (e.g., "3 type errors", "2 lint errors", "5 tests failed") below the structured block.

## Deterministic Checks

This skill is entirely deterministic. There are no LLM judgment calls anywhere in the process.

- Exit code 0 = PASS. Always.
- Exit code non-zero = FAIL. Always.
- No "it looks like this might be okay" reasoning. No interpretation of output.
- The same codebase with the same commands will always produce the same result.

## Gates

- **No judgment calls.** The exit code is the only signal.
- **No skipping.** If a command is detected, it runs. Period.
- **Fresh execution only.** Do not cache results. Do not reuse previous runs. Execute the commands right now.
- **No file modifications.** This skill is read-only (plus command execution). It must not change the codebase.

## Escalation

- **Timeout:** Each command has a 120-second timeout. If a command exceeds this, mark it as FAIL with reason "TIMEOUT".
- **No commands detected:** If no typecheck, lint, or test commands can be detected, all three checks are SKIPPED and the overall result is PASS. Log a note that no verification commands were found.
- **Environment errors:** If a command fails due to missing tooling (e.g., `tsc` not installed), mark it as FAIL. Do not attempt to install the tooling.
