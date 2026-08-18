# Plan — Spill-to-disk with a followup-readable locator (#1398)

## Problem

Long-running harness sessions (fleet workers, autopilot loops) accumulate large
intermediate tool output — full test logs, whole diffs, grep/glob overflow.
Inlining all of it blows the context budget; truncating it ad hoc loses the tail
with no recovery path. We need a spill mechanism that offloads over-threshold
output to disk and hands back a stable, followup-readable locator the model can
read or search on a later turn.

## Fork decision (pre-answered by human)

**Fork C:** extend `packages/core` session/state handling. Do NOT create a new
package. The spill backend lands in `packages/core/src/state/` alongside the
existing session/state resolvers, reusing `getStateDir()` so spilled payloads
sit inside the resolved state area (`.harness/<session|stream|legacy>/spill/`),
which is git-ignored via `.harness/.gitignore`.

## Design

New module `packages/core/src/state/spill.ts`:

- `spillIfNeeded(projectPath, content, options?)` — if `Buffer.byteLength(content)`
  exceeds the resolved threshold, write it under the resolved state dir's
  `spill/` subdir and return `{ spilled: true, locator, path, bytes, preview, notice }`;
  otherwise return `{ spilled: false, content, bytes }` unchanged.
- `readSpill(projectPath, locator)` — resolve a locator (or bare relative path)
  back to disk and return the full original content. Rejects path-traversal.
- `searchSpill(projectPath, locator, pattern, opts?)` — grep the spilled payload
  line-by-line (substring or RegExp), returning matches with 1-based line numbers
  and a truncation flag, so a later turn can search without pulling it all inline.
- `resolveSpillThreshold(explicit?)` — precedence: explicit arg → env var
  `HARNESS_SPILL_THRESHOLD_BYTES` → default `DEFAULT_SPILL_THRESHOLD_BYTES`
  (30 KB).

Locator format: `harness-spill:<repo-relative-posix-path>` — e.g.
`harness-spill:.harness/sessions/my-session/spill/lq3k2-9f2ab-test-log.txt`. It
is scheme-prefixed (recognizable) yet directly cat/grep-able after stripping the
scheme, and `readSpill`/`searchSpill` accept it with or without the scheme.

## Tasks

1. **Write the spill module** — `spill.ts` with the four functions, types, and
   constants above. Reuse `getStateDir` for session/stream/legacy resolution.
2. **Barrel export** — add the public surface to `packages/core/src/state/index.ts`.
   (`state` is an auto-discovered `export *` module, so the generated top-level
   core barrel picks it up automatically — verified via
   `generate-core-barrel.mjs --check`.)
3. **Tests** — `spill.test.ts`: over-threshold spills + working locator;
   under-threshold passthrough (no file written); threshold boundary; session
   scoping + label sanitization; round-trip read-by-locator (byte-for-byte);
   bare-path read; missing/traversal locator rejection; substring + regex search;
   match cap + truncation; threshold config via arg and env.
4. **Changeset** — minor bump for `@harness-engineering/core` (new exported API).
5. **Validate** — build (Node 22), typecheck, lint, tests, barrel freshness,
   `harness ci check` via pre-commit.

## Acceptance criteria

- Over-threshold output writes to disk under the state area and returns a locator
  that `readSpill` resolves to the original content byte-for-byte.
- Under-threshold output passes through inline unchanged with no file written.
- Threshold is configurable (argument + env var) with a 30 KB default.
- A later turn can search spilled content by locator.
- Spilled runtime files never land in the diff (spill dir is under `.harness/`,
  which is git-ignored; tests use temp dirs and clean up).

## Assumptions

- Fork C: extend `packages/core` state handling; no new package.
- 30 KB default threshold — large enough that ordinary output passes through,
  small enough to capture a full test log/diff before it dominates the context
  budget.
- Locator is machine-local (same-host session continuity), consistent with how
  the rest of `.harness/` state is used.
- The core module is the reusable backend; wiring specific fleet/autopilot call
  sites to route their output through `spillIfNeeded` is left to the consumers of
  this API (out of scope for this issue, which asks for the backend + locator).

## Wiring (stage: wiring)

The backend above delivered `spillIfNeeded` but nothing called it — the real
truncation sites in long-running sessions still dropped output ad hoc. This stage
wires the primitive into its intended consumer so the recovery path is actually
exercised.

### Consumer site

`packages/cli/src/mcp/middleware/compaction.ts:wrapWithCompaction` — the single
choke point every MCP tool response flows through. Its default pipeline
(`StructuralStrategy → TruncationStrategy`, 4000-token budget) is exactly the "ad
hoc truncation with no recovery path" the issue names: over-budget test logs,
whole diffs, and grep/glob overflow are cut to a `[truncated]` marker and the tail
is lost. This is the genuine large-session-output site — not a display formatter.

### How the locator substitutes for truncated output

- `applyCompaction(handlers, { projectRoot })` is now called with the server's
  resolved project root (`packages/cli/src/mcp/server.ts`), threading a
  `CompactionOptions { projectRoot?, spillThresholdBytes? }` down to every wrapped
  handler.
- For a non-lossless tool whose output is compacted by the truncation pipeline,
  the middleware calls `spillIfNeeded(projectRoot, fullOriginalText, { label: toolName })`
  on the **pre-compaction** payload. Over threshold → the whole payload is written
  to disk and a recovery line carrying the `harness-spill:` locator is appended to
  the compacted result (`spillLargeResult` → `appendLocatorNotice`), so a later
  turn can `readSpill`/`searchSpill` the full output. Under threshold → the
  compacted result is returned unchanged (no file written, no locator).
- Lossless-only tools (`run_skill`, `manage_state`, …) are never lossy-truncated,
  so they are deliberately **not** routed through spill.
- Fail-open throughout: a spill error returns the normal compacted result. Absent
  a `projectRoot` (e.g. unit tests that don't pass one), spill is disabled and
  compaction behaves exactly as before — backward-compatible.

### Deliberately skipped (non-spill) truncation sites

- `packages/cli/src/skill/dispatch-session.ts` / `dispatcher.ts` `.slice(0, 3)` /
  `.slice(0, 10)` — these cap _recommendation/knowledge lists_ for display, not
  large session output. No recovery value.
- `packages/core/src/config/stripped-keys.ts`, brand forbidden-phrase snippets,
  naming-craft convention extraction — display/formatting/secret-stripping, not
  recoverable large output.

### Wiring test

`packages/cli/tests/mcp/middleware/compaction.test.ts` → `CT-spill` block: an
over-threshold handler output spills to a temp `projectRoot`, the appended
`harness-spill:` locator reads back the original payload byte-for-byte via
`readSpill` and is grep-able via `searchSpill`; an under-threshold output passes
through with no locator and no spill dir created; a no-`projectRoot` call stays
backward-compatible; and `applyCompaction` threads `projectRoot` to every handler.
Temp dirs are cleaned in `afterEach`; no spilled runtime file is committed.
