# Plan — Generic subscription-CLI analysis provider (#1710)

**Issue:** #1710 — comprehension: bare subscription-CLI analysis providers (codex/gemini)
**Route:** feature (brainstorming to lock the interface, then autopilot)
**ADR context:** 0109 slice 3 (#1709) made the semantic backstop provider-neutral via a
config-declared OpenAI-compatible endpoint. This slice closes the remaining gap: a bare
subscription CLI (no API key, no `/v1` endpoint).

## Fork decision (design settled up front)

**Fork A — one `GenericCliAnalysisProvider` with a pluggable arg-template + output-parser,
NOT N bespoke per-vendor adapters.** Rationale: one extensible, unit-testable
implementation; codex/gemini become preset dialects; adopters with an unlisted CLI wire it
via a `custom` placeholder template with no code change. Chosen because the vendors differ
only in (1) how the prompt/schema/model are passed as argv/stdin and (2) how stdout maps
back to structured content — exactly the two seams a template + parser abstract.

## Tasks

1. **`GenericCliAnalysisProvider`** (`packages/intelligence/src/analysis-provider/generic-cli.ts`)
   - Mirror `ClaudeCliAnalysisProvider`'s shape/interface (`AnalysisProvider.analyze<T>`),
     but with NOTHING Claude-specific: inject `argTemplate` (build argv + optional stdin)
     and `outputParser` (stdout → `{ content, usage?, model? }`).
   - Reuse the shared `structured-output.ts` helpers (`coerceStructuredContent`,
     `extractEmbeddedJson`, `buildCorrectionPrompt`) and the same schema-check → ONE
     corrective retry recovery loop. Ignore `images` (bare CLIs vary) like the
     OpenAI-compatible provider.
   - Built-in `codexCliTemplate` / `geminiCliTemplate` (schema folded into the prompt,
     since bare CLIs have no `--json-schema`), `buildCustomCliTemplate` (placeholder-based),
     `textSalvageParser` (default) + `jsonEnvelopeParser`, and a JSON-config-friendly
     `createCliAnalysisProvider` factory. Export all from the intelligence index.

2. **Resolver wiring + PATH detection**
   (`packages/cli/src/mcp/utils/analysis-provider.ts`)
   - Generalize the Windows-safe PATH scan to `isCliAvailable(command, opts)`; keep
     `isClaudeCliAvailable` as a thin wrapper.
   - Add `makeGenericCliProvider` and thread an `AnalysisCliConfig` (`cli`) through
     `resolveAnalysisProvider` and `resolveProviderKind`, inserted **before** the Claude CLI
     in precedence: Anthropic key → `/v1` endpoint → generic CLI (configured + on PATH) →
     Claude CLI → null. Add the `generic-cli` `ProviderKind`.

3. **Config surface** (`packages/cli/src/config/schema.ts`, `comprehension/config.ts`)
   - Add `comprehension.analysisCli` (`vendor` codex/gemini/custom, `command`, optional
     `model`, optional `custom` template) — non-secret only, reusing the `comprehension`
     block conventions (no top-level key that would warn on older installed CLIs).
   - `comprehensionCli(cconf)` reads it; thread into `selectSemanticModel` (so a generic-CLI
     kind yields `undefined` model, never a Claude id) and `resolveCompileProvider`.

## Verification

- Unit tests with **mocked CLI I/O** (spawn stubbed, fixture stdout): provider dialects,
  parsers, recovery/retry, error paths; resolver precedence (generic before claude,
  after anthropic/local); `isCliAvailable`; config helper + model neutrality.
- Build + typecheck + lint intelligence and cli; full comprehension + mcp suites.
- **NOT exercised:** live codex/gemini CLIs (unavailable here — the stated reason #1710 was
  split from slice 3). Live integration deferred; see the PR "Verification limits".
