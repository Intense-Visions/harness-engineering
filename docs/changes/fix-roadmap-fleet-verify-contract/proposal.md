# Proposal: satisfiable roadmap-fleet VERIFY provenance + closing-keyword contract

- **Slug:** `fix-roadmap-fleet-verify-contract`
- **Issues:** #1298 (VERIFY requires a gitignored autopilot-state artifact), #1297 (DISPATCH does not specify the closing-keyword contract)
- **Surface:** `agents/skills/claude-code/roadmap-fleet/SKILL.md` (canonical source; cursor/codex/gemini-cli dirs are symlinks; `.claude-plugin` / `.cursor-plugin` / `.gemini-extension` / `.antigravity-extension` command copies are generated).

## Problem

`roadmap-fleet` is the batch-build stage of the `-fleet` conveyor. Two clauses of its own contract are broken:

1. **#1298 — the VERIFY two-artifact check is unsatisfiable.** VERIFY demanded (a) a plan artifact under `docs/changes/<slug>/plans/` **and** (b) an "autopilot-state (session state)" on the branch. But `.harness/.gitignore` ignores `sessions/`, so session state is absent from every branch by construction — and gitignored `.harness` runtime artifacts are additionally absent in the fresh worktrees where every lane runs. The skill's own Gates section says a gate that cannot be evaluated counts as **failed, never passed**; applied literally, no item in this repo could ever be merge-ready. In practice the check was silently waived every run — theatre.

2. **#1297 — DISPATCH never states the closing-keyword contract.** Nothing told a lane whether its PR should say `Closes #N` or `Refs #N`. Whichever the brief happened to carry silently decided whether the roadmap row ever reconciled. On the 2026-08-10 run every lane was briefed with `Refs`, which fires no auto-close, so the merge-triggered reconciler had nothing to match and rows stayed `planned`/`in-progress`. The irony: that same run had just landed #1290, which cleaned up five rows (#1208, #1128, #1129, #603) stranded by this exact failure mode.

## Decisions (human-approved)

- **#1298 → provenance file.** Replace the autopilot-state requirement with a **committed pipeline-provenance file** under `docs/changes/<slug>/` (e.g. `provenance.json`). VERIFY's two required artifacts become: (1) the plan artifact under `.../plans/`, and (2) the committed provenance file — both of which survive into the PR where the orchestrator can check them. DISPATCH states each lane MUST write it, with fields: issue number(s), pipeline stages run, plan-artifact path, assumptions. Gates reference the provenance file, not session state. This is issue #1298's Option 2 — the only option that restores the guarantee the Iron Law depends on, because it survives into the PR.
- **#1297 → closing-keyword contract.** DISPATCH gains the contract: a PR that FULLY resolves its issue uses `Closes #<N>`; a PR that lands only a SLICE of a multi-finding issue uses `Refs #<N>` and flags the issue for manual reconciliation (no auto-close). VERIFY notes that the PR body is checked for the scope-correct keyword.

## Non-goals

- No change to any TypeScript, orchestrator code, or CI. This is a skill-contract (documentation) change.
- No change to `.harness/.gitignore` — session state stays gitignored; the fix routes provenance to a committed path instead of fighting the ignore rule.
- Not touching sibling fleet skills (e.g. `cicd-fleet`) even though they carry a similar phrase — out of scope for these two issues.

## Acceptance criteria

- VERIFY no longer requires any gitignored/session-state artifact; both required artifacts (plan + provenance file) are committed and survive into the PR.
- DISPATCH instructs each lane to write a committed `docs/changes/<slug>/provenance.json` with issue number(s), pipeline stages run, plan-artifact path, and assumptions.
- DISPATCH states the closing-keyword contract (`Closes` for full resolution, `Refs` + manual-reconciliation flag for a slice).
- Gates and Rationalizations reference the provenance file rather than autopilot-state; a fully-resolving PR with no closing keyword is a gate finding.
- No `autopilot-state`/`session state` remains as a _required_ VERIFY artifact anywhere in the skill (only as explanatory rationale for why it was replaced).
- Generated command mirrors (`.claude-plugin`, `.cursor-plugin`, `.gemini-extension`, `.antigravity-extension`, codex) are regenerated to match the source, not hand-edited.
- This change dogfoods its own contract: the branch carries this proposal, a plan under `plans/`, and a committed `provenance.json`.
