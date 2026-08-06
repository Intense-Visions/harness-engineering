# Plan: uat-signoff — change-lifecycle artifact-model rework

**Date:** 2026-08-06 | **Spec:** docs/changes/uat-signoff/proposal.md | **Tasks:** 6 | **Time:** ~40 min | **Integration Tier:** small

## Goal

Move the `uat-signoff` skill and `uat_signoff` tool off the unshipped
`docs/inception/<engagement>/` engagement model (brd.md/gaps.md) and onto the
change lifecycle directory `docs/changes/<slug>/` — reading the change's
`proposal.md` `## Success Criteria` as the acceptance checklist and recording the
sign-off at `docs/changes/<slug>/signoff.md`. Preserve the human-authority,
advisory/record-only contract and the `ExecutionOutcomeConnector` graph node.

## Scope (this change only)

Covers spec Success Criteria 1-7. Rework only — no new node type, no new entry
point, no on-disk `docs/inception/` migration.

## Observable Truths (Acceptance Criteria)

1. `grep -rn "docs/inception\|brd.md\|gaps.md\|engagement\|brdRefs"` over the
   uat-signoff source, skill, and tests returns nothing (SC1, SC5).
2. Recorder emits `outcome:uat-signoff:<slug>:<uuid>` id, `uat-signoff:<slug>`
   identifier, and metadata `{ source, decision, signedOffBy, criteriaRefs, slug }`
   with `result` = success iff decision === ACCEPTED (SC3, SC4).
3. The MCP tool requires `['slug','decision','signedOffBy']`, resolves the graph
   via `resolveGraphDir`, and returns a record-only advisory payload (SC4).
4. `SKILL.md` reads `docs/changes/<slug>/proposal.md` `## Success Criteria` in
   Phase 1 and writes `docs/changes/<slug>/signoff.md` in Phase 4 (SC1, SC2).
5. `SKILL.md` is byte-identical across the four platform trees (SC6).
6. `pnpm build` + full vitest + `harness validate` pass; server tool-count is 99
   (uat_signoff + api_craft over the merge base) (SC6, SC7).

## File Map

- MODIFY packages/intelligence/src/uat-signoff/types.ts
- MODIFY packages/intelligence/src/uat-signoff/recorder.ts
- MODIFY packages/intelligence/tests/uat-signoff/recorder.test.ts
- MODIFY packages/cli/src/mcp/tools/uat-signoff.ts
- MODIFY packages/cli/src/mcp/tools/uat-signoff.test.ts
- MODIFY packages/cli/tests/mcp/server.test.ts (tool count 99)
- MODIFY packages/cli/tests/mcp/server-integration.test.ts (tool count 99)
- MODIFY agents/skills/{claude-code,codex,cursor,gemini-cli}/uat-signoff/SKILL.md
- REGEN docs/reference/mcp-tools.md, docs/reference/skills-catalog.md

## Tasks

1. **Rework intelligence types + recorder** — rename `engagement`→`slug`,
   `brdRefs`→`criteriaRefs`; update id/identifier/metadata; update docstrings.
2. **Update recorder test** — `slug`/`criteriaRefs`, id regex `uat-signoff:<slug>`.
3. **Rework MCP tool** — inputs, description, schema, validation → slug model;
   update tool test.
4. **Rework SKILL.md (claude-code)** — Phase 1 reads proposal Success Criteria;
   Phase 4 writes `docs/changes/<slug>/signoff.md`; preserve Iron Law/gates.
5. **Mirror SKILL.md** byte-identical to codex/cursor/gemini-cli.
6. **Regenerate docs + verify** — generate-docs, build, test, harness validate,
   pre-push gauntlet.

## Uncertainties

- Tool-count reconciliation at merge: base + uat_signoff + api_craft = 99.
  Resolved during the main merge; server.test + server-integration assert 99.
