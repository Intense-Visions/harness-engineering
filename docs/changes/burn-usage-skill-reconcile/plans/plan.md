# Plan — reconcile burn attribution with `/usage` by adding an invoking-skill cut

Issue: #1300 — "burn attribution groups by agent type while /usage groups by invoking
skill, so the two can never reconcile"

## Problem

Per-subagent attribution (#1270, PR #1292) groups the week's spend by `attributionAgent`
— the agent **type** that spent it (`harness-task-executor`, `general-purpose`, …).
Claude Code's own `/usage` groups the _same_ spend by the **skill** that spawned the
subagent (`harness:roadmap-fleet`, `harness:autopilot`, …). Both cuts are defensible,
but they are not comparable: `/usage` shows a `harness:roadmap-fleet` row at 43% that
burn has no equivalent for, because burn has no concept of the invoking skill. Anyone
cross-checking one against the other concludes a number is broken.

## Decision (confirmed, folded in — not re-litigated here)

1. **ADD** an invoking-skill grouping dimension; do **not** replace the existing
   agent-type grouping. Both coexist so the two views reconcile.
2. Derive the invoking skill from the transcript field burn already scans
   (`attributionSkill`, already carried per subagent turn alongside `attributionAgent`).
   When a turn carries no readable skill, group it under `unattributed-skill` — never
   drop, never fabricate — matching #1270's `unattributed` discipline for agents. Rows
   that predate skill tracking (legacy store rows) group under `pre-migration`, mirroring
   the agent dimension.
3. The windows differ (`/usage` last-24h vs burn week-to-date). Make burn's window
   explicit in the report so a reconciliation is apples-to-apples, and state which cut
   each grouping shows. Do **not** change burn's default window.

## Key finding from the transcripts (load-bearing)

Real subagent transcripts on this machine already carry `attributionSkill` (values
`harness:autopilot`, `harness:brainstorming`, …) and `attributionPlugin` (`harness`)
right next to `attributionAgent`. The value is already fully-qualified `plugin:skill`,
which is exactly the shape `/usage` reports — so the skill cut is directly derivable and
directly reconcilable. Older transcripts predating the field carry `null`; those degrade
to `unattributed-skill`.

## Tasks

1. **Data model** (`types.ts`)
   - Add `invokingSkill: string` to `UsageRecord` (never empty; `unattributed-skill`
     fallback, `pre-migration` for legacy rows).
   - Add a `SkillBlock` interface (mirrors `AgentBlock`: requests, units, pct_of_week,
     lanes).
   - Add `skills: Record<string, SkillBlock>` to `Summary`.

2. **Scan** (`scan.ts`)
   - In `toRecord`, read `attributionSkill` with the same string type-guard used for
     `attributionAgent`/`agentId` (undocumented internals may change type, must never
     abort the scan). Derive `invokingSkill = trimmed skill || 'unattributed-skill'`.

3. **Store** (`store.ts`)
   - Widen `usage.tsv` to a 10th column (`invokingSkill`), written last so an older
     reader still parses the first nine.
   - Read the 10th column in `toStoredRecord`; a wide row missing it falls to
     `pre-migration` (predates skill tracking), mirroring the agent fallback.
   - Bump `STORE_VERSION` 2 → 3 so the migration is a stated one-time full rescan that
     re-derives the skill from transcripts still on disk.
   - Extend `tsvSafe` sanitisation to the new column.

4. **Summary** (`summary.ts`)
   - Roll records up per invoking skill exactly as per agent (same lane-union idiom),
     and emit the sorted `skills` block. Partitions the week identically to `agents`.

5. **Report** (`packages/cli/.../burn/report.ts`)
   - Add a `by invoking skill` section that **leads** (renders before `by agent`), states
     it is the cut `/usage` shows, and states the window is week-to-date vs `/usage`'s
     last-24h so the discrepancy reads as "different question", not "wrong number".

6. **Docs** (`packages/burn/README.md`)
   - Document the skill cut, the `unattributed-skill`/`pre-migration` labels, and the
     window/`/usage` reconciliation note. Note the 9→10 column widening.

7. **Tests**
   - Extend `agentLine` helper to carry `attributionSkill`.
   - scan: a turn's skill is read; missing → `unattributed-skill`; non-string type
     degrades without aborting.
   - store: 10-column round-trip; wide-row-missing-skill → `pre-migration`; version 3;
     sanitisation of the new column.
   - summary: skills block partitions the week; `unattributed-skill` bucket present and
     never dropped.
   - report: `by invoking skill` renders, leads before `by agent`, states the window.

## Non-goals

- No change to burn's default window or to the existing agent-type cut.
- No second degradation flag for skills — the existing agent-type `attribution.degraded`
  already headlines a broken scanner; the skill cut degrades honestly to
  `unattributed-skill`.
- No dependency on the parallel #1522 cost-per-pr lane; build against current `main`,
  keep changes additive.
