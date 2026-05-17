# Plan: Hermes Phase 0.2 — Gateway Tunnel Guide

**Date:** 2026-05-16
**Spec:** `docs/changes/hermes-phase-0-2-gateway-tunnel-guide/proposal.md`
**Parent phase spec:** `docs/changes/hermes-phase-0-gateway-api/proposal.md` (§D5, §547)
**Roadmap item:** `Hermes Phase 0.2: Gateway Tunnel Guide` (`github:Intense-Visions/harness-engineering#328`)
**Tasks:** 6
**Checkpoints:** 1 (`human-verify` after Task 3 — guide reads naturally end-to-end)
**Estimated time:** ~45 minutes implementation
**Integration Tier:** low (docs-only; no code, no graph nodes, no new CLI surface)

## Goal

Write `docs/guides/gateway-tunnel.md` covering Cloudflare Tunnel, Tailscale, and ngrok as the three canonical bridge-exposure patterns, with `examples/slack-echo-bridge/` as the worked end-to-end example. Wire the guide into the docs index and the slack-bridge README; flip the roadmap entry to `done`. No orchestrator code changes.

## Observable Truths (Acceptance Criteria)

1. **The repository shall contain `docs/guides/gateway-tunnel.md`** with sections for each of Cloudflare Tunnel, Tailscale, and ngrok in that order, each presenting install/auth, start-the-bridge, bring-up-the-tunnel, register-the-subscription, trigger-and-verify, teardown steps.
2. **The guide shall cite orchestrator URL-validation constraints** by file path + line range (`packages/orchestrator/src/server/routes/v1/webhooks.ts` and `packages/orchestrator/src/server/utils/url-guard.ts`); the citations shall resolve to the correct code at write time.
3. **The guide shall NOT inline the HMAC verification snippet** — it shall link to `examples/slack-echo-bridge/src/signer.ts` as the canonical source.
4. **`docs/guides/index.md` shall list the new guide** in the same shape as existing entries (title link + one-line summary + "Best for:" line) and shall be inserted after the Docker Deployment entry to keep operational-deployment guides adjacent.
5. **`examples/slack-echo-bridge/README.md` shall no longer carry the `_Note: docs/guides/gateway-tunnel.md is a forthcoming Hermes Phase 0.2 deliverable…_` disclaimer paragraph.** The pointer line above it (currently line 89) shall remain as-is.
6. **`docs/roadmap.md`'s Phase 0.2 entry shall report `Status: done`** and shall reference this plan in its `Plan:` field; the `External-ID` shall remain `github:Intense-Visions/harness-engineering#328`.
7. **`harness validate` shall pass on the working tree** after all changes are applied.
8. **All cross-references shall resolve.** No broken relative links from the guide → bridge, guide → orchestrator code, bridge → guide, index → guide.

## Uncertainties

- **[ASSUMPTION] The orchestrator's URL guard is the authoritative constraint set.** Verified at `packages/orchestrator/src/server/routes/v1/webhooks.ts:143-150` (https check + `isPrivateHost` rejection) and `packages/orchestrator/src/server/utils/url-guard.ts:1-12` (full regex set). The guide cites these by line range. If future PRs renumber, `harness check-docs` will catch it.
- **[ASSUMPTION] The slack-echo-bridge listens on port 3000 by default.** Verified at `examples/slack-echo-bridge/README.md:34` and line 68 (PORT default = 3000). The guide uses port 3000 in the worked example.
- **[ASSUMPTION] The guides index is naturally appended-to, not auto-generated.** Verified by reading `docs/guides/index.md` — entries are hand-authored. Insertion is a normal Edit.
- **[DEFERRED] Re-validation cadence for vendor commands.** Cloudflare/Tailscale/ngrok CLI surfaces evolve. Cadence and ownership of "re-run the three recipes" is **not** in scope for this plan; the guide carries a "vendor commands re-validated YYYY-MM-DD" footer instead.

## Tasks

### Task 1 — Write the guide

**Files:**

- `docs/guides/gateway-tunnel.md` (NEW)

**What:** Create the guide following the structure laid out in the proposal's "Guide structure" section. Use `examples/slack-echo-bridge/README.md`'s style and vocabulary (HMAC, subscribe-webhook scope, `X-Harness-Signature`, etc.) as the prose register. Order: Cloudflare Tunnel → Tailscale → ngrok. Each pattern documents both topology variants (bridge-local + orchestrator-remote, and bridge-remote + orchestrator-local). Include the comparison table, code-cited constraints section, troubleshooting table, security notes, next steps.

**Verify:**

- File exists at the path the bridge README references.
- Markdown renders without warnings under `markdownlint` (already in repo's lint chain via `harness validate`).
- Both topology variants are described for every pattern.

### Task 2 — Update the guides index

**Files:**

- `docs/guides/index.md`

**What:** Insert a "### Gateway Tunnel Guide" section after the existing "Docker Deployment" section. One-paragraph summary, "Best for:" line. Use the existing entries' formatting verbatim.

**Verify:**

- The new entry sits between Docker Deployment and the next existing entry (or in the spot dictated by the file's natural ordering).
- The link `./gateway-tunnel.md` resolves.

### Task 3 — Wire the slack-echo-bridge README

**Files:**

- `examples/slack-echo-bridge/README.md`

**What:** Delete the blockquote `_Note: docs/guides/gateway-tunnel.md is a forthcoming Hermes Phase 0.2 deliverable …_` paragraph at line 91. Do NOT touch line 89's link — the cross-reference is now live and works as written.

**Verify:**

- `grep -n "forthcoming" examples/slack-echo-bridge/README.md` returns no matches.
- Line 89's pointer is unchanged.

**Checkpoint:** `[checkpoint:human-verify]` — at this point a human-skimmable read of bridge README → tunnel guide → bridge README loop should feel continuous, not circular.

### Task 4 — Roadmap state flip

**Files:**

- `docs/roadmap.md` (entry at line 1154)

**What:** Update the Phase 0.2 entry: `Status: planned` → `done`; `Plan: —` → `Plan: docs/changes/hermes-phase-0-2-gateway-tunnel-guide/plans/2026-05-16-gateway-tunnel-guide-plan.md`. Preserve `External-ID` and `Summary`. Do NOT use `manage_roadmap` for the GitHub-side close in the execution step — that happens in integration.

**Verify:**

- `grep -A 9 "Hermes Phase 0\.2: Gateway Tunnel Guide" docs/roadmap.md` shows `Status: done` and the populated `Plan:` line.

### Task 5 — Verify cross-references and validate

**Files:** (verification only)

**What:**

1. `harness validate` — passes.
2. `grep -r "gateway-tunnel.md" docs examples` — every reference resolves (every `docs/guides/gateway-tunnel.md` mentioned in code/docs now points at a real file).
3. `grep -n "isPrivateHost\|startsWith('https" packages/orchestrator/src/server/routes/v1/webhooks.ts packages/orchestrator/src/server/utils/url-guard.ts` — confirm the line numbers cited in the guide still match.
4. Markdown lint passes on the new guide.

**Verify:**

- All four checks green. Any drift in cited line numbers is fixed in Task 1 immediately, not deferred.

### Task 6 — Final read-through

**Files:** (review only)

**What:** Read the guide top-to-bottom as if you were a new operator. Confirm:

- The Quick Comparison table sets up the recommendation order.
- Every code block is copy-pasteable (no `<placeholders-that-look-like-commands>`).
- The Slack bridge worked example is the same shape across all three patterns.
- The troubleshooting table covers the four failure modes named in the proposal's risk register.

**Verify:**

- The doc reads coherently end-to-end in under 15 minutes for a first-time reader.

## Integration Tasks (derived from spec's Integration Points)

These are tracked separately and run during `/harness:integration` step, NOT during execution:

- **I1.** Update roadmap GitHub issue (#328) via `manage_roadmap` — flips the issue state and adds a comment with the PR URL. Source: spec Integration Point §3.
- **I2.** Confirm no edit needed to `docs/knowledge/decisions/0011-orchestrator-gateway-api-contract.md` (spec Integration Point §7). The ADR's "deferred" language reads correctly post-ship.
- **I3.** Confirm no edit needed to top-level `README.md` (spec Integration Point §4). The Gateway API bullet stays single-link to the Slack bridge; the bridge is the entry point that surfaces the tunnel guide.
- **I4.** Run `harness check-docs` and confirm zero new drift on the touched files.

## Rollback

Single-commit revert. The guide adds one file and edits three existing files; reverting the commit restores the prior state with no orphaned references (the bridge README's "forthcoming" disclaimer regains accuracy on revert).

## Out of scope (explicit)

- New orchestrator code, env vars, validators
- Knowledge graph node additions
- A second worked example beyond the Slack bridge
- Docker / production deployment refinements
- Updates to plugin marketplace listings (the Gateway API listing is unchanged; tunnels are an operator concern)
