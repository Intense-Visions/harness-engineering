# harness:audit-harness-strength

**Keywords:** harness-strength, self-audit, failure-patterns, load-bearing, mechanical-checks, gear-pieces, rule-registry, dual-mode, ci-gate

## Overview

`harness:audit-harness-strength` is a self-audit skill that mechanically
inspects a project's own harness setup against the seven failure patterns
surfaced by the v5.0 dogfood audit, and reports a per-pattern finding, a 0–100
strength score, a tier label, and concrete remediation.

The harness ships gates, hooks, and templates that _can_ be load-bearing, but
adopters have no mechanical way to check whether _their_ configuration actually
holds weight. The dogfood audit found seven concrete anti-patterns where the
harness "warns but doesn't stop" — hooks documented to never block, pre-commit
auto-updating baselines on regression, empty `architecture.thresholds`, health
snapshots reporting `passed:true` while listing active signals. These are
invisible until someone reads every config file by hand. This skill makes "is
my harness actually a harness?" machine-checkable
(`STRATEGY.md#our-approach` — constraints-as-code over prompts-and-conventions).

The skill is the v5.0 milestone's recursion item: it detects the exact failure
class ("warns but doesn't stop", "self-audit-as-marketing") that the milestone
exists to eliminate. The roadmap is explicit — "the distinction between
self-audit-as-marketing and self-audit-as-mechanical-check is whether the skill
enumerates concrete detectable patterns." Accordingly it is implemented as a
deterministic core engine, not LLM prose.

### Goals

1. Mechanically detect all 7 patterns (STRENGTH-001..007) in a target repo,
   each with `file:line` evidence and a remediation string.
2. Produce a 0–100 strength score + tier label (`solid` / `at-risk` /
   `theatre`) and a per-pattern breakdown.
3. Be load-bearing itself: exit non-zero on any error-severity finding (so it
   can be a required CI check); `--report-only` softens to exit 0.
4. Run in two modes: **adopter** (default — materialized `harness.config.json`,
   `template.level`, resolved hooks, CI, snapshot) and **toolkit**
   (auto-detected in a harness-distribution repo — additionally audits `.hbs`
   templates and the init skill's default tier).
5. Emit human-readable stdout + `--json`; persist nothing (dashboard /
   health-snapshot / trend items consume the output).

### Non-goals (YAGNI)

- No separate "seven gear pieces" detection. Each mechanical check _labels_ the
  gear piece it defends; the conceptual layer lands with
  `docs/standard/article-failure-patterns.md` (a separate downstream item that
  is blocked by this skill).
- No graph persistence, no Markdown report artifact, no writing to
  `health-snapshot.json` or the dashboard (sibling v5.0 items own those).
- Not a deep/AI review — purely mechanical, deterministic, unit-testable.

## Decisions made

| #   | Decision                                                                                                                                                                                               | Rationale                                                                                                                                                                                                                                                           |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **Core engine + CLI**, not SKILL.md-prose. `HarnessStrengthAuditor` in `packages/core`; `harness check-harness-strength` command; SKILL.md orchestrates.                                               | The recursion item must survive being pointed at itself — a prose-only self-audit fails its own STRENGTH-001. Patterns are overwhelmingly mechanical (JSON key checks, greps, arithmetic, YAML parse), so judgment adds little. Matches `STRATEGY.md#our-approach`. |
| D2  | **Dual mode**: `adopter` (default) + `toolkit` (auto-detected when `templates/` **and** `agents/skills/` both present; `--toolkit`/`--adopter` override). Patterns #1-3,6,7 mode-agnostic; #4/#5 fork. | Adopter mode is the shippable product (External Adoption bet); toolkit mode lets this repo catch its own source-form weaknesses before they ship downstream. Shared checks keep the extra surface small.                                                            |
| D3  | **Findings (error/warn/info) + 0–100 score + tier label**; exit non-zero on any error-severity finding by default; `--report-only` → exit 0.                                                           | Satisfies the roadmap's "per-piece score". Default-blocking makes it a valid required CI check; `--report-only` accommodates first-run adopters. Consistent with `check-security`'s severity gate.                                                                  |
| D4  | **Stdout + `--json` only; persist nothing.**                                                                                                                                                           | Clean boundary against in-flight sibling items (5-signal dashboard, health-snapshot reconciliation, trend tracking) which _consume_ this output. Graph/trends can be added later without rework.                                                                    |
| D5  | **Rule-registry**: 7 `StrengthRule` modules implementing `{ id, gearPiece, defaultSeverity, appliesIn(mode), detect(ctx) }`; auditor builds `ProjectContext` once, runs applicable rules, aggregates.  | Each STRENGTH-NNN gets isolated fixture tests (the testability D1 hinges on). Dual-mode is one predicate (`appliesIn`), not scattered conditionals. Additive for future rules / gear-piece layer. Mirrors the proven `SecurityScanner` pattern.                     |

### Severity defaults (overridable via `audit.harnessStrength.severities`)

| Rule         | Pattern                                                              | Default     |
| ------------ | -------------------------------------------------------------------- | ----------- |
| STRENGTH-001 | Hook documented "never blocks"/"always exits 0" in an active profile | **error**   |
| STRENGTH-002 | Pre-commit auto-updates baselines/thresholds on regression           | **error**   |
| STRENGTH-003 | `--skip` list > 2 categories without inline justification            | **warning** |
| STRENGTH-004 | `layers` defined but `architecture.thresholds` empty/absent          | **error**   |
| STRENGTH-005 | Init/config defaults to lowest tier (`basic`)                        | **warning** |
| STRENGTH-006 | Baseline-update PR auto-approved without independent review          | **error**   |
| STRENGTH-007 | `passed:true` in health snapshot whose `signals[]` names that check  | **error**   |

## Technical design

### File layout

```
packages/core/src/harness-strength/
  types.ts            # StrengthFinding, StrengthRule, ProjectContext, AuditResult, zod schemas
  context.ts          # buildProjectContext(root, mode) — reads all inputs once; resolves hooks
  auditor.ts          # HarnessStrengthAuditor.audit(root, opts) -> Result<AuditResult>
  scoring.ts          # rollupScore(findings) -> { score, tier }
  rules/
    strength-001-nonblocking-hooks.ts
    strength-002-autobaseline.ts
    strength-003-skip-list.ts
    strength-004-empty-thresholds.ts
    strength-005-lowest-tier.ts
    strength-006-autoapprove-baseline.ts
    strength-007-snapshot-signal-mismatch.ts
    index.ts          # ALL_RULES registry
packages/cli/src/commands/check-harness-strength.ts   # createCheckHarnessStrengthCommand()
agents/skills/claude-code/harness-audit-harness-strength/
  SKILL.md
  skill.yaml
```

### Core types

```ts
type Mode = 'adopter' | 'toolkit';
type Severity = 'error' | 'warning' | 'info';
type Tier = 'solid' | 'at-risk' | 'theatre';

interface StrengthFinding {
  id: string; // e.g. "STRENGTH-001"
  gearPiece: string; // label only (v1) — gear piece this defends
  severity: Severity;
  file: string; // relative to root
  line?: number; // when locatable
  message: string; // what's wrong
  remediation: string; // concrete fix
}

interface ProjectContext {
  root: string;
  mode: Mode;
  config: HarnessConfig | null; // parsed harness.config.json (null if absent)
  preCommit: string | null; // raw .husky/pre-commit text
  hookFiles: { name: string; path: string; text: string }[]; // resolved active hooks
  workflows: { path: string; text: string }[]; // .github/workflows/*.yml
  healthSnapshot: unknown | null; // parsed .harness/health-snapshot.json
  templates?: { path: string; text: string }[]; // toolkit mode only (.hbs)
  initSkill?: string | null; // toolkit mode only
}

interface StrengthRule {
  id: string;
  gearPiece: string;
  defaultSeverity: Severity;
  appliesIn(mode: Mode): boolean;
  // severity applied by auditor (config-overridable); detect returns the rest:
  detect(ctx: ProjectContext): Omit<StrengthFinding, 'severity'>[];
}

interface AuditResult {
  mode: Mode;
  score: number; // 0–100
  tier: Tier;
  findings: StrengthFinding[];
  summary: {
    errors: number;
    warnings: number;
    info: number;
    rulesRun: number;
    rulesPassing: number;
  };
}
```

### Auditor flow (`auditor.ts`)

1. `buildProjectContext(root, resolveMode(opts, root))` — reads every input
   file once; missing files → `null`/`[]` handled silently (mirrors
   `detect-design-drift` absent-input handling).
2. `ALL_RULES.filter(r => r.appliesIn(ctx.mode))`, run each `detect(ctx)`.
3. Apply config severity overrides
   (`harness.config.json` → `audit.harnessStrength.severities`).
4. `rollupScore(findings)` → `{ score, tier }`.
5. Return `Result<AuditResult>` (the repo's `Ok/Err` Result type).
   The `--severity` threshold filters at the command layer (matches
   `check-security`), not in the auditor.

### Hook resolution (soundness fix)

Adopters declare active hooks in `.claude/settings.json`, not
`harness.config.json`. `buildProjectContext` resolves `hookFiles` by reading
`.claude/settings.json` hook registrations and collecting referenced scripts
plus any scripts present in `.husky/` and `.claude/hooks/`. When a profile is
declared, `packages/cli/src/hooks/profiles.ts` maps the profile to its hook
set. If neither settings nor hook dirs are resolvable, STRENGTH-001 reports
"not evaluable" rather than a false pass.

### Scoring (`scoring.ts`)

Pure, deterministic function. Start at 100; subtract a per-severity weight ×
finding count (`error = 14`, `warning = 6`, `info = 2` — tunable so 7 errors
floors near 0). Tier thresholds: `solid ≥ 85`, `at-risk 50–84`, `theatre < 50`.
Unit-tested directly.

### Mode resolution (`context.ts`)

Explicit `--toolkit`/`--adopter` wins; else auto-detect `toolkit` when **both**
`templates/` and `agents/skills/` exist at root; else `adopter`.

### Rule detection notes (the non-trivial parses)

- **001** — for each resolved active hook file, regex for `never blocks` /
  `always exits? 0` / a guaranteed `exit 0` as the sole exit. Both modes.
- **002** — parse `.husky/pre-commit`; flag any branch invoking
  `--update-baseline` (or a threshold rewrite) conditioned on a check failing.
- **003** — extract the `--skip` value, split on `,`, count; if > 2 and no
  inline `#` justification on/adjacent to the line → warning.
- **004** — `config.layers?.length > 0` AND
  (`!config.architecture?.thresholds` or empty) → error. Toolkit mode
  additionally runs the same check against each
  `templates/*/harness.config.json.hbs`.
- **005** — adopter: `config.template?.level === 'basic'`. toolkit: scan
  `initialize-harness-project/SKILL.md` for a default recommendation of `basic`.
- **006** — scan `.github/workflows/*.yml` for an auto-approve/auto-merge step
  gated only on a PAT (e.g. `BASELINE_AUTOAPPROVE_PAT`) without an
  independent-review condition.
- **007** — for each `checks.<k>.passed === true` in `health-snapshot.json`,
  fail if `signals[]` contains the signal name mapped to `<k>`.

### CLI command (`check-harness-strength.ts`)

Mirrors `check-security.ts:55–189`. Options: `--mode`, `--toolkit`/`--adopter`,
`--severity <error|warning|info>` (default `warning`), `--report-only`,
`--json`. Builds `OutputFormatter`; calls `audit()`; exits non-zero when any
finding ≥ `error` survives unless `--report-only`. Registered via
`_registry.ts` (auto-generated — run `generate-barrel-exports`).

## Integration points

### Entry points

- New CLI command: `harness check-harness-strength`
  (`packages/cli/src/commands/check-harness-strength.ts`).
- New skill: `harness:audit-harness-strength`
  (`agents/skills/claude-code/harness-audit-harness-strength/`).
- New core barrel export: `@harness-engineering/core` → `harness-strength`
  (`HarnessStrengthAuditor`, types).

### Registrations required

- `packages/cli/src/commands/_registry.ts` — add
  `createCheckHarnessStrengthCommand` (via `pnpm run generate-barrel-exports`;
  do not hand-edit).
- `packages/core` barrel/index regen for the new module.
- `skill.yaml`: `tier: 2`, `cognitive_mode: constructive-architect`,
  `type: rigid`, platforms (claude-code/cursor/codex/gemini-cli), tools
  (`Bash`, `Read`, `Grep`, `Glob`).
- Slash-command + agent-definition regen (`harness generate-slash-commands`,
  `generate-agent-definitions`) so the skill is invocable.

### Documentation updates

- `AGENTS.md` — add the command to the `check-*` family listing.
- CLI command reference for `check-harness-strength`.
- Cross-link from `docs/standard/article-failure-patterns.md` once it exists.

### Architectural decisions

- **D1 (core engine over prose)** warrants a standalone ADR: it sets the
  precedent that _self-audit skills must be mechanically enforced, not prose_,
  a rule future audit skills should follow. References the canonical D1 above.

### Knowledge impact

- New graph concepts: `harness-strength-pattern` (the 7 STRENGTH rules) and the
  `gearPiece` taxonomy label. Relationship: each STRENGTH rule _defends_ a gear
  piece. Seeds the vocabulary `article-failure-patterns.md` will formalize.

## Success criteria

1. `harness check-harness-strength` runs in a repo and emits a report with
   per-pattern findings, a 0–100 score, and a tier label.
2. All 7 rules are implemented as independent `StrengthRule` modules, each with
   isolated fixture-based unit tests (passing + failing fixtures).
3. Self-audit passes its own audit: run against this repo after the v5.0
   mechanical fixes land, the command reports the corresponding patterns
   resolved (no false "passing" while a weakness exists).
4. Default run exits non-zero when any error-severity finding is present;
   `--report-only` exits 0 with the same report.
5. `--json` emits a machine-readable `AuditResult` consumable by the
   dashboard / health-snapshot items.
6. Adopter mode runs cleanly in a repo without `templates/`+`agents/skills/`;
   toolkit mode auto-activates in this repo and additionally evaluates `.hbs`
   templates (#4) and the init skill's default tier (#5).
7. Missing input files are handled silently (absent `harness.config.json` /
   `health-snapshot.json` → no crash; rule reports "not evaluable" rather than
   false pass).
8. Scoring is a pure, deterministic function — same inputs yield the same
   score/tier across runs.
9. `harness validate` passes; barrel exports regenerated; skill discoverable
   via slash-command + agent-definition generation.

### Requirement phrasing (EARS)

- _When_ any rule produces an error-severity finding and `--report-only` is not
  set, the command shall exit non-zero.
- _If_ a required input file is absent, then the rule shall not emit a passing
  result for that pattern (reports "not evaluable").
- _When_ both `templates/` and `agents/skills/` are present and no mode flag is
  given, the system shall run in toolkit mode.

## Implementation order

### Phase 1: Core types & context

<!-- complexity: medium -->

`types.ts` (zod schemas), `context.ts` (`buildProjectContext` + mode resolution + hook resolution), `scoring.ts` (pure rollup). Unit-test scoring, mode-detect, and context-absence handling.

### Phase 2: Rule registry (the 7 rules)

<!-- complexity: high -->

Implement STRENGTH-001..007 each with a fixture pair (passing/failing). Wire
`ALL_RULES`. `HarnessStrengthAuditor.audit()`.

### Phase 3: CLI command

<!-- complexity: low -->

`check-harness-strength.ts` mirroring `check-security.ts`; options,
`OutputFormatter`, exit codes, `--json`, `--report-only`; registry regen.

### Phase 4: Skill and wiring

<!-- complexity: medium -->

`SKILL.md` (SCAN→DETECT→SCORE, gates, rationalizations), `skill.yaml`;
slash-command / agent-definition regen; AGENTS.md + CLI docs; the D1 ADR.

### Phase 5: Dogfood verification

<!-- complexity: low -->

Run toolkit mode against this repo; confirm it flags the live patterns and that
score/tier are sane; lock fixtures.
