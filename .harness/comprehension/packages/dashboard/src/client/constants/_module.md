---
schemaVersion: 1
module: 'packages/dashboard/src/client/constants'
sourceHash: 'edd7c430063ab70096659263fa638d72a315d1d7f956757f1b0d2cfa00c5d862'
compiledAt: '2026-08-28T01:22:11.291Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['skills.ts']
---

## Summary

SKILL_REGISTRY is a curated catalog of 40+ harness engineering skills organized by category (health, security, performance, architecture, code-quality, workflow). Each skill entry maps a unique ID to its UI name, description, slash-command trigger, and metadata. The registry is the single source of truth for the dashboard's skill menu — it drives both discovery UI and CLI routing. Critical structural patterns: IDs follow `harness:capability` naming; a subset are marked `loadBearing: true` (core workflow gates: verify, outcome-eval, code-review, initialize-project, strategy, brainstorming, planning, execution, tdd, debugging, autopilot, roadmap-pilot). Optional `contextSources` fields point to API endpoints for dynamic data injection.

## Invariants

- SKILL_REGISTRY is the single source of truth for all available skills in the dashboard and CLI; unregistered skills are unreachable.
- Each skill ID must be globally unique and follow the 'harness:capability' naming pattern; collisions silently break routing.
- The slashCommand field must exactly match CLI syntax users type; mismatches cause 'command not found' errors.
- Skills marked loadBearing: true (verify, outcome-eval, code-review, initialize-project, strategy, brainstorming, planning, execution, tdd, debugging, autopilot, roadmap-pilot) are workflow gates; removing or renaming them breaks orchestration pipelines.
- Only 6 categories exist (health, security, performance, architecture, code-quality, workflow); new skills must fit one; new categories require dashboard filtering logic changes.
- The contextSources field is optional but when present, must point to valid /api/\* endpoints or the dashboard hydration fails silently.

## Interface Contract

```ts
export SKILL_REGISTRY
```

## Dependency Slice

```
import { SkillEntry } from '../types/skills'
```
