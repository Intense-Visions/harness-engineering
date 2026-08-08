# Proposal Pitch Pipeline

> Turn a source (chat, issue, or doc) into a reviewable proposal via a configured provider, draft-first: gather the source, agree the page structure with the author before building, render concept stills, publish as drafts only, and close the loop on the source. Invokes the docs-publish surface — the `harness docs-publish` CLI command (`draft`, `attach-media`, `verify-render`, `page-tree`) or the `docs_publish` MCP tool, which resolves a configured connector — for the mechanics, and enforces the gates that keep a pitch honest and safe — drafts-only, render-verify, epistemic labels, and no real customer data.

## When to Use

- When turning a chat thread, issue, or design doc into a reviewable proposal published through a configured provider.
- When pitching a concept as a set of draft pages with concept stills for an author to review and later publish.
- When you need the discipline gates (drafts-only, render-verify, epistemic labels, no customer data) wrapped around a publishing flow.
- NOT for the raw publishing mechanics (attachment upload, media forms, render verification) — invoke the docs-publish surface (`harness docs-publish <op>` / the `docs_publish` MCP tool), which resolves the configured connector.
- NOT for publishing final/current/live pages — this pipeline is drafts-only; promotion is the author's click.
- NOT when the proposal would require real customer data in a rendered still — that is never permitted (see Gates).
- NOT when the author has not yet agreed the page structure — stop and get agreement first.

## Process

### Iron Law

**Ship drafts, label every claim, and hand back — never resolve the author's open question with your own suggestion, and never publish or expose the work without the author's explicit yes.**

A proposal is the author's argument, not the agent's. The agent gathers, structures (with agreement), renders, drafts, and reports — then stops. Publishing, resolving open questions, and public exposure all belong to the author.

---

### Phase 1: GATHER SOURCE

1. Collect the source: the chat thread, the issue, or the doc that the proposal is based on.
2. Separate what is **settled** (decided, cited) from what is **open** (unresolved questions, undecided options).
3. Do not invent answers to open items here — record them as open. They travel with the proposal and come back to the author in Phase 5.

### Phase 2: AGREE STRUCTURE

1. Draft the proposed page structure: the page tree, the sections, and what each figure will show.
2. Present it to the author and get explicit agreement **before building anything**. Building against an unagreed structure wastes work and pre-empts the author's framing.
3. If the author has not agreed, do not proceed to render or publish. This is a hard stop (see Gates).

### Phase 3: RENDER STILLS

1. Render the concept stills that illustrate the proposal.
2. Invoke the docs-publish surface for the mechanics — deterministic stills, attachment upload, and media forms are the configured connector's responsibility, reached through `harness docs-publish attach-media` / the `docs_publish` MCP tool. Do not duplicate that recipe here.
3. Use clearly fabricated fixtures for any data shown in a still. Never use real customer data (see Gates).

### Phase 4: PUBLISH DRAFTS

1. Publish the pages as DRAFTS only via the docs-publish surface — `harness docs-publish draft` / the `docs_publish` MCP tool (`op: draft`), and `harness docs-publish page-tree` for child pages and ordering.
2. For attachments, run `harness docs-publish attach-media`. Attaching media cannot be automated headless, so the surface returns a `manual-step-required` result: surface its `instructions` to the human verbatim, wait for them to complete the upload, then confirm authoritatively (its `verifyWith` note + `verify-render`). Do not treat the manual step as done until confirmed.
3. Never move a draft to current/live. Promotion is the author's click.
4. Render-verify every page before handoff via `harness docs-publish verify-render` / the `docs_publish` MCP tool (`op: verify-render`). An unverified page is not done — stored-format correctness is not rendering correctness.

### Phase 5: CLOSE THE LOOP

1. Report back on the source (the issue, doc, or chat) with what was built and what remains open.
2. Label every claim on the page and in the report with its epistemic status:
   - **verified** — you ran or read it; evidence is citable.
   - **inferred** — drawn from a doc; say which doc, and that it was not re-verified.
   - **proposed** — invented in this conversation.
3. Carry every open question from Phase 1 back to the author unresolved. The skill's own suggestion never "resolves" an open question — label it `proposed` and hand it back.
4. Track defects, do not narrate them: fix, file-with-repro, or flag-suspected. "As-designed" requires evidence.

## Harness Integration

- **`harness skill run proposal-pitch`** / **`run_skill`** — invoke this skill.
- **`harness skill validate proposal-pitch`** — validate this skill's structure and schema.
- **`harness docs-publish <op>`** / **`docs_publish` MCP tool** — the publishing surface this pipeline invokes for all mechanics (attachment upload, media forms, page-tree ops, render verification, deterministic stills). The surface resolves a connector configured in `harness.config.json` (`docsPublish` block). Do not reimplement those here, and do not name a provider — the surface resolves the connector.
- **Config:** the connector reads its own provider pointers from its `docsPublish.config` block in `harness.config.json` — the pipeline names no provider block. The pipeline itself reads only `brand.proposal_css_path` for still styling. Documented with placeholder keys only:

  ```jsonc
  "brand": {
    "proposal_css_path": "<PATH_TO_CSS>"
  }
  ```

- **Absent-config degradation:** when no connector is configured (no `docsPublish` block), or when `brand.proposal_css_path` is absent, the surface prints a clear message that names what is missing (a `docsPublish` connector, and/or `brand.proposal_css_path`) and how to add it. Do NOT crash and do NOT silently no-op.

## Success Criteria

- The source is gathered and its settled vs open items are separated.
- The page structure was agreed with the author BEFORE any page was built.
- Concept stills are rendered and render-verified (via `harness docs-publish verify-render` / the `docs_publish` MCP tool).
- Pages are published as drafts only — never moved to current/live.
- Every claim carries an epistemic label (verified / inferred / proposed), and no open question was resolved by the skill's own suggestion.
- No real customer data appears in any rendered still.
- The loop is closed: the source is updated with what was built and what remains open.

## Examples

### Example: chat source → agreed outline → verified draft

1. GATHER SOURCE: read the chat thread. Settled: "the pitch is a two-page proposal with one hero figure." Open: "which pricing tier is the default" — record as open, do not answer.
2. AGREE STRUCTURE: propose a parent page plus one child, with the hero figure on the parent. The author replies "yes, but swap the section order." Update the outline and re-confirm. Only now proceed.
3. RENDER STILLS: build the hero still with a fabricated sample dataset (no real customer names or numbers). Render the still via the docs-publish surface.
4. PUBLISH DRAFTS: create the parent and child as drafts under `<PAGE_ID>` (the provider's page handle) via `harness docs-publish draft` / `page-tree`. If a figure needs an attachment, run `harness docs-publish attach-media` and hand its `manual-step-required` instructions to the author, then confirm. Render-verify via `harness docs-publish verify-render`: media loaded, zero broken-media indicators, the intended figure form matches intent.
5. CLOSE THE LOOP: comment on the source chat — "Built draft parent + child at `<PAGE_ID>` (draft). Hero figure verified [verified]. Default pricing tier still open [proposed: tier B] — needs your call." Leave the draft-to-current promotion to the author.

## Gates

- **Drafts only.** Publishing is the author's click. Never move a draft to current/live, and never auto-promote.
- **Render-verify before handoff.** An unverified page is not done. Stored-format correctness is not rendering correctness — run `harness docs-publish verify-render` (or the `docs_publish` MCP tool) first.
- **Surface every manual step; never fake it.** When `attach-media` returns `manual-step-required`, hand the instructions to the human and confirm the upload authoritatively (its `verifyWith` note + render-verify) before calling the page done. Never report an unverified attachment as attached.
- **Epistemic labels on every claim.** Every claim on the page and in the report is labeled verified / inferred / proposed. The skill's own suggestion NEVER "resolves" an open question.
- **Defects tracked, not narrated.** Fix, file-with-repro, or flag-suspected. "As-designed" requires evidence — it is not an escape hatch.
- **No real customer data in any still, ever.** Use clearly fabricated fixtures.
- **No public hosting of proposal content without the author's explicit yes.** A private draft in the provider is not public exposure; a public URL is — and it requires an explicit yes.

## Escalation

- **The source has an unresolved open question the author has not answered.** Do not resolve it with your own proposal. Label your idea `proposed`, carry the question back to the author in plain text, and wait.
- **A claim cannot be labeled verified / inferred / proposed.** Stop. An unlabelable claim is a claim you cannot stand behind — surface it to the author rather than shipping it unlabeled.
- **A still would require real customer data to be meaningful.** Stop. Propose a fabricated fixture that makes the point, or ask the author how to illustrate it without real data. Never render real customer data.
- **The author has not agreed the structure.** Do not render or publish. Present the proposed structure and wait for explicit agreement.
- **The author asks to publish to current or expose a public URL.** Confirm explicitly in plain text before doing either; absent an explicit yes, stay in drafts and keep it private.

## Rationalizations to Reject

| Rationalization                                                           | Reality                                                                                                                          |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| "The author will obviously want this published, I'll move it to current." | Publishing is the author's click. Ship drafts only; never auto-promote.                                                          |
| "The page stored without error, so it's done."                            | Stored-format correctness is not rendering correctness. Render-verify (via `harness docs-publish verify-render`) before handoff. |
| "I'll label this claim verified since it sounds right."                   | Verified means you ran or read it with citable evidence. Otherwise it is `inferred` or `proposed`.                               |
| "My suggestion answers the open question."                                | A skill's own suggestion never resolves an open question. Label it `proposed` and carry it back to the author.                   |
| "This defect is as-designed."                                             | "As-designed" needs evidence. Otherwise fix it, file it with a repro, or flag it suspected.                                      |
| "Synthetic-looking sample data is fine in a still."                       | No real customer data in any still, ever. Use clearly fabricated fixtures.                                                       |
| "I'll drop it on a public URL so the author can preview."                 | No public hosting without an explicit author yes. A private draft in the provider is not exposure; a public URL is.              |
