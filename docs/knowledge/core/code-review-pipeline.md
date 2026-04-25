---
type: business_process
domain: core
tags: [review, code-review, pipeline, context-bundles, evidence]
---

# Code Review Pipeline

The review module orchestrates a 7-phase code review process that combines mechanical checks with domain-specific AI analysis.

## Phases

1. **Eligibility Gate** — Checks PR state (must be open, not draft), changed file count, and prior review history. Stops ineligible PRs before consuming resources.

2. **Mechanical Checks** — Runs validate, check-deps, check-docs, and security-scan in parallel. Validate and check-deps failures stop the pipeline; security and docs failures emit warnings.

3. **Context Scoping** — Analyzes the diff to detect change type (feature/bugfix/refactor/docs). Builds ContextBundles for 5 review domains (compliance, bug, security, architecture, learnings), each receiving diff files plus relevant imports, tests, specs, and types.

4. **Parallel Agent Review** — Spawns 5 subagents (one per domain) in parallel. Each receives a ContextBundle and produces domain-specific findings.

5. **Deduplication & Synthesis** — Findings are deduplicated by location and message, grouped by severity, and classified as critical/important/suggestion.

6. **Evidence Gate** — Cross-references findings against session evidence entries. Uncited findings are flagged [UNVERIFIED], enabling traceability from findings back to source evidence.

7. **Output & Reporting** — Formats GitHub inline comments with file-specific findings, highlights strengths, and reports evidence coverage metrics.

## Review Assessment

The final assessment (approve/comment/request-changes) is derived from findings and severity distribution. Spec context is only provided during spec-compliance review to keep other domains objective.
