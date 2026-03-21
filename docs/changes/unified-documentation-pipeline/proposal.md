# Unified Documentation Pipeline

**Date:** 2026-03-21
**Status:** Proposed
**Parent:** [Harness v2 Design Patterns](../harness-v2-patterns/proposal.md) — Patterns 1, 2, 4
**Scope:** Orchestrator skill composing 4 documentation skills into a sequential pipeline
**Keywords:** documentation-pipeline, doc-drift, align-docs, knowledge-mapper, context-engineering, convergence-loop, AGENTS.md, bootstrap

## Overview

A new orchestrator skill (`harness-docs-pipeline`) that composes the 4 existing documentation skills into a sequential pipeline with convergence-based remediation, producing a qualitative documentation health report. Handles the AGENTS.md bootstrap problem and coordinates graph freshness across all doc operations.

### Non-goals

- Replacing standalone doc skills — they keep independent value
- Numeric health scoring — qualitative PASS/WARN/FAIL only
- Multi-platform doc hosting (Confluence, Notion, etc.) — out of scope
- Creating documentation for non-code artifacts (design specs, ADRs) — existing skills handle those

## Decisions

| Decision            | Choice                                                        | Rationale                                                                               |
| ------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Orchestrator        | New skill `harness-docs-pipeline`                             | Existing skills have clear standalone purposes; orchestrator composes without absorbing |
| Pipeline structure  | Sequential: FRESHEN→DETECT→FIX→AUDIT→FILL→REPORT              | Doc checks naturally chain; each phase feeds the next                                   |
| Remediation         | Convergence-based in FIX and FILL phases                      | Fixing one drift issue can reveal others; loop handles cascading fixes                  |
| Health report       | Qualitative PASS/WARN/FAIL with categorized findings          | Numeric scores imply false precision for documentation                                  |
| AGENTS.md bootstrap | Auto-bootstrap from graph or directory structure fallback     | Doc pipeline should be self-sufficient; 50% quality > nothing                           |
| Composition style   | Shared `DocPipelineContext` with optional structured findings | Convergence loop needs typed findings; text parsing is fragile                          |
| Sub-skill coupling  | Context is optional — skills work standalone without it       | Preserves independent usage while enabling richer orchestrated flow                     |

## Technical Design

### Pipeline Phases

```
┌─────────────────────────────────────────────────────────┐
│ 1. FRESHEN                                               │
│    - Check graph existence and staleness                 │
│    - Medium sensitivity: auto-refresh if >10 commits     │
│    - If no graph: log notice, proceed with fallbacks     │
│    - If no AGENTS.md: trigger bootstrap sequence         │
├─────────────────────────────────────────────────────────┤
│ 2. DETECT                                                │
│    - Invoke detect-doc-drift                             │
│    - Classify findings into 5 drift types                │
│    - Prioritize: Critical → High → Medium → Low          │
│    - Output: DriftFinding[] into context                 │
├─────────────────────────────────────────────────────────┤
│ 3. FIX (convergence loop)                                │
│    - Invoke align-documentation with drift findings      │
│    - Classify fixes: safe / probably-safe / unsafe        │
│    - Apply safe fixes silently                           │
│    - Present probably-safe as diffs for approval          │
│    - Surface unsafe to user                              │
│    - Verify: harness check-docs after each batch         │
│    - Re-run detect; loop if issue count decreased        │
│    - Stop when converged or all remaining need user      │
├─────────────────────────────────────────────────────────┤
│ 4. AUDIT                                                 │
│    - Invoke validate-context-engineering                  │
│    - Find gaps: undocumented files, broken links,        │
│      stale sections, missing context                     │
│    - Exclude items already fixed in FIX phase (dedup)    │
│    - Output: GapFinding[] into context                   │
├─────────────────────────────────────────────────────────┤
│ 5. FILL (convergence loop)                               │
│    - If AGENTS.md needs regeneration: invoke             │
│      knowledge-mapper (or fallback)                      │
│    - Address remaining gaps from AUDIT                    │
│    - Same safe/probably-safe/unsafe classification        │
│    - Verify: harness check-docs after each batch         │
│    - Re-run audit; loop if issue count decreased         │
├─────────────────────────────────────────────────────────┤
│ 6. REPORT                                                │
│    - Synthesize results from all phases                  │
│    - Overall verdict: PASS / WARN / FAIL                 │
│    - Per-category breakdown:                             │
│      Accuracy: drift findings remaining                  │
│      Coverage: undocumented modules remaining            │
│      Links: broken references remaining                  │
│      Freshness: graph staleness status                   │
│    - List auto-fixes applied, user decisions pending     │
└─────────────────────────────────────────────────────────┘
```

### Shared Context Object

```typescript
interface DocPipelineContext {
  // Pipeline state
  graphAvailable: boolean;
  agentsMdExists: boolean;
  bootstrapped: boolean; // true if AGENTS.md was created this run

  // Phase outputs
  driftFindings: DriftFinding[];
  fixesApplied: DocFix[];
  gapFindings: GapFinding[];
  fillsApplied: DocFix[];
  exclusions: Set<string>; // finding IDs already addressed

  // Health verdict
  verdict: 'pass' | 'warn' | 'fail';
  summary: string;
}

interface DriftFinding {
  id: string;
  file: string;
  line?: number;
  driftType: 'renamed' | 'new-code' | 'deleted-code' | 'changed-behavior' | 'moved-code';
  priority: 'critical' | 'high' | 'medium' | 'low';
  staleText: string;
  codeChange: string;
  suggestedFix: string;
  fixSafety: 'safe' | 'probably-safe' | 'unsafe';
}

interface GapFinding {
  id: string;
  file?: string;
  gapType: 'undocumented' | 'broken-link' | 'stale-section' | 'missing-context';
  priority: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  suggestedFix: string;
  fixSafety: 'safe' | 'probably-safe' | 'unsafe';
}

interface DocFix {
  findingId: string;
  file: string;
  oldText: string;
  newText: string;
  safety: 'safe' | 'probably-safe';
  verified: boolean; // harness check-docs passed after applying
}
```

### Fix Safety Classification

| Category        | Safe (silent)                                                      | Probably safe (present diff)                                                    | Unsafe (surface to user)                                          |
| --------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| **Drift fixes** | Update file path where rename is unambiguous; fix import reference | Rewrite description for simple rename/parameter change; update code examples    | Rewrite behavioral explanations; remove sections for deleted code |
| **Gap fills**   | Add entry for new file with obvious single-purpose name            | Add entry for new file requiring description; update AGENTS.md section ordering | Write documentation for complex modules; create new doc pages     |
| **Link fixes**  | Redirect broken link where target is unambiguous                   | Redirect when multiple candidates exist (present options)                       | Remove link when target no longer exists                          |

### AGENTS.md Bootstrap Sequence

When FRESHEN detects no AGENTS.md:

```
1. Check graph availability
2. If graph exists:
   - Invoke harness-knowledge-mapper to generate AGENTS.md
   - Mark context: bootstrapped = true
3. If no graph:
   - Generate minimal AGENTS.md from directory structure:
     - Glob source directories
     - Read package.json for project name/description
     - Identify entry points (src/index.*, main field)
     - List top-level modules (src/*/) with directory names
     - Note: "Generated from directory structure. Run harness scan for richer output."
   - Mark context: bootstrapped = true
4. Proceed to DETECT phase with new AGENTS.md
```

### Verdict Logic

```
FAIL if:
  - Any critical drift findings remain unfixed
  - harness check-docs fails after all fix attempts
  - AGENTS.md does not exist and bootstrap failed

WARN if:
  - High-priority drift or gap findings remain (user-deferred)
  - >30% of source modules undocumented
  - Graph not available (reduced accuracy)

PASS if:
  - No critical or high findings remaining
  - harness check-docs passes
  - AGENTS.md exists and covers >70% of modules
```

### Flags

| Flag           | Effect                                                            |
| -------------- | ----------------------------------------------------------------- |
| `--fix`        | Enable convergence-based auto-fix (default: detect + report only) |
| `--no-freshen` | Skip graph staleness check                                        |
| `--bootstrap`  | Force AGENTS.md regeneration even if one exists                   |
| `--ci`         | Non-interactive: apply safe fixes only, report everything else    |

### Sub-Skill Integration

Each sub-skill gains optional context awareness:

- If invoked with a `DocPipelineContext` (via the orchestrator): read findings from context, write results back
- If invoked standalone (no context): behave exactly as today
- Detection: check if context object exists in handoff.json with a `pipeline` field; if not, standalone mode

No changes to sub-skill interfaces — the context is passed via handoff.json with a `pipeline` field that sub-skills check for.

## Success Criteria

1. **Single command for full doc health** — `harness-docs-pipeline` runs all 4 sub-skills in the right order with shared context
2. **Convergence loop works for docs** — FIX and FILL phases iterate until converged; cascading drift fixes are caught
3. **Safe fixes are silent** — broken links with unambiguous targets, renamed file paths are auto-fixed without prompting
4. **Unsafe changes surface to user** — behavioral rewrites, section removals, complex module documentation always require approval
5. **Mechanical verification gates fixes** — `harness check-docs` runs after every fix batch; failed fixes are reverted
6. **Bootstrap handles cold start** — no AGENTS.md + no graph produces a minimal AGENTS.md from directory structure; no AGENTS.md + graph produces a full AGENTS.md via knowledge-mapper
7. **Standalone skills unchanged** — all 4 sub-skills work independently exactly as today when invoked without pipeline context
8. **Graph fallback throughout** — entire pipeline runs without graph using static analysis fallbacks; single notice at start
9. **Qualitative report is actionable** — PASS/WARN/FAIL with per-category breakdown (accuracy, coverage, links, freshness) and specific remaining findings
10. **Dedup across phases** — drift fixes in FIX phase are excluded from AUDIT findings; no double-counting

## Implementation Order

1. **Skill scaffold** — Create `harness-docs-pipeline` with `skill.yaml` and `SKILL.md`. Define the 6 phases, context object, flags, and verdict logic. No sub-skill invocation yet.

2. **FRESHEN + bootstrap** — Implement graph staleness check, AGENTS.md detection, and the bootstrap sequence (graph path and directory-structure fallback).

3. **DETECT phase** — Wire up `detect-doc-drift` invocation. Define `DriftFinding` structure. Populate context with prioritized findings.

4. **FIX phase with convergence** — Wire up `align-documentation` with drift findings. Implement safety classification, convergence loop, and mechanical verification (`harness check-docs` after each batch).

5. **AUDIT phase** — Wire up `validate-context-engineering` invocation. Define `GapFinding` structure. Implement dedup against findings already fixed in FIX phase.

6. **FILL phase with convergence** — Wire up `harness-knowledge-mapper` for AGENTS.md regeneration and gap-filling. Same convergence loop as FIX.

7. **REPORT phase** — Implement verdict logic (PASS/WARN/FAIL), per-category breakdown, and summary of fixes applied and findings remaining.

8. **Sub-skill context awareness** — Add optional `DocPipelineContext` detection to the 4 sub-skills via handoff.json `pipeline` field. Ensure standalone behavior is unchanged.
