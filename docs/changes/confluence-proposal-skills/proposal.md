---
title: Confluence Publishing + Proposal-Pitch Skills
status: proposed
owner: Chad Warner
keywords:
  [
    confluence,
    adf,
    atlassian,
    publishing,
    proposal,
    drafts,
    render-verify,
    epistemic-labels,
    skills,
  ]
---

# Confluence Publishing + Proposal-Pitch Skills

## Overview

Two new `claude-code` skills, extracted from a product-local skill that turned out
to be ~60% portable. A grep of `agents/skills/` finds no Confluence publishing
skill today; the only Confluence mentions are incidental prose inside unrelated
skills and the graph `ConfluenceConnector` (ingest-only, unrelated to publishing).

The portable half is the part that cost real debugging: undocumented Atlassian
MCP gaps and ADF rendering behavior discovered by trial across several proposal
builds. Both skills are authored as claude-code source with `codex`/`cursor`/
`gemini-cli` symlinks, matching the repo's existing platform-mirror convention.

- **`docs-confluence-publish`** — Confluence Cloud publishing mechanics. Zero
  company-specific content: portable Atlassian platform behavior (attachment
  upload recipe, ADF media forms, page-tree ops, draft/publish race, render
  verification, deterministic stills).
- **`proposal-pitch`** — the pipeline and its gates (gather source → agree
  structure → render stills → publish as drafts → close the loop). Ships no space
  ids, page ids, or brand assets; those come from a shared config contract.

## Problem Boundary

**In scope:** two rigid, user-facing skills in the rich harness format, each
passing `harness skill validate` and the skill-structure vitest, registered for
`claude-code` with platform symlinks. Grep-clean of company-specific content.
Prose documentation of the shared config contract and its graceful-degradation
message.

**Out of scope:** implementing the shared company-knowledge loader (that is the
canary-side prerequisite; these skills read from it and degrade in prose when the
`confluence` block is absent — they do not ship a loader). Company-specific
Atlassian defaults (a separate downstream layer). Any actual publish to a live
Confluence during this change.

## Decisions Made

1. **Two skills, not one.** Mechanics (`docs-confluence-publish`) and pipeline
   (`proposal-pitch`) have different audiences and change cadences. The mechanics
   skill is a portable reference other pipelines can reuse; the pipeline skill
   composes it and adds gates. Splitting keeps each under the 6-phase ceiling and
   lets the pipeline skill `depends_on` the mechanics skill.

2. **Both rigid.** Both carry hard stops where skipping causes real damage:
   publishing draft→current is the author's click (never the agent's); an
   unverified page is silently broken (stored-format correctness ≠ render
   correctness); real customer data must never reach a rendered still. Rigid
   skills require `## Gates` and `## Escalation`, which is exactly the discipline
   these need.

3. **Config contract read from the shared tier, documented in prose.** Per the
   companion config-contract amendment, `confluence` (cloud_id, space_id,
   proposals_index_page_id, exemplar_page_ids) and `brand.proposal_css_path` are
   org pointers read from the shared company-knowledge tier. The skills describe
   the contract and the exact degradation message when the block is absent — a
   clear instruction to the author, not a crash or a silent no-op. No loader code
   ships here.

4. **Zero company-specific content, enforced by grep.** No space ids, page ids,
   brand hex, product names, or personal names in either skill body. This is an
   acceptance gate and a shipped-artifact rule.

## Technical Design

### File layout

```
agents/skills/claude-code/docs-confluence-publish/
  skill.yaml
  SKILL.md
agents/skills/claude-code/proposal-pitch/
  skill.yaml
  SKILL.md
agents/skills/{codex,cursor,gemini-cli}/docs-confluence-publish -> ../claude-code/docs-confluence-publish   (symlink)
agents/skills/{codex,cursor,gemini-cli}/proposal-pitch          -> ../claude-code/proposal-pitch            (symlink)
```

### `docs-confluence-publish` content (rich format, rigid)

Required sections: `## When to Use`, `## Process`, `## Harness Integration`,
`## Success Criteria`, `## Examples`, `## Gates`, `## Escalation`,
`## Rationalizations to Reject` (domain-specific).

Process phases document the battle-tested recipe:

- **Attachment upload** — Atlassian MCP has no attachment API. Recipe: a
  logged-in Chrome tab on the Atlassian origin; upload JS written to a scratch
  file and injected via `osascript` (`atob` → `File` → `FormData` →
  `POST /wiki/rest/api/content/{id}/child/attachment?status=draft` with
  `X-Atlassian-Token: nocheck`). Traps: don't pass large base64 through tool
  params; don't serve from `127.0.0.1` (fetch hangs silently); osascript may run
  in a different tab than the one polled, so verify authoritatively with a `GET`.
- **`media-single` vs `media-group`** — always emit `media-single` figures;
  `media-group` renders as cropped attachment cards. Includes the `media-inline`
  file-chip form. Discovered by writing ADF and reading it back as HTML.
- **Page-tree operations** — children under a draft parent; sidebar ordering via
  `PUT /content/{id}/move/{before|after|append}/{target}` (no MCP support);
  full-body round-trips that preserve `data-local-id` on retained nodes.
- **Draft/publish race** — a `status: draft` update against a just-published page
  becomes a pending edit (its tiny-link id is not a fork); a stale editor tab
  clobbers API edits; tiny links resolve only after publish.
- **Render verification** — DOM assertions: count `img` with `naturalWidth > 0`,
  require zero `media-card-error`, compare `mediaSingle` vs `mediaGroup` counts
  (thumbnail cards also pass a naturalWidth check, so counting loaded images
  alone is insufficient).
- **Deterministic stills** — Playwright against local `file://` HTML with
  `emulateMedia({colorScheme, reducedMotion:'reduce'})` and
  `screenshot({scale:'device'})`.

### `proposal-pitch` content (rich format, rigid)

Same required section set. Process phases: gather source (chat/issue/doc) → agree
page structure before building → render concept stills → publish as drafts →
close the loop on the source. `depends_on: docs-confluence-publish`.

Gates (hard stops):

- Drafts only — publishing is the author's click; never move draft → current.
- Render-verify before handoff — an unverified page is not done.
- Epistemic labels on every claim — verified / inferred / proposed; the skill's
  own suggestion never "resolves" an open question.
- Defects tracked, not narrated — fix / file-with-repro / flag-suspected;
  "as-designed" needs evidence.
- No real customer data in any still, ever.
- No public hosting without the author's explicit yes.

### Config contract (documented in both skills)

```jsonc
"confluence": { "cloud_id", "space_id", "proposals_index_page_id", "exemplar_page_ids" },
"brand": { "proposal_css_path" }
```

Read from the shared company-knowledge tier. Absent-block degradation message
(prose, both skills): tell the author which pointers are missing and how to add
them; do not crash, do not silently no-op.

## Integration Points

- **Entry Points** — two new skills under `agents/skills/claude-code/`, each
  invocable via `harness skill run <name>` and `run_skill`. Platform symlinks add
  `codex`/`cursor`/`gemini-cli` entries.
- **Registrations Required** — skills auto-appear in the generated
  `docs/reference/skills-catalog.md` (via `scripts/generate-docs.mjs` `loadSkills`
  over `agents/skills/claude-code`). Run `pnpm run generate-docs` after build.
  Create the three platform symlinks per skill. Verify `pnpm generate:plugin:check`
  exits 0 (a new skill legitimately grows the command count).
- **Documentation Updates** — regenerated skills-catalog; no AGENTS.md change
  required (skills are discovered dynamically).
- **Architectural Decisions** — None rise to a standalone ADR; the two-skill
  split and rigid-type choice are captured in Decisions Made and are skill-local.
- **Knowledge Impact** — introduces the "ADF media-single vs media-group" and
  "draft/publish race" facts and the "epistemic labels" and "drafts-only" gate
  concepts as reusable publishing knowledge.

## Success Criteria

- Both skills exist in the rich harness format (`SKILL.md` + `skill.yaml`) and
  `harness skill validate` passes with zero errors for each.
- The skill-structure vitest (`agents/skills/tests`) passes, including the
  `## Rationalizations to Reject` parity check with domain-specific content.
- Grep-clean: no space ids, page ids, brand hex, product names, or personal names
  in either skill body.
- Both skills document the config contract and a graceful-degradation message for
  the absent `confluence` block (not a crash, not a silent no-op).
- Both registered for `claude-code` with `codex`/`cursor`/`gemini-cli` symlinks;
  `pnpm generate:plugin:check` exits 0.
- `pnpm format:check` clean; `.harness/arch/baselines.json` byte-identical to
  origin/main.

## Implementation Order

1. Author `docs-confluence-publish` (skill.yaml + SKILL.md) — mechanics reference.
2. Author `proposal-pitch` (skill.yaml + SKILL.md) — pipeline, depends on #1.
3. Create platform symlinks (codex/cursor/gemini-cli) for both.
4. Build dist; run `harness skill validate` for both; run skill-structure vitest.
5. Regenerate docs; grep-clean check; format; generate:plugin:check; arch/changeset gates.
