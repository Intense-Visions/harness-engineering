# Project-Local Skill Discovery

> Extend `generate-slash-commands` to discover project-level skills by default, with opt-in for built-in globals. Fix `create-skill` to declare both platforms.

**Keywords:** skills, slash-commands, discovery, project-local, generate, create-skill, multi-platform

## Overview

`harness generate-slash-commands` only discovers built-in skills from the CLI package's bundled `agents/skills/` directory. Project-level skills created via `harness create-skill` are invisible to the generator. Additionally, `create-skill` only scaffolds for `claude-code` but should declare both platforms.

### Goals

1. `generate-slash-commands` discovers project-local skills by default (from `agents/skills/claude-code/` relative to project root)
2. `--include-global` flag merges built-in skills into the output alongside project skills
3. Project skills take precedence over global skills on name collision
4. `create-skill` generates `skill.yaml` with `platforms: [claude-code, gemini-cli]` by default
5. All existing global-only behavior continues to work when run outside a project (fallback)

### Out of Scope

- Skill registry abstraction (YAGNI — can be introduced later if more sources emerge)
- Separate output directories for project vs global skills
- Platform-specific skill directories (single source in `claude-code/`, `platforms` field controls rendering)

## Decisions

| Decision                                                            | Rationale                                                                                                     |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Project-local by default, `--include-global` for built-ins          | User ran `create-skill` in their project — they expect the generator to find those skills without extra flags |
| Single canonical skill in `claude-code/` dir, multi-platform render | Matches existing built-in pattern. `platforms` field in `skill.yaml` controls which renderers fire            |
| `findUpDir` from CWD for project root detection                     | Consistent with existing resolution pattern, forgiving for nested directories                                 |
| Project skills win on name collision                                | Local customization should override defaults, same as most config layering systems                            |
| `resolveSkillsDir` split into project + global functions            | Centralizes the distinction so `skill list`, `skill run` can adopt later without duplicating logic            |

## Technical Design

### File Modifications

**1. `packages/cli/src/utils/paths.ts`**

Split `resolveSkillsDir()` into two functions:

- `resolveProjectSkillsDir(cwd?: string): string | null` — walks up from CWD looking for `agents/skills/claude-code/`. Returns `null` if not in a project context.
- `resolveGlobalSkillsDir(): string` — current behavior, returns bundled skills path from the CLI package.
- Keep existing `resolveSkillsDir()` as a wrapper that tries project first, falls back to global (backward compat for other callers).

**2. `packages/cli/src/slash-commands/types.ts`**

Add `source?: 'project' | 'global'` to `SlashCommandSpec` for traceability in dry-run output.

**3. `packages/cli/src/slash-commands/normalize.ts`**

Change `normalizeSkills()` signature to accept `string[]` (array of skill directories) instead of a single `string`:

- Scan all directories, collect skills
- On collision from different sources: project wins (earlier entries in the array have higher priority)
- On collision from same source: error (existing behavior preserved)
- Tag each `SlashCommandSpec` with its source

**4. `packages/cli/src/commands/generate-slash-commands.ts`**

- Add `--include-global` option (boolean, default false)
- Replace single `skillsDir` resolution with:
  - Always try `resolveProjectSkillsDir()`
  - If `--include-global`, also call `resolveGlobalSkillsDir()`
  - If no project dir found and no `--skills-dir` override, fall back to global (backward compat)
- Pass array of skill directories to `normalizeSkills()`
- `--skills-dir` continues to work as a full override (ignores both project and global discovery)

**5. `packages/cli/src/commands/create-skill.ts`**

Change default `platforms` in generated `skill.yaml` from `[claude-code]` to `[claude-code, gemini-cli]`.

**6. `packages/mcp-server/src/tools/generate-slash-commands.ts`**

Add `includeGlobal` boolean parameter to the MCP tool schema, passed through to the generator.

### Data Flow

```
generate-slash-commands
  ├─ resolveProjectSkillsDir(cwd) → agents/skills/claude-code/ (or null)
  ├─ if --include-global: resolveGlobalSkillsDir() → dist/agents/skills/claude-code/
  ├─ normalizeSkills([projectDir, globalDir].filter(Boolean))
  │    ├─ scan each dir for skill.yaml
  │    ├─ validate & normalize each skill
  │    └─ dedupe: first source (project) wins on collision
  ├─ render per platform
  └─ sync to output dir
```

### Collision Handling

| Scenario                                     | Behavior                                                |
| -------------------------------------------- | ------------------------------------------------------- |
| Two project skills with same normalized name | Error (existing behavior)                               |
| Project skill collides with global skill     | Project wins, global silently dropped                   |
| `--dry-run` with collision                   | Shows both, marks which is active and which is shadowed |

## Success Criteria

1. Running `harness generate-slash-commands` in a project with `agents/skills/claude-code/my-skill/` discovers and generates a slash command for `my-skill`
2. Running `harness generate-slash-commands` in a project with no local skills and no `--include-global` produces zero commands (or a helpful message)
3. Running `harness generate-slash-commands --include-global` generates both project and built-in skills
4. When a project skill has the same normalized name as a built-in, the project version wins with `--include-global`
5. Running outside any project (no `agents/skills/` found) falls back to global skills (backward compat)
6. `harness create-skill --name foo --description "bar"` produces a `skill.yaml` with `platforms: [claude-code, gemini-cli]`
7. `--skills-dir` still works as a full override
8. `--dry-run` output shows the source (project/global) for each generated command
9. Existing integration tests continue to pass
10. Slash commands generated from project skills use correct relative paths

## Implementation Order

1. `paths.ts` — split resolution functions (foundation)
2. `types.ts` — add `source` field
3. `normalize.ts` — multi-directory support with collision handling
4. `generate-slash-commands.ts` (CLI) — wire up `--include-global`, new resolution flow
5. `create-skill.ts` — default both platforms
6. `generate-slash-commands.ts` (MCP) — add `includeGlobal` param
7. Tests — update integration tests, add project-local discovery, collision, and fallback cases

Steps 1–4 are sequential. Step 5 is independent. Step 6 depends on 4. Step 7 spans all changes.
