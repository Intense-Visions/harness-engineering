---
'@harness-engineering/core': patch
---

Extract `roadmap/heading.ts` as the single source of truth for the H3 feature-heading grammar.

The grammar — "an H3 heading, optionally escaped with a `Feature: ` prefix" — was encoded three times (`parse.ts`'s `h3Pattern`, `store/shard.ts`'s `H3_NAME`, and `serialize.ts`'s `serializeFeatureHeading`) with nothing keeping them in sync. The copies had already diverged on whitespace: the monolith reader required exactly one space while the shard reader accepted `\s+`, so a heading like `###  Feature:  x` read fine through the shard path but was silently dropped by the monolith path.

All three now route through `roadmap/heading.ts`, and the whitespace question is settled deliberately in one place: **lenient read (`\s+`), one-space emit**. The monolith reader is widened (Postel's law — it now accepts everything the shard reader did) and the emitter still emits exactly one space, so `serialize → parse` is an identity. No behavior change for any already-canonical roadmap; the only observable difference is that the monolith reader now also accepts the lenient hand-edited form the shard reader always accepted.
