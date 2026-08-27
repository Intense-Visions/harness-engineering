---
'@harness-engineering/cli': minor
---

Add the answer-quality axis to `harness graph bench` (deferred slice of #1271). The
benchmark measured two objective axes — retrieval tokens and tool calls — but the
comparator's third axis, **answer quality** (whether the retrieved payload actually
suffices to answer the query), was deferred. It now ships as an opt-in `--judge` flag:
an LLM judge grades each strategy's payload for retrieval sufficiency, reusing the shared
harness eval/judge plumbing (`resolveAnalysisProvider` → Anthropic key or a local `/v1`
endpoint, the same resolver `outcome_eval`/`acceptance_eval` use) rather than a bespoke
judge.

The axis is **advisory and degrades honestly**: with no judge provider configured it
reports `answerQuality.status: "inconclusive"` instead of fabricating a score, and it
never fails the benchmark — the token/tool-call axes stand regardless. Off by default
(`status: "skipped"`), so the deterministic headline and CI runs are unchanged. The JSON
result gains an `answerQuality` block (per-strategy sufficiency counts) and each scenario
gains a `quality` grade plus the exact `query` the judge was asked; `harness graph bench
--judge --json` lets a reviewer trace bench → judge → score. Also fixes a pre-existing bug
where the program-global `--json` option shadowed `graph bench --json`. `Refs #1271`.
