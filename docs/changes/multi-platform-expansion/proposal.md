# Harness Multi-Platform Expansion — Codex CLI + Cursor

**Keywords:** `platform-expansion`, `codex-cli`, `cursor`, `skill-rendering`, `agents-md`, `mdc-rules`, `platform-adapters`, `skill-yaml-schema`

## Overview

Harness currently supports Claude Code and Gemini CLI. The two fastest-growing platforms in the developer AI space — OpenAI's Codex CLI and Cursor — have no harness integration, leaving those user bases without structured skill-driven workflows.

This spec adds Codex CLI and Cursor as first-class harness platforms via thin format adapters (Phase A), with schema space reserved for deeper native integration in a follow-on phase (Phase B).

**In scope:**

- Add `codex` and `cursor` to `ALLOWED_PLATFORMS`
- New skill directory symlinks for both platforms (79 skills each)
- `render-cursor.ts` — generates `.mdc` rules files for Cursor
- `render-codex.ts` — generates per-skill `SKILL.md` + `openai.yaml` placeholder + top-level `AGENTS.md`
- `skill.yaml` schema extension with reserved `codex:` and `cursor:` optional blocks

**Out of scope:**

- Windsurf, Continue.dev, GitHub Copilot, Aider (future work)
- Codex `agents/openai.yaml` deep integration (Phase B)
- Cursor slash commands
- Persona/agent definitions for new platforms (Phase B)
- Publishing to platform marketplaces

---

## Decisions

| Decision                 | Choice                                                | Rationale                                                                                                                                                                                             |
| ------------------------ | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Platforms to add         | Codex CLI + Cursor                                    | Codex CLI is the fastest-growing AI coding CLI (OpenAI's terminal agent, open source at github.com/openai/codex); Cursor is the hottest AI IDE. Together they cover the highest incremental audience. |
| Cursor integration model | Ambient rules (`.cursor/rules/*.mdc`)                 | Slash commands fight the grain of how Cursor works. Rules are the native Cursor pattern — they load automatically based on file context.                                                              |
| Codex integration model  | AGENTS.md aggregator + per-skill SKILL.md directories | Codex natively reads AGENTS.md and has its own SKILL.md concept with YAML frontmatter — the format maps cleanly to harness skills.                                                                    |
| Integration depth        | Thin adapters now, reserved schema for native later   | Codex's `agents/openai.yaml` spec is not stable. Building deep against it risks a rewrite. Reserved `codex:`/`cursor:` blocks in skill.yaml cost nothing and enable clean Phase B upgrade.            |
| Platform parity          | Full parity (all 79 skills) via symlinks              | Follows existing Gemini CLI pattern. Zero duplication overhead. Platform parity tests auto-enforce it.                                                                                                |

---

## Technical Design

### Platform Enum

Add `codex` and `cursor` to `ALLOWED_PLATFORMS` in:

- `packages/cli/src/slash-commands/types.ts`
- `packages/cli/src/skill/schema.ts`

### Skill Directory Structure

Symlink new platform dirs to `claude-code/` (same zero-duplication pattern as Gemini CLI):

```
agents/skills/codex/   ← 79 per-skill symlinks → agents/skills/claude-code/<skill>/
agents/skills/cursor/  ← 79 per-skill symlinks → agents/skills/claude-code/<skill>/
```

### skill.yaml Schema Extension

Two optional blocks added to the Zod schema — `cursor` is read by the renderer today; `codex` is parsed but reserved:

```yaml
# cursor: used by render-cursor.ts in Phase A
cursor:
  globs: string[] # e.g. ["src/**/*.ts"] — activates rule on file match
  alwaysApply: boolean # default: false

# codex: reserved for Phase B, parsed but ignored by renderer
codex:
  instructions_override: string
```

Both blocks are optional. Skills without them use platform defaults.

### Cursor Output

Renderer: `packages/cli/src/slash-commands/render-cursor.ts`
Output dir: `agents/commands/cursor/harness/`

Each skill renders as a `.mdc` file with YAML frontmatter:

```markdown
---
description: Structured ideation and exploration with harness methodology
alwaysApply: false
---

# Harness Brainstorming

...SKILL.md content...
```

If `cursor.globs` is set in skill.yaml, the frontmatter gains a `globs` field. If `cursor.alwaysApply: true`, it is reflected in the frontmatter.

### Codex CLI Output

Renderer: `packages/cli/src/slash-commands/render-codex.ts`
Output dir: `agents/commands/codex/`

Per skill — a directory with two files:

```
agents/commands/codex/harness/
  harness-brainstorming/
    SKILL.md              ← skill instructions (same content as source)
    agents/
      openai.yaml         ← minimal placeholder (Phase B will populate)
```

`openai.yaml` placeholder (Phase A):

```yaml
# Reserved for Phase B native integration
name: harness-brainstorming
version: '1.0.0'
```

Top-level aggregator at `agents/commands/codex/AGENTS.md` — bootstraps harness context and lists all available skills.

### Generator Updates

`generate-slash-commands.ts` — add `codex` and `cursor` cases to platform dispatch:

```
claude-code → renderClaudeCode()   (existing)
gemini-cli  → renderGemini()       (existing)
codex       → renderCodex()        (new)
cursor      → renderCursor()       (new)
```

`generate-agent-definitions.ts` — not extended in Phase A. Persona/agent output for Codex and Cursor is Phase B scope.

### File Layout

```
packages/cli/src/slash-commands/
  render-codex.ts          ← new
  render-cursor.ts         ← new
  types.ts                 ← +codex, +cursor to ALLOWED_PLATFORMS
packages/cli/src/skill/
  schema.ts                ← +codex, +cursor to platform enum + optional blocks

agents/skills/
  codex/                   ← new (79 symlinks)
  cursor/                  ← new (79 symlinks)

agents/commands/
  codex/
    AGENTS.md              ← new
    harness/<skill>/
      SKILL.md             ← new (79 skills)
      agents/openai.yaml   ← new (79 placeholders)
  cursor/
    harness/<skill>.mdc    ← new (79 files)
```

### Dependencies

- Existing `generate-slash-commands.ts` platform dispatch architecture (`packages/cli/src/commands/generate-slash-commands.ts`)
- Existing symlink parity pattern (`agents/skills/tests/platform-parity.test.ts`)
- Zod schema validation pipeline (`packages/cli/src/skill/schema.ts`)
- Existing renderer contracts (return type of `renderClaudeCode` / `renderGemini` as reference)

### Risks

| Risk                                                   | Mitigation                                                                          |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| Codex `agents/openai.yaml` spec changes before Phase B | Phase A emits only a placeholder — no deep schema dependency                        |
| Cursor `.mdc` frontmatter format changes               | Thin renderer with no logic beyond frontmatter mapping — easy to update             |
| Platform parity tests failing during symlink creation  | Tests dynamically discover platforms; symlinks must be created before running tests |

---

## Success Criteria

1. `harness generate-slash-commands --platform codex` renders all 79 skills to `agents/commands/codex/harness/<skill>/SKILL.md` with valid content.
2. `harness generate-slash-commands --platform cursor` renders all 79 skills to `agents/commands/cursor/harness/<skill>.mdc` with valid YAML frontmatter.
3. A top-level `agents/commands/codex/AGENTS.md` is generated listing all available harness skills.
4. `agents/skills/codex/` and `agents/skills/cursor/` contain symlinks for all 79 skills pointing to their `claude-code/` counterparts.
5. Platform parity tests pass — codex and cursor skill counts match claude-code.
6. `skill.yaml` validation accepts `codex:` and `cursor:` optional blocks without error.
7. `harness validate` passes after generation.
8. When `cursor.alwaysApply: true` is set in a skill.yaml, the rendered `.mdc` frontmatter reflects it.
9. When `cursor.globs` is set in a skill.yaml, the rendered `.mdc` frontmatter includes the glob array.
10. Existing claude-code and gemini-cli generation is unaffected.

---

## Implementation Order

### Phase A — Core (this spec)

1. **Schema updates** — Add `codex` and `cursor` to `ALLOWED_PLATFORMS`; extend `skill.yaml` Zod schema with optional `codex`/`cursor` blocks.
2. **Skill directories** — Create `agents/skills/codex/` and `agents/skills/cursor/` with symlinks for all 79 skills.
3. **Cursor renderer** — Implement `render-cursor.ts`, wire into `generate-slash-commands.ts`, generate `.mdc` output.
4. **Codex renderer** — Implement `render-codex.ts`, generate per-skill `SKILL.md` + `openai.yaml` placeholder + top-level `AGENTS.md`.
5. **Tests** — Verify platform parity, renderer output format, frontmatter correctness, glob/alwaysApply propagation.
6. **Validation** — Run `harness validate` and confirm existing platforms unaffected.

### Phase B — Native Integration (future spec)

1. Populate `cursor.globs` and `cursor.alwaysApply` across all 79 skill.yaml files based on each skill's domain.
2. Define full `agents/openai.yaml` schema and populate per skill.
3. Extend `render-codex.ts` to emit rich tool dependencies and invocation policies.
4. Add persona/agent definitions for Codex and Cursor platforms.
