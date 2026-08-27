# Discovery: Graphify adoption evaluation

**Date:** 2026-08-26
**Advisor session:** harness-architecture-advisor
**Subject:** [Graphify](https://github.com/Graphify-Labs/graphify) (graphify.net / graphify.com) vs `@harness-engineering/graph`

## Prompt (verbatim)

> Analyze the following project for adoption. Analyze what it does stronger, weaker, what should be adopted, what should be ignored. Also determine if it should be used wholesale as a replacement for the graph package.
> https://github.com/Graphify-Labs/graphify https://graphify.net

## Discovery answers

1. **Primary motivation** — Due diligence. Graphify is popular (~108k stars, YC S26). Leadership wants a defensible written verdict on adopt / replace before committing either way.
2. **Language / architecture constraint** — Polyglot is acceptable. A Python Graphify sidecar that emits `graph.json` for a TS adapter to ingest is on the table **if** the capability gain justifies the operational cost. (It is not a hard "must stay pure-TS in-process" constraint — but see the 91-importer footprint below, which still governs the _core_ path.)
3. **Deliverable** — Full ADR via `manage_adr`, plus analysis + proposal docs on an isolated worktree branch.

## Success in 6 months

- A clear, evidence-cited record of what (if anything) we ported from Graphify and why.
- No regression in the harness analytical surface (entropy / constraints / traceability / blast-radius) that depends on our graph.
- We would regret this if we either (a) took a hard runtime dependency on an unstable external OSS tool that later gated features behind its enterprise tier, or (b) reinvented capabilities Graphify gives for free with no payoff.
