---
type: business_process
domain: cli
tags: [skills, dispatch, recommendation, signals, health]
---

# Skill Dispatch and Recommendation

Skill dispatch is a three-phase system triggered at session start that recommends which skills to run based on project health and recent changes.

## Phase 1: Enrichment

Merge a health snapshot (cached or fresh) with change-type signals (feature/bugfix/refactor/docs) and domain signals (database/containerization/deployment/secrets, detected from file patterns in the diff).

## Phase 2: Recommendation

Apply three-layer scoring:

1. **Hard address matching** — Critical urgency for skills whose addresses directly match active signals
2. **Soft scoring** — Weighted health metric evaluation (fanOut, couplingRatio, cyclomaticComplexity, coverage thresholds)
3. **Topological sort + heuristic sequencing** — Order skills by dependency and parallel-safety

## Phase 3: Annotation

Compute estimated impact (high/medium/low) and parallel-safety flags for each recommended skill. Output includes dispatch context, ordered skill list, urgency classification, and reasoning.

## Signal Categories

- **Structure**: circular-deps, layer-violations
- **Quality**: dead-code, drift
- **Security**: security-findings
- **Performance**: perf-regression
- **Coverage**: low-coverage

## Skill Types

- **Rigid** — Fixed multi-phase workflow requiring all phases
- **Flexible** — Adaptive workflow with optional phases
- **Knowledge** — Documentation-only, no code execution, no tools or phases
