# Plan — Machine-readable provenance trailer from agent-authored commits (#1531)

**Keywords:** provenance, commit-trailer, fleet, orchestrator, shipWorkspace, parser, squash-survival, tier-detection

## Overview

Implement a governed, deterministically-parseable `Harness-*` commit trailer, emit it on the orchestrator's autonomous ship path, and ship a pure parser. Deferred remainder (CI presence gate, `harness provenance` CLI) is out of scope for this slice — `Refs #1531`.

## Decisions

| Decision          | Choice                                                     | Rationale                                                             |
| ----------------- | ---------------------------------------------------------- | --------------------------------------------------------------------- |
| Trailer namespace | `Harness-*` keys, primary `Harness-Run: <skill>@<version>` | Distinct from `Co-authored-by:`; mechanical tier detection            |
| Location          | `packages/core/src/provenance/commit-trailer.ts` (pure)    | IO-free, reused by emit + parse; alongside existing provenance module |
| Emit chokepoint   | `WorkspaceManager.shipWorkspace`                           | Single autonomous commit site; other callers unaffected               |
| Squash survival   | Mirror trailer into PR body                                | Repo squash-merges; PR body carries equivalent record                 |
| Idempotency       | `appendProvenanceTrailer` no-ops if `Harness-Run` present  | Resumed ships must not double-stamp                                   |
| Closing keyword   | `Refs #1531`                                               | Slice; CI gate + CLI reader deferred                                  |

## Tasks

### T1 — Core primitive: schema + formatter + appender + parser

- **File (new):** `packages/core/src/provenance/commit-trailer.ts`
- `PROVENANCE_TRAILER_VERSION = 1`; `ProvenanceTrailer` + `ProvenanceTrailerInput` types.
- `formatProvenanceTrailer(input)` — deterministic ordered `Key: value` block; omit absent optional fields; strip CR/LF from values.
- `appendProvenanceTrailer(message, input)` — append block separated by a blank line; no-op if `Harness-Run` already present.
- `parseProvenanceTrailer(message)` — scan the trailing block for `Harness-*` keys; return structured record or `null` when `Harness-Run` absent; tolerate other trailing trailers (e.g. `Claude-Session:`, `Co-authored-by:`).
- **Verification:** unit-tested in T2 (TDD — tests first).

### T2 — Tests for the primitive (TDD)

- **File (new):** `packages/core/src/provenance/commit-trailer.test.ts`
- format determinism + field ordering; omitted optionals; format→parse round-trip; `parseProvenanceTrailer` returns `null` on non-fleet message (interactive commit unaffected); coexistence with a `Claude-Session:` line; value sanitization (embedded newline cannot forge a key); `appendProvenanceTrailer` idempotency.

### T3 — Export from the provenance barrel

- **File:** `packages/core/src/provenance/index.ts` — re-export the new symbols. Core `index.ts` already `export * from './provenance'`, so it flows to `@harness-engineering/core`. Run `pnpm run generate:barrels` if the barrel check flags staleness.

### T4 — Wire emission into the ship path

- **File:** `packages/orchestrator/src/workspace/manager.ts` — `shipWorkspace` gains optional `opts.provenance`; when present, commit message = `appendProvenanceTrailer(title, provenance)` and PR body = `appendProvenanceTrailer(body, provenance)`.
- **File:** `packages/orchestrator/src/orchestrator.ts` — at the `settleWorkflowSuccessLocal` ship call, build the provenance input from live run context (skill/lane, backend model, flight-recorder run id, issue) and thread it into `shipWorkspace`. Degrade field-by-field when context absent.

### T5 — Wiring tests

- **File:** `packages/orchestrator/src/workspace/manager.ship.test.ts` — assert the committed message carries a parseable trailer when `provenance` is supplied, and is byte-identical to today when it is not; assert the PR body carries the trailer block.

### T6 — Document the schema

- **File (new):** `docs/reference/provenance-trailer.md` — the key list, ordering, example block, parse contract, and squash-survival note. Link from an existing reference index if one enumerates provenance/telemetry.

### T7 — Verify & ship

- `pnpm turbo build`; targeted vitest for the new + changed files; `pnpm run generate:barrels --check` (or regenerate); typecheck. Commit through the real pre-commit gate (no `--no-verify`); add a changeset. Push; open PR with `Refs #1531` + Assumptions section flagging the deferred CI gate and CLI reader.

## Risks / mitigations

- **Barrel staleness** — `pnpm run generate:barrels` before commit (pre-push checks freshness).
- **Changeset gate** — add a changeset for `@harness-engineering/core` (+ orchestrator).
- **Orchestrator context plumbing** — if the live skill/lane/session are not readily available at the ship site, thread the fields that are (model, runId, issue-derived agent) and omit the rest; the schema tolerates absent optionals. If wiring the orchestrator call site proves to touch broad state, keep emission behind the optional opt and land the primitive + manager wiring + a synthesized-context test rather than parking.
