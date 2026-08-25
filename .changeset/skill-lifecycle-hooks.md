---
'@harness-engineering/core': minor
'@harness-engineering/cli': minor
---

Add a general cross-skill lifecycle-hook framework: a new top-level `skillHooks`
block in `harness.config.json` lets a project attach additional **skills**,
**commands**, and **prompts** at lifecycle points of any hook-supporting
orchestrator skill. Hooks are keyed by skill name and an event string
(`before:/after:<phase>`, `before:run`/`after:run`, or `on:<event>` such as
`on:failure`). Entries are a bare skill-name string or a discriminated
`{type: "skill" | "prompt" | "command"}` object, each with an optional `enabled`
toggle; `command`/`skill` hooks receive an env + stdin (or subagent-brief) input
context. Resolution/normalization is shared in `@harness-engineering/core`
(`resolveSkillHooks` + hook-context helpers). An unresolvable skill or
un-spawnable command is a hard halt (false-green protection), never a silent
skip. `harness-autopilot` (review + non-review + `on:failure`) and
`harness-code-review` (`after:mechanical`) are the wired reference consumers.

This **supersedes** the unreleased `review.additionalSkills` field, which is
removed — express it as `skillHooks["harness-autopilot"]["after:REVIEW"]` and
`["after:FINAL_REVIEW"]`. Closes #1481.
