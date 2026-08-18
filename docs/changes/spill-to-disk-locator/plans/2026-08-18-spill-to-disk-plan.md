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
