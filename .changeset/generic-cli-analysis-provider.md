---
'@harness-engineering/intelligence': minor
'@harness-engineering/cli': minor
---

feat(comprehension): provider-neutral bare subscription-CLI analysis backstop
(codex/gemini) via a `GenericCliAnalysisProvider` (#1710, ADR 0109 slice 3 follow-up).

The comprehension semantic backstop could reach a non-Claude agent only through an
OpenAI-compatible `/v1` gateway (`comprehension.analysisBaseUrl`). A **bare
subscription CLI** — codex-CLI / gemini-CLI with no API key and no `/v1` endpoint —
was unreachable: `ClaudeCliAnalysisProvider`'s flags (`--print --output-format json
--json-schema`) are Claude-specific.

New `GenericCliAnalysisProvider` (intelligence) takes a pluggable **arg template**
(how the prompt/schema/model are passed) and **output parser** (how the vendor's
stdout maps to the analysis result), so one extensible implementation covers every
vendor CLI instead of N bespoke adapters. Built-in `codex`/`gemini` dialects and a
`custom` placeholder template (`{{prompt}}`/`{{schema}}`/`{{model}}`, arg or stdin)
are exposed via `createCliAnalysisProvider`. It reuses the same mechanical
"schema-check → one corrective retry" recovery as the Claude CLI provider and salvages
embedded JSON from prose (bare CLIs have no `--json-schema` flag).

Resolver + detection: a config-declared `comprehension.analysisCli` block is detected
on PATH and inserted in precedence **before** the Claude CLI (Anthropic key → `/v1`
endpoint → generic subscription CLI → Claude CLI → static-only). Provider-neutral: a
generic-CLI provider is never handed a Claude model id.

Verification limit: the real codex/gemini CLIs are not available in CI, so this ships
**unit-tested with mocked CLI I/O only**; live end-to-end integration against a real
vendor CLI is deferred to a maintainer with those CLIs installed.
