---
title: Generic Docs-Publish Contract + Confluence Adapter + Proposal-Pitch Skills
status: proposed
owner: Chad Warner
keywords:
  [
    docs-publish,
    publish-contract,
    provider-adapter,
    confluence,
    adf,
    atlassian,
    proposal,
    drafts,
    render-verify,
    epistemic-labels,
    skills,
  ]
---

# Generic Docs-Publish Contract + Confluence Adapter + Proposal-Pitch Skills

## Overview

Three new `claude-code` skills that separate a vendor-neutral publishing
**contract** from its provider **adapter** and from the **pipeline** that consumes
it. This supersedes the earlier two-skill design that tied the pipeline directly
to Confluence: the mechanics are just as valuable, but nothing in the pipeline is
Confluence-specific, so the dependency is inverted through a small generic
contract.

A grep of `agents/skills/` finds no publishing contract or Confluence publishing
skill today; the only Confluence mentions are incidental prose inside unrelated
skills and the graph `ConfluenceConnector` (ingest-only, unrelated to publishing).

- **`docs-publish`** (NEW) — the generic, vendor-neutral publishing contract.
  Specifies four operations every provider adapter must implement — **draft**,
  **attach-media**, **verify-render**, **page-tree** — plus the cross-cutting
  invariants (drafts-only, verify-before-done, authoritative read-back). Names no
  vendor. Pipelines depend on this; adapters implement it.
- **`docs-publish-confluence`** (was `docs-confluence-publish`) — the Confluence
  **provider adapter** that implements the `docs-publish` contract. Keeps all the
  hard-won Atlassian mechanics (osascript/FormData attachment recipe + traps, ADF
  media-single vs media-group, draft/publish race, page-tree move ops, DOM
  render-verify, deterministic Playwright stills). Framed explicitly as "one
  adapter of the contract" so future Notion/GDocs/Markdown adapters slot in
  without touching the pipeline.
- **`proposal-pitch`** — the target-agnostic pipeline and its gates (gather source
  → agree structure → render stills → publish as drafts → close the loop).
  Depends on `docs-publish` (the contract), **not** on any provider. Ships no
  space ids, page ids, or brand assets; those come from a shared config contract.

All three are authored as claude-code source with `codex`/`cursor`/`gemini-cli`
symlinks, matching the repo's existing platform-mirror convention.

## Problem Boundary

**In scope:** three rigid, user-facing skills in the rich harness format, each
passing `harness skill validate` and the skill-structure vitest, registered for
`claude-code` with platform symlinks. Grep-clean of company-specific content. The
generic contract's four operations + invariants specified vendor-neutrally.
Reframing the Confluence mechanics as one adapter of the contract, with the
mechanics preserved verbatim in substance. Prose documentation of the shared
config contract and its graceful-degradation message.

**Out of scope:** implementing any additional adapter (Notion/GDocs/Markdown) —
the contract is authored so they can be added later without touching
`proposal-pitch`. Implementing the shared company-knowledge loader (canary-side
prerequisite; these skills read from it and degrade in prose when the `confluence`
block is absent — they ship no loader). Company-specific Atlassian defaults (a
separate downstream layer). Any actual publish to a live target during this change.

## Decisions Made

1. **Three skills: contract / adapter / pipeline.** The publishing mechanics and
   the pitch pipeline have different audiences and change cadences, and the
   pipeline is provider-agnostic. Introducing a thin generic contract skill
   (`docs-publish`) lets the pipeline depend on the contract while the Confluence
   adapter depends on it too — inverting the earlier direct pipeline→Confluence
   dependency. Future adapters implement the same contract with zero pipeline
   edits.

2. **The contract is a skill, not just a prose section.** A first-class
   `docs-publish` skill gives adapters a single normative reference to implement
   against and gives the pipeline a stable `depends_on` target. It carries the
   four operations and the cross-cutting invariants; it carries no vendor
   mechanics. This is the cleanest fit for the harness skill model (discoverable,
   validatable, symlinked like every other skill).

3. **Rename `docs-confluence-publish` → `docs-publish-confluence`.** The
   `docs-publish` / `docs-publish-confluence` family makes the contract↔adapter
   relationship legible and signals exactly where a future `docs-publish-notion`
   would live. The mechanics are preserved; only the framing and name change.

4. **All three rigid.** Each carries hard stops where skipping causes real damage:
   publishing draft→current is the author's click (never the agent's); an
   unverified page is silently broken (stored-format correctness ≠ render
   correctness); real customer data must never reach a rendered still. Rigid skills
   require `## Gates` and `## Escalation`, which is exactly the discipline these
   need.

5. **Config contract read from the shared tier, documented in prose.** Per the
   companion config-contract amendment, `confluence` (cloud_id, space_id,
   proposals_index_page_id, exemplar_page_ids) and `brand.proposal_css_path` are
   org pointers read from the shared company-knowledge tier. The adapter and the
   pipeline describe the contract and the exact degradation message when the block
   is absent — a clear instruction to the author, not a crash or a silent no-op.
   No loader code ships here.

6. **Zero company-specific content, enforced by grep.** No space ids, page ids,
   brand hex, product names, or personal names in any skill body. This is an
   acceptance gate and a shipped-artifact rule. Shipped bodies also carry no
   internal roadmap/PR/issue numbers.

## Technical Design

### File layout

```
agents/skills/claude-code/docs-publish/                 (NEW — generic contract)
  skill.yaml            # type: rigid; depends_on: []
  SKILL.md
agents/skills/claude-code/docs-publish-confluence/      (RENAMED from docs-confluence-publish)
  skill.yaml            # type: rigid; depends_on: [docs-publish]
  SKILL.md
agents/skills/claude-code/proposal-pitch/               (EDITED — retarget dependency)
  skill.yaml            # type: rigid; depends_on: [docs-publish]  (was docs-confluence-publish)
  SKILL.md
agents/skills/{codex,cursor,gemini-cli}/<skill> -> ../claude-code/<skill>   (symlinks, all three)
```

### `docs-publish` content (the generic contract, rigid)

Required sections: `## When to Use`, `## Process`, `## Harness Integration`,
`## Success Criteria`, `## Examples`, `## Gates`, `## Escalation`,
`## Rationalizations to Reject` (domain-specific).

The Process defines the contract as four operations an adapter must provide and a
pipeline may rely on — described in vendor-neutral terms:

- **draft** — create/update a publish target in a non-live DRAFT state; never
  publish or promote. Return a stable handle to the draft.
- **attach-media** — attach a media asset to a draft and return an authoritative
  confirmation (a read-back, not the caller's optimistic success).
- **verify-render** — assert the rendered output is correct, not merely stored:
  media actually loaded, zero broken-media indicators, intended figure form. Return
  a pass/fail with the failing assertions.
- **page-tree** — create children under a draft parent and order siblings; preserve
  provider-native node identity across full-body round-trips.

Cross-cutting invariants the contract mandates (and every adapter inherits):
drafts-only; verify-render before "done"; authoritative read-back over optimistic
success; stored-format correctness is not rendering correctness. The skill states
what an adapter MUST implement and what a consumer (like `proposal-pitch`) may
assume — with a clear degradation path when no adapter is configured.

### `docs-publish-confluence` content (the Confluence adapter, rigid)

Same required section set. Framed as "the Confluence adapter implementing the
`docs-publish` contract." Each contract operation maps to its Confluence mechanics,
preserved from the prior skill:

- **draft** → Confluence draft page semantics; the draft/publish race
  (a `status: draft` update against a just-published page becomes a pending edit,
  its tiny-link id is not a fork; stale editor tab clobbers API edits; tiny links
  resolve only after publish).
- **attach-media** → the osascript + FormData recipe (Atlassian MCP has no
  attachment API): scratch-file JS injected via `osascript`, `atob` → `File` →
  `FormData` → `POST /wiki/rest/api/content/{id}/child/attachment?status=draft`
  with `X-Atlassian-Token: nocheck`; the three traps (no large base64 through tool
  params; never serve from the `127.0.0.1` literal; verify authoritatively with a
  GET because osascript may run in a different tab).
- **verify-render** → DOM assertions: `img` with `naturalWidth > 0`, zero
  `media-card-error`, compare `mediaSingle` vs `mediaGroup` counts (thumbnail cards
  also pass a naturalWidth check). ADF `media-single` vs `media-group` (always emit
  `media-single`; `media-inline` chips) lives here.
- **page-tree** → children under a draft parent; sidebar ordering via
  `PUT /content/{id}/move/{before|after|append}/{target}` (no MCP support);
  full-body round-trips preserving `data-local-id`.
- Deterministic stills (Playwright against local `file://` HTML with
  `emulateMedia({colorScheme, reducedMotion:'reduce'})` and
  `screenshot({scale:'device'})`) are the adapter's still-rendering implementation.

`depends_on: [docs-publish]`.

### `proposal-pitch` content (the pipeline, rigid)

Unchanged pipeline phases (gather source → agree structure → render stills →
publish as drafts → close the loop) and unchanged gates (drafts-only,
render-verify, epistemic labels, defects-tracked, no customer data, no public
hosting). The only change: it depends on and invokes the **`docs-publish`
contract** for all publishing mechanics — resolving a configured provider adapter
(Confluence today) — instead of naming Confluence directly. `depends_on:
[docs-publish]` (was `docs-confluence-publish`). References to "the publishing
mechanics" point at the contract, not at any vendor.

### Config contract (documented in adapter + pipeline)

```jsonc
"confluence": { "cloud_id", "space_id", "proposals_index_page_id", "exemplar_page_ids" },
"brand": { "proposal_css_path" }
```

Read from the shared company-knowledge tier. The `confluence` block is adapter
configuration (named by the Confluence adapter, not by the generic contract or the
pipeline). Absent-block degradation message (prose): tell the author which pointers
are missing and how to add them; do not crash, do not silently no-op.

## Integration Points

- **Entry Points** — one NEW skill (`docs-publish`), one RENAMED skill
  (`docs-publish-confluence`), one EDITED skill (`proposal-pitch`), each invocable
  via `harness skill run <name>` and `run_skill`. Platform symlinks add
  `codex`/`cursor`/`gemini-cli` entries for all three.
- **Registrations Required** — skills auto-appear in the generated
  `docs/reference/skills-catalog.md` (via `scripts/generate-docs.mjs` `loadSkills`).
  Run `pnpm run generate-docs` after build. Create/refresh the platform symlinks;
  remove the stale `docs-confluence-publish` symlinks and command files. Verify
  `pnpm generate:plugin:check` exits 0 (the rename retires the old command file and
  adds the new ones — the net is additive-plus-rename, never the destructive prune).
- **Documentation Updates** — regenerated skills-catalog; no AGENTS.md change
  required (skills are discovered dynamically).
- **Architectural Decisions** — the contract/adapter split (Decision 1 + 2) is the
  load-bearing architectural decision, but it is skill-local and fully captured in
  Decisions Made; it does not warrant a standalone repo-level ADR.
- **Knowledge Impact** — introduces the "generic publish contract (draft /
  attach-media / verify-render / page-tree)" and "provider-adapter pattern for
  publishing" concepts, plus the retained "ADF media-single vs media-group" and
  "draft/publish race" facts as Confluence-adapter knowledge.

## Success Criteria

- Three skills exist in the rich harness format (`SKILL.md` + `skill.yaml`) and
  `harness skill validate` passes with zero errors for each.
- The skill-structure vitest (`agents/skills/tests`) passes, including the
  `## Rationalizations to Reject` parity check with domain-specific content for all
  three, and the platform-parity test (each skill present in all four platform
  dirs with identical content).
- `docs-publish` names no vendor: grep-clean of `confluence`, `atlassian`, `adf`,
  and any provider term in its body.
- `proposal-pitch` names no vendor and `depends_on: [docs-publish]` (no
  Confluence dependency remains).
- `docs-publish-confluence` preserves every mechanic from the prior skill and
  `depends_on: [docs-publish]`.
- Grep-clean of company-specific content and internal roadmap/PR/issue numbers in
  all three bodies.
- All three registered for `claude-code` with `codex`/`cursor`/`gemini-cli`
  symlinks; the stale `docs-confluence-publish` entries (dir, symlinks, command
  files, catalog row) are removed; `pnpm generate:plugin:check` exits 0.
- `pnpm format:check` clean; `.harness/arch/baselines.json` byte-identical to
  origin/main.

## Implementation Order

1. Author `docs-publish` (skill.yaml + SKILL.md) — the vendor-neutral contract.
2. Rename `docs-confluence-publish` → `docs-publish-confluence`; reframe its body
   as the Confluence adapter of the contract; preserve all mechanics; retarget
   `depends_on` to `docs-publish`.
3. Retarget `proposal-pitch` to `depends_on: [docs-publish]` and repoint its prose
   from Confluence to the contract; keep phases and gates.
4. Refresh platform symlinks for all three; remove stale `docs-confluence-publish`
   symlinks/command files.
5. Build dist; run `harness skill validate` for all three; run skill-structure +
   platform-parity vitest.
6. Regenerate docs; grep-clean checks; format; generate:plugin:check; arch/changeset
   gates.
