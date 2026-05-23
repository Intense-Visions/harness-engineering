---
number: 0022
title: Renumber duplicate ADRs in the 0003-0007 range
date: 2026-05-23
status: accepted
tier: small
source: docs/changes/design-pipeline/AMENDMENTS.md (A3 + A4 surfaced this)
supersedes:
---

## Context

The ADR README at `docs/knowledge/decisions/README.md` states unambiguously: **"Never reuse a number, even if the ADR is deprecated or superseded."** Yet a scan of the directory reveals five duplicate-numbered ADR pairs in the 0003-0007 range:

| Number | ADR A (first by git history) | ADR B (later, conflicting) |
|---|---|---|
| 0003 | `0003-compound-vs-knowledge-pipeline-boundary.md` | `0003-local-model-resolution-strategy.md` |
| 0004 | `0004-local-availability-disables-not-escalates.md` | `0004-report-only-maintenance-tasks-for-pulse-and-compound.md` |
| 0005 | `0005-named-backends-map.md` | `0005-pulse-config-in-harness-config-json.md` |
| 0006 | `0006-compound-auto-invocation-deferred.md` | `0006-single-runner-orchestrator-dispatch.md` |
| 0007 | `0007-learnings-md-deprecation-scope.md` | `0007-multi-provider-intelligence-pipeline.md` |

This was discovered while filing ADRs 0018-0021 for the design-pipeline initiative. The new ADRs picked 0018+ specifically because the lower duplicates made the "next sequential" rule ambiguous.

The duplicates exist because two parallel feature tracks (compound-vs-knowledge-pipeline / pulse work AND local-model-resolution / multi-provider intelligence work) were authored in adjacent windows and each track took the next-available number from its own perspective without checking the other.

Consequences of leaving it unfixed:

1. The README rule is silently violated, undermining the convention.
2. Cross-references like "ADR 0004" are ambiguous — readers must check both files to know which is referenced.
3. Knowledge-pipeline ingestion may produce confusing graph nodes (two `decision` nodes with the same `number` metadata).
4. Future ADR authoring is gun-shy — pickers tend to jump to 0018+ to avoid collisions, leaving 0003-0007 permanently doubled.

## Decision

**Renumber the second ADR of each duplicate pair** to fresh sequential numbers, preserving the older ADR's number for citation stability. Renumbering happens in a dedicated follow-up PR, not as part of any feature work.

### Renumbering plan

The "second" of each pair (the later-filed ADR by git history) is renumbered to 0023+:

| Old number | New number | File |
|---|---|---|
| 0003 (second) | **0023** | `local-model-resolution-strategy` |
| 0004 (second) | **0024** | `report-only-maintenance-tasks-for-pulse-and-compound` |
| 0005 (second) | **0025** | `pulse-config-in-harness-config-json` |
| 0006 (second) | **0026** | `single-runner-orchestrator-dispatch` |
| 0007 (second) | **0027** | `multi-provider-intelligence-pipeline` |

### Renumbering procedure (for the follow-up PR)

1. For each pair, identify the file to renumber (the second-by-git-history one — typically the LATER `git log --diff-filter=A` entry).
2. `git mv` the file from `NNNN-<slug>.md` to `MMMM-<slug>.md`.
3. Update the file's YAML frontmatter `number:` field from `NNNN` to `MMMM`.
4. Grep the repo for inbound references to the old number+slug combination:
   ```
   grep -rn '0003-local-model-resolution-strategy\|ADR 0003 (local-model)\|decisions/0003-local-model' \
     docs/ packages/ agents/ AGENTS.md README.md
   ```
   Update each occurrence to the new number.
5. Run `harness validate` and `pnpm run generate-docs` (the latter regenerates the skills catalog and any auto-doc that lists ADRs).
6. Run the knowledge-pipeline reingest if available, or note that next ingestion will reconcile graph state.
7. Commit with message `chore(adr): renumber duplicate ADR NNNN -> MMMM (<slug>)` — one commit per pair for reviewability.

### Going forward (codified, not just observed)

The README will be amended in the same follow-up PR with an explicit pre-flight check before allocating any new ADR number:

```bash
# Find next available ADR number
ls docs/knowledge/decisions/ | grep -oE '^[0-9]{4}' | sort -u | tail -1
# Then ALSO check for duplicates in case parallel work already grabbed it
ls docs/knowledge/decisions/ | grep -oE '^[0-9]{4}' | sort | uniq -d
```

If a duplicate is observed, halt and rebase before picking a number.

## Consequences

**Positive:**
- README rule honored.
- ADR citations become unambiguous.
- Knowledge graph stops producing collision artifacts on ingestion.
- Future authors regain confidence that "next number" means what it says.

**Negative:**
- All inbound references to the renumbered ADRs must be updated. Grep + careful review needed. Risk of missing one in a comment, scratch note, or external reference.
- Git blame on the renumbered file becomes harder to follow (the rename is visible in `git log --follow` but inline citations to commits-before-renumber will show the old number).
- Any external documentation or blog post that cites the old number breaks (low risk — the project is internal).

**Neutral:**
- 0023-0027 are now reserved for this renumbering; future ADRs continue at 0028+.
- The duplicate state was already documented in the design-pipeline `AMENDMENTS.md`; this ADR formalizes the remediation plan.

## Scope of this ADR

**This ADR documents the decision and remediation plan. It does NOT execute the renumbering.** Executing the file moves + reference updates is a separate PR scoped specifically to that cleanup, so the diff is reviewable on its own and doesn't tangle with feature work.

When the follow-up PR lands, this ADR's status remains `accepted` (the decision was correct; the work simply completed).
