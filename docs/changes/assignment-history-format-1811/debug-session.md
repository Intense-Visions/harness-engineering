# Debug Session: assignment-history records dropped when a field contains a pipe

Status: resolved
Started: 2026-09-05
Issue: https://github.com/Intense-Visions/harness-engineering/issues/1811
Error: `parseRoadmap(serializeRoadmap(r)).assignmentHistory` returns `[]` for a record
whose `feature` is `Auth | Login flow`. Silent — no error, no warning.

## Investigation Log

### Phase 1 — INVESTIGATE (read-only)

- `harness cleanup` (entropy): only pre-existing doc drift under `docs/api/*.md`
  (RENAMED/NOT_FOUND symbol references). NOTHING near `packages/core/src/roadmap/`.
  Not related.
- Reproduced deterministically at base `463e0162a` (head of #1843) with the pushed
  repro `3d6970b25` cherry-picked:
  `cd packages/core && npx vitest run tests/roadmap/repro-assignment-history-pipe.test.ts`
  -> `1 failed`, assertion `Expected [ {feature: 'Auth | Login flow', ...} ] / Received []`.
  Assertion failure, not a resolution error. Ran twice, identical.
- Data flow traced backward from the empty array:
  1. `parse.ts::parseAssignmentHistory` returns `[]`.
  2. Its row reader does `trimmed.split('|').map(trim).filter(c => c.length > 0)`.
  3. For `| Auth | Login flow | alice | assigned | 2026-03-21 |` that yields
     `['Auth', 'Login flow', 'alice', 'assigned', '2026-03-21']` — FIVE cells.
  4. `cells[2]` is therefore `'alice'`, which fails the
     `['assigned','completed','unassigned']` membership check, and the row is
     `continue`d — the record is dropped with no diagnostic.
  5. The row came from `serialize.ts::serializeAssignmentHistory`, which
     interpolates `record.feature` into a pipe table cell with NO escaping.

### Phase 2 — ANALYZE

- Working examples in the SAME module family: `summary-field.ts` (#1756) and
  `list-field.ts` (#1757). Both fix the identical class of bug — a line-oriented
  grammar whose separator is legal inside a value — by owning a reversible codec
  in a dedicated module shared by the emitter and the reader.
- Difference: those two fields live on `- **Field:** value` bullets, where the
  ONLY hostile character is the newline. Assignment history is the one place the
  roadmap grammar uses a _column_ separator (`|`), so it has a second hostile
  character that no codec in the repo covers.
- `heading.ts` is the module-level precedent for "single source of truth shared
  with both readers, so the emitter cannot drift from them" (#1261).
- Blast radius re-derived, NOT taken on trust: `grep -rl 'Assignment History'`
  over committed sources returns `docs/roadmap.d/_meta.md` (source of truth, 17
  data rows) and `docs/roadmap.md` (the regenerated aggregate, section at line
  3161, identical 17 rows). NO per-feature shard carries history. Both
  `docs/roadmap.md` and `docs/roadmap.d/**` are in `.prettierignore`, so
  `format:check` does not police their layout.

### Assumptions surfaced

- ASSUMPTION: legacy `_meta.md` / `roadmap.md` files in flight (other branches,
  adopter repos) still carry the pipe table, so the reader must keep parsing it.
  Consequence if wrong: none — legacy reading is strictly additive.
- ASSUMPTION (F3, answered by the human at the CONFIRM gate): the chosen fix is
  (b) move OFF the pipe-table format entirely, NOT (a) escape `|`.
- DEFERRABLE: leading/trailing spaces inside a value now round-trip (the old
  table trimmed them). Strictly an improvement; not asserted either way.

## Hypotheses

H1: "Every record whose `feature` or `assignee` contains a `|` is dropped because
the row reader recovers cells positionally from an unescaped `split('|')`, so any
embedded pipe shifts `action` off column 2."
Prediction: a record with a pipe in `assignee` (not `feature`) is dropped too, and
a record with a pipe in `date` (the LAST column) is NOT dropped but is corrupted.
Test: table-driven round-trip over adversarial values.
Result: CONFIRMED — see `tests/roadmap/assignment-history-round-trip.test.ts`.

## Resolution

Resolved: 2026-09-05

Root cause: `serializeAssignmentHistory` interpolated four free-text values into a
markdown pipe table row with NO escaping, and `parseAssignmentHistory` recovered them
POSITIONALLY from `split('|').filter(nonEmpty)`. The separator is legal inside every
value, so any embedded `|` shifted `action` off column 2, failed the action-membership
check, and dropped the record with no diagnostic.

Fix: removed the column separator instead of escaping it (human-answered fork F3 = (b)).
`packages/core/src/roadmap/assignment-history.ts` is the new single source of truth for
the section grammar — the emitter AND both readers. A record is now four `- **Key:**
value` bullets at column 0, the same line grammar every feature row uses, so `|` has no
special meaning. Newlines reuse the existing `summary-field` codec (#1756). The legacy
pipe table is STILL read, with its original tolerances, so no in-flight document loses
history; only the writer moved.

Follow-on edits the root-cause fix forced:

- `serialize.ts` / `parse.ts` now re-export from the new module, so every historical
  import path (`from '../serialize'`, `from '../parse'`) still resolves.
- `preservation.ts` learned the `Feature`/`Action`/`Date` bullets, or the #839
  write-preservation guard would have reported the new section as unpreservable content.
- `docs/roadmap.d/_meta.md` migrated (18 records in, 18 records out, deep-equal) and
  `docs/roadmap.md` regenerated with `harness roadmap regen` (one diff hunk).

Regression tests:

- `packages/core/tests/roadmap/repro-assignment-history-pipe.test.ts` (cherry-picked
  from the bug-fleet repro branch, `3d6970b25`, unchanged — it is format-agnostic).
- `packages/core/tests/roadmap/assignment-history-round-trip.test.ts` (new; 15
  adversarial values x 3 fields, plus ordering, double round-trip, the preservation
  guard, legacy read, legacy migration, and `_meta.md` byte-stability).

Revert-and-fail: with `serialize.ts` and `parse.ts` restored to the base commit,
`31 failed | 24 passed (55)`; restored, `55 passed (55)`.

Learnings: the roadmap grammar had ONE place that used a column separator instead of a
line-per-value bullet, and that one place was the one with unescaped round-trip loss —
after #1756 (newline in summary) and #1757 (comma in list) had already fixed the same
class twice. The durable lesson is not "add a third codec": it is that a separator which
is legal inside its own values is the defect, and the roadmap's own bullet grammar had
the answer all along.
