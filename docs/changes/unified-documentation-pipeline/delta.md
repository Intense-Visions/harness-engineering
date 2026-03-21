# Change Delta: Unified Documentation Pipeline

**Date:** 2026-03-21
**Spec:** docs/changes/unified-documentation-pipeline/proposal.md

## Changes to detect-doc-drift

- [ADDED] Pipeline Context section: when `pipeline` field exists in handoff.json, read exclusions and write DriftFinding[] back to context
- Standalone behavior: unchanged

## Changes to align-documentation

- [ADDED] Pipeline Context section: when `pipeline` field exists in handoff.json, read driftFindings/fixBatch and write DocFix[] back to context
- Standalone behavior: unchanged

## Changes to validate-context-engineering

- [ADDED] Pipeline Context section: when `pipeline` field exists in handoff.json, read exclusions and write GapFinding[] back to context
- Standalone behavior: unchanged

## Changes to harness-knowledge-mapper

- [ADDED] Pipeline Context section: when `pipeline` field exists in handoff.json, read bootstrapped flag and write DocFix[] back to context
- Standalone behavior: unchanged

## Changes to documentation-maintainer persona

- [ADDED] `harness-docs-pipeline` to skills array
- [ADDED] `validate-context-engineering` to skills array
- [MODIFIED] Role description to include "run full documentation health pipeline"

## New: harness-docs-pipeline skill

- [ADDED] `skill.yaml` — orchestrator with 6 phases, 4 sub-skill dependencies, 4 CLI flags
- [ADDED] `SKILL.md` — full process documentation with schemas, convergence loops, verdict logic, safety classification, bootstrap sequence
