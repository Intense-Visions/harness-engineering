---
schemaVersion: 1
module: 'packages/core/src/hooks'
sourceHash: '75869716f1f9c18e6c7a7661d6a605b512d51b0e16f1977672a814ff95cee98b'
compiledAt: '2026-08-28T01:22:10.407Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['canary-review-hooks.ts', 'hook-context.ts', 'index.ts', 'skill-lifecycle.ts']
---

## Summary

The `hooks` module implements declarative hook dispatch for harness automations, centered on auto-wiring Canary's four deterministic test detectors (savant, blackhawk, katana, cassandra) at autopilot's REVIEW and FINAL_REVIEW stages. Canary defaults gracefully skip if not installed (forward-wired), unlike user-declared hooks which hard-halt on resolution failure—this distinction keeps the feature adoptable without per-project config. Detectors run alongside harness-code-reviewer (never replacing). hook-context.ts defines the context contract (event, phase, session dir, etc.) threaded to every hook via env vars (portable), STDIN JSON (structured), and skill briefs. skill-lifecycle.ts provides base machinery for declaring, resolving, and normalizing skillHooks from config with blocking/non-blocking dispatch modes.

## Invariants

- Graceful Skip vs. Hard Halt: Canary defaults silently skip if not installed (undefined availability → skip all). User-declared hooks hard-halt on resolution failure. This distinction is enforced in resolveReviewHooksWithCanary, not in caller or config.
- Availability is Input, Not Probed: Presence and skill availability are caller-supplied; module stays IO-free. undefined means 'skip all defaults.' Caller owns truth about installed skill catalog.
- Dedup by Raw Declaration: Canary default dropped only if skill name appears in raw declared set (including enabled:false parks). Project's explicit entry always wins; disabled entry prevents default re-injection.
- Event Gating: Canary detectors wire ONLY at after:REVIEW and after:FINAL_REVIEW on harness-autopilot. Other events and host skills never gain Canary defaults.
- Ordering and Non-Overlap: Four detectors dispatched in fixed order; each finds distinct, non-overlapping defect class. Merging findings requires no dedup.
- Env Contract: Unset not Empty: Missing context values produce unset env keys, never empty strings or 'null' placeholders. Hooks must handle absent HARNESS\_\* vars.
- Configured Hooks Lead: User hooks dispatched first; Canary defaults append. Configured hook for same skill wins (default never re-appears). Dedup against all declared names, including enabled:false.
- Context Threaded: All hooks receive invocation context (event, phase, session dir, changed files, plan path, failure reason). Passed three ways: env vars, STDIN JSON, skill briefs. No templating ({{token}} reserved for v2).

## Interface Contract

```ts
export CANARY_REVIEW_DETECTORS
export CANARY_REVIEW_EVENTS
export CANARY_REVIEW_HOST_SKILL
export CanaryReviewDetectorPlan
export HookContext
export NormalizedHook
export SKILL_HOOK_EVENT_KEY_RE
export SkillAvailability
export SkillHookEntry
export SkillHooksConfig
export SkillHooksConfigHolder
export SkillHooksForSkill
export buildHookBriefLines
export buildHookEnv
export buildHookStdinPayload
export defaultBlocking
export planCanaryReviewDetectors
export resolveCanaryReviewHooks
export resolveReviewHooksWithCanary
export resolveSkillHooks
```

## Dependency Slice

```
import { NormalizedHook, SkillHookEntry, SkillHooksConfigHolder, defaultBlocking, resolveSkillHooks } from './skill-lifecycle'
```
