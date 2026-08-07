# Plan: Confluence Publishing + Proposal-Pitch Skills

**Date:** 2026-08-07 | **Spec:** docs/changes/confluence-proposal-skills/proposal.md (Technical Design, Integration Points, Success Criteria) | **Tasks:** 9 | **Time:** ~40 min | **Integration Tier:** large

## Goal

Author two new rigid, user-facing `claude-code` skills — `docs-confluence-publish` (portable Confluence Cloud publishing mechanics) and `proposal-pitch` (the draft-first proposal pipeline that composes it) — in the rich harness format, register them for `claude-code` with `codex`/`cursor`/`gemini-cli` symlinks, and regenerate all derived artifacts, such that both pass `harness skill validate`, the skill-structure and parity vitest suites, and the grep-clean / format / plugin-check / arch / changeset gates — shipping zero company-specific content and zero internal tracker references.

## Scope

**In scope:** the two skill source pairs under `agents/skills/claude-code/`, their nine platform symlinks (three per skill), the regenerated `docs/reference/skills-catalog.md`, and a changeset. Both skills document the shared `confluence`/`brand` config contract in prose and its absent-block graceful-degradation message.

**Out of scope (per spec Problem Boundary):** implementing the shared company-knowledge loader (skills only read from it and degrade in prose), company-specific Atlassian defaults, and any actual publish to a live Confluence. No CLI/schema code changes. Do NOT run write-mode `generate:plugin` — the read-only `generate:plugin:check` is the only plugin gate here (a new skill legitimately grows the command count; that is fine).

## Grounding (verified against actual code)

- **Skill source-of-truth is the `claude-code` copy only.** Skills live at `agents/skills/claude-code/<skill>/{SKILL.md,skill.yaml}`. The `codex`/`cursor`/`gemini-cli` mirrors are committed **symlinks** to `../claude-code/<skill>` (confirmed: `git ls-files -s agents/skills/codex/harness-skill-authoring` → mode `120000`, target `../claude-code/harness-skill-authoring`). Author ONLY the claude-code copy; create the three symlinks per skill manually (Task 5). A symlinked mirror resolves through `existsSync`/`readFileSync`, so the parity test sees identical content for free.
- **Rigid rich-skill required sections are gate-enforced** by `packages/cli/src/commands/skill/validate.ts:14-62` AND `agents/skills/tests/structure.test.ts:13-124`. Behavioral skills need: `## When to Use`, `## Process`, `## Harness Integration`, `## Success Criteria`, `## Examples`, `## Rationalizations to Reject`. Rigid skills ALSO need `## Gates` and `## Escalation`. Both new skills are `type: rigid`, so all eight `##` sections plus the title h1 and blockquote summary are mandatory.
- **`## Rationalizations to Reject` must be domain-specific.** The validator only checks the heading exists, but the repo convention (harness-skill-authoring) requires a table of 3–8 domain-specific entries — NOT the three universal ones. `align-design-system` currently FAILS `harness skill validate` for a missing Rationalizations section, which is exactly the failure mode to avoid: `harness skill validate` with no argument validates ALL skills and will surface that pre-existing failure, so this plan validates the two NEW skills BY NAME (`harness skill validate docs-confluence-publish` / `... proposal-pitch`) to keep the gate scoped and honest.
- **skill.yaml schema** (`packages/cli/src/skill/schema.ts`): `name` must match the directory; `triggers` ∈ {manual, on_pr, on_commit, on_new_feature, on_bug_fix, on_refactor, on_project_init, on_review, on_milestone, on_task_complete, on_doc_check}; `platforms` ∈ {claude-code, gemini-cli, codex, cursor}; `type` ∈ {rigid, flexible, knowledge}; `tier` 1–3; `cognitive_mode` is regex-checked kebab-case only; `phases[]`, `state`, `depends_on` optional. `align-design-system/skill.yaml` is the rigid+phases exemplar.
- **These skills are NOT `harness-` prefixed**, so the mandatory-`capabilities` rule (`validate.ts:72-103`, only fires for `harness-`-named skills) does NOT apply — omit the `capabilities` block (matching `align-design-system`, which omits it cleanly).
- **`harness skill validate` resolves the working-tree skills dir first** (`resolveProjectSkillsDir(cwd) ?? resolveSkillsDir()`, `validate.ts:152-157`), so the globally-installed `harness` binary (`/opt/homebrew/bin/harness`, backed by the already-built dist) validates THIS worktree's `agents/skills/claude-code`. No local rebuild needed.
- **Structure vitest** lives at `agents/skills/tests/structure.test.ts`; **parity** at `platform-parity.test.ts` (every skill must exist in all four platform dirs with identical files, and per-platform skill counts must match — adding two skills to each of four dirs keeps counts equal); **internal-ref leak guard** at `internal-refs.test.ts` (fails on `roadmap|PR|pull request|issue #\d{1,4}` and sub-project index patterns unless allowlisted). Run these via repo-root `pnpm exec vitest run agents/skills/tests/...`.
- **Derived catalog** `docs/reference/skills-catalog.md` is generated by `scripts/generate-docs.mjs` (`loadSkills` over `agents/skills/claude-code`); regenerate with `pnpm run generate-docs`. Slash-command/plugin sync is checked read-only with `pnpm generate:plugin:check` (must exit 0). `pnpm format:check` is `prettier --check`. Changesets live in `.changeset/*.md`.
- **Shipped-artifact content rules (two distinct gates):** (a) NO company-specific content — no space ids, page ids, brand hex, product names, or personal names — enforced here by an explicit grep (Task 8); (b) NO internal roadmap/PR/issue numbers in skill bodies — enforced by `internal-refs.test.ts` (Task 6). Both skill bodies must pass both. The config contract is documented with **placeholder keys only** (`cloud_id`, `space_id`, `proposals_index_page_id`, `exemplar_page_ids`, `brand.proposal_css_path`) — never real values.
- **All skill CONTENT is enumerated in the spec's Technical Design** (proposal.md:87-145). This plan references those bullets by section rather than re-transcribing them; the executing agent authors prose from the spec, keeping every phase/gate/rationalization grounded in the spec's battle-tested recipe.

## Observable Truths (Acceptance Criteria)

1. `agents/skills/claude-code/docs-confluence-publish/{skill.yaml,SKILL.md}` and `agents/skills/claude-code/proposal-pitch/{skill.yaml,SKILL.md}` exist; both `skill.yaml` parse with `type: rigid`, matching `name`, and `proposal-pitch` declares `depends_on: [docs-confluence-publish]`.
2. `harness skill validate docs-confluence-publish` and `harness skill validate proposal-pitch` each report zero errors.
3. Both `SKILL.md` contain all eight required sections (When to Use with positive+negative, Process, Harness Integration, Success Criteria, Examples, Gates, Escalation, and a domain-specific Rationalizations to Reject table of 3–8 rows).
4. Both skills document the `confluence`/`brand` config contract (placeholder keys only) and an absent-block graceful-degradation message (name the missing pointers + how to add them; no crash, no silent no-op).
5. Six mirror symlinks exist and resolve — `agents/skills/{codex,cursor,gemini-cli}/docs-confluence-publish` and `.../proposal-pitch` → `../claude-code/<skill>` (two skills × three platforms).
6. `pnpm exec vitest run agents/skills/tests/structure.test.ts agents/skills/tests/platform-parity.test.ts agents/skills/tests/internal-refs.test.ts` passes.
7. `docs/reference/skills-catalog.md` lists both skills after `pnpm run generate-docs`; `pnpm generate:plugin:check` exits 0.
8. Grep-clean: no space ids, page ids, brand hex, product names, or personal names in either skill body.
9. `pnpm format:check` clean; `.harness/arch/baselines.json` byte-identical to `origin/main`; a changeset exists.

## File Map

- CREATE `agents/skills/claude-code/docs-confluence-publish/skill.yaml`
- CREATE `agents/skills/claude-code/docs-confluence-publish/SKILL.md`
- CREATE `agents/skills/claude-code/proposal-pitch/skill.yaml`
- CREATE `agents/skills/claude-code/proposal-pitch/SKILL.md`
- CREATE (symlinks) `agents/skills/{codex,cursor,gemini-cli}/docs-confluence-publish` → `../claude-code/docs-confluence-publish`
- CREATE (symlinks) `agents/skills/{codex,cursor,gemini-cli}/proposal-pitch` → `../claude-code/proposal-pitch`
- CREATE `.changeset/confluence-proposal-skills.md`
- REGEN (committed, machine-generated — do not hand-edit) `docs/reference/skills-catalog.md`

## Phase 1 — Author, wire, and gate the two skills

Single cohesive phase. Author the mechanics skill first (it is the dependency), then the pipeline skill, then symlinks, then validate/regenerate/gate/commit.

### Task 1: Author `docs-confluence-publish/skill.yaml`

**Depends on:** none | **Files:** `agents/skills/claude-code/docs-confluence-publish/skill.yaml`

Create the file with EXACTLY this content:

```yaml
name: docs-confluence-publish
version: '1.0.0'
description: Portable Confluence Cloud publishing mechanics — attachment-upload recipe, ADF media forms, page-tree ops, the draft/publish race, render verification, and deterministic stills. Ships zero company-specific content; reads org pointers from the shared company-knowledge config contract.
stability: draft
cognitive_mode: methodical-operator
triggers:
  - manual
platforms:
  - claude-code
tools:
  - Bash
  - Read
  - Write
  - Grep
cli:
  command: harness skill run docs-confluence-publish
  args:
    - name: path
      description: Project root path
      required: false
mcp:
  tool: run_skill
  input:
    skill: docs-confluence-publish
    path: string
type: rigid
tier: 2
phases:
  - name: attach
    description: Upload attachments via the logged-in-Chrome + osascript injection recipe (Atlassian MCP has no attachment API); verify with an authoritative GET
    required: true
  - name: author-adf
    description: Emit media-single figures and media-inline file-chips; never media-group
    required: true
  - name: page-tree
    description: Children under a draft parent, sidebar move ops, and data-local-id-preserving round-trips
    required: true
  - name: publish-race
    description: Understand draft-vs-current update semantics, stale-editor clobbering, and tiny-link resolution
    required: true
  - name: verify
    description: DOM render assertions and deterministic Playwright stills
    required: true
state:
  persistent: false
  files: []
depends_on: []
```

Run: `harness skill validate docs-confluence-publish` — expect it to fail only on the missing `SKILL.md` (authored in Task 2), confirming the yaml itself parses.

### Task 2: Author `docs-confluence-publish/SKILL.md`

**Depends on:** Task 1 | **Files:** `agents/skills/claude-code/docs-confluence-publish/SKILL.md`
**Skills:** `harness-skill-authoring` (apply)

Author the rich rigid SKILL.md. Structure (in order): an h1 title, a one-paragraph `>` blockquote summary, then the eight required `##` sections. Ground every process/gate/rationalization line in spec §"docs-confluence-publish content" (proposal.md:87-117). Required content:

1. **`## When to Use`** — positive triggers (building/verifying a Confluence Cloud page with figures; another pipeline needs a portable publishing reference) AND negative triggers (NOT for Confluence ingest/read — that is `ConfluenceConnector`; NOT for the proposal pipeline itself — that is `proposal-pitch`; NOT for a live publish to production without author sign-off).
2. **`## Process`** — one subsection per phase, transcribing the battle-tested recipe:
   - **Attachment upload** — Atlassian MCP has no attachment API; recipe = logged-in Chrome tab on the Atlassian origin, upload JS written to a scratch file (Write tool) and injected via `osascript` (`atob` → `File` → `FormData` → `POST /wiki/rest/api/content/{id}/child/attachment?status=draft` with `X-Atlassian-Token: nocheck`). Traps: do not pass large base64 through tool params; do not serve from `127.0.0.1` (fetch hangs silently — use `localhost`); osascript may run in a different tab than polled, so verify authoritatively with a `GET`.
   - **`media-single` vs `media-group`** — always emit `media-single` figures; `media-group` renders as cropped attachment cards. Include the `media-inline` file-chip form. (Discovered by writing ADF and reading it back as HTML.)
   - **Page-tree operations** — children under a draft parent; sidebar ordering via `PUT /content/{id}/move/{before|after|append}/{target}` (no MCP support); full-body round-trips preserving `data-local-id` on retained nodes.
   - **Draft/publish race** — a `status: draft` update against a just-published page becomes a pending edit (its tiny-link id is not a fork); a stale editor tab clobbers API edits; tiny links resolve only after publish.
   - **Render verification** — DOM assertions: count `img` with `naturalWidth > 0`, require zero `media-card-error`, compare `mediaSingle` vs `mediaGroup` counts (thumbnail cards also pass a naturalWidth check, so counting loaded images alone is insufficient).
   - **Deterministic stills** — Playwright against local `file://` HTML with `emulateMedia({colorScheme, reducedMotion:'reduce'})` and `screenshot({scale:'device'})`.
3. **`## Harness Integration`** — reads the shared company-knowledge `confluence`/`brand` config contract; document the contract with placeholder keys only (`{ cloud_id, space_id, proposals_index_page_id, exemplar_page_ids }`, `{ proposal_css_path }`) and the absent-block degradation message (name the missing pointers + how to add them; do not crash, do not silently no-op). Note invocation via `harness skill run docs-confluence-publish` / `run_skill`.
4. **`## Success Criteria`** — an author can, from this skill alone, upload an attachment, emit a correct `media-single` figure, order a page in the tree, avoid the draft/publish race, and render-verify a page with DOM assertions.
5. **`## Examples`** — at least one worked example: uploading an image and asserting `naturalWidth > 0` with zero `media-card-error`.
6. **`## Gates`** (rigid) — hard stops: never serve upload bytes from `127.0.0.1`; never trust an osascript "success" without an authoritative `GET`; a page is not "done" until render-verify passes (stored-format correctness ≠ render correctness); never emit `media-group` for figures.
7. **`## Escalation`** — what to do when the MCP/API path is unavailable or the render check keeps failing (fall back to manual author steps; surface the exact failing DOM assertion; stop and hand back to the author).
8. **`## Rationalizations to Reject`** — a markdown table of 3–8 DOMAIN-SPECIFIC rows (NOT the universal ones), e.g. "The stored ADF looks right so the page renders right" → "Stored-format correctness ≠ render correctness; run the DOM assertions"; "`media-group` is fine, it shows the images" → "It renders as cropped attachment cards; always `media-single`"; "osascript returned success so the upload worked" → "It may have run in a different tab; confirm with a GET"; "Serving from 127.0.0.1 is equivalent to localhost" → "fetch hangs silently on 127.0.0.1; use localhost".

Constraint: NO company-specific content (no real space/page ids, brand hex, product names, personal names) and NO internal roadmap/PR/issue numbers anywhere in the body.

Run: `harness skill validate docs-confluence-publish` — expect zero errors.

### Task 3: Author `proposal-pitch/skill.yaml`

**Depends on:** Task 2 | **Files:** `agents/skills/claude-code/proposal-pitch/skill.yaml`

Create the file with EXACTLY this content (note `depends_on`):

```yaml
name: proposal-pitch
version: '1.0.0'
description: The draft-first proposal pipeline — gather source, agree page structure before building, render concept stills, publish as drafts, and close the loop on the source. Composes docs-confluence-publish; enforces drafts-only, render-verify, and epistemic-label gates. Ships zero company-specific content.
stability: draft
cognitive_mode: disciplined-facilitator
triggers:
  - manual
platforms:
  - claude-code
tools:
  - Bash
  - Read
  - Write
  - Edit
  - Grep
  - Glob
cli:
  command: harness skill run proposal-pitch
  args:
    - name: path
      description: Project root path
      required: false
mcp:
  tool: run_skill
  input:
    skill: proposal-pitch
    path: string
type: rigid
tier: 2
phases:
  - name: gather
    description: Gather source from chat, issue, or doc
    required: true
  - name: structure
    description: Agree the page structure with the author before building anything
    required: true
  - name: stills
    description: Render concept stills for review
    required: true
  - name: draft
    description: Publish pages as drafts only (never move draft to current)
    required: true
  - name: close-loop
    description: Close the loop on the source with epistemic labels on every claim
    required: true
state:
  persistent: false
  files: []
depends_on:
  - docs-confluence-publish
```

Run: `harness skill validate proposal-pitch` — expect it to fail only on the missing `SKILL.md` (authored in Task 4), confirming the yaml parses and `depends_on` resolves.

### Task 4: Author `proposal-pitch/SKILL.md`

**Depends on:** Task 3 | **Files:** `agents/skills/claude-code/proposal-pitch/SKILL.md`
**Skills:** `harness-skill-authoring` (apply)

Author the rich rigid SKILL.md, grounded in spec §"proposal-pitch content" (proposal.md:119-135). Structure = h1 title + `>` blockquote summary + the eight required sections:

1. **`## When to Use`** — positive (turning a chat/issue/doc into a reviewable Confluence proposal; pitching a concept as draft pages) AND negative (NOT for the raw publishing mechanics — call `docs-confluence-publish`; NOT for publishing final/current pages — this is drafts-only; NOT when real customer data would appear in a still).
2. **`## Process`** — phases in order: **gather source** (chat/issue/doc) → **agree page structure BEFORE building** → **render concept stills** → **publish as drafts** → **close the loop on the source**. Reference `docs-confluence-publish` for the underlying attachment/ADF/verify mechanics rather than duplicating them.
3. **`## Harness Integration`** — `depends_on: docs-confluence-publish`; document the same `confluence`/`brand` config contract (placeholder keys) and the identical absent-block degradation message; invocation via `harness skill run proposal-pitch` / `run_skill`.
4. **`## Success Criteria`** — source gathered; structure agreed before build; stills rendered and render-verified; pages published as drafts (never current); every claim epistemically labeled; the loop closed on the source.
5. **`## Examples`** — one worked example walking chat-source → agreed outline → draft page with verified stills.
6. **`## Gates`** (rigid) — the six hard stops from spec §proposal-pitch:
   - Drafts only — publishing is the author's click; never move draft → current.
   - Render-verify before handoff — an unverified page is not done.
   - Epistemic labels on every claim — verified / inferred / proposed; the skill's own suggestion never "resolves" an open question.
   - Defects tracked, not narrated — fix / file-with-repro / flag-suspected; "as-designed" needs evidence.
   - No real customer data in any still, ever.
   - No public hosting without the author's explicit yes.
7. **`## Escalation`** — when structure cannot be agreed, when a gate would be violated (e.g. author asks to publish to current), or when source is ambiguous: stop and hand back to the author in plain text.
8. **`## Rationalizations to Reject`** — 3–8 domain-specific rows, e.g. "The draft looks done, I'll publish it to current" → "Publishing is the author's click; stay in drafts"; "I'll skip render-verify, the ADF is fine" → "An unverified page is silently broken; verify before handoff"; "I'll use a real customer name to make the still concrete" → "No real customer data in any still, ever — use placeholders"; "My suggestion answers the open question" → "Label it proposed; the skill's own suggestion never resolves an open question"; "The behavior is as-designed" → "As-designed needs evidence; otherwise file-with-repro or flag-suspected".

Constraint: NO company-specific content and NO internal tracker references anywhere in the body.

Run: `harness skill validate proposal-pitch` — expect zero errors.

### Task 5: Create the six platform mirror symlinks

**Depends on:** Task 4 | **Files:** `agents/skills/{codex,cursor,gemini-cli}/{docs-confluence-publish,proposal-pitch}` | **Category:** integration

Create each mirror as a relative symlink to the claude-code source (matching the `harness-skill-authoring` convention). From the repo root, run for each platform dir:

```bash
for p in codex cursor gemini-cli; do
  ln -s ../claude-code/docs-confluence-publish "agents/skills/$p/docs-confluence-publish"
  ln -s ../claude-code/proposal-pitch          "agents/skills/$p/proposal-pitch"
done
```

Verify all six resolve and point at the claude-code source:

```bash
ls -la agents/skills/codex/docs-confluence-publish agents/skills/cursor/docs-confluence-publish agents/skills/gemini-cli/docs-confluence-publish \
       agents/skills/codex/proposal-pitch agents/skills/cursor/proposal-pitch agents/skills/gemini-cli/proposal-pitch
```

Each line must show `-> ../claude-code/<skill>`. Confirm the git object mode will be `120000`: `git add agents/skills/{codex,cursor,gemini-cli}/{docs-confluence-publish,proposal-pitch} && git ls-files -s agents/skills/codex/docs-confluence-publish` shows `120000`.

### Task 6: Validate both skills and run the skill vitest suites

**Depends on:** Task 5 | **Files:** (verification only)

1. Validate BOTH new skills by name (scoped, to avoid the pre-existing `align-design-system` no-Rationalizations failure that an unscoped run would surface):

   ```bash
   harness skill validate docs-confluence-publish && harness skill validate proposal-pitch
   ```

   Both must report zero errors.

2. Run the three skill test suites from the repo root:

   ```bash
   pnpm exec vitest run agents/skills/tests/structure.test.ts agents/skills/tests/platform-parity.test.ts agents/skills/tests/internal-refs.test.ts
   ```

   All must pass — structure (all eight rigid sections present), parity (both skills exist in all four platform dirs with identical content via the symlinks; per-platform counts still match), and internal-refs (no `roadmap|PR|issue #N` leaks in either body).

3. Confirm both skills load in the index with no parse error: `harness skill list 2>&1 | grep -E "docs-confluence-publish|proposal-pitch"` shows both.

### Task 7: Regenerate the skills catalog and verify plugin sync (read-only)

**Depends on:** Task 6 | **Files:** `docs/reference/skills-catalog.md` | **Category:** integration

1. Regenerate the catalog so the committed doc is not stale:

   ```bash
   pnpm run generate-docs
   ```

   Confirm both skills now appear: `grep -nE "docs-confluence-publish|proposal-pitch" docs/reference/skills-catalog.md`.

2. Verify the plugin/slash-command generators are in sync WITHOUT writing (a new skill legitimately grows the command count — a non-zero exit here means genuine drift, not the count change):

   ```bash
   pnpm generate:plugin:check && echo "PLUGIN GENERATORS IN SYNC"
   ```

   Observe exit 0. Do NOT run write-mode `generate:plugin` / `generate:plugin:all`. Do NOT hand-edit any generated file.

### Task 8: Grep-clean, format, and arch-baseline gates

**Depends on:** Task 7 | **Files:** (verification only) | **Category:** integration

1. **Grep-clean for company-specific content.** Confirm no space ids, page ids, brand hex, product names, or personal names in either skill body (adjust the alternation to the org's actual tokens before running; a clean run prints nothing):

   ```bash
   grep -rniE "([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}|space[_-]?id[[:space:]]*[:=][[:space:]]*[A-Za-z0-9]|#[0-9a-fA-F]{6}|pageId=[0-9]+)" \
     agents/skills/claude-code/docs-confluence-publish/SKILL.md \
     agents/skills/claude-code/proposal-pitch/SKILL.md \
     && echo "REVIEW: potential company-specific token found" || echo "GREP-CLEAN OK"
   ```

   Any hit must be a documented placeholder key (`cloud_id`, `space_id`, `exemplar_page_ids`, `proposal_css_path`) with NO real value; a real value fails the gate.

2. **Format check** — `pnpm format:check` clean. If prettier reports the new files, run `pnpm format` and re-check.

3. **Arch baseline unchanged** — confirm `.harness/arch/baselines.json` is byte-identical to `origin/main`: `git diff --stat origin/main -- .harness/arch/baselines.json` prints nothing. If it drifted, do NOT commit the drift — restore with `git checkout origin/main -- .harness/arch/baselines.json`.

### Task 9: Add changeset and commit

**Depends on:** Task 8 | **Files:** `.changeset/confluence-proposal-skills.md`, all of the above | **Category:** integration

1. `[checkpoint:human-verify]` — Present both authored `SKILL.md` bodies for review: confirm the eight rigid sections, the domain-specific Rationalizations tables, the config-contract prose + absent-block degradation message, and zero company-specific / internal-ref content read correctly before committing. Wait for confirmation.

2. Create `.changeset/confluence-proposal-skills.md` (no internal tracker numbers in the summary):

   ```markdown
   ---
   '@harness-engineering/cli': patch
   ---

   Add two rigid claude-code skills: `docs-confluence-publish` (portable
   Confluence Cloud publishing mechanics — attachment upload, ADF media-single
   figures, page-tree ops, the draft/publish race, render verification, and
   deterministic stills) and `proposal-pitch` (the draft-first proposal pipeline
   that composes it and enforces drafts-only, render-verify, and epistemic-label
   gates). Both ship zero company-specific content and read org pointers from the
   shared company-knowledge config contract, degrading gracefully in prose when
   the `confluence` block is absent.
   ```

3. Stage exactly the skill source, the six symlinks, the regenerated catalog, and the changeset, then commit atomically (the pre-commit hook re-verifies and may re-sync plugin artifacts — if it re-stages files, re-add and re-commit; NEVER use `--no-verify`):

   ```bash
   git add agents/skills/claude-code/docs-confluence-publish \
           agents/skills/claude-code/proposal-pitch \
           agents/skills/codex/docs-confluence-publish agents/skills/cursor/docs-confluence-publish agents/skills/gemini-cli/docs-confluence-publish \
           agents/skills/codex/proposal-pitch agents/skills/cursor/proposal-pitch agents/skills/gemini-cli/proposal-pitch \
           docs/reference/skills-catalog.md \
           .changeset/confluence-proposal-skills.md
   git commit -m "feat(skills): add docs-confluence-publish and proposal-pitch rigid skills"
   ```

4. Confirm the commit landed and the baseline is still clean: `git log --oneline -1 && git diff --stat origin/main -- .harness/arch/baselines.json` (the second command prints nothing).

## Verification (exact commands)

Run in order from the repo root; every command must succeed:

```bash
# 1. Both skills validate (scoped by name — avoids pre-existing align-design-system noise)
harness skill validate docs-confluence-publish
harness skill validate proposal-pitch

# 2. Skill structure, platform parity, and internal-ref leak guard
pnpm exec vitest run agents/skills/tests/structure.test.ts agents/skills/tests/platform-parity.test.ts agents/skills/tests/internal-refs.test.ts

# 3. Both skills load in the index
harness skill list 2>&1 | grep -E "docs-confluence-publish|proposal-pitch"

# 4. Catalog regenerated and contains both skills
pnpm run generate-docs
grep -nE "docs-confluence-publish|proposal-pitch" docs/reference/skills-catalog.md

# 5. Plugin generators in sync (read-only; exit 0 despite the legitimate command-count growth)
pnpm generate:plugin:check

# 6. Six symlinks resolve to the claude-code source (git mode 120000)
git ls-files -s agents/skills/codex/docs-confluence-publish agents/skills/cursor/docs-confluence-publish agents/skills/gemini-cli/docs-confluence-publish agents/skills/codex/proposal-pitch agents/skills/cursor/proposal-pitch agents/skills/gemini-cli/proposal-pitch

# 7. Format clean
pnpm format:check

# 8. Arch baseline byte-identical to origin/main (prints nothing)
git diff --stat origin/main -- .harness/arch/baselines.json
```

## Checkpoints

- **Task 9, step 1 `[checkpoint:human-verify]`** — human reviews both SKILL.md bodies (eight rigid sections, domain-specific Rationalizations, config-contract + degradation prose, grep-clean, no internal refs) before the commit.

## Risks & Concerns

- **Unscoped `harness skill validate` surfaces pre-existing failures.** `align-design-system` currently lacks `## Rationalizations to Reject`, so a no-argument validate fails on a skill this change does not touch. Mitigation: validate the two NEW skills BY NAME (Tasks 2, 4, 6). Flag the align gap separately; it is out of scope here.
- **Two mirror conventions exist in-repo** (symlink for `harness-skill-authoring`; copied dirs for `align-design-system`). This plan follows the spec's file-layout diagram and the symlink convention (Task 5). The parity test is satisfied either way because a symlinked dir resolves to identical file content.
- **Grep-clean is heuristic.** The Task 8 pattern catches common shapes (UUID cloud ids, `#RRGGBB` hex, `pageId=`), but product/personal names need a human eye — hence the Task 9 checkpoint. Tune the alternation to the org's real tokens before relying on it.
- **Generated-artifact drift.** Only `generate-docs` writes here (the catalog); `generate:plugin:check` is read-only. If the pre-commit hook auto-syncs plugin command artifacts, re-add and re-commit rather than fighting it — never `--no-verify`.
- **Node version / dist.** Validation uses the globally-installed `harness` (already-built dist) which resolves the working-tree skills dir; no local rebuild is required. If `harness skill list` errors with a module-not-found, the environment's Node version is the likely cause (repo requires Node 22).
