---
'@harness-engineering/orchestrator': patch
---

fix(orchestrator): make the spec-vs-diff eval see the implementation, not noise

Two related defects in `WorkspaceManager.getIntroducedDiffText` (the diff the
local gate's `outcome_eval` judge reads) caused false NOT_SATISFIED verdicts on
correct, passing work:

1. **Untracked files were invisible.** It diffed with plain `git diff <mergeBase>`,
   which silently omits untracked files — so a brand-NEW file the agent created
   (a new module, not a modification) never reached the judge, which then
   concluded the work was missing. Both `getIntroducedDiff{,Text}` now
   `git add --intent-to-add` first (respects `.gitignore`, leaves contents
   untouched, harmless residual index entries).

2. **Process artifacts buried the code.** The eval diff also pulled in the design
   stage's proposal/plan (`docs/changes`), roadmap shards (`docs/roadmap.d`), and
   the local `.pnpm-store` — ~280 lines of planning + binary noise dwarfing a
   ~90-line change, so the judge conflated "described in the proposal" with
   "implemented" and reported the new file missing. `getIntroducedDiffText` now
   excludes those process artifacts (the 4c hunk scan keeps the fuller diff).

Validated end-to-end: with both fixes the local outcome-eval flips from a false
NOT_SATISFIED to SATISFIED on a correct diff.
