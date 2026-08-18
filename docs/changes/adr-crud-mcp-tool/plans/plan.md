# Plan: `manage_adr` — ADR CRUD as an MCP tool

Issue: Intense-Visions/harness-engineering#1283
Slug: `adr-crud-mcp-tool`
Fork decision: **Fork A** — a standalone MCP tool `manage_adr`, symmetric to
`manage_roadmap`, with actions create / read / update / list. Not folded into the
`adr-fleet` skill surface. Shape and registration modeled on
`packages/cli/src/mcp/tools/roadmap.ts`.

## Problem

ADRs live in `docs/knowledge/decisions/NNNN-<slug>.md` and are ingested into the
knowledge graph by `DecisionIngestor`, but the only way to author or amend one is
through skill-mediated prose (`adr-fleet`, `architecture-advisor`). No MCP caller
can create or update an ADR programmatically —
`ls packages/cli/src/mcp/tools/ | grep -i 'adr\|decision'` returns nothing.

## Design

1. **ADR store** — `packages/cli/src/mcp/tools/adr-store.ts`: pure read/write
   functions over `docs/knowledge/decisions/`:
   - `listAdrs` — parse every `NNNN-<slug>.md`, return number-sorted summaries.
   - `readAdr` — resolve by number (`"92"`/`"0092"`), slug, or filename.
   - `allocateNextNumber` — **`max(existing) + 1`, zero-padded** (see #1323).
   - `createAdr` — allocate a number, write required frontmatter + Context /
     Decision / Consequences sections at `status: proposed` by default.
   - `updateAdr` — patch frontmatter fields and/or individual body sections
     without ever reusing the number.
     Frontmatter parse/serialize mirrors `DecisionIngestor`'s format. Kept in the
     CLI package (not `@harness-engineering/core`) because the surface is consumed
     only by the MCP tool — no core-barrel export is added.

2. **MCP tool** — `packages/cli/src/mcp/tools/adr.ts`: `manageAdrDefinition` +
   `handleManageAdr`, action-dispatch on create/read/update/list, modeled on
   `roadmap.ts`.

3. **Registration** — three sites in `packages/cli/src/mcp/server.ts` (import,
   `TOOL_DEFINITIONS` array, `TOOL_HANDLERS` map) plus a `write`-scope entry in
   `tool-capability-declarations.ts` (local FS only, no `network`).

4. **Reference docs** — `manage_adr` is picked up by `generate-docs` from the
   built `getToolDefinitions()` and now appears in `docs/reference/mcp-tools.md`.

5. **Tests** — `packages/cli/tests/mcp/tools/adr.test.ts`: create allocates a
   fresh collision-free number; read/list/update round-trip; the #1323 gap +
   duplicate scenario is exercised directly.

## #1323 collision safety

The on-disk number sequence has gaps and duplicates. `allocateNextNumber` uses
the **maximum** existing number + 1, never the count, so a new ADR can never
re-mint an existing number even across gaps — matching `adr-fleet`'s
pre-allocation strategy and the directory README's numbering rule.

## Wiring (adoption pass)

The define pass registered `manage_adr` but left it unreachable-by-default and
without a consumer. This pass closes both gaps in the same PR:

1. **Tool-tier exposure** — `packages/cli/src/mcp/tool-tiers.ts`: added
   `manage_adr` to `STANDARD_EXTRA` (next to its sibling `manage_roadmap`), so it
   is exposed in the `standard` tier, not only `full`. A membership assertion was
   added to `packages/cli/tests/mcp/tool-tiers.test.ts` (the existing tier tests
   are subset/threshold-based, so no count needed updating).

2. **Skill consumers (prose-level)** — the fleets are prose orchestrators, so
   adoption is at the skill-instruction level, not code:
   - `agents/skills/claude-code/adr-fleet/SKILL.md`: DISPATCH now persists each
     drafted ADR through `mcp__harness__manage_adr` (`action: "create"`) as the
     canonical write mechanism instead of hand-writing the file; SIGN-OFF flips
     `proposed → accepted` through `action: "update"`. Harness Integration lists
     the tool.
   - `agents/skills/claude-code/harness-architecture-advisor/SKILL.md`: Phase 4
     (DOCUMENT) points its persist step at `manage_adr` when the harness MCP
     surface is available, with the portable `<docs>/architecture/...` file path
     retained as an adopter fallback (degrade-gracefully).
   - `DecisionIngestor` (`packages/graph/src/ingest/DecisionIngestor.ts`) is a
     **reader** — it folds existing ADRs into the graph and has no write calls —
     so it is deliberately **not** rewired to call `manage_adr`.

## Verification

- `packages/cli/tests/mcp/tools/adr.test.ts` — 16 cases, all green.
- Registration/count tests updated (106 → 107) and a `manage_adr` registration
  assertion added.
- `tool-tiers.test.ts` — added `manage_adr ∈ STANDARD_TOOL_NAMES` assertion.
- `tsc --noEmit` clean; `generate-docs` regenerated `mcp-tools.md`;
  `generate:plugin:all` regenerated the skill command mirrors.
