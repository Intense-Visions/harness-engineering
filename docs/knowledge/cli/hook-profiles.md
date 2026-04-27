---
type: business_rule
domain: cli
tags: [hooks, profiles, safety, automation, events]
related: [HookProfile]
---

# Hook Profile Safety Tiers

Hook profiles implement a tiered safety system for Claude Code automation, controlling which hooks fire at each event. The valid profile values are defined by the `HookProfile` type (`'minimal' | 'standard' | 'strict'`) in `packages/cli/src/hooks/profiles.ts`.

## Profile Tiers

- **Minimal** — Safety floor: `block-no-verify` (prevents Bash execution without verification)
- **Standard** (default) — Adds: `protect-config` (guards config edits), `quality-gate` (validates post-edit outputs), `pre-compact-state` (preserves state before compaction), `adoption-tracker`, `telemetry-reporter`
- **Strict** — Adds: `cost-tracker` (monitors token spend), `sentinel-pre`/`sentinel-post` (comprehensive security scanning)

## Cumulative Rule

Profiles are ordered and cumulative. Moving from minimal to standard to strict adds hooks without removing any. Higher profiles always include all lower-profile hooks.

## Event System

Hooks are event-driven with pattern-based matchers:

- **PreToolUse** — Before a tool executes (pattern matches tool name, e.g., "Bash", "Write|Edit")
- **PostToolUse** — After a tool completes
- **PreCompact** — Before context compaction
- **Stop** — On session end

## Implementation

Each hook is a JavaScript file in `/hooks/` (e.g., `block-no-verify.js`). Hooks declare their event trigger, matcher pattern (regex or `*` for all tools), and minimum profile tier. The hook system resolves which hooks apply by filtering on the active profile.
