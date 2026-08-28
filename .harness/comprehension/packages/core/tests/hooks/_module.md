---
schemaVersion: 1
module: 'packages/core/tests/hooks'
sourceHash: 'ac2e55422c647fb012367cd0bf07b96dfd2d14afdab95cbfc5d3b4ee5e8c05bc'
compiledAt: '2026-08-28T01:22:10.869Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['canary-review-hooks.test.ts', 'skill-lifecycle.test.ts']
---

## Summary

The `packages/core/tests/hooks` module tests two interdependent subsystems for lifecycle hook resolution. **skill-lifecycle.test.ts** validates a shared hook resolver that normalizes three entry types (skill shortcuts, prompt directives, command runs) across all skills. It enforces a default blocking policy (review/verify events block by default; others don't), builds hook context for subagents, and respects per-entry overrides and enabled toggles. **canary-review-hooks.test.ts** layers canary's four deterministic review detectors into harness-autopilot's review moments, with graceful degradation: detectors are availability-filtered (skipped if not installed, never a hard halt), while user-declared hooks hard-halt on resolution failure. The system deduplicates against explicit config, honors enabled:false opt-outs, preserves non-skill hooks, and restricts injection to harness-autopilot at the two review events.

## Invariants

- Default blocking policy: review/verify lifecycle events (after:REVIEW, after:FINAL_REVIEW, after:VERIFY, before:review) default to blocking:true; all others default to blocking:false. Substring matches (preview, reverify, unverified) are rejected.
- Canary detector availability filtering: only harness-DEFAULT canary detectors are skipped on missing skills; user-declared hooks flow through regardless so the dispatcher can hard-halt on them.
- Deduplication and opt-out: a detector already in project config (explicit or bare-string) is not re-injected; enabled:false on a detector prevents re-injection on all future merges.
- Canary scope: detectors attach only to harness-autopilot, only at after:REVIEW and after:FINAL_REVIEW events; other hosts and events receive no canary injection.
- Non-skill hook preservation: prompt and command entries flow through untouched in declared order, appended after or between skill hooks; prompts never carry a blocking field.
- Hook context omits empty fields: buildHookEnv and buildHookStdinPayload omit absent optional fields rather than passing empty strings (absent → unset env var).
- Cross-skill isolation: each skill sees only its own hooks; resolveSkillHooks scoped by skillName returns [] for unmatched event keys or missing config.
- Event-key grammar: accepts before:/after:/on: with lifecycle phases or run-boundary forms (before:run, on:failure, after:REVIEW); rejects malformed keys (during:, missing prefix/suffix, spaces).

## Interface Contract

```ts

```

## Dependency Slice

```
import { CANARY_REVIEW_DETECTORS, CANARY_REVIEW_EVENTS, planCanaryReviewDetectors, resolveCanaryReviewHooks, resolveReviewHooksWithCanary } from '../../src/hooks/canary-review-hooks'
import { HookContext, buildHookBriefLines, buildHookEnv, buildHookStdinPayload } from '../../src/hooks/hook-context'
import { SKILL_HOOK_EVENT_KEY_RE, SkillHooksConfigHolder, defaultBlocking, resolveSkillHooks } from '../../src/hooks/skill-lifecycle'
import { describe, expect, it } from 'vitest'
```
