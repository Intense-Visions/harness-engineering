# Plan: Phase 4 — Docs, knowledge, changeset, final validation

**Date:** 2026-08-07
**Spec:** docs/changes/canary-tdd-verify-wiring/proposal.md (resolves #913)
**Integration Tier:** medium
**Estimated tasks:** 4
**Estimated time:** 15 minutes

## Goal

Document the added adapter method + MCP tool + reusable-seam contract in the knowledge node and AGENTS.md, add the release changeset, and run the full validation gauntlet with canary both present and absent.

> **SHIPPED-body rule:** `docs/knowledge/**`, `AGENTS.md`, and the changeset body must carry **no** internal issue/PR numbers. The `docs/changes/**` plan/proposal may reference `#913`.

## Observable Truths (Acceptance Criteria)

1. `docs/knowledge/intelligence/canary-adapter.md` lists `listFrameworks()` in the Surface section, documents the `canary_discover_test_command` tool under "How skills reach it", and records the "one total adapter method + one thin MCP tool per capability, reusable for results ingestion" seam note.
2. The knowledge node records the corrected CLI contract (`canary frameworks --json` → `{ frameworks: CanaryFrameworkInfo[] }`, no `details[]`) and the permissive-schema / registry-order-tie-break behavior.
3. `AGENTS.md` notes the two new wirings (verify DETECT registry-truth, tdd RED detect-and-offer) and their degrade behavior.
4. A changeset in `.changeset/` bumps `@harness-engineering/cli` and `@harness-engineering/intelligence` to `minor`, single-quoted, matching the repo's existing format.
5. No shipped doc/changeset body contains an internal issue/PR number.
6. `harness validate`, `harness check-deps`, typecheck, lint, and the full test suite pass with canary absent and with canary present; the boundary test passes.

## File Map

```
MODIFY docs/knowledge/intelligence/canary-adapter.md   (Surface + How-skills-reach-it + seam-reuse note + corrected contract)
MODIFY AGENTS.md                                        (canary adapter line: note the two wirings)
CREATE .changeset/canary-tdd-verify-wiring.md           (cli + intelligence: minor)
```

## Tasks

### Task 1: Update the Canary Adapter knowledge node

**Depends on:** Phases 1–3 complete
**Files:** `docs/knowledge/intelligence/canary-adapter.md`

1. In the `## Surface` section, change "three total methods" to "four total methods" and add a bullet after the `reviewTest` bullet:

```markdown
- `listFrameworks()` → zod-validated `CanaryFrameworkInfo[]` (`canary frameworks --json`); `[]` when unavailable or malformed. The live CLI returns the detail objects directly under the top-level `frameworks` key (there is no separate `details[]` key), so the adapter parses `frameworks` and tolerates extra keys (`category`, `capabilities`, …). The pure `resolveTestCommand(fw, file, { ci? })` helper fills `{file}`, appends `ci_flags` under CI, and returns `null` for null or non-`{file}` commands (catalog-tier and `{target}`-only scanners are not per-file test commands).
```

2. In the `## How skills reach it` section, append after the existing test-advisor sentence:

```markdown
`harness-verify` DETECT reaches the registry through a third MCP tool, `canary_discover_test_command` (`{ files?, ci? }`): it probes, matches each file against a framework by longest file-extension suffix (preferring preferred-status / full-tier, then registry order on ties), resolves the per-file test command, and returns `{ status, frameworks: [{ name, command, matchedFiles }] }`. DETECT uses it as registry truth for the **test** command and falls back to `package.json`/`Makefile` heuristics when it degrades. `harness-tdd` RED reuses the existing `canary_probe` and `canary_recommend_framework` tools plus the generative `/canary-write-test` plugin skill (detect-and-offer / B'); it adds no new adapter method.
```

3. Add a new short subsection before `## Related`:

```markdown
## One capability = one method + one tool

Every new canary capability is added as exactly **one total adapter method plus one thin MCP tool** — never a new integration pattern. `listFrameworks()` + `canary_discover_test_command` follow the same shape as `probe`/`recommendFramework` and their tools, so the sibling results-ingestion work can add a `readHistory()`-style method + tool to this same boundary additively. The boundary stays read-only: tools return resolved strings; the resolved command is executed only by the calling skill's own EXECUTE phase, never inside the adapter or tool.
```

4. Confirm no internal numbers: `grep -nE "#[0-9]{2,}" docs/knowledge/intelligence/canary-adapter.md` → expect no matches.
5. Run: `harness validate`
6. Commit: `docs(intelligence): document listFrameworks + canary_discover_test_command in the adapter node`

---

### Task 2: Update AGENTS.md

**Depends on:** Task 1
**Files:** `AGENTS.md`

1. In the adapters bullet (the line describing the canary adapter under `packages/intelligence/src/adapters/`), extend the method list from `probe / recommendFramework / reviewTest` to `probe / recommendFramework / reviewTest / listFrameworks` and append a sentence noting the two new wirings:

```markdown
`harness-verify` DETECT consults `canary_discover_test_command` (registry-truth test command, longest-suffix framework match) before its package.json/Makefile heuristics, and `harness-tdd` RED offers canary generation via `/canary-write-test` + `canary_recommend_framework` (detect-and-offer); both fall back to today's behavior when canary is absent.
```

2. Confirm no internal numbers introduced: `grep -nE "#913" AGENTS.md` → expect no matches.
3. Run: `harness validate`
4. Commit: `docs(agents): note canary verify/tdd wirings and listFrameworks`

---

### Task 3: Add the release changeset

**Depends on:** Task 2
**Files:** `.changeset/canary-tdd-verify-wiring.md`

1. Create `.changeset/canary-tdd-verify-wiring.md` (repo convention: single-quoted package names, **no** `@`-escaping — confirmed across all 74 existing changesets; no issue/PR numbers in the body):

```markdown
---
'@harness-engineering/intelligence': minor
'@harness-engineering/cli': minor
---

Wire canary into harness-verify and harness-tdd through the existing adapter seam.

`CanaryAdapter` gains a total `listFrameworks()` method (execs `canary frameworks --json`,
zod-parses the framework registry, returns `[]` on any degrade) and a pure
`resolveTestCommand()` helper that fills the `{file}` placeholder and appends CI flags.
A new MCP tool, `canary_discover_test_command`, matches candidate test files against the
registry by longest file-extension suffix and returns the resolved per-file test command.

`harness-verify` DETECT now consults registry truth for the test command before its
`package.json`/`Makefile` heuristics, and `harness-tdd` RED offers canary-authored failing
tests (detect-and-offer). Both degrade silently to today's behavior when canary is absent —
the dependency stays optional and the adapter boundary is unchanged.
```

2. Confirm no internal numbers: `grep -nE "#[0-9]{2,}" .changeset/canary-tdd-verify-wiring.md` → expect no matches.
3. Run: `npx changeset status` (verify the changeset parses and targets both packages).
4. Run: `harness validate`
5. Commit: `chore: add changeset for canary verify/tdd wiring`

---

### Task 4: [checkpoint:human-verify] Full gauntlet — canary present and absent

**Depends on:** Task 3
**Files:** (verification only)

1. **With canary present** (this environment: `canary` on PATH), run the full suite:
   - `npx vitest run packages/intelligence/tests/adapters/ packages/cli/src/mcp/tools/canary.test.ts`
   - `npx tsc --noEmit -p packages/intelligence/tsconfig.json && npx tsc --noEmit -p packages/cli/tsconfig.json`
   - `harness check-deps`
   - `harness validate`
2. **Simulate canary absent** — the adapter unit/handler tests already inject `execRejects({ code: 'ENOENT' })` degrade paths, proving graceful absence deterministically (no need to uninstall the bin). Confirm those degrade cases are green in step 1's run.
3. Confirm the boundary test still passes: `npx vitest run packages/intelligence/tests/adapters/canary-boundary.test.ts`.
4. Repo-wide shipped-body check: `grep -rnE "#913" agents/skills docs/knowledge AGENTS.md .changeset/canary-tdd-verify-wiring.md packages/*/src` → expect no matches.
5. **[checkpoint:human-verify]** Present the final gauntlet results (all green, boundary intact, no shipped-body leaks). Wait for sign-off before merge.
6. No commit (review gate).

---

## Traceability Matrix

| Observable Truth                              | Delivered by Task(s)           |
| --------------------------------------------- | ------------------------------ |
| 1. Knowledge node surface + tool + seam note  | Task 1                         |
| 2. Corrected contract + schema behavior noted | Task 1                         |
| 3. AGENTS.md notes both wirings               | Task 2                         |
| 4. Changeset bumps both packages minor        | Task 3                         |
| 5. No internal numbers in shipped bodies      | Task 1, Task 2, Task 3, Task 4 |
| 6. Full gauntlet green, boundary intact       | Task 4                         |
