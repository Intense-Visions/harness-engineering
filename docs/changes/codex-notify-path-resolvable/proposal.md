---
feature: codex-notify-path-resolvable
status: proposed
tier: small
issue: Intense-Visions/harness-engineering#1208
keywords:
  - codex
  - notify
  - session-retrospect
  - agent-retrospect
  - portable-config
  - path-resolvable
  - harness-hooks
---

# Codex notify hook should emit a PATH-resolvable command, not an absolute path

## Overview and Goals

`harness update`/`harness hooks init` wire an opt-in end-of-session retrospection
trigger into every supported agent. For Claude, Gemini, and Cursor the trigger is
a shell command that resolves the repo root at runtime
(`git rev-parse --path-format=absolute --git-common-dir`), so the generated config
is machine-independent and safe to commit (`packages/cli/src/commands/hooks/init.ts:92`).

Codex is the exception. Its `notify` key is a raw argv array with **no shell**, and
its notify subprocess CWD is **not guaranteed to be the repo root**
(`packages/cli/src/hooks/session-retrospect-codex.js:20-22`). `writeCodexNotifyHook`
therefore falls back to a hardcoded absolute path
(`packages/cli/src/hooks/agent-retrospect.ts:206`):

```toml
notify = ["node", "/Users/<name>/.../.harness/hooks/session-retrospect-codex.js"]
```

That path is machine-specific. `.codex/config.toml` is a tracked, shared file, so the
line churns per machine and cannot be committed for the team — it breaks other
contributors and CI. This surfaced concretely while committing a `harness update`
sync (commit `f90dc3bb0`), where `.codex/config.toml` had to be excluded for exactly
this reason.

**Goal:** make the generated Codex `notify` line machine-independent and committable,
without changing the already-portable Claude/Gemini/Cursor wiring.

**Non-goals:** migrating the other three agents to the new mechanism; changing the
retrospection behavior itself; adding new lifecycle events.

## Assumptions

- **`harness` is on `PATH`.** The PATH-resolvable command form depends on it, the
  same assumption `.mcp.json` already makes (`"command": "harness"`). If `harness`
  is not on `PATH`, the Codex notify invocation fails — which is acceptable because
  notify is log-only, Codex ignores notify exit codes, and the failure is silent
  (no blocked turn). This is strictly no worse than the old absolute-path form, which
  broke outright on any machine other than the one that generated it.
- **Codex appends the JSON payload as the final argv element** after the configured
  `notify` array, so the process sees
  `harness hooks run session-retrospect-codex '<json>'` regardless of how many fixed
  tokens precede it. Commander parses `<name>` and `[payload]` positionally, so the
  four-token command prefix is transparent to payload extraction
  (verified against `session-retrospect-codex.js:32-53`, which reads the payload from
  the trailing argv element under the current two-token `["node", <path>]` form).

## Decisions Made

- **D1 — Route notify through a PATH-resolvable command.** Emit
  `notify = ["harness", "hooks", "run", "session-retrospect-codex"]` instead of a
  filesystem path to a copied `.js` script. This mirrors the existing convention in
  `.mcp.json`, which launches the server as `"command": "harness"` — the harness
  install already assumes `harness` is on `PATH`. A PATH-resolvable command needs no
  CWD and no absolute path, so it is identical on every machine.

- **D2 — Add the entrypoint as `harness hooks run <name>`, a subcommand of the
  existing `harness hooks` command** (`packages/cli/src/commands/hooks/index.ts`),
  not a new top-level `harness hook`. Reuses the established command namespace and
  its `init`/`list`/`remove`/`add` structure. `run` does not currently collide with
  any existing subcommand.

- **D3 — Change only the Codex generator.** `writeCodexNotifyHook` is the sole site
  edited. Claude/Gemini/Cursor keep their shell + `git rev-parse` form — it is
  already portable and committable, so migrating it would be churn and added risk for
  no benefit (YAGNI). The `harness hooks run` dispatcher is written so additional
  agent hook names can be added later without a redesign, but only the Codex name is
  wired now.

- **D4 — Fail-soft, exit 0 always.** The retrospect hook is log-only; Codex ignores
  notify exit codes. An unknown `<name>`, a missing/malformed payload, disabled
  retrospection, or any thrown error results in `exit 0` — never a non-zero exit and
  never a blocked turn. This preserves the current
  `session-retrospect-codex.js` behavior.

- **D5 — The command runs the retrospect logic bundled in the CLI**, importing
  `retrospectSession` / `retrospectLogLine` / `isRetrospectionEnabled` from
  `packages/cli/src/hooks/session-retrospect-core.js`. It does **not** shell out to a
  copied `.harness/hooks/*.js`, which is what reintroduced the path problem in the
  first place.

## Technical Design

### `harness hooks run <name> [payload]`

New subcommand file `packages/cli/src/commands/hooks/run.ts`, registered in
`packages/cli/src/commands/hooks/index.ts` via `command.addCommand(createRunCommand())`.

Behavior:

1. Resolve `<name>` against a dispatch table. The only wired entry is
   `session-retrospect-codex`. An unknown name → `exit 0` (fail-soft, D4).
2. For `session-retrospect-codex`, replicate the payload contract already documented
   in `session-retrospect-codex.js:32-53`:
   - The Codex JSON payload arrives as a single positional argv element
     (`payload` argument). Codex appends it after the configured argv, so the
     process sees `harness hooks run session-retrospect-codex '<json>'`.
   - Parse it as JSON; on parse failure → `exit 0`.
   - `sessionId = payload['thread-id']` (falls back to `'unknown'`).
   - `cwd = payload.cwd` (falls back to `process.cwd()`), because the notify
     subprocess CWD is not guaranteed to be the project.
3. Call `retrospectSession({ cwd, sessionId })`, then
   `retrospectLogLine('session-retrospect-codex', result)`; write any line to stderr.
4. `exit 0` in all paths, including the catch (D4).

`isRetrospectionEnabled()` gating is preserved by `retrospectSession` /
the core exactly as today (runtime no-op unless `HARNESS_SESSION_RETROSPECTION` is set).

To avoid duplicating the ~12-line Codex payload-parsing block between
`run.ts` and the copied `session-retrospect-codex.js`, extract a small shared helper
`parseCodexNotifyPayload(raw): { sessionId, cwd } | null` into
`session-retrospect-core.js` and have both call it. (Implementation detail; the
executor may keep them separate if the import boundary between the compiled TS
command and the shipped `.js` core proves awkward — behavior is the contract, not the
factoring.)

### Generator change

`packages/cli/src/hooks/agent-retrospect.ts`:

- `writeCodexNotifyHook(configPath)` — the `scriptPath` parameter is removed; the
  emitted line becomes:

  ```ts
  const notifyLine = `notify = ["harness", "hooks", "run", "session-retrospect-codex"]`;
  ```

  The idempotency/conflict detection (`notifyLineRe`, `scriptMarker`) is updated: the
  "ours" marker changes from `session-retrospect-codex.js` to a stable token in the
  new line (e.g. `"session-retrospect-codex"` still appears, so the marker can stay
  the same string). Existing non-harness `notify` is still reported as `conflict` and
  left untouched.

- `installAgentRetrospectHooks` — the Codex branch no longer computes
  `scriptPath` (`agent-retrospect.ts:253`); it calls `writeCodexNotifyHook(configPath)`.

### Migration of an already-installed absolute-path line

A project that previously ran `harness update` has the old absolute-path `notify`
line committed or on disk. Because the marker token `session-retrospect-codex` is
present in both the old and new lines, the current logic would treat the old line as
"ours already" and return `skipped`, leaving the stale absolute path in place.

**Recognition rule.** Classify an existing `notify` line into three cases:

1. **New form** — the line equals (modulo whitespace) the new
   `["harness", "hooks", "run", "session-retrospect-codex"]` array → `skipped`
   (idempotent no-op).
2. **Old harness form** — the line references `session-retrospect-codex.js` (the
   copied entry script the harness itself previously emitted) → **rewrite in place**
   to the new form and return `installed` (an upgrade). Ownership is proven by the
   `.js` script marker, which only the harness generator ever wrote.
3. **Foreign** — any other `notify` (no `session-retrospect-codex` marker at all) →
   `conflict`, left untouched.

This is the one behavior subtlety and is covered by a dedicated test per case.

## Integration Points

- **Entry Points:** New CLI subcommand `harness hooks run <name> [payload]`
  (`packages/cli/src/commands/hooks/run.ts`). No new MCP tool, skill, or route.
- **Registrations Required:** Register `createRunCommand()` in
  `packages/cli/src/commands/hooks/index.ts`. No barrel-export regeneration is needed
  (the `hooks` subcommands are wired inside `index.ts`, not the auto-generated
  `_registry.ts`). Regenerate the generated CLI reference doc so `hooks run` appears.
- **Documentation Updates:** Regenerate the generated CLI command reference
  (`pnpm` doc-gen). Update the `writeCodexNotifyHook` doc comment
  (`agent-retrospect.ts:178-192`) and the `session-retrospect-codex.js` header note
  that currently says notify points at an absolute path.
- **Architectural Decisions:** None rise to a standalone ADR (small change; the
  decisions above are captured here).
- **Knowledge Impact:** One durable fact worth recording — "Codex `notify` is
  shell-less and CWD-unstable, so agent triggers for Codex must be PATH-resolvable
  commands, not filesystem paths." Useful the next time a Codex lifecycle seam is wired.

## Success Criteria

1. **Portable output:** After `harness hooks init`/`harness update` in a project with
   a `.codex/` dir, `.codex/config.toml` contains
   `notify = ["harness", "hooks", "run", "session-retrospect-codex"]` and **no
   absolute filesystem path**. (Testable: assert the generated string; assert it
   contains no `/` outside the command tokens.)
2. **Machine-independent:** the generated line is byte-identical regardless of the
   project's absolute location. (Testable: run the generator from two different
   `projectDir` roots; assert equal output.)
3. **Functionally equivalent:** `harness hooks run session-retrospect-codex '<json>'`
   with a payload carrying `thread-id` and `cwd` performs the same retrospection as
   the old `node .harness/hooks/session-retrospect-codex.js '<json>'` path, gated by
   `HARNESS_SESSION_RETROSPECTION`. (Testable: with retrospection enabled, both
   archive the session once for a given `thread-id`; with it unset, both no-op.)
4. **Fail-soft:** unknown name, empty/malformed payload, and thrown errors all exit 0
   and never throw. (Testable: `run bogus-name`, `run session-retrospect-codex` with
   no payload, and `run … 'not json'` each exit 0.)
5. **Idempotent + non-clobbering:** re-running the generator is a no-op on the new
   line; an existing foreign `notify` is still reported `conflict` and left untouched;
   an existing **old absolute-path** harness line is upgraded in place to the new form.
6. **Other agents unchanged:** the Claude/Gemini/Cursor generated commands are
   byte-identical to before. (Testable: existing agent-retrospect tests for those
   three still pass unmodified.)
7. `harness validate`, lint, typecheck, and the full CLI test suite pass.

## Implementation Order

This is one cohesive change — a new subcommand, a one-function generator edit, and
doc regen that share files and must land together — so it is a single implementation
phase. The planner decomposes it into tasks (command, generator, tests, docs) in
dependency order.

### Phase 1: Portable Codex notify command <!-- complexity: low -->

1. **Command.** Add `packages/cli/src/commands/hooks/run.ts` (`createRunCommand`) with
   the Codex dispatch + fail-soft behavior; register it in `hooks/index.ts`. Extract
   `parseCodexNotifyPayload` into `session-retrospect-core.js` if the import boundary
   is clean. Unit tests for dispatch, payload parsing, and the four fail-soft paths
   (criteria 3, 4).
2. **Generator.** Update `writeCodexNotifyHook` + the Codex branch of
   `installAgentRetrospectHooks` to emit the PATH-resolvable line and to upgrade an
   old absolute-path line in place (recognition rule: new form → skip; old
   `session-retrospect-codex.js` form → rewrite; foreign → conflict). Tests for
   portable output, machine-independence, idempotency, conflict, and in-place upgrade
   (criteria 1, 2, 5); assert the other three agents are unchanged (criterion 6).
3. **Docs + regen.** Update the two doc comments (`agent-retrospect.ts:178-192` and
   the `session-retrospect-codex.js` header); regenerate the CLI reference doc. Run
   `harness validate` + full CI checks (criterion 7).

### Post-merge follow-up (not an autopilot phase)

Re-run `harness update` locally and commit the now-portable `.codex/config.toml`.
Excluded from this change's diff because it depends on the published CLI carrying the
new generator; it is a manual step the author performs after merge.
