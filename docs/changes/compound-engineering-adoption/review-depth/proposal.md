# Review Depth: Adversarial Domain, Framework-Aware Subagents, Confidence Calibration

> Add an adversarial review domain to the existing 4-agent fan-out, framework-aware conditional subagents (TypeScript-strict, frontend-races) selected by diff content, and an additive `confidence` field on the existing `ReviewFinding` schema. Extends `harness-code-review` without breaking its current schema.

**Date:** 2026-05-05
**Status:** Proposed
**Keywords:** adversarial-review, framework-aware-subagent, confidence-calibration, code-review-fanout

## Overview

`harness-code-review` already runs a 7-phase pipeline with a 4-agent fan-out in Phase 4: **Compliance Agent** (standard tier), **Bug Detection Agent** (strong tier), **Security Agent** (strong tier, via `harness-security-review`), **Architecture Agent** (standard tier). Each emits `ReviewFinding[]` with the existing schema:

```typescript
interface ReviewFinding {
  id: string;
  file: string;
  lineRange: [number, number];
  domain: 'compliance' | 'bug' | 'security' | 'architecture';
  severity: 'critical' | 'important' | 'suggestion';
  title: string;
  rationale: string;
  suggestion?: string;
  evidence: string[];
  validatedBy: 'mechanical' | 'graph' | 'heuristic';
}
```

The skill already has `--fast` / `--thorough` rigor flags and a meta-judge in thorough mode. Comparison with the EveryInc compound-engineering plugin reveals three lateral additions worth adopting:

1. **No "between the lens" reviewer.** The 4 existing agents check known patterns. None actively _constructs_ failure scenarios — assumption violations, composition failures, cascade chains, abuse cases — that fall _between_ the bug, security, and architecture domains
2. **No framework-aware subagents.** A diff touching TypeScript benefits from a strict-TS lens; a diff with async UI benefits from a frontend-races lens. The existing fan-out is invariant to diff content
3. **No confidence calibration.** The existing severity enum (`critical|important|suggestion`) ranks impact but not how confident the reviewer is. This makes cross-agent dedup harder and lets low-confidence findings rise to `critical`

This spec adds:

1. New `adversarial` domain in the existing fan-out (5th agent slot, conditional on diff size + risk signals)
2. Two framework-aware conditional subagents: `typescript-strict` and `frontend-races`. They emit findings under existing domains (`bug` for type holes, `bug` for race conditions). They are activated by diff content, not invoked unconditionally
3. **Additive** `confidence` field on `ReviewFinding` (optional integer 25/50/75/100). Existing consumers ignore it; new agents populate it. No existing field is removed or renamed
4. Depth calibration based on diff line count + risk-keyword detection — drives whether the conditional subagents activate, NOT a replacement for the existing rigor flags

### Goals

1. Catch failure modes that single-pattern agents miss (assumption violations, cascades, abuse cases)
2. Add framework-specific lenses without breaking the existing 4-agent pipeline
3. Right-size the _number of subagents dispatched_ by diff size + risk
4. Add confidence calibration as a non-breaking additive field
5. Keep all changes additive: existing reviews continue to produce the same shape; new agents add to it

### Non-Goals

- Replacing the existing 4 agents (they remain unchanged)
- Replacing or renaming any field in `ReviewFinding` (only adds optional `confidence`)
- Replacing existing `--fast`/`--thorough`/`--deep` flags (depth calibration is orthogonal — about _which agents activate_, not their tier)
- Building a generic AI red-team — adversarial is bounded to scenarios constructible from the diff
- Adding named-person personas (DHH, Kieran, Julik) — explicit YAGNI cut from INDEX
- Supporting all frameworks at v1 — only `typescript-strict` and `frontend-races` initially

## Decisions

| #   | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Rationale                                                                                                             |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| 1   | Adversarial is a new agent slot in the existing Phase 4 fan-out, emitting `ReviewFinding[]` with `domain: 'bug'` (since the existing schema does not accept new domain values without a breaking change). Findings are tagged with a `subagent: 'adversarial'` field added below                                                                                                                                                                                                     | Reusing existing domains avoids breaking the type union; existing dedup and dashboard work unchanged                  |
| 2   | Framework-aware subagents (`typescript-strict`, `frontend-races`) emit findings under existing domains (`bug` primarily, `architecture` for `typescript-strict` complexity findings). They are _additional_ agents that run alongside the existing 4, not replacements                                                                                                                                                                                                               | Same reason — additive                                                                                                |
| 3   | Add a `subagent` string field to `ReviewFinding` to identify which of the (compliance, bug, adversarial, typescript-strict, frontend-races, security, architecture) produced the finding                                                                                                                                                                                                                                                                                             | The existing `domain` field is too coarse — `bug` is now produced by 4 different agents and dedup needs to know which |
| 4   | Add an OPTIONAL `confidence` integer (25/50/75/100) to `ReviewFinding`. New agents populate it; existing 4 agents continue NOT populating it (treated as `undefined` = no claim). Anchored confidence rubric lives in `agents/skills/claude-code/harness-code-review/references/confidence-rubric.md`                                                                                                                                                                                | Additive, non-breaking. Future migration of existing agents is voluntary                                              |
| 5   | Depth calibration is a new Phase 3.5 between CONTEXT and FAN-OUT: computes `Quick / Standard / Deep` from diff line count + risk-keyword detection. **Output: which conditional subagents activate.** Existing 4 agents always run; conditional subagents (adversarial, typescript-strict, frontend-races) activate per the depth rule                                                                                                                                               | Depth gates _additional_ work; existing review behavior is unchanged at every depth                                   |
| 6   | Activation rules: adversarial activates at Standard or Deep (i.e., 50+ changed lines OR risk signals present). typescript-strict activates when the diff includes a non-test `.ts` or `.tsx` file (test files exclude `.test.ts`/`.test.tsx`/`__tests__/**`/`*.spec.ts`). frontend-races activates when typescript-strict activated AND the diff includes one of (`.tsx`, `useEffect`, `useState`, `setTimeout`, `setInterval`, `addEventListener`, `data-controller=` for Stimulus) | Concrete, testable, mechanically enforceable predicates                                                               |
| 7   | Risk-keyword list: `auth`, `authn`, `authz`, `password`, `token`, `payment`, `billing`, `migration`, `migrate`, `external API`, `webhook`, `cryptography`, `crypto`, `session`, `cookie`, `personally identifiable`, `PII`, `compliance`. Single source: `agents/skills/claude-code/harness-code-review/references/risk-keywords.md`. The decision row above does NOT redundantly enumerate; this list is canonical                                                                  | Single source eliminates the drift the soundness review caught                                                        |
| 8   | All `Quick`/`Standard`/`Deep` thresholds: Quick = `< 50` lines AND no keywords; Standard = `50–199` lines OR exactly one keyword; Deep = `≥ 200` lines OR two-or-more keywords. PR author can override with `--depth deep` flag                                                                                                                                                                                                                                                      | Numeric thresholds; no "minor" vs "strong" judgment                                                                   |
| 9   | Confidence rubric anchors are deliberately generic, with examples per agent class. `100` = mechanically constructible (an explicit `any`, a missing `clearInterval`, a mechanically-traceable cascade). `75` = constructible scenario from the diff. `50` = judgment-based. `≤25` = suppress. The rubric file includes worked examples for each subagent class                                                                                                                       | The CE rubric was adversarial-specific; we generalize and document examples                                           |
| 10  | Initial v1: `adversarial` + `typescript-strict` + `frontend-races`. Rails / SQL / Python / data-migrations deferred to follow-up specs. Each new conditional subagent requires evidence the existing v1 catches real issues                                                                                                                                                                                                                                                          | Avoid scope sprawl; prove the pattern with three before generalizing                                                  |
| 11  | No migration of the existing 4 agents to populate `confidence`. They continue emitting findings without confidence. Future migration is opt-in per agent and out of scope here                                                                                                                                                                                                                                                                                                       | Eliminates the breaking-migration risk the soundness review flagged                                                   |
| 12  | Dashboard and PR comment formatter: render `confidence` when present, omit when absent. No formatter change required for existing findings                                                                                                                                                                                                                                                                                                                                           | The additive choice cascades — no downstream consumer breaks                                                          |

## Technical Design

### `ReviewFinding` schema additions (additive)

```typescript
interface ReviewFinding {
  id: string;
  file: string;
  lineRange: [number, number];
  domain: 'compliance' | 'bug' | 'security' | 'architecture'; // unchanged
  severity: 'critical' | 'important' | 'suggestion'; // unchanged
  title: string;
  rationale: string;
  suggestion?: string;
  evidence: string[];
  validatedBy: 'mechanical' | 'graph' | 'heuristic';
  // NEW (both optional):
  subagent?:
    | 'compliance'
    | 'bug'
    | 'security'
    | 'architecture'
    | 'adversarial'
    | 'typescript-strict'
    | 'frontend-races';
  confidence?: 25 | 50 | 75 | 100;
}
```

Existing 4 agents do not populate `subagent` or `confidence`. New agents always populate both. Phase 6 DEDUP+MERGE uses `(file, lineRange, title)` similarity as today; when two findings collide, the one with explicit `confidence` is preserved with the other listed in `evidence`. When neither has confidence, current dedup logic is unchanged.

### New Phase 3.5: CALIBRATE DEPTH

Inserted between Phase 3 (CONTEXT) and Phase 4 (FAN-OUT):

```
Inputs: diff metadata, intent summary
Steps:
1. Count changed lines (additions + deletions, excluding test/generated/lockfile)
2. Scan diff content + intent summary for risk keywords (from references/risk-keywords.md)
3. Compute depth tier:
   - Deep:     ≥ 200 lines OR ≥ 2 keywords matched
   - Standard: 50–199 lines OR exactly 1 keyword matched
   - Quick:    < 50 lines AND 0 keywords matched
4. Compute conditional-subagent activation set:
   - adversarial:       active if depth in {Standard, Deep}
   - typescript-strict: active if non-test *.ts or *.tsx file present
   - frontend-races:    active if typescript-strict active AND async-UI signal present
5. Pass depth + activation set to Phase 4
Output: depth tier, activation set, risk signals matched
Recorded: in PipelineContext for Phase 7 OUTPUT to display
```

The PR-author override flag `--depth deep` forces Deep tier and activates all conditional subagents.

### Adversarial subagent

New file: `agents/personas/adversarial-reviewer.yaml`. Hunts in four categories, depth-gated:

**Standard (always when active):** Assumption violation + composition failures + abuse cases (per CE adversarial reviewer)

**Deep (additionally):** Cascade construction + multi-pass

Output: `ReviewFinding[]` with `domain: 'bug'`, `subagent: 'adversarial'`, `confidence` populated.

What adversarial does NOT flag (the actual existing fan-out, not phantom personas):

- Logic errors, edge cases, error handling, race conditions, type safety, test coverage — owned by existing **Bug Detection Agent** (`subagent: 'bug'`, no `confidence` set)
- Known vulnerability patterns, OWASP, CWE-tagged findings — owned by existing **Security Agent** via `harness-security-review`
- Layer compliance, dependency direction, pattern adherence, separation of concerns — owned by existing **Architecture Agent**
- Spec alignment, API surface, backward compatibility, doc accuracy — owned by existing **Compliance Agent**

The adversarial reviewer's territory is the _space between_ — combinations, assumptions, sequences, emergent behavior. When the same line is flagged by both adversarial and bug detection, Phase 6 dedup keeps the higher-`severity` finding; if equal, the one with `confidence` wins.

### Framework-aware subagents

#### `typescript-strict` subagent

New file: `agents/personas/typescript-strict-reviewer.yaml`. Activation: non-test `.ts`/`.tsx` in diff. Hunt:

- Type safety holes that disable the checker (`any`, unsafe assertions, broad `unknown as Foo`, nullable flows relying on hope)
- Existing-file complexity that would be easier as a new module
- Refactor regression risk where call-sites have no test coverage
- Five-second rule failures (vague names, overloaded helpers)

Output: `ReviewFinding[]` with `domain: 'bug'` (type holes, regression) or `domain: 'architecture'` (complexity), `subagent: 'typescript-strict'`, `confidence` populated.

#### `frontend-races` subagent

New file: `agents/personas/frontend-races-reviewer.yaml`. Activation: typescript-strict active AND async-UI signal in diff. Hunt:

- Lifecycle cleanup gaps (listeners/timers outliving owner)
- React/Stimulus/Turbo timing mistakes (state in wrong hook, async after disconnect)
- Concurrent interaction bugs (overlapping operations, impossible-state booleans)
- Promise/timer flows leaving stale work behind

Output: `ReviewFinding[]` with `domain: 'bug'`, `subagent: 'frontend-races'`, `confidence` populated.

### Confidence rubric reference file

New file: `agents/skills/claude-code/harness-code-review/references/confidence-rubric.md`. Contents:

- **100 — Mechanical**: directly verifiable from the diff. Examples per agent: adversarial — every step in the cascade is traceable to specific lines; typescript-strict — explicit `any` or `// @ts-ignore`; frontend-races — `setInterval` with no `clearInterval` in disconnect
- **75 — Constructible scenario**: full concrete scenario from the diff. Examples per agent: adversarial — given specific input X execution reaches line Y producing wrong outcome Z; typescript-strict — refactor removes a guard, traceable in diff; frontend-races — race traceable to a specific interaction sequence
- **50 — Judgment-based**: the issue is real but partly judgment. Examples: adversarial — scenario depends on external API behavior assumed but unverified; typescript-strict — naming/extraction quality calls; frontend-races — race depends on timing windows not fully forceable from diff
- **≤25 — Suppress**: speculation; the agent must not emit

### Risk-keyword list reference file

New file: `agents/skills/claude-code/harness-code-review/references/risk-keywords.md`. Single source — Decisions 7 and 8 reference this file rather than repeating its contents. Format:

```
# Risk keywords for depth calibration
# Used by Phase 3.5 CALIBRATE in harness-code-review.

auth
authn
authz
password
token
payment
billing
migration
migrate
external API
webhook
cryptography
crypto
session
cookie
personally identifiable
PII
compliance
```

Modifications to this list are policy decisions; updates require PR review.

### Phase 4 dispatch updates

In Phase 4 FAN-OUT, the dispatcher reads the activation set from Phase 3.5 and dispatches:

- The existing 4 agents (compliance, bug, security, architecture) — always
- Adversarial — when active
- typescript-strict — when active
- frontend-races — when active

Phase 5 VALIDATE and Phase 6 DEDUP+MERGE work without change because: (a) findings still match the existing schema with two optional fields; (b) similarity key `(file, lineRange, title)` is unchanged; (c) dedup merge preserves the higher-severity finding, with the new tiebreaker (confidence-set wins) only firing when both are present.

Phase 7 OUTPUT renders the depth tier and activated subagent list at the top of the review summary:

```
Review depth: Standard (124 changed lines, risk signal: external-api)
Subagents dispatched: compliance, bug, security, architecture, adversarial, typescript-strict (6/7)
```

## Integration Points

### Entry Points

- Extends existing `/harness:code-review` (no new slash command)
- New optional flag: `--depth quick|standard|deep` (override calibration)
- Three new persona files: `adversarial-reviewer.yaml`, `typescript-strict-reviewer.yaml`, `frontend-races-reviewer.yaml` under `agents/personas/`
- Two new reference files: `confidence-rubric.md`, `risk-keywords.md` under `agents/skills/claude-code/harness-code-review/references/`

### Registrations Required

- Three new persona YAML files in the persona registry
- Phase 3.5 logic in the `harness-code-review` skill (CALIBRATE step)
- `--depth` flag added to the CLI invocation in `packages/cli/src/commands/code-review.ts` (or wherever the entry point lives)
- `ReviewFinding` schema in `packages/core/src/review/` (or current location) gains optional `subagent` and `confidence` fields. Schema version bumped from `1` to `2`. Backward compatibility: schema v1 findings parse cleanly under v2 (new fields are optional). Forward compatibility: schema v2 findings written to a v1 consumer simply have unknown fields ignored
- Slash command regeneration via `packages/cli/src/commands/generate-slash-commands.ts`

### Documentation Updates

- `harness-code-review` SKILL.md — Phase 3.5 CALIBRATE section; activation rules for new subagents; depth-tier output format
- `AGENTS.md` — review depth section explaining Quick/Standard/Deep
- `harness-code-review` SKILL.md schema diagram update to show optional fields
- `docs/conventions/` — convention doc on adding new conditional subagents (the activation-predicate pattern)

### Architectural Decisions

- **ADR-1**: Depth calibration as Phase 3.5 (vs replacing rigor flags) — depth determines _which subagents activate_, rigor determines _tier_. Orthogonal axes
- **ADR-2**: Adversarial domain mapping to existing `bug` (vs adding new domain enum) — additive non-breaking
- **ADR-3**: Confidence field as optional additive (vs replacing severity) — preserves existing consumers
- **ADR-4**: Framework-persona naming convention (`typescript-strict`, `frontend-races`) — lens-based, no person names

### Knowledge Impact

- `references/confidence-rubric.md` becomes a referenced standard cited by the new subagents and any future review-related skills
- `references/risk-keywords.md` becomes a policy file that future skills can read for risk classification (e.g., autopilot complexity calibration)
- `subagent` field on findings becomes a queryable dimension for the dashboard's review trends

## Success Criteria

1. Phase 3.5 CALIBRATE selects depth correctly on five fixtures: 10-line config tweak (Quick), 100-line refactor with 0 risk keywords (Standard), 50-line auth change (Deep — keyword forces it), 300-line UI change with 0 keywords (Deep — size forces it), 30-line migration (Standard — exactly one keyword)
2. Adversarial subagent produces ≥ 1 finding at confidence ≥ 75 on fixture `tests/fixtures/review/adversarial-cascade.ts` (a planted resource-exhaustion fixture defined by this spec); produces 0 findings on a no-op formatting-only diff
3. typescript-strict subagent activates only when a non-test `.ts`/`.tsx` is in the diff (test fixture: a Python-only diff produces no typescript-strict dispatch in Phase 4 logs; a `.test.ts`-only diff also produces no dispatch)
4. frontend-races subagent activates only when typescript-strict active AND async-UI signal present (test fixture: a backend-only TS diff with no `useEffect`/`setTimeout`/etc produces no frontend-races dispatch)
5. Existing 4 agents continue to emit findings with the existing schema unchanged across the v1→v2 schema bump (test fixture: existing review-pipeline integration tests pass without modification)
6. New agents emit findings with `subagent` and `confidence` fields populated; consumers (dashboard, PR comment formatter) render them when present
7. Phase 6 DEDUP+MERGE preserves the higher-severity finding when adversarial and bug-detection flag the same line; preserves the confidence-bearing finding when severities are equal
8. `--depth deep` flag override forces Deep tier regardless of diff size (test fixture: a 5-line diff with `--depth deep` activates all conditional subagents)
9. `harness validate` passes with the new persona files and updated `ReviewFinding` schema
10. Risk-keyword list and confidence rubric are each defined exactly once on disk (test: grep for canonical anchor text returns one match per file)

## Implementation Order

### Phase 1: Schema and Reference Files

<!-- complexity: low -->

Bump `ReviewFinding` schema from v1 to v2 by adding optional `subagent` and `confidence` fields. Backward/forward-compat round-trip tests with v1 fixtures verify no field removal or rename. Create `references/confidence-rubric.md` (with per-agent worked examples for adversarial, typescript-strict, frontend-races) and `references/risk-keywords.md` (single-source canonical list). Tests assert each is defined exactly once on disk.

### Phase 2: Phase 3.5 CALIBRATE

<!-- complexity: medium -->

Insert new Phase 3.5 CALIBRATE in the `harness-code-review` pipeline between CONTEXT and FAN-OUT. Compute changed-line count (excluding tests/generated/lockfile), scan diff content + intent summary for risk keywords from `references/risk-keywords.md`, derive Quick/Standard/Deep tier per Decision 8 thresholds, compute conditional-subagent activation set per Decision 6 predicates. Add `--depth quick|standard|deep` CLI override flag. Record calibration result in `PipelineContext` for Phase 7 to display.

### Phase 3: Adversarial Subagent

<!-- complexity: medium -->

Write `agents/personas/adversarial-reviewer.yaml`. Depth-gated hunt categories: Standard runs assumption-violation + composition-failures + abuse-cases; Deep additionally runs cascade-construction with multi-pass. Output `ReviewFinding[]` with `domain: 'bug'`, `subagent: 'adversarial'`, `confidence` populated. Integration tests with fixtures for each hunt category plus a no-op formatting-only diff (must produce 0 findings).

### Phase 4: TypeScript-strict Subagent

<!-- complexity: medium -->

Write `agents/personas/typescript-strict-reviewer.yaml`. Activation predicate: non-test `.ts`/`.tsx` in diff, excluding `*.d.ts` and `entropy.excludePatterns`. Hunt: type holes that disable checker (`any`, unsafe assertions, broad `unknown as Foo`), existing-file complexity, refactor regression risk, five-second-rule failures. Output `ReviewFinding[]` with `domain: 'bug'` (type holes) or `domain: 'architecture'` (complexity), `subagent: 'typescript-strict'`, `confidence` populated. Integration tests with type-safety-hole and complexity-regression fixtures plus a Python-only diff (must not activate).

### Phase 5: Frontend-races Subagent

<!-- complexity: medium -->

Write `agents/personas/frontend-races-reviewer.yaml`. Activation predicate: typescript-strict active AND async-UI signal in diff (one of `.tsx`, `useEffect`, `useState`, `setTimeout`, `setInterval`, `addEventListener`, `data-controller=`). Hunt: lifecycle cleanup gaps, React/Stimulus/Turbo timing mistakes, concurrent interaction bugs, promise/timer flows leaving stale work. Output `ReviewFinding[]` with `domain: 'bug'`, `subagent: 'frontend-races'`, `confidence` populated. Integration tests with cleanup-gap and concurrent-interaction fixtures plus a backend-only TS diff (must not activate).

### Phase 6: Phase 4 Dispatcher Refactor

<!-- complexity: high -->

Refactor Phase 4 FAN-OUT dispatcher in `harness-code-review` to read the activation set from Phase 3.5 and dispatch conditional subagents (adversarial, typescript-strict, frontend-races) alongside the existing 4 (compliance, bug, security, architecture). High complexity: invasive change to existing pipeline, must preserve existing 4-agent behavior at every depth. Fixtures run with conditional subagents disabled to verify no regression.

### Phase 7: Dedup and Output Updates

<!-- complexity: medium -->

Update Phase 6 DEDUP+MERGE: when adversarial and bug-detection flag the same line, preserve the higher-severity finding; on severity tie, prefer the finding with `confidence` set; surface other findings as evidence references (no information loss). Update Phase 7 OUTPUT: render depth tier, activated subagents, and (where present) `confidence` in the review summary. Backward-compatible — existing review output format extended only.

### Phase 8: Documentation and ADRs

<!-- complexity: low -->

Write 4 ADRs (depth-vs-rigor orthogonality, adversarial-mapping-to-existing-bug-domain, confidence-as-additive, framework-persona-naming-convention). Update AGENTS.md with review depth section. Write conventions doc on adding new conditional subagents (the activation-predicate pattern). Update `harness-code-review` SKILL.md with Phase 3.5 documentation, schema diagram update, and depth-tier output format.

## Risks and Mitigations

- **Risk:** Adversarial findings drift into speculation ("what if X were true...") → **Mitigation:** Confidence rubric `≤25 = suppress` is enforced at the agent prompt; integration-test fixtures include negative cases (no findings on a clean diff)
- **Risk:** Framework subagents flag false positives on edge file types (`.d.ts` declaration files; generated `.ts`) → **Mitigation:** Activation predicate excludes `*.d.ts` and files matching the project's `entropy.excludePatterns` list. Edge cases recorded in test fixtures
- **Risk:** Activation predicate too narrow (typescript-strict skips a `.test.tsx` that legitimately has type holes) → **Mitigation:** The predicate excludes `.test.ts`/`.test.tsx`/`__tests__/**`/`*.spec.ts` by design (test files are not production type holes); PR author can override via `--depth deep` if a specific test diff warrants it
- **Risk:** Schema v2 ripples into downstream consumers (dashboard, PR formatter) and breaks deserializers expecting v1 → **Mitigation:** Schema is purely additive; round-trip tests with v1 fixtures verify no field removal or rename. Consumers using strict deserializers should explicitly opt into v2 or ignore unknown fields (project convention is the latter)
- **Risk:** Depth calibration mis-classifies (a 30-line migration gets Standard because exactly one keyword matched) → **Mitigation:** Mechanical thresholds; PR-author override via `--depth deep`; calibration result visible in Phase 7 output for transparency
- **Risk:** Confidence rubric anchors are vague for agent classes outside adversarial → **Mitigation:** The rubric file includes per-agent worked examples (mechanical/constructible/judgment for each of adversarial, typescript-strict, frontend-races); future agents add their examples when registering
- **Risk:** Adversarial vs Bug Detection territory drifts and produces overlapping findings on the same line → **Mitigation:** Phase 6 DEDUP+MERGE existing logic handles overlap by similarity key; new tiebreaker (confidence wins on severity tie) deterministic; dedup metrics visible in Phase 7
- **Risk:** New subagent registration breaks the existing fan-out logic that hard-codes 4 agents → **Mitigation:** Phase 4 dispatcher refactor in step 7 reads activation set rather than hard-coding; fixtures run with conditional subagents disabled to verify no regression
