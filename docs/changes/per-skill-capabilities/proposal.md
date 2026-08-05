# Per-Skill Capability Declarations

**Roadmap item:** `add-per-skill-capability-declarations`
**Keywords:** skill.yaml, capabilities, tools, network, filesystem, bounds-enforcement, skill-validation

## Overview

Skills are markdown + YAML. Each `skill.yaml` already declares a `tools:` list
(e.g. `tools: [Bash, Read, Write, Edit, Glob, Grep]`), but nothing declares the
capability envelope a skill needs — whether it touches the network, whether it
writes the filesystem or only reads it. Without that surface, there is no place
for a future orchestrator/daemon to bound a skill to what it declared.

This change adds a `capabilities:` manifest to `skill.yaml` and a validation
that enforces it today. It is the **declaration + validation** layer. Runtime
bounds-enforcement (an orchestrator actually blocking a skill that exceeds its
envelope) is a deliberate follow-up (see Non-Goals).

### Problem

The article's gear #4 ("bounded, observable, reversible") applies at the
orchestrator-workspace grain today, and only when the daemon is running. At the
skill grain there is nothing: a skill's markdown can direct the agent to take
any action the user permitted Claude Code. The first prerequisite for bounding a
skill is a machine-readable statement of what it should be allowed to do — and
that statement must be validated, or it rots into a comment.

## Design

### Schema

`SkillCapabilitiesSchema` (in `packages/cli/src/skill/schema.ts`):

```yaml
capabilities:
  tools: [Bash, Read, Write, Edit, Glob, Grep] # mirrors the skill's tools:
  network: false # WebFetch/WebSearch present?
  filesystem: read-write # none | read | read-write
```

The field is **optional** in the schema (backward compatible; third-party and
knowledge skills without it still parse), and added as
`capabilities: SkillCapabilitiesSchema.optional()` on `SkillMetadataSchema`.

### Derivation from `tools:`

`deriveCapabilities(tools)` maps the existing `tools:` list to an envelope
mechanically, so the 89 harness-authored skills are seeded rather than
hand-authored:

- `filesystem = 'read-write'` if any mutating tool (`Write`, `Edit`,
  `MultiEdit`, `NotebookEdit`, `Bash`) is present — a shell can create and
  delete files, so `Bash` counts as read-write. Else `'read'` if any read-only
  tool (`Read`, `Glob`, `Grep`) is present. Else `'none'`.
- `network = true` if any network tool (`WebFetch`, `WebSearch`) is present.
- `tools` mirrors the declared list verbatim, so the envelope is self-contained
  for a future enforcer that never re-reads the skill body.

### The wired check (teeth)

`harness skill validate` (and the vitest suite that runs it in CI) enforces two
rules via `validateSkillEntry`:

1. **Presence** — every harness-authored skill (reserved `harness-` name
   prefix) MUST declare `capabilities`. A missing declaration fails validation.
2. **Consistency** — any skill that declares `capabilities` must keep it
   consistent with its `tools:` list. `capabilityDriftErrors(tools, declared)`
   flags a tool-set mismatch, a wrong `network`, or a wrong `filesystem`. So
   adding `WebFetch` to `tools` without setting `network: true`, or listing a
   tool the envelope omits, fails.

This is what makes the primitive non-dormant: it runs today, in
`harness skill validate` and in CI, and fails on a missing or drifted
declaration.

### Seeding

All 89 `agents/skills/claude-code/harness-*/skill.yaml` files are seeded with
their derived envelope. The four platform trees (`claude-code`, `gemini-cli`,
`codex`, `cursor`) are hardlinks of the same inode, so seeding once populates
all four. The `gemini-cli` command tomls embed the full `skill.yaml`, so their
plugin artifacts are regenerated (content-only; no file-set change).

## Non-Goals (follow-up)

- **Runtime bounds-enforcement.** This change does not make the
  orchestrator/daemon block a skill from exceeding its declared capabilities.
  That requires orchestrator work and is the next item on this thread.
- **Per-tool network/filesystem scoping** (allowed hosts, path allowlists).
  The envelope is coarse (`boolean` / three-level enum) by design; finer grain
  can extend the schema later without breaking existing declarations.
