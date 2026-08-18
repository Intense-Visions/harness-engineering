---
'@harness-engineering/graph': patch
'@harness-engineering/cli': patch
---

fix(knowledge): abstain on empty baseline + confidence floor for `--fix`, and report honest extraction counts (#1335, #1340)

The knowledge pipeline previously reported a healthy-looking `warn` on a
first run where the graph held no prior `business_*` nodes: every fresh entry
classified as `new`, the drift score approached 1.0, and the verdict read as
`WARN` with `0 stale, 0 drifted, 0 contradicting` — indistinguishable from a
clean incremental run. A zero-denominator baseline is now an explicit
`abstain` verdict (distinct from `pass`/`warn`/`fail`) threaded from the
pre-extraction baseline into `computeVerdict`, and the CLI renders an
unambiguous `ABSTAIN` header with a one-line explanation. The result now
carries a `baselineEmpty` flag (surfaced in `--json`). (#1335)

`--fix` materialization into the consumer's tracked `docs/knowledge/` tree is
now gated on a named confidence floor (`MATERIALIZATION_CONFIDENCE_FLOOR`,
default `0.5`): low-confidence / comment-derived signals are still reported as
gaps but no longer written to disk. Human-authored nodes carry no confidence
and remain trusted, so the floor cannot suppress hand-written knowledge.
(#1335)

Extraction now reports the number of signals actually extracted this run
(`signalsExtracted`) rather than `nodesAdded` (deduped new store insertions),
which dropped to 0 on a re-scan even while the extractors wrote thousands of
records — producing a "0 code signals" headline that contradicted a non-empty
"extracted" gap total. (#1340)
