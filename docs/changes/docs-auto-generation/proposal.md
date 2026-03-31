# Documentation Auto-Generation

**Keywords:** docs, reference, CLI, MCP, skills, catalog, auto-generate, CI, freshness, build-script

## Overview

Documentation Auto-Generation adds a build script (`scripts/generate-docs.ts`) that produces three reference docs from code metadata: CLI Command Reference, MCP Tools Reference, and Skills Catalog. A CI freshness check ensures generated docs never drift from source. This complements hand-written narrative docs (features overview, personas guide).

### Goals

1. CLI reference, MCP tools reference, and skills catalog are generated from code — never hand-maintained
2. Generated docs are always current via CI freshness check
3. A single `pnpm run generate-docs` command regenerates all three
4. Generated docs follow a consistent format and link back to the features overview

### Non-goals

- Auto-generating narrative documentation (features overview, personas guide)
- Generating API docs from JSDoc (separate tooling concern)
- Publishing docs to a website (future scope)
- Generating docs for external/community skills

## Decisions

| Decision              | Choice                                                                                              | Rationale                                                                      |
| --------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Generation approach   | Build script at `scripts/generate-docs.ts`                                                          | Simple, discoverable via `pnpm run generate-docs`, no CLI package changes      |
| Output location       | `docs/reference/cli-commands.md`, `docs/reference/mcp-tools.md`, `docs/reference/skills-catalog.md` | Separate `reference/` directory distinguishes generated from hand-written docs |
| CLI source            | Parse Commander metadata from `packages/cli/src/commands/*.ts` and `packages/cli/src/index.ts`      | Commands self-describe via `.description()`, `.option()`, `.argument()`        |
| MCP source            | Parse tool registrations from `packages/cli/src/mcp/server.ts`                                      | Each tool has name, description, and input schema                              |
| Skills source         | Read `agents/skills/claude-code/*/skill.yaml`                                                       | Every skill has name, tier, description, triggers, platforms in YAML           |
| CI enforcement        | `pnpm run generate-docs && git diff --exit-code docs/reference/` in CI                              | Fails if generated docs are stale — same pattern as coverage ratchet           |
| Generated file header | `<!-- AUTO-GENERATED — do not edit. Run pnpm run generate-docs to regenerate. -->`                  | Prevents accidental manual edits                                               |

## Technical Design

### Build Script

Location: `scripts/generate-docs.ts`

The script has three generators, each reading from a different source and producing one markdown file:

**CLI Reference Generator:**

- Walks `packages/cli/src/commands/` and `packages/cli/src/index.ts`
- Instantiates Commander programs to extract the command tree
- For each command/subcommand: name, description, arguments (with types), options (with defaults)
- Groups by command group (top-level, agent, skill, state, graph, hooks, perf, etc.)
- Output: `docs/reference/cli-commands.md`

**MCP Tools Generator:**

- Reads `packages/cli/src/mcp/server.ts` and tool registration files in `packages/cli/src/mcp/tools/`
- Extracts tool name, description, and input schema (parameter names, types, required/optional)
- Groups by category (checkers, generators, graph-queries, reviewers, state-management, etc.)
- Links to corresponding CLI command where one exists
- Output: `docs/reference/mcp-tools.md`

**Skills Catalog Generator:**

- Globs `agents/skills/claude-code/*/skill.yaml`
- Parses YAML for: name, tier, description, triggers, platforms, cognitive_mode, type, depends_on
- Groups by tier (Tier 1: Workflow, Tier 2: Maintenance, Tier 3: Domain)
- Sorts alphabetically within each tier
- Output: `docs/reference/skills-catalog.md`

### Output Format

Each generated file starts with:

```markdown
<!-- AUTO-GENERATED — do not edit. Run pnpm run generate-docs to regenerate. -->
```

**CLI Reference structure:**

```markdown
# CLI Command Reference

## Top-Level Commands

### `harness validate`

Run all validation checks.
**Options:** `--cross-check` — Run cross-artifact consistency validation
...

## Skill Commands

### `harness skill list`

...
```

**MCP Tools Reference structure:**

```markdown
# MCP Tools Reference

## Checkers

### `validate_project`

Run all validation checks.
**Parameters:** `path` (string, optional) — Project root path
...
```

**Skills Catalog structure:**

```markdown
# Skills Catalog

## Tier 1 — Workflow (11 skills)

### harness-brainstorming

Structured ideation and exploration with harness methodology

- **Triggers:** manual, on_new_feature
- **Platforms:** claude-code, gemini-cli
- **Type:** rigid
  ...

## Tier 2 — Maintenance (19 skills)

...

## Tier 3 — Domain (43 skills)

...
```

### CI Freshness Check

Added to `.github/workflows/ci.yml`:

```yaml
- name: Verify generated docs are fresh
  run: pnpm run generate-docs && git diff --exit-code docs/reference/
```

This fails if any generated doc is out of date, forcing the contributor to run `pnpm run generate-docs` before committing.

### File Layout

```
scripts/
  generate-docs.ts              # main generation script
docs/reference/
  cli-commands.md               # generated: 76+ commands
  mcp-tools.md                  # generated: 54 tools
  skills-catalog.md             # generated: 79 skills
```

### Package.json Addition

```json
{
  "scripts": {
    "generate-docs": "tsx scripts/generate-docs.ts"
  }
}
```

## Success Criteria

1. When `pnpm run generate-docs` is run, it produces three markdown files in `docs/reference/`
2. The CLI reference lists all 76+ commands with descriptions, arguments, and options
3. The MCP tools reference lists all 54 tools with descriptions and input parameters
4. The skills catalog lists all 79 skills grouped by tier with descriptions and triggers
5. Each generated file has an auto-generated header warning against manual edits
6. When a new CLI command is added and `generate-docs` is not re-run, CI fails
7. When a new skill is added and `generate-docs` is not re-run, CI fails
8. Generated docs are valid markdown with consistent formatting

## Implementation Order

1. **Phase 1: Script skeleton** — Create `scripts/generate-docs.ts` with output framework, file writers, and header generation. Add `generate-docs` script to root `package.json`.
2. **Phase 2: CLI reference generator** — Parse Commander command tree, extract metadata, generate `cli-commands.md`
3. **Phase 3: MCP tools generator** — Parse tool registrations, extract schemas, generate `mcp-tools.md`
4. **Phase 4: Skills catalog generator** — Read skill.yaml files, group by tier, generate `skills-catalog.md`
5. **Phase 5: CI integration** — Add freshness check to CI workflow, verify all three docs stay current
