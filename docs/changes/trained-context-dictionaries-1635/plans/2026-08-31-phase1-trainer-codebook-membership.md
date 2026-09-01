# Plan — trained context dictionaries, phase 1 (trainer + codebook + membership, report-only) (#1635)

> Stage: harness-autopilot. Consumes `../proposal.md`. Route: feature.

## Tasks

1. **Core: recurring-span mining** (`packages/core/src/dictionary/mine.ts`)
   - `CorpusDocument` / `CorpusSpan` model; `mineRecurringSpans` over document
     frequency; canonical-definition selection; `frequency × length` scoring;
     whitespace-normalized grouping; deterministic sort.
   - Tests: `mine.test.ts` (document-frequency, minFrequency, canonical/variants,
     normalization, ordering).

2. **Core: governed versioned codebook** (`packages/core/src/dictionary/codebook.ts`)
   - `deriveHandle` (label-keyed, deterministic), `definitionHash` (sha-256),
     `reconcileCodebook` (mint v1 / keep / bump+archive / retire), `expand`
     (current + version-pinned), `auditStaleReferences`, `verifyEntry`.
   - Tests: `codebook.test.ts` (version-bump + pinned-expansion AC2, retire,
     byte-stability, stale audit).

3. **Core: membership by measurement** (`packages/core/src/dictionary/membership.ts`)
   - `netSaving`, `decideMembership` (enter/retain/retire with hysteresis +
     amortization guard + decay-to-zero retirement), `liveLabelsFromDecisions`.
   - Tests: `membership.test.ts`.

4. **Core: report builder** (`packages/core/src/dictionary/report.ts`)
   - `buildCodebookReport` (mine → decide → reconcile → project savings);
     `SavingsProjection` (paired baseline vs codebook, never negative).
   - Tests: `report.test.ts` (empty, AC1 savings, AC2 drift bump across runs,
     AC3 soak entry/exit).
   - Wire `export * from './dictionary'` into `packages/core/src/index.ts`.

5. **CLI: corpus adapter + command**
   (`packages/cli/src/commands/context-dictionary/`)
   - `corpus.ts`: read `.harness/comprehension/**/_module.md` → `CorpusDocument`s
     (invariant + import spans), graceful empty on missing dir.
   - `index.ts`: `harness context-dictionary report [--json] [--write]`; reads a
     prior codebook from `.harness/dictionary/codebook.json` for drift
     governance; `--write` persists the trained codebook. Read-only otherwise.
   - Register in `_registry.ts`. Tests: `context-dictionary.test.ts`.

6. **Ship hygiene:** changeset (minor core + cli), `pnpm generate-docs`
   (reference-docs freshness), provenance.json, typecheck / lint / build / tests.

## Verification

- `EXISTS`: files above present; command registered.
- `SUBSTANTIVE`: 36 core + 3 CLI tests green; pure functions total on empty input.
- `WIRED`: `harness context-dictionary report` runs end-to-end over the real
  702-unit corpus, mining recurring spans into a 100-term governed codebook with
  a ~73.8% projected reduction; `--write` persists and a second run retains with
  zero drift bumps (governance loop closed).

## Deferred (follow-up slice)

Handle-substitution into the serving/assembly path (`Assembler` /
`StabilityLayout`): substitute handles for recurring spans with
expansion-on-demand, consumer version-pinning, and the paired
outcome-degradation measurement on _served_ context. Tracked under `Refs #1635`.
