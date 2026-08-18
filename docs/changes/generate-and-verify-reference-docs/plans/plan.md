# Plan — Generate-and-verify skill/MCP-tool reference docs (#1401)

## Problem

`detect-doc-drift` is advisory. The existing `scripts/generate-docs.mjs` already
emits `docs/reference/mcp-tools.md` and `docs/reference/skills-catalog.md` with a
`--check` freshness gate, but `mcp-tools.md` renders only a **shallow, one-line-
per-parameter** summary of each tool. It cannot see drift _inside_ a nested
object, an `enum`, an array's `items` schema, or the `required` set — so a tool's
real input schema and its documented schema can silently diverge. There is no
canonical, gated serialization of the **full live schema** for skills or tools.

## Goal

Port dsh's `gen-tool-catalog` / `verify-tool-catalog` pattern: boot every shipped
MCP tool and skill definition against a real context, extract its live
name/description/schema, GENERATE a canonical catalog, and add a VERIFY mode that
regenerates in CI and fails the build on any diff — the exact generate-then-diff
shape `generate-barrel-exports:check` / `generate-docs --check` already use.

## Approach (mirror the existing convention, don't reinvent it)

1. **New generator** `scripts/generate-tool-catalog.mjs`:
   - Boots the **live** MCP tool definitions from the built CLI dist
     (`getToolDefinitions()` — same real-context boot generate-docs uses).
   - Reads the **live** skill contracts from every `agents/skills/claude-code/*/skill.yaml`.
   - Emits `docs/reference/tool-catalog.md` capturing each tool's **full input
     schema** (`JSON.stringify` of the whole `inputSchema`) and each skill's
     **full declared contract** (tier, catalog tier, type, cognitive mode,
     platforms, triggers, depends_on).
   - Determinism (the #1081 lesson): code-point sort of every entry, deep-sorted
     JSON keys, `\n` newlines, VitePress angle-bracket escaping in prose.
   - `--check`: regenerate to a temp location and exit non-zero on any diff.

2. **Both commands**, following the `generate-barrel-exports` / `:check` pair:
   - `pnpm run generate:tool-catalog`
   - `pnpm run generate:tool-catalog:check`

3. **Gate it for real**:
   - CI: a new `Verify tool & skill catalog is fresh` step in
     `.github/workflows/ci.yml` (ubuntu leg, after the existing docs check,
     after `pnpm build`).
   - Pre-push: mirror the reference-docs freshness gate in `.husky/pre-push`.

4. **Determinism vs prettier**: prettier's embedded-JSON array formatting is
   non-idempotent around its print-width boundary (collapses a short `enum` on
   one pass, re-expands on the next), which would make the check flap. The
   generator therefore owns byte-exact output and the file is added to
   `.prettierignore` — the same escape hatch the roadmap serializer and the
   empty-changeset marker already use.

5. **Discoverability**: link the catalog from `docs/reference/index.md`
   (consistent with the other generated reference pages, which are linked from
   the index rather than the manually-curated sidebar).

## Non-goals

- Not replacing `mcp-tools.md` / `skills-catalog.md` (the human-readable
  summaries stay; this is the schema-fidelity twin beside them).
- No new `@harness-engineering/core` export (so no barrel-allowlist edit needed).

## Verification

- `pnpm run generate:tool-catalog` writes the catalog; `:check` passes on a fresh
  tree and exits non-zero when any tool/skill definition is mutated (negative
  test performed).
- CI step gates the same check on ubuntu after build.
