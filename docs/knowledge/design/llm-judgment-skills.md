---
type: business_concept
domain: design
tags: [skills, llm, judgment, design-craft, confidence, mode-selection, intelligence-provider]
---

# LLM-Judgment Skills

An **LLM-judgment skill** is a harness skill whose primary finding stream is produced by an LLM exercising taste, judgment, or aesthetic critique — not by deterministic rule evaluation. The pattern is codified by [ADR 0018](../decisions/0018-llm-judgment-skill-pattern.md). First instance: [`harness-design-craft`](../../changes/design-pipeline/design-craft-elevator/proposal.md).

## Why a distinct pattern

Rule-based skills (`detect-design-drift`, `audit-component-anatomy`, `harness-design`) produce binary outputs from deterministic checks. The standard `severity: 'error' | 'warn' | 'info'` vocabulary fits because the underlying judgment IS binary — the rule either fires or it does not.

LLM-judgment skills break four assumptions that rule-based infrastructure relies on:

1. **Outputs are non-deterministic** — two runs over the same input produce overlapping-but-not-identical finding sets.
2. **Confidence is real and must be visible** — a 95%-confident judgment deserves different treatment from a 40%-confident one; collapsing both to `warn` destroys signal.
3. **Cost and latency are first-class** — text-LLM calls are cents and seconds, vision-LLM calls are dimes and tens-of-seconds; routine CI cannot afford every mode every time.
4. **Determinism must wrap the payload** — finding codes, citations, derived priority, and runIds must be stable so the convergence verifier and graph adapters see a fixed contract while the judgment varies.

## The four required properties

LLM-judgment skills MUST satisfy all four (per ADR 0018):

| Property                                     | Requirement                                                                                                                                                                                                                                             |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1. Confidence as first-class output**      | Every finding carries `confidence: 'high' \| 'medium' \| 'low'`, emitted by the LLM (not derived post-hoc). Low-confidence findings are surfaced with visual distinction (italic, `(low confidence:)` prefix) and excluded from enforcement by default. |
| **2. Deterministic skeleton wraps judgment** | Stable `code` (e.g. `CRAFT-C001`), `cite` block (catalog id, never an LLM hallucination), `target` block (`file` / `line` / `component`), `derived` block (priority computed deterministically), and `summary.runId` for fixpoint detection.            |
| **3. Explicit mode selection**               | Skills with both text and vision modes expose `mode: 'fast' \| 'deep'` (or analogous) as top-level input. Default is the cheaper mode. No auto-escalation. Cost tracking exposed via `summary.llmCalls.{provider, model, count, costUsd}`.              |
| **4. Provider integration via intelligence** | Skills wrap `packages/intelligence/` rather than calling provider SDKs directly — centralizes cost accounting, vision-vs-text variant selection, provider fallback, and mock-injection for CI tests.                                                    |

A fifth property — **soft dependency with progressive upgrade** — applies to LLM-judgment skills that benefit from upstream declared intent. See [[detect-and-offer]] and ADR 0021.

## Confidence semantics

| Value    | Meaning                                                             | Treatment                                                                                         |
| -------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `high`   | Model is confident; finding is well-supported by rubric + evidence. | Treat as thoughtful peer assertion. May feed enforcement gates.                                   |
| `medium` | Model sees the issue but acknowledges alternative readings.         | Treat as discussion item. Surface in main output.                                                 |
| `low`    | Model is unsure; finding may not survive human inspection.          | Investigation candidate, NOT enforcement. Visually distinguished. Excluded from gates by default. |

LLMs are demonstrably more honest when asked to self-report confidence than when their outputs are post-filtered. Dropping low-confidence findings hides cases where the model genuinely does not know — exactly the signal a human reviewer needs.

## Fast vs deep mode

Mode selection is **explicit and opt-in**, not heuristic-driven:

| Mode   | Calls         | Cost         | Use case                                                                    |
| ------ | ------------- | ------------ | --------------------------------------------------------------------------- |
| `fast` | text-LLM only | cents / call | Default. Routine CI, autopilot, in-editor critique, fast iteration loops.   |
| `deep` | text + vision | dimes / call | Designer-led ceiling-raising; release-quality elevation; preflight reviews. |

Cost tracking is mandatory: `summary.llmCalls.costUsd` must accumulate per-call records so operators can budget LLM spend without per-skill bespoke accounting.

## Composing with other patterns

LLM-judgment skills typically co-adopt several companion patterns:

- **Output vocabulary** — see [[craft-output-vocabulary]] / ADR 0019 for the 3-axis (tier × impact × confidence) and 5-dim radar shapes used by craft-domain LLM-judgment skills.
- **Catalog backing** — see [[living-catalogs]] / ADR 0020 for the seed + growth infrastructure used by LLM-judgment skills whose findings cite a corpus of rubrics, patterns, or exemplars.
- **Soft dependency upgrade** — see [[detect-and-offer]] / ADR 0021 for the precondition detection + inline-chain-to-upstream pattern when LLM-judgment quality depends on upstream declared intent.

A craft-domain LLM-judgment skill (`harness-design-craft`) typically uses all three. Domain-specific LLM-judgment skills (e.g. a future `copy-craft` or `accessibility-narrative`) may compose a subset.

## What the pattern does NOT mandate

- A specific output vocabulary — but ADR 0019 is the recommended default for craft-domain skills.
- A specific catalog shape — but ADR 0020 is the recommended default for catalog-backed skills.
- A specific render pipeline — vision-mode implementations may use playwright, storybook test-runner, browser-use, etc.
- A specific cost budget — that is operator policy, not skill policy.

## Anti-patterns to avoid

- **Silent confidence collapse** — never map `low` to a higher tier in the markdown output. Reviewers must be able to see "the model wasn't sure."
- **Auto-escalation to deep mode** — never decide on the user's behalf to spend 10x more per call. Mode is the caller's choice.
- **Direct provider SDK calls** — every direct call to Anthropic / OpenAI / Vertex bypasses cost accounting and provider fallback. Always route through `packages/intelligence/`.
- **Per-skill cost ledgers** — never invent skill-local cost tracking. The shared ledger pattern means an org can cap "LLM spend" globally.
- **Treating LLM output as authoritative** — the deterministic skeleton (codes, cites, derived priority) is what downstream consumers depend on. The judgment payload is non-deterministic by design.

## Related

- ADR: [0018 — LLM-judgment-based skill pattern](../decisions/0018-llm-judgment-skill-pattern.md)
- First instance: [`harness-design-craft`](../../changes/design-pipeline/design-craft-elevator/proposal.md)
- Companion patterns: [[craft-output-vocabulary]], [[living-catalogs]], [[detect-and-offer]]
- Intelligence provider: `packages/intelligence/` — wraps provider SDKs with cost tracking and vision-variant selection.
- Prior art: [REFERENCES.md](../../changes/design-pipeline/REFERENCES.md) #3 (emilkowalski/skill — judgment-heavy SKILL.md prose), #4 (alchaincyf/huashu-design — 5-dim radar from LLM critique).
