# Health Analyst Security Scan Integration

**Date:** 2026-03-19
**Status:** Proposed
**Keywords:** security, scanner, health-analyst, triage, severity-threshold, mechanical-scan, check-security

## Overview

Add a lightweight security scanning dimension to the codebase-health-analyst persona. Teams get continuous security triage as part of their regular health checks, without duplicating the deep analysis provided by the security-reviewer persona.

### In Scope

- New `harness-security-scan` skill — mechanical-only, single-phase wrapper around `SecurityScanner`
- New `check-security` CLI command — matches `check-perf` pattern
- Updated `codebase-health-analyst.yaml` — adds skill, command, and config
- Changed-file scoping for PR triggers
- Configurable severity threshold (default: `warning`)

### Out of Scope

- AI-powered review (stays in `harness-security-review`)
- Threat modeling (stays in security-reviewer persona)
- Changes to the existing `harness-security-review` skill or `security-reviewer` persona
- New vulnerability detection rules (uses existing `SecurityScanner` as-is)

## Decisions

| #   | Decision                                                                  | Rationale                                                                                                                     |
| --- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 1   | Lightweight mechanical scan only                                          | Health analyst is a broad triage tool; deep security analysis belongs in the security-reviewer persona                        |
| 2   | Configurable severity threshold (`securitySeverity`, default `warning`)   | Follows existing config patterns; lets teams tune noise level                                                                 |
| 3   | Full scan on weekly cron, changed-files-only on PR                        | Avoids redundancy with security-reviewer's PR trigger while maintaining continuous coverage                                   |
| 4   | New `check-security` CLI command                                          | Consistent with `check-deps` and `check-perf`; independently useful                                                           |
| 5   | New `harness-security-scan` skill (not reusing `harness-security-review`) | Clean separation — mechanical scan vs. deep review are fundamentally different operations with different performance profiles |
| 6   | No threat modeling in health analyst                                      | Threat modeling is inherently deep analysis; keeping it out preserves the health analyst's speed                              |
| 7   | Existing projects update via `harness generate-agent-definitions`         | Established sync pattern — no new migration machinery needed. CI workflows regenerated to include `check-security` step       |

## Technical Design

### New Skill: `harness-security-scan`

**Location:** `agents/skills/claude-code/harness-security-scan/` (+ gemini-cli mirror)

```yaml
name: harness-security-scan
version: '1.0.0'
description: Lightweight mechanical security scan for health checks
cognitive_mode: meticulous-implementer
triggers:
  - manual
  - scheduled
platforms:
  - claude-code
  - gemini-cli
tools:
  - Bash
  - Read
  - Glob
  - Grep
type: rigid
phases:
  - name: scan
    description: Run SecurityScanner and filter by severity threshold
    required: true
depends_on: []
```

**SKILL.md workflow:**

1. Resolve project root and load `harness.config.json` security config
2. If triggered by PR with changed files, scope scan to those files only
3. Call `SecurityScanner.scanFiles()`
4. Filter findings by configured severity threshold
5. Output structured report (findings count, file list, top findings)

### New CLI Command: `check-security`

**Location:** `packages/cli/src/commands/check-security.ts`

Pattern-matches `check-perf.ts`:

- `--path` — project root (defaults to cwd)
- `--severity` — override threshold (defaults to config value or `warning`)
- `--changed-only` — scan only git-changed files (for PR use)
- Calls `SecurityScanner` from `@harness-engineering/core`
- Exits non-zero if any findings meet/exceed severity threshold

### Updated Persona: `codebase-health-analyst.yaml`

```yaml
skills:
  - harness-hotspot-detector
  - harness-dependency-health
  - harness-impact-analysis
  - cleanup-dead-code
  - harness-perf
  - harness-security-scan # added
commands:
  - graph status
  - check-deps
  - check-perf
  - check-security # added
config:
  severity: warning
  autoFix: false
  timeout: 600000
  securitySeverity: warning # added
```

### Configuration Migration

No migration script needed. Existing projects pick up changes through the established workflow:

1. **Persona config** — `securitySeverity` default is in the persona YAML. Users get it on harness update.
2. **CLI command** — Available after package update. No config needed.
3. **CI workflow** — Run `harness generate-agent-definitions` to regenerate CI workflow with the new `check-security` step. This is the existing sync pattern for all persona-to-CI changes.

### File Layout

```
agents/skills/claude-code/harness-security-scan/
  skill.yaml
  SKILL.md
agents/skills/gemini-cli/harness-security-scan/
  skill.yaml
  SKILL.md
packages/cli/src/commands/check-security.ts
agents/personas/codebase-health-analyst.yaml  (modified)
```

## Success Criteria

- When `check-security` runs on a project, it produces findings filtered by the configured severity threshold
- When the health analyst triggers on a PR with 10+ files, only the changed files are scanned for security
- When the health analyst triggers on the weekly cron, all source files are scanned
- When a project has no `security` config in `harness.config.json`, the scanner uses defaults and the severity threshold defaults to `warning`
- When a user runs `harness generate-agent-definitions`, the CI workflow includes the `check-security` step
- If the security scan finds findings at or above the severity threshold, the CLI exits non-zero
- The health analyst's total runtime does not increase by more than 15% with the security scan added

## Implementation Order

1. New `harness-security-scan` skill — skill.yaml + SKILL.md for both platforms
2. New `check-security` CLI command — following `check-perf.ts` pattern
3. Update `codebase-health-analyst.yaml` — add skill, command, and `securitySeverity` config
4. Update CI workflow generation — ensure `generate-agent-definitions` includes `check-security` step
5. Tests — CLI command tests following existing `check-perf` test patterns
