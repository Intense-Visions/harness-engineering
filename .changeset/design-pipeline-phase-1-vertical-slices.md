---
'@harness-engineering/cli': minor
---

Design-pipeline initiative decomposition + Phase 1 vertical slices for sub-projects #2 and #6.

**New MCP tools** (registered separately in a follow-up commit; exports ready):

- `mcp__harness__audit_anatomy` (`packages/cli/src/mcp/tools/audit-anatomy.ts`) — audit component definitions for missing required anatomy parts (slots, states, sizes). Vertical-slice scope: Button + ANAT-D001 working end-to-end. Pattern findings (ANAT-P\*) deferred.
- `mcp__harness__design_craft` (`packages/cli/src/mcp/tools/design-craft.ts`) — first LLM-judgment-based skill in harness. Three branchable phases (CRITIQUE / POLISH / BENCHMARK). Vertical-slice scope: CRITIQUE with hierarchy-clarity rubric + 3-axis (tier × impact × confidence) finding schema + 5-dim radar for BENCHMARK schema.

**New internal modules** (CLI-internal, not exported):

- `packages/cli/src/audit/component-anatomy/` — TypeScript Compiler API parser, ConventionRule + PatternRule types (with Phase 0 spike's recommended `postProcess` + `auxiliary` additive fields), 3-layer source-of-truth resolver (JSDoc → DESIGN.md → conventions), 3-layer component-type resolver, convention runner.
- `packages/cli/src/design-craft/` — 3-axis findings schema, deterministic priority derivation, hierarchy-clarity rubric, mock LLM provider, CRITIQUE phase with permissive LLM-output parser.

**Two new skills** added at `agents/skills/{claude-code,gemini-cli,cursor,codex}/{audit-component-anatomy,harness-design-craft}/` (4-platform parity, markdown-only per the established harness skill convention).

**Five new ADRs** establishing reusable patterns:

- 0018 LLM-judgment skill pattern
- 0019 3-axis craft output model + 5-dim radar
- 0020 Living-catalog H pattern
- 0021 Detect-and-offer B' pattern
- 0028 Brand-guidelines source of truth (path A: extend DESIGN.md + claim DTCG `$extensions.harness.brand`)

**ADR cleanup (0022)**: renumbered 5 duplicate ADRs in the 0003-0007 range to 0023-0027 with inbound reference sweep across `AGENTS.md`, `docs/conventions/`, and feedback-loops plan/proposal docs. README rule ("Never reuse a number") now honored.

**Deferred to follow-up commits** (intentional scope split — see PR description):

- Tree-sitter pattern engine + JSDoc/DESIGN.md parsers for #2
- DesignConstraintAdapter graph integration for both skills
- harness-accessibility i18n-style deferral patch
- `harness.config.json` schema extensions (`design.audit.componentAnatomy.*`, `design.craft.*`)
- `packages/cli/src/mcp/server.ts` registration of both new tools (2-line wire-ups)
- Vision-LLM + playwright MCP rendering for #6 deep mode
- POLISH + BENCHMARK phase implementations + B' detect-and-offer for #6
- Remaining catalog content for both skills (Phase 2)

Test coverage: 4/4 audit-anatomy vertical-slice tests passing; 7/7 design-craft vertical-slice tests passing; full skills package 23941/23941 passing.
