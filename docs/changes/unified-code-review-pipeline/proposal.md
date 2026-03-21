# Unified Code Review Pipeline

**Date:** 2026-03-20
**Status:** Proposed
**Skill:** `harness-code-review`
**Keywords:** code-review, pipeline, fan-out, graph-context, deduplication, model-tiering, inline-comments, mechanical-exclusion, eligibility-gate

## Overview

Enhance the existing `harness-code-review` skill to orchestrate a multi-phase, multi-agent review pipeline that composes harness's existing skills and MCP tools into a single unified experience. The result should be strictly superior to Claude Code's code-review plugin — matching its high-signal, low-noise output while adding graph-scoped context, mechanical exclusion boundaries, and cross-agent deduplication.

### Non-goals

- Multi-platform posting (GitLab, Bitbucket) — future work
- Replacing standalone skills (security-review, pre-commit, etc.) — they keep independent value
- Threat modeling in the default pipeline — remains opt-in via `--deep`

## Decisions

| Decision                   | Choice                                                                 | Rationale                                                                                                              |
| -------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Skill structure            | Enhance existing `harness-code-review` as orchestrator                 | Standalone skills retain independent value; code-review becomes the umbrella                                           |
| Parallel review            | Fan-out with graph-scoped context + mechanical pre-validation          | Graph gives precision over Claude Code's blind-diff approach; mechanical checks are cheaper than LLM validation        |
| Deduplication              | Cross-agent dedup before output                                        | Prevents multiple agents flagging the same issue with redundant findings                                               |
| Graph dependency           | Enhancer, not requirement — graceful fallback                          | Not all projects will have a graph; pipeline must work without one                                                     |
| False-positive suppression | Mechanical checks as exclusion boundary, graph reachability validation | More principled than a hand-curated exclusion list; anything lint/typecheck/scanner catches is excluded from AI review |
| Output                     | Terminal by default, `--comment` posts inline GitHub comments          | Table stakes for competitive review tooling                                                                            |
| Model tiering              | Abstract tiers (`fast`/`standard`/`strong`), provider-agnostic         | Supports Claude, OpenAI, local models — not locked to one provider                                                     |
| Eligibility gate           | Automated/CI mode only; manual invocation skips gate                   | Prevents wasted compute in CI without second-guessing explicit user intent                                             |

## Technical Design

### Pipeline Phases

```
┌─────────────────────────────────────────────────────────┐
│ 1. GATE (fast tier, automated mode only)                │
│    - PR state (closed? draft? trivial?)                 │
│    - Already reviewed this commit range?                │
│    - Skip → exit with reason                            │
├─────────────────────────────────────────────────────────┤
│ 2. MECHANICAL (no LLM)                                  │
│    - Lint, typecheck, test (via harness:verify)          │
│    - Security scan (via run_security_scan MCP)           │
│    - Output: pass/fail + findings set (exclusion list)   │
│    - Fail → report mechanical failures, stop pipeline    │
├─────────────────────────────────────────────────────────┤
│ 3. CONTEXT (fast tier)                                   │
│    - Load graph if available                             │
│    - Compute impact/blast radius per changed file        │
│    - Scope context per review domain:                    │
│      compliance → convention files + changed files       │
│      bugs → changed files + direct dependencies          │
│      security → security-relevant paths + data flows     │
│      architecture → layer boundaries + import graph      │
│    - Fallback (no graph): diff + imported files heuristic│
├─────────────────────────────────────────────────────────┤
│ 4. FAN-OUT (parallel subagents)                          │
│    ┌──────────────┐ ┌──────────────┐                     │
│    │ Compliance   │ │ Bug Detection│                     │
│    │ (standard)   │ │ (strong)     │                     │
│    │ CLAUDE.md,   │ │ Logic errors,│                     │
│    │ AGENTS.md,   │ │ edge cases,  │                     │
│    │ conventions  │ │ off-by-one   │                     │
│    └──────────────┘ └──────────────┘                     │
│    ┌──────────────┐ ┌──────────────┐                     │
│    │ Security     │ │ Architecture │                     │
│    │ (strong)     │ │ (standard)   │                     │
│    │ OWASP +      │ │ Boundaries,  │                     │
│    │ stack-adaptive│ │ dependency   │                     │
│    │              │ │ direction    │                     │
│    └──────────────┘ └──────────────┘                     │
├─────────────────────────────────────────────────────────┤
│ 5. VALIDATE                                              │
│    - Exclude findings already caught by mechanical phase │
│    - Graph reachability check (if graph available)       │
│    - Fallback: import-chain heuristic validation         │
│    - Discard unvalidated findings                        │
├─────────────────────────────────────────────────────────┤
│ 6. DEDUP + MERGE                                         │
│    - Group findings by file + line range                 │
│    - Merge overlapping findings, combine evidence        │
│    - Assign final severity (Critical/Important/Suggestion)│
│    - Preserve strongest rationale from each agent        │
├─────────────────────────────────────────────────────────┤
│ 7. OUTPUT                                                │
│    - Terminal: Strengths / Issues / Assessment            │
│    - --comment: inline GitHub comments via gh CLI/MCP     │
│      - Small fixes → committable suggestion blocks       │
│      - Large fixes → description + rationale             │
│    - Exit code: 0 (approve), 1 (request changes)        │
└─────────────────────────────────────────────────────────┘
```

### Model Tier Mapping

Tiers are defined abstractly and resolved at runtime from config:

```yaml
# harness.config.json (or equivalent)
review:
  model_tiers:
    fast: 'haiku' # or "gpt-4o-mini", "gemini-flash", etc.
    standard: 'sonnet' # or "gpt-4o", "gemini-pro", etc.
    strong: 'opus' # or "o1", "gemini-ultra", etc.
```

Defaults are sensible per-provider. If no config exists, all agents use whatever model the user is currently running (no tiering).

### Graph Fallback Strategy

| Capability              | With Graph                              | Without Graph                                                |
| ----------------------- | --------------------------------------- | ------------------------------------------------------------ |
| Context scoping         | Dependency traversal from changed files | Changed files + direct imports (static analysis)             |
| Reachability validation | Full graph path check                   | Import-chain heuristic (follow imports 2 levels deep)        |
| Impact/blast radius     | `get_impact` MCP tool                   | Changed files + their test files (filename convention match) |
| Architecture check      | Layer boundary from graph edges         | `check-deps` CLI output                                      |

### Finding Schema

Each agent produces findings in a common format:

```typescript
interface ReviewFinding {
  id: string; // unique, for dedup
  file: string; // file path
  lineRange: [number, number]; // start, end
  domain: 'compliance' | 'bug' | 'security' | 'architecture';
  severity: 'critical' | 'important' | 'suggestion';
  title: string; // one-line summary
  rationale: string; // why this is an issue
  suggestion?: string; // fix, if available
  evidence: string[]; // supporting context from agent
  validatedBy: 'mechanical' | 'graph' | 'heuristic';
}
```

### Flags

| Flag              | Effect                                                      |
| ----------------- | ----------------------------------------------------------- |
| `--comment`       | Post inline comments to GitHub PR                           |
| `--deep`          | Add threat modeling pass (invokes security-review `--deep`) |
| `--no-mechanical` | Skip mechanical checks (useful if already run)              |
| `--ci`            | Enable eligibility gate, non-interactive output             |

## Success Criteria

1. **Parity with Claude Code plugin** — every capability their plugin offers (parallel agents, validation, inline comments, eligibility gating) is present in our pipeline
2. **Graph advantage is measurable** — when graph is available, review agents receive scoped context (not the full diff), and findings include reachability validation
3. **Graceful degradation** — full pipeline runs and produces useful results without a graph, without model tiering config, and without `--comment` flag
4. **No duplicate findings** — mechanical findings are excluded from AI review; cross-agent overlaps are merged before output
5. **Mechanical checks gate AI review** — if lint/typecheck/tests fail, pipeline stops and reports mechanical failures without spending compute on AI agents
6. **Model tiering is provider-agnostic** — tiers resolve to configured models regardless of provider; defaults work without configuration
7. **Terminal output matches existing format** — Strengths/Issues/Assessment with Critical/Important/Suggestion severity
8. **Inline comments are high-signal** — small fixes get committable suggestion blocks, large fixes get description + rationale only
9. **Eligibility gate prevents wasted compute in CI** — closed, draft, trivial, and already-reviewed PRs are skipped with a reason
10. **Manual invocation always runs** — no gating when the user explicitly invokes the review

## Implementation Order

1. **Pipeline skeleton** — Restructure `harness-code-review` SKILL.md with the 7-phase pipeline structure. Define the phase boundaries, flag handling, and the finding schema. No new behavior yet — existing review logic maps into the new phases.

2. **Mechanical exclusion boundary** — Wire up the mechanical phase (lint, typecheck, security scan) and produce the exclusion set. AI review phases receive the exclusion list and skip covered findings.

3. **Context scoping** — Implement the context phase with graph-enhanced scoping and the fallback heuristic. Each review domain gets a scoped context bundle rather than the raw diff.

4. **Parallel fan-out** — Implement the 4 parallel subagents (compliance, bugs, security, architecture) with model tier annotations. Each agent produces findings in the common schema.

5. **Validation + dedup** — Implement the validation phase (mechanical exclusion, graph reachability / import-chain heuristic) and cross-agent deduplication/merge logic.

6. **Output + inline comments** — Terminal output in Strengths/Issues/Assessment format. `--comment` flag posts inline GitHub comments via `gh` CLI or GitHub MCP.

7. **Eligibility gate + CI mode** — Add the gate phase for `--ci` mode. Check PR state, commit range, prior reviews.

8. **Model tiering config** — Add `review.model_tiers` config support with provider-agnostic resolution and sensible defaults.

## Competitive Analysis

### vs Claude Code code-review plugin

| Capability                 | Claude Code                                       | Harness (this proposal)                                       |
| -------------------------- | ------------------------------------------------- | ------------------------------------------------------------- |
| Parallel review agents     | 4 agents (2 compliance, 2 bug/security)           | 4 agents (compliance, bugs, security, architecture)           |
| Context scoping            | Full diff to all agents                           | Graph-scoped context per domain; fallback to import heuristic |
| False-positive suppression | Hand-curated exclusion list + LLM validation pass | Mechanical exclusion boundary + graph reachability validation |
| Model tiering              | Claude-specific (Haiku/Sonnet/Opus)               | Provider-agnostic (fast/standard/strong)                      |
| Inline comments            | GitHub only via MCP                               | GitHub via gh CLI/MCP                                         |
| Eligibility gating         | Always on                                         | CI mode only; manual invocation skips                         |
| Security depth             | Basic (within diff)                               | OWASP baseline + stack-adaptive + optional threat modeling    |
| Architecture review        | Not present                                       | Boundary violations, dependency direction                     |
| Mechanical checks          | Not present                                       | Lint, typecheck, test as gating + exclusion boundary          |
| Graph integration          | Not present                                       | Dependency traversal, impact analysis, blast radius           |
| Deduplication              | Not present                                       | Cross-agent dedup with evidence merging                       |
