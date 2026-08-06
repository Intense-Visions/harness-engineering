---
'@harness-engineering/intelligence': minor
'@harness-engineering/cli': minor
---

Add `uat-signoff` — a human-judged user-acceptance sign-off skill and its
`uat_signoff` MCP tool. This closes the acceptance/outcome edge of the change
lifecycle: it is the terminal, human-authority stage under
`docs/changes/<slug>/`, the same slug used by the spec, plan, code review, and
`outcome-eval`. Where `acceptance-eval` and `outcome-eval` are
spec-vs-implementation, LLM-judged, TS-authority-derived, and
merge/ship-blocking, `uat-signoff` is intent(Success-Criteria)-vs-shipped-reality,
HUMAN-judged, and advisory. The human is the authority: the skill runs no LLM
verdict and derives no ship authority — it records the decision a person already
made.

The skill is a plain-text guided interview (slug-scoped, no code surface). It
reads the change's `docs/changes/<slug>/proposal.md` `## Success Criteria` (with
`plans/` and prior review/outcome-eval records as supporting context), walks the
human through each acceptance item one at a time (capturing ACCEPT, REJECT, or
CHANGES_REQUESTED with an optional note), captures one overall decision plus the
signer, writes `docs/changes/<slug>/signoff.md`, and persists exactly one
`execution_outcome`-shaped node via the `uat_signoff` MCP tool
(`source: "uat-signoff"`, `result` derived from the overall decision; the
per-item dispositions, signer, and closed criteria refs ride in additive
metadata). Reusing the shared `execution_outcome` shape means the eval-fail-rate
signal and effectiveness baselines consume the record for free — no new node
type. The skill ships across all four platform trees (claude-code / cursor /
codex / gemini-cli) and is wired into the catalog, slash commands, and plugin.
