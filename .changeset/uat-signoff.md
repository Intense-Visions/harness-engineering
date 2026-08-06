---
'@harness-engineering/intelligence': minor
'@harness-engineering/cli': minor
---

Add `uat-signoff` — a human-judged user-acceptance sign-off skill and its
`uat_signoff` MCP tool. This closes the acceptance/outcome edge of an
engagement: the far-end mirror of `product-advisor`, which owns the inception
edge (it writes the BRD + gap-list). Where `acceptance-eval` and `outcome-eval`
are spec-vs-implementation, LLM-judged, TS-authority-derived, and
merge/ship-blocking, `uat-signoff` is intent(BRD)-vs-shipped-reality,
HUMAN-judged, and advisory. The human is the authority: the skill runs no LLM
verdict and derives no ship authority — it records the decision a person already
made.

The skill is a plain-text guided interview (engagement-scoped, no code surface).
It reads `docs/inception/<engagement>/brd.md` and `gaps.md`, walks the human
through each acceptance item one at a time (capturing ACCEPT, REJECT, or
CHANGES_REQUESTED with an optional note), captures one overall decision plus the
signer, writes `docs/inception/<engagement>/signoff.md`, and persists exactly
one `execution_outcome`-shaped node via the `uat_signoff` MCP tool
(`source: "uat-signoff"`, `result` derived from the overall decision; the
per-item dispositions, signer, and closed BRD refs ride in additive metadata).
Reusing the shared `execution_outcome` shape means the eval-fail-rate signal and
effectiveness baselines consume the record for free — no new node type. The
skill ships across all four platform trees (claude-code / cursor / codex /
gemini-cli) and is wired into the catalog, slash commands, and plugin.
