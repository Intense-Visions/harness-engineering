# Plan: Docs-Publish Contract + Confluence Adapter + Target-Agnostic Pipeline

**Date:** 2026-08-07 | **Spec:** docs/changes/confluence-proposal-skills/proposal.md (amended: Technical Design, Integration Points, Success Criteria, Implementation Order) | **Tasks:** 10 | **Time:** ~55 min | **Integration Tier:** large

## Goal

Restructure the three `claude-code` skills so the publishing **mechanics** are decoupled from any vendor: introduce a NEW vendor-neutral `docs-publish` contract skill (four operations — draft / attach-media / verify-render / page-tree — plus cross-cutting invariants, naming no vendor), RENAME `docs-confluence-publish` → `docs-publish-confluence` reframed as "the Confluence adapter of the `docs-publish` contract" (every existing mechanic preserved verbatim in substance), and make `proposal-pitch` fully target-agnostic (`depends_on: [docs-publish]`, prose repointed from Confluence to "the `docs-publish` contract / a configured provider adapter", its five phases and six gates unchanged) — such that all three pass `harness skill validate` by name, the skill vitest suites (structure, platform-parity, internal-refs) pass, the stale `docs-confluence-publish` symlinks and command files are removed and the new ones reconciled to `generate:plugin:check` exit 0, and every shipped body stays grep-clean of company-specific content and internal tracker references.

## Scope

**In scope:** one NEW skill source pair (`docs-publish/{skill.yaml,SKILL.md}`); the `git mv` rename of `docs-confluence-publish` → `docs-publish-confluence` plus its `name:`/`depends_on:` edits and body reframe; the `proposal-pitch` retarget (`depends_on` + prose); the mirror-symlink delta (remove 3 stale `docs-confluence-publish` symlinks, add 6 new symlinks for `docs-publish` + `docs-publish-confluence` across `codex`/`cursor`/`gemini-cli`); the regenerated `docs/reference/skills-catalog.md`; the plugin command-file reconciliation (remove stale `docs-confluence-publish.md`, add `docs-publish.md` + `docs-publish-confluence.md`, refresh `proposal-pitch.md`); and a changeset.

**Out of scope (per spec Problem Boundary):** implementing any additional adapter (Notion/GDocs/Markdown) — the contract is authored so they slot in without pipeline edits; the shared company-knowledge loader (skills only read from it and degrade in prose); company-specific Atlassian defaults; and any actual publish to a live target. No CLI/schema code changes. The `proposal-pitch` symlinks stay in place (name unchanged) — only their target content changes, transparently through the symlink.

## Grounding (verified against actual code)

- **Both current skills validate cleanly today (scoped, by name).** `harness skill validate docs-confluence-publish` and `harness skill validate proposal-pitch` each report `Validated 1 skill(s)` with zero errors (only the unrelated `harness.config.json: ignored unknown key` warnings print). This is the pre-restructure baseline. `harness check-deps` reports `validation passed`.
- **Skill source-of-truth is the `claude-code` copy only; mirrors are committed symlinks.** `git ls-files -s agents/skills/{codex,cursor,gemini-cli}/docs-confluence-publish` → mode `120000`, object `1b228684…`, and the `proposal-pitch` mirrors → mode `120000`, object `d02653e6…` — all point at `../claude-code/<skill>`. A symlinked mirror resolves through `existsSync`/`readFileSync`, so the parity test sees identical content for free. Author/edit ONLY the `claude-code` copy; manage the symlink delta manually (Task 6).
- **`git mv` preserves the symlink relationship for the rename.** Renaming the `claude-code` dir does NOT move or fix the three mirror symlinks (they still literally read `../claude-code/docs-confluence-publish`, now dangling). The rename therefore REQUIRES: (a) `git mv` the source dir, (b) `git rm` the three stale `docs-confluence-publish` symlinks, (c) create three new `docs-publish-confluence` symlinks. Task 3 + Task 6.
- **Rigid rich-skill required sections are gate-enforced** by `packages/cli/src/commands/skill/validate.ts:14-62` (`BEHAVIORAL_REQUIRED_SECTIONS` = `## When to Use`, `## Process`, `## Harness Integration`, `## Success Criteria`, `## Examples`, `## Rationalizations to Reject`; rigid ALSO requires `## Gates` and `## Escalation`) AND `agents/skills/tests/structure.test.ts:13-122` (same set; rigid Gates+Escalation at `:94-122`). The SKILL.md must also start with an `# ` h1 (`validate.ts:38`). All three skills are `type: rigid`, so all eight `##` sections + the h1 + a `>` blockquote summary are mandatory for each.
- **`## Rationalizations to Reject` domain-specificity is a repo CONVENTION, not a test assertion.** The validator/structure test only check the heading exists; the convention (harness-skill-authoring) requires a table of 3–8 domain-specific rows, NOT the three universal ones. Enforced here by the Task 9 human checkpoint, not by a machine gate.
- **`capabilities` block is NOT required for these skills.** `validate.ts:72-103` (`isHarnessAuthoredSkill`) only fires the mandatory-`capabilities` rule for names starting with `harness-`. None of these three are `harness-`-prefixed, so OMIT `capabilities` (matching `align-design-system/skill.yaml`, which omits it cleanly). Copy that file's yaml shape: `name, version, description, stability, cognitive_mode, triggers, platforms:[claude-code], tools, cli, mcp{tool:run_skill}, type:rigid, tier:2, phases[], state, depends_on`.
- **skill.yaml schema** (`packages/cli/src/skill/schema.ts`, mirrored in `agents/skills/tests/schema.ts`): `name` must match the directory; `platforms` ∈ `{claude-code, gemini-cli, codex, cursor}` (`ALLOWED_PLATFORMS`, schema.ts:46); `type` ∈ `{rigid, flexible, knowledge}`; `tier` 1–3; `cognitive_mode` is regex-checked kebab-case only; `triggers` includes `manual`. `depends_on` is a free list of skill names.
- **`harness skill validate` resolves the working-tree skills dir first** (`resolveProjectSkillsDir(cwd) ?? resolveSkillsDir()`, `validate.ts:152-157`), and validate-by-name scopes to exactly that skill and errors if absent (`:170-172`). The globally-installed `harness` (`/opt/homebrew/bin/harness`, already-built dist) validates THIS worktree's `agents/skills/claude-code` — confirmed above. No local rebuild is needed even though the SKILL.md content changes, because validate reads the working-tree files directly. Validate BY NAME to avoid surfacing pre-existing unrelated failures in other skills.
- **Node version hazard.** This shell runs Node `v26.5.0`; the repo requires Node 22 for native `better-sqlite3` (ABI). Validate/vitest/generate scripts used here do not need sqlite, but if any command throws `MODULE_NOT_FOUND`/ABI errors, switch to Node 22 (`nvm use 22`) before retrying. Do NOT `--no-verify` around it.
- **Platform-parity test** (`agents/skills/tests/platform-parity.test.ts:22-103`): discovers the four `ALLOWED_PLATFORMS` dirs, takes the UNION of skill names across them, and asserts every skill is present in every platform dir with byte-identical `SKILL.md` + `skill.yaml`. Renaming a skill without fixing all four dirs (claude-code + 3 mirrors) makes the union include a name missing elsewhere → test fails. Antigravity is NOT a parity platform.
- **internal-refs guard** (`agents/skills/tests/internal-refs.test.ts:49`): fails on `\b(?:roadmap|PR|pull request|issue) #\d{1,4}\b` in any shipped skill body unless allowlisted. Neither the contract, adapter, nor pipeline bodies may carry tracker numbers.
- **Derived catalog** `docs/reference/skills-catalog.md` is generated by `scripts/generate-docs.mjs` (`loadSkills` over `agents/skills/claude-code`); regenerate with `pnpm run generate-docs`.
- **`generate:plugin` write-mode is DESTRUCTIVE in a worktree — the known-risk step.** `package.json:36-43`: `generate:plugin:all` runs the write generator across `claude/cursor/gemini/codex/antigravity`; per repo memory it wipes each `commands/` dir down to a handful of files in a worktree (the generator enumerates from a source that is incomplete outside a full build). `generate:plugin:check` (`:43`) is READ-ONLY (`--check` per target) and is the acceptance gate. Current stale state (verified): `.claude-plugin/commands/` and `.cursor-plugin/commands/` each contain `docs-confluence-publish.md` and `proposal-pitch.md`; `.gemini-extension`/`.codex-plugin`/`.antigravity-extension` contain NONE for these skills (`.codex-plugin` has no `commands/` dir at all; gemini/antigravity use `.toml`). Task 8 reconciles WITHOUT trusting a bare write-mode run — see its two documented procedures.
- **Baseline is clean.** `git diff --stat origin/main -- .harness/arch/baselines.json` prints nothing today; it must still print nothing at commit (`git merge=ours` churn is a known hazard — restore from origin/main if it drifts).
- **Skill CONTENT is fully enumerated in the amended spec Technical Design** (proposal.md:132-207). This plan references those bullets by section rather than re-transcribing them; the executing agent authors prose from the spec + the preserved current bodies, keeping every operation/phase/gate grounded.

## Observable Truths (Acceptance Criteria)

1. `agents/skills/claude-code/docs-publish/{skill.yaml,SKILL.md}` exists; the yaml parses with `type: rigid`, `name: docs-publish`, `depends_on: []`; the SKILL.md carries all eight rigid sections and NAMES NO VENDOR.
2. `agents/skills/claude-code/docs-publish-confluence/{skill.yaml,SKILL.md}` exists (moved from `docs-confluence-publish` via `git mv` with history preserved); the yaml has `name: docs-publish-confluence`, `depends_on: [docs-publish]`; the SKILL.md is reframed as "the Confluence adapter of the `docs-publish` contract" and PRESERVES every mechanic from the prior skill (osascript/FormData recipe + 3 traps, media-single vs media-group + media-inline, draft/publish race incl. pending-edit-not-fork, page-tree move endpoint + data-local-id, DOM render-verify incl. mediaSingle-vs-mediaGroup counting, deterministic Playwright stills).
3. `agents/skills/claude-code/docs-confluence-publish/` no longer exists (renamed).
4. `proposal-pitch/skill.yaml` declares `depends_on: [docs-publish]` (no Confluence dependency remains); `proposal-pitch/SKILL.md` names no vendor, keeps the five phases (gather source → agree structure → render stills → publish drafts → close the loop) and all six gates (drafts-only, render-verify, epistemic labels, defects-tracked, no customer data, no public hosting), and its Rationalizations table stays domain-specific to the pipeline.
5. `harness skill validate docs-publish`, `harness skill validate docs-publish-confluence`, and `harness skill validate proposal-pitch` each report zero errors.
6. `docs-publish`'s body is grep-clean of `confluence`, `atlassian`, `adf`, `media-single`, `media-group`, `osascript`, `playwright`, and any other provider term (case-insensitive). `proposal-pitch`'s body is grep-clean of the same vendor terms.
7. The mirror symlink set is correct: `agents/skills/{codex,cursor,gemini-cli}/docs-publish` and `.../docs-publish-confluence` exist as `120000` symlinks to `../claude-code/<skill>`; the three `agents/skills/{codex,cursor,gemini-cli}/docs-confluence-publish` symlinks are removed; the three `proposal-pitch` symlinks are unchanged.
8. `pnpm exec vitest run agents/skills/tests/structure.test.ts agents/skills/tests/platform-parity.test.ts agents/skills/tests/internal-refs.test.ts` passes.
9. `docs/reference/skills-catalog.md` lists `docs-publish` and `docs-publish-confluence`, no longer lists `docs-confluence-publish`, after `pnpm run generate-docs`; the plugin command files are reconciled (stale `docs-confluence-publish.md` removed; `docs-publish.md` + `docs-publish-confluence.md` present; `proposal-pitch.md` refreshed) and `pnpm generate:plugin:check` exits 0.
10. Grep-clean of company-specific content (space/page ids, brand hex, product/personal names) and internal roadmap/PR/issue numbers in all three bodies; `pnpm format:check` clean; `.harness/arch/baselines.json` byte-identical to `origin/main`; a changeset exists.

## File Map

- CREATE `agents/skills/claude-code/docs-publish/skill.yaml`
- CREATE `agents/skills/claude-code/docs-publish/SKILL.md`
- RENAME (`git mv`) `agents/skills/claude-code/docs-confluence-publish/` → `agents/skills/claude-code/docs-publish-confluence/` (both files move with history)
- MODIFY `agents/skills/claude-code/docs-publish-confluence/skill.yaml` — `name:` → `docs-publish-confluence`, `depends_on: [docs-publish]`, description reframe
- MODIFY `agents/skills/claude-code/docs-publish-confluence/SKILL.md` — reframe as the Confluence adapter of the contract; preserve all mechanics
- MODIFY `agents/skills/claude-code/proposal-pitch/skill.yaml` — `depends_on: [docs-publish]`, description repoint
- MODIFY `agents/skills/claude-code/proposal-pitch/SKILL.md` — target-agnostic prose; phases + gates unchanged
- CREATE (symlinks) `agents/skills/{codex,cursor,gemini-cli}/docs-publish` → `../claude-code/docs-publish`
- CREATE (symlinks) `agents/skills/{codex,cursor,gemini-cli}/docs-publish-confluence` → `../claude-code/docs-publish-confluence`
- DELETE (symlinks) `agents/skills/{codex,cursor,gemini-cli}/docs-confluence-publish`
- DELETE `.claude-plugin/commands/docs-confluence-publish.md`, `.cursor-plugin/commands/docs-confluence-publish.md`
- CREATE/REGEN `.claude-plugin/commands/docs-publish.md`, `docs-publish-confluence.md` (+ `.cursor-plugin/` equivalents; and any other plugin dir `generate:plugin:check` requires)
- REGEN `.claude-plugin/commands/proposal-pitch.md`, `.cursor-plugin/commands/proposal-pitch.md` (description changed)
- REGEN (committed, machine-generated — do not hand-edit) `docs/reference/skills-catalog.md`
- CREATE `.changeset/docs-publish-contract-adapter.md`

## Phase 1 — Restructure to contract + adapter + agnostic pipeline

Single cohesive phase. Author the contract first (it is the new dependency), rename+reframe the adapter, retarget the pipeline, fix the symlink delta, then validate / regenerate / reconcile / gate / commit.

### Task 1: Author `docs-publish/skill.yaml` (the vendor-neutral contract)

**Depends on:** none | **Files:** `agents/skills/claude-code/docs-publish/skill.yaml`

Create the file with EXACTLY this content (note `depends_on: []`, no vendor tokens, no `capabilities` block):

```yaml
name: docs-publish
version: '1.0.0'
description: The vendor-neutral publishing contract — the four operations every provider adapter must implement (draft, attach-media, verify-render, page-tree) and the cross-cutting invariants (drafts-only, verify-render before done, authoritative read-back over optimistic success, stored-format correctness is not rendering correctness). Names no provider; pipelines depend on this, adapters implement it.
stability: draft
cognitive_mode: methodical-operator
triggers:
  - manual
platforms:
  - claude-code
tools:
  - Read
  - Write
  - Grep
cli:
  command: harness skill run docs-publish
  args:
    - name: path
      description: Project root path
      required: false
mcp:
  tool: run_skill
  input:
    skill: docs-publish
    path: string
type: rigid
tier: 2
phases:
  - name: draft
    description: Create or update a publish target in a non-live DRAFT state and return a stable handle; never publish or promote
    required: true
  - name: attach-media
    description: Attach a media asset to a draft and return an authoritative read-back confirmation, not the caller's optimistic success
    required: true
  - name: verify-render
    description: Assert the rendered output is correct (media loaded, zero broken-media indicators, intended figure form) — not merely that it stored
    required: true
  - name: page-tree
    description: Create children under a draft parent, order siblings, and preserve provider-native node identity across full-body round-trips
    required: true
state:
  persistent: false
  files: []
depends_on: []
```

Run: `harness skill validate docs-publish` — expect it to fail ONLY on the missing `SKILL.md` (authored in Task 2), confirming the yaml parses.

### Task 2: Author `docs-publish/SKILL.md` (the contract body — names no vendor)

**Depends on:** Task 1 | **Files:** `agents/skills/claude-code/docs-publish/SKILL.md`
**Skills:** `harness-skill-authoring` (apply)

Author the rich rigid SKILL.md. Structure (in order): an `# ` h1 title (e.g. `# Docs Publish Contract`), a one-paragraph `>` blockquote summary, then the eight required `##` sections. Ground every operation/invariant in spec §"`docs-publish` content (the generic contract, rigid)" (proposal.md:132-155). **Hard constraint: NAME NO VENDOR** — the body must contain none of `confluence`, `atlassian`, `adf`, `media-single`, `media-group`, `osascript`, `playwright`, or any other provider-specific term. Describe everything in vendor-neutral language (e.g. "a media asset", "broken-media indicators", "the intended figure form", "provider-native node identity"). Required content:

1. **`## When to Use`** — positive: implementing a new provider adapter and needing the normative operations/invariants to implement against; a pipeline that needs a stable publishing dependency it can `depends_on` without naming a vendor. Negatives: NOT the mechanics of any specific provider (those live in an adapter such as `docs-publish-confluence`); NOT the proposal pipeline itself (that is `proposal-pitch`); NOT for reading/ingesting content (that is a connector concern).
2. **`## Process`** — one subsection per contract operation, each stating what an adapter MUST implement and what a consumer MAY assume, vendor-neutrally:
   - **draft** — create/update a publish target in a non-live DRAFT state; never publish or promote; return a stable handle to the draft.
   - **attach-media** — attach a media asset to a draft and return an authoritative confirmation (a read-back, not the caller's optimistic success).
   - **verify-render** — assert the rendered output is correct, not merely stored: media actually loaded, zero broken-media indicators, intended figure form; return pass/fail with the failing assertions.
   - **page-tree** — create children under a draft parent and order siblings; preserve provider-native node identity across full-body round-trips.
     Then a **Cross-cutting invariants** subsection: drafts-only; verify-render before "done"; authoritative read-back over optimistic success; stored-format correctness is not rendering correctness. Then a **Graceful degradation** subsection: what a consumer does when NO adapter is configured — surface a clear, actionable message naming what is missing and how to configure an adapter; do not crash, do not silently no-op.
3. **`## Harness Integration`** — invocation via `harness skill run docs-publish` / `run_skill`; the contract is the `depends_on` target for pipelines (`proposal-pitch`) and the interface adapters (`docs-publish-confluence`) implement. Describe the shared-config contract abstractly (an adapter reads its own provider pointers from the shared company-knowledge tier) WITHOUT naming the `confluence` block here — that key belongs to the adapter, not the generic contract.
4. **`## Success Criteria`** — from this skill alone, an adapter author knows the exact four operations and four invariants to implement; a pipeline author knows what it may assume and how degradation is signalled.
5. **`## Examples`** — one vendor-neutral worked example: a consumer calls draft → attach-media (confirmed by read-back) → verify-render (pass with zero broken-media indicators) → page-tree, staying in drafts throughout.
6. **`## Gates`** (rigid) — hard stops the contract mandates for every adapter: never publish/promote (drafts-only); never report "done" before verify-render passes; never treat optimistic success as confirmation (require authoritative read-back); never equate stored-format correctness with rendering correctness.
7. **`## Escalation`** — what a consumer does when no adapter is configured (degrade with the actionable message), and what an adapter does when an operation cannot satisfy an invariant (return the failing assertions; hand back rather than claim success).
8. **`## Rationalizations to Reject`** — a markdown table of 3–8 DOMAIN-SPECIFIC, VENDOR-NEUTRAL rows, e.g. "The API returned 200 so the media attached" → "Optimistic success is not confirmation; require an authoritative read-back"; "It stored without error so the page is done" → "Stored-format correctness is not rendering correctness; verify-render before done"; "I'll promote it to live since it looks ready" → "Drafts-only; promotion is the owner's action, never the adapter's"; "No adapter is configured so I'll skip publishing silently" → "Degrade with an actionable message; never silently no-op".

Run: `harness skill validate docs-publish` — expect zero errors.

### Task 3: Rename the adapter (`git mv`) and edit its `skill.yaml`

**Depends on:** Task 2 | **Files:** `agents/skills/claude-code/docs-publish-confluence/skill.yaml` (moved from `docs-confluence-publish/`)

1. Rename the source directory, preserving git history:

   ```bash
   git mv agents/skills/claude-code/docs-confluence-publish agents/skills/claude-code/docs-publish-confluence
   ```

2. Edit `agents/skills/claude-code/docs-publish-confluence/skill.yaml`:
   - Change `name: docs-confluence-publish` → `name: docs-publish-confluence` (MUST match the new dir).
   - Change `version: '0.1.0'` → `version: '1.0.0'`.
   - Change `depends_on: []` → `depends_on:\n  - docs-publish`.
   - Reframe `description:` to name the contract, e.g.: `The Confluence adapter of the docs-publish contract — maps draft, attach-media, verify-render, and page-tree to Confluence Cloud mechanics (the osascript/FormData attachment recipe, ADF media forms, the draft/publish race, the page-tree move endpoint, DOM render verification, and deterministic stills). Ships zero company-specific content.`
   - Keep the existing `phases[]`, `tools`, `cli`, `mcp`, `stability`, `cognitive_mode`, `state` as-is (they already describe the Confluence mechanics accurately). Do NOT add a `capabilities` block.

3. Run: `harness skill validate docs-publish-confluence` — expect it to PASS (the moved SKILL.md still has all eight sections; the reframe in Task 4 is a content edit, not a structural one). If it errors, the `name:`/dir mismatch is the likely cause — fix and re-run.

### Task 4: Reframe `docs-publish-confluence/SKILL.md` as the contract's Confluence adapter

**Depends on:** Task 3 | **Files:** `agents/skills/claude-code/docs-publish-confluence/SKILL.md`
**Skills:** `harness-skill-authoring` (apply)

Edit the moved SKILL.md in place. **PRESERVE ALL EXISTING MECHANICS VERBATIM IN SUBSTANCE** — the osascript+FormData attachment recipe and its three traps (no large base64 through tool params; never the `127.0.0.1` literal; verify authoritatively with a GET), the `media-single` vs `media-group` + `media-inline` distinction, the draft/publish race incl. pending-edit-is-not-a-fork and stale-editor-clobber and tiny-link-resolution timing, the page-tree `PUT …/move/{before|after|append}/…` endpoint + `data-local-id` preservation, the DOM render-verify incl. `mediaSingle`-vs-`mediaGroup` counting (thumbnail cards also pass `naturalWidth > 0`), and the deterministic Playwright stills (`emulateMedia({colorScheme, reducedMotion:'reduce'})`, `screenshot({scale:'device'})`). Ground against spec §"`docs-publish-confluence` content (the Confluence adapter, rigid)" (proposal.md:157-184). The ONLY changes are framing:

1. **H1 + blockquote** — reframe as the Confluence adapter, e.g. `# Confluence Adapter for docs-publish` and a summary that says "the Confluence Cloud adapter implementing the `docs-publish` contract".
2. **`## When to Use`** — add a positive trigger "you are implementing/using the Confluence adapter of the `docs-publish` contract"; keep the existing positives/negatives; keep the negative "NOT the pipeline — that is `proposal-pitch`".
3. **`## Process`** — reframe the phase preamble so each Confluence phase is explicitly mapped to a contract operation: **draft** → Confluence draft page semantics + the draft/publish race; **attach-media** → the osascript/FormData recipe + 3 traps; **verify-render** → the DOM assertions + `media-single`/`media-group`/`media-inline`; **page-tree** → children + the move endpoint + `data-local-id`; plus deterministic stills as the adapter's still-rendering implementation. Keep every mechanical detail already present.
4. **`## Harness Integration`** — add `depends_on: docs-publish` and one line stating this skill implements the contract's four operations; keep the existing `confluence`/`brand` config-contract prose (placeholder keys only — `cloud_id`, `space_id`, `proposals_index_page_id`, `exemplar_page_ids`, `brand.proposal_css_path`) and the absent-block degradation message. The `confluence` block is named HERE (the adapter owns it), which is correct.
5. **`## Gates`, `## Escalation`, `## Success Criteria`, `## Examples`, `## Rationalizations to Reject`** — keep verbatim in substance; where they reference "this skill", they still read correctly. Optionally add one row/line tying a gate back to a contract invariant (e.g. "verify-render before done — the contract invariant this adapter satisfies via the DOM assertions").

Constraints: NO company-specific content (no real space/page ids, brand hex, product/personal names — only `<CLOUD_ID>`/`<PAGE_ID>` placeholders) and NO internal roadmap/PR/issue numbers anywhere in the body.

Run: `harness skill validate docs-publish-confluence` — expect zero errors.

### Task 5: Retarget `proposal-pitch` to the contract (yaml + target-agnostic prose)

**Depends on:** Task 4 | **Files:** `agents/skills/claude-code/proposal-pitch/skill.yaml`, `agents/skills/claude-code/proposal-pitch/SKILL.md`

1. Edit `proposal-pitch/skill.yaml`:
   - Change `depends_on:\n  - docs-confluence-publish` → `depends_on:\n  - docs-publish`.
   - Bump `version: '0.1.0'` → `version: '1.0.0'`.
   - Repoint `description:` from `Composes docs-confluence-publish` to `Composes the docs-publish contract (resolving a configured provider adapter)`; remove any Confluence naming.

2. Edit `proposal-pitch/SKILL.md` to be FULLY target-agnostic while KEEPING the five phases (gather source → agree structure → render stills → publish drafts → close the loop) and all six gates (drafts-only, render-verify, epistemic labels, defects-tracked, no customer data, no public hosting) unchanged in substance. Ground against spec §"`proposal-pitch` content (the pipeline, rigid)" (proposal.md:186-207). Specific edits:
   - Repoint every `docs-confluence-publish` reference to `docs-publish` (the contract), and every "Confluence proposal"/"Confluence" mention to "a reviewable proposal via the configured provider adapter" / "the `docs-publish` contract". This includes the blockquote, `## When to Use`, `## Process` (Phase 3 render-stills and Phase 4 publish-drafts delegate to "the `docs-publish` contract" — e.g. "the contract's verify-render / attach-media operations"), `## Harness Integration` (`depends_on: docs-publish`; describe the config contract as "read by the configured provider adapter" — the pipeline itself names no vendor block), `## Success Criteria`, `## Examples` (genericize the worked example; keep `<PAGE_ID>` placeholders but frame them as "the provider's page handle"), `## Gates`, and `## Escalation`.
   - **KEEP the `## Rationalizations to Reject` table domain-specific to the PIPELINE** (drafts-only, render-verify, epistemic labels, no customer data, as-designed-needs-evidence, no-public-hosting) — its substance is already vendor-neutral; only swap the one `docs-confluence-publish` reference to `docs-publish`.
   - **Grep-clean of vendor terms:** after editing, the body must contain none of `confluence`, `atlassian`, `adf`, `media-single`, `media-group` (case-insensitive). Generic terms like "figure", "render-verify", "page tree" are fine.

3. Run: `harness skill validate proposal-pitch` — expect zero errors.

### Task 6: Fix the mirror-symlink delta (remove 3 stale, add 6 new)

**Depends on:** Task 5 | **Files:** `agents/skills/{codex,cursor,gemini-cli}/{docs-confluence-publish,docs-publish,docs-publish-confluence}` | **Category:** integration

The `git mv` in Task 3 left the three `docs-confluence-publish` mirror symlinks dangling (they still read `../claude-code/docs-confluence-publish`). The `proposal-pitch` symlinks are untouched and stay. From the repo root:

1. Remove the three stale symlinks:

   ```bash
   git rm agents/skills/codex/docs-confluence-publish agents/skills/cursor/docs-confluence-publish agents/skills/gemini-cli/docs-confluence-publish
   ```

2. Create six new relative symlinks (contract + adapter, across the three mirror platforms):

   ```bash
   for p in codex cursor gemini-cli; do
     ln -s ../claude-code/docs-publish            "agents/skills/$p/docs-publish"
     ln -s ../claude-code/docs-publish-confluence "agents/skills/$p/docs-publish-confluence"
   done
   ```

3. Stage and confirm each resolves as a `120000` symlink to the claude-code source:

   ```bash
   git add agents/skills/codex/docs-publish agents/skills/cursor/docs-publish agents/skills/gemini-cli/docs-publish \
           agents/skills/codex/docs-publish-confluence agents/skills/cursor/docs-publish-confluence agents/skills/gemini-cli/docs-publish-confluence
   git ls-files -s agents/skills/codex/docs-publish agents/skills/gemini-cli/docs-publish-confluence
   ```

   Each must show mode `120000`. Also confirm the stale ones are gone: `ls agents/skills/codex | grep docs-confluence-publish` prints nothing.

### Task 7: Build-if-needed, validate all three by name, run the skill vitest suites

**Depends on:** Task 6 | **Files:** (verification only)

1. Validate ALL THREE skills BY NAME (scoped — avoids surfacing any pre-existing unrelated failure in another skill):

   ```bash
   harness skill validate docs-publish && \
   harness skill validate docs-publish-confluence && \
   harness skill validate proposal-pitch
   ```

   All three must report `Validated 1 skill(s)` with zero errors. (No rebuild is needed — `harness skill validate` reads the working-tree `agents/skills/claude-code` directly. If instead `harness` errors with `MODULE_NOT_FOUND`/ABI, the shell is on Node 26 — switch to Node 22 (`nvm use 22`) and, only if the global binary is stale, `pnpm --filter @harness-engineering/cli build`, then retry.)

2. Run the three skill test suites from the repo root:

   ```bash
   pnpm exec vitest run agents/skills/tests/structure.test.ts agents/skills/tests/platform-parity.test.ts agents/skills/tests/internal-refs.test.ts
   ```

   All must pass — structure (all eight rigid sections present in each of the three), parity (all three skills exist in all four platform dirs with identical content via the symlinks; no dangling `docs-confluence-publish` name remains in any dir's union), and internal-refs (no tracker leaks).

3. Confirm the index loads all three and the old name is gone:

   ```bash
   harness skill list 2>&1 | grep -E "docs-publish( |$)|docs-publish-confluence|proposal-pitch"
   harness skill list 2>&1 | grep -E "docs-confluence-publish" && echo "STALE NAME STILL PRESENT — investigate" || echo "OK: docs-confluence-publish gone"
   ```

### Task 8: Regenerate the catalog and reconcile the plugin command files (known destructive-prune risk)

**Depends on:** Task 7 | **Files:** `docs/reference/skills-catalog.md`, `.claude-plugin/commands/`, `.cursor-plugin/commands/` (+ any other plugin dir the check requires) | **Category:** integration

1. Regenerate the skills catalog (safe, non-destructive):

   ```bash
   pnpm run generate-docs
   ```

   Confirm the catalog now lists the new names and drops the old one:

   ```bash
   grep -nE "docs-publish( |\b)|docs-publish-confluence|proposal-pitch" docs/reference/skills-catalog.md
   grep -nE "docs-confluence-publish" docs/reference/skills-catalog.md && echo "STALE CATALOG ROW — investigate" || echo "OK: catalog clean"
   ```

2. **Reconcile the plugin command files. `generate:plugin:all` write-mode is DESTRUCTIVE in a worktree — do NOT run it blindly and commit the result.** Use one of the two procedures below; the acceptance gate for both is `generate:plugin:check` exit 0 with ONLY the intended delta staged (remove `docs-confluence-publish.md`; add `docs-publish.md` + `docs-publish-confluence.md`; refresh `proposal-pitch.md`).

   **Procedure A — salvage-and-restore (use the generator's exact output, then undo its collateral damage):**

   ```bash
   # a) Run the write generator ONCE (this ALSO wipes unrelated command files — expected).
   pnpm generate:plugin:all
   # b) Salvage the freshly-generated additive/changed files to a scratch dir BEFORE restoring.
   mkdir -p /tmp/plugin-salvage/claude /tmp/plugin-salvage/cursor
   cp .claude-plugin/commands/docs-publish.md .claude-plugin/commands/docs-publish-confluence.md .claude-plugin/commands/proposal-pitch.md /tmp/plugin-salvage/claude/ 2>/dev/null
   cp .cursor-plugin/commands/docs-publish.md .cursor-plugin/commands/docs-publish-confluence.md .cursor-plugin/commands/proposal-pitch.md /tmp/plugin-salvage/cursor/ 2>/dev/null
   # (also salvage from .gemini-extension/.codex-plugin/.antigravity-extension IF the generator produced these skills' commands there)
   # c) Restore ALL plugin dirs to origin/main, undoing the destructive wipe.
   git checkout origin/main -- .claude-plugin .cursor-plugin .gemini-extension .codex-plugin .antigravity-extension
   # d) Remove the stale command files for the renamed skill.
   git rm .claude-plugin/commands/docs-confluence-publish.md .cursor-plugin/commands/docs-confluence-publish.md
   # e) Drop the salvaged new/changed files into place.
   cp /tmp/plugin-salvage/claude/* .claude-plugin/commands/
   cp /tmp/plugin-salvage/cursor/* .cursor-plugin/commands/
   ```

   **Procedure B — hand-create by copying the committed format (safer; no destructive run):** copy the committed `docs-confluence-publish.md` to `docs-publish-confluence.md` in `.claude-plugin/commands/` and `.cursor-plugin/commands/`, edit the skill name/description inside to match the reframed adapter; create `docs-publish.md` the same way from the copied format with the contract's name/description; regenerate `proposal-pitch.md`'s body to match the updated description; then `git rm` the two stale `docs-confluence-publish.md` files.

3. **Verify the reconciliation with the read-only check (the acceptance gate):**

   ```bash
   pnpm generate:plugin:check && echo "PLUGIN GENERATORS IN SYNC"
   ```

   Must exit 0. A non-zero exit means the committed command files do not match what the generator would produce — fix the offending file's content (do NOT hand-edit toward a guess; re-salvage from a fresh `generate:plugin:all` output for that one file) and re-run. Confirm no destructive collateral snuck in: `git status --porcelain .claude-plugin .cursor-plugin .gemini-extension .codex-plugin .antigravity-extension` should show ONLY the intended rename/add/refresh, never a mass deletion of unrelated command files.

### Task 9: Grep-clean, vendor-neutrality, format, and arch-baseline gates

**Depends on:** Task 8 | **Files:** (verification only) | **Category:** integration

1. **Vendor-neutrality of the contract and the pipeline** (Observable Truth 6). Each command must print nothing:

   ```bash
   grep -niE "confluence|atlassian|adf|media-single|media-group|osascript|playwright" agents/skills/claude-code/docs-publish/SKILL.md && echo "FAIL: vendor term in docs-publish" || echo "OK: docs-publish vendor-neutral"
   grep -niE "confluence|atlassian|adf|media-single|media-group" agents/skills/claude-code/proposal-pitch/SKILL.md && echo "FAIL: vendor term in proposal-pitch" || echo "OK: proposal-pitch vendor-neutral"
   ```

2. **Company-specific content grep-clean** across all three bodies (a clean run prints nothing; tune the alternation to the org's real tokens before relying on it):

   ```bash
   grep -rniE "([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}|space[_-]?id[[:space:]]*[:=][[:space:]]*[A-Za-z0-9]|#[0-9a-fA-F]{6}|pageId=[0-9]+)" \
     agents/skills/claude-code/docs-publish/SKILL.md \
     agents/skills/claude-code/docs-publish-confluence/SKILL.md \
     agents/skills/claude-code/proposal-pitch/SKILL.md \
     && echo "REVIEW: potential company-specific token found" || echo "GREP-CLEAN OK"
   ```

   Any hit must be a documented placeholder (`<CLOUD_ID>`, `<PAGE_ID>`, `cloud_id`, `space_id`, `exemplar_page_ids`, `proposal_css_path`) with NO real value; a real value fails the gate.

3. **Format check** — `pnpm format:check` clean. If prettier reports the new/edited files, run `pnpm format` and re-check.

4. **Arch baseline unchanged** — `git diff --stat origin/main -- .harness/arch/baselines.json` prints nothing. If it drifted, restore: `git checkout origin/main -- .harness/arch/baselines.json` (do NOT commit baseline churn).

### Task 10: Add changeset and commit

**Depends on:** Task 9 | **Files:** `.changeset/docs-publish-contract-adapter.md`, all of the above | **Category:** integration

1. `[checkpoint:human-verify]` — Present all three authored/edited `SKILL.md` bodies for review: confirm (a) `docs-publish` carries the eight rigid sections, the four contract operations + four invariants + graceful-degradation prose, and NAMES NO VENDOR; (b) `docs-publish-confluence` reads as the contract's Confluence adapter with EVERY prior mechanic preserved (recipe + 3 traps, media-single/group/inline, draft/publish race, move endpoint + data-local-id, DOM verify counting, deterministic stills); (c) `proposal-pitch` is vendor-neutral, keeps its five phases + six gates, and its Rationalizations stay pipeline-domain-specific; (d) zero company-specific / internal-ref content in all three. Wait for confirmation before committing.

2. Create `.changeset/docs-publish-contract-adapter.md` (no internal tracker numbers in the summary):

   ```markdown
   ---
   '@harness-engineering/cli': patch
   ---

   Restructure the publishing skills into a vendor-neutral contract plus a
   provider adapter. Add `docs-publish` — the generic publishing contract
   defining four operations (draft, attach-media, verify-render, page-tree) and
   the cross-cutting invariants (drafts-only, verify-render before done,
   authoritative read-back over optimistic success, stored-format correctness is
   not rendering correctness), naming no provider. Rename
   `docs-confluence-publish` to `docs-publish-confluence` and reframe it as the
   Confluence adapter of that contract, preserving every mechanic. Retarget
   `proposal-pitch` to depend on the contract (not on any provider) so it is fully
   target-agnostic. All three ship zero company-specific content.
   ```

3. Stage exactly the skill source, the symlink delta, the regenerated catalog, the reconciled plugin command files, and the changeset, then commit atomically (the pre-commit hook re-verifies and may re-sync plugin artifacts — if it re-stages files, re-add and re-commit; NEVER use `--no-verify`):

   ```bash
   git add agents/skills/claude-code/docs-publish \
           agents/skills/claude-code/docs-publish-confluence \
           agents/skills/claude-code/proposal-pitch \
           agents/skills/codex/docs-publish agents/skills/cursor/docs-publish agents/skills/gemini-cli/docs-publish \
           agents/skills/codex/docs-publish-confluence agents/skills/cursor/docs-publish-confluence agents/skills/gemini-cli/docs-publish-confluence \
           .claude-plugin .cursor-plugin .gemini-extension .codex-plugin .antigravity-extension \
           docs/reference/skills-catalog.md \
           .changeset/docs-publish-contract-adapter.md
   # the git mv + git rm from Tasks 3 and 6 are already staged; confirm with `git status`
   git commit -m "refactor(skills): split docs-publish contract from confluence adapter; make proposal-pitch target-agnostic"
   ```

4. Confirm the commit landed and the baseline is still clean: `git log --oneline -1 && git diff --stat origin/main -- .harness/arch/baselines.json` (the second command prints nothing). Confirm the rename registered as a rename (not delete+add): `git show --stat HEAD | grep -E "docs-confluence-publish|docs-publish-confluence"`.

## Verification (exact commands)

Run in order from the repo root; every command must succeed:

```bash
# 1. All three skills validate (scoped by name — avoids pre-existing unrelated noise)
harness skill validate docs-publish
harness skill validate docs-publish-confluence
harness skill validate proposal-pitch

# 2. Skill structure, platform parity, and internal-ref leak guard
pnpm exec vitest run agents/skills/tests/structure.test.ts agents/skills/tests/platform-parity.test.ts agents/skills/tests/internal-refs.test.ts

# 3. Index loads new names; old name is gone
harness skill list 2>&1 | grep -E "docs-publish|docs-publish-confluence|proposal-pitch"
harness skill list 2>&1 | grep -E "docs-confluence-publish" && echo "STALE — investigate" || echo "OK: old name gone"

# 4. Catalog regenerated: contains new names, drops old
pnpm run generate-docs
grep -nE "docs-publish|docs-publish-confluence|proposal-pitch" docs/reference/skills-catalog.md
grep -nE "docs-confluence-publish" docs/reference/skills-catalog.md && echo "STALE ROW" || echo "OK"

# 5. Plugin command files reconciled (read-only check; exit 0)
pnpm generate:plugin:check

# 6. Symlink delta correct (new = mode 120000; old = absent)
git ls-files -s agents/skills/codex/docs-publish agents/skills/cursor/docs-publish agents/skills/gemini-cli/docs-publish \
                agents/skills/codex/docs-publish-confluence agents/skills/cursor/docs-publish-confluence agents/skills/gemini-cli/docs-publish-confluence
git ls-files agents/skills/codex/docs-confluence-publish agents/skills/cursor/docs-confluence-publish agents/skills/gemini-cli/docs-confluence-publish

# 7. Vendor-neutrality of contract + pipeline (both print nothing)
grep -niE "confluence|atlassian|adf|media-single|media-group|osascript|playwright" agents/skills/claude-code/docs-publish/SKILL.md || echo "docs-publish OK"
grep -niE "confluence|atlassian|adf|media-single|media-group" agents/skills/claude-code/proposal-pitch/SKILL.md || echo "proposal-pitch OK"

# 8. Format clean
pnpm format:check

# 9. Arch baseline byte-identical to origin/main (prints nothing)
git diff --stat origin/main -- .harness/arch/baselines.json
```

## Checkpoints

- **Task 10, step 1 `[checkpoint:human-verify]`** — human reviews all three SKILL.md bodies (contract vendor-neutrality + four ops/invariants; adapter mechanic-preservation + contract framing; pipeline agnosticism + phases/gates intact; grep-clean; no internal refs) before the commit.

## Sequencing & Parallelism

Strictly sequential: Task 1 → 2 (contract must exist before the adapter/pipeline can depend on it) → 3 → 4 (rename before reframe) → 5 → 6 (symlink delta needs the renamed source dir) → 7 (validate needs all sources + symlinks final) → 8 (regen needs the final `claude-code` sources) → 9 → 10. No parallelism — each task's output is the next task's input, and the regen/reconcile steps must see the final source.

## Risks & Concerns

- **Destructive `generate:plugin:all` in a worktree (the load-bearing risk).** Write-mode plugin generation wipes each `commands/` dir to a handful of files in a worktree. Task 8 handles this with an explicit salvage-and-restore procedure (Procedure A) or a no-destructive-run hand-create (Procedure B), with `git status --porcelain` on all five plugin dirs as the collateral-damage tripwire and `generate:plugin:check` exit 0 as the acceptance gate. Never commit the raw output of a bare `generate:plugin:all` from this worktree.
- **`git mv` leaves mirror symlinks dangling.** The three `docs-confluence-publish` symlinks are not moved by the rename and become dangling; Task 6 removes them and adds the six new ones. The platform-parity test is the backstop — a missed symlink surfaces as a union-mismatch failure in Task 7.
- **Vendor leakage into the generic contract.** The single biggest content risk is a Confluence term (`adf`, `media-single`, `osascript`, …) slipping into `docs-publish` or `proposal-pitch`. Task 9 step 1 greps for exactly these; the Task 10 checkpoint is the human backstop.
- **Rename must register as a rename, not delete+add.** Verified in Task 10 step 4 (`git show --stat`). `git mv` (Task 3) is what preserves the history and the review-friendly diff; a manual `rm`+`cp` would lose it.
- **Node version / dist.** This shell is Node 26; the repo wants Node 22 for native `better-sqlite3`. Validate/vitest/generate here do not need sqlite, but if any command throws `MODULE_NOT_FOUND`/ABI, switch to Node 22 and rebuild the CLI only if the global binary is stale. Never `--no-verify`.
- **Baseline churn.** `.harness/arch/baselines.json` is prone to `merge=ours`/`updatedAt` churn on commit; Task 9 step 4 and Verification step 9 both assert byte-identity to origin/main and restore from origin/main if it drifts.
- **Grep-clean is heuristic.** The Task 9 pattern catches common shapes (UUID cloud ids, `#RRGGBB` hex, `pageId=`), but product/personal names need the human eye — hence the Task 10 checkpoint.
