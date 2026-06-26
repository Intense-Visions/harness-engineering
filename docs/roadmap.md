---
project: harness-engineering
version: 1
created: 2026-03-21
updated: 2026-06-25
last_synced: 2026-06-23T18:05:08.357Z
last_manual_edit: 2026-06-26T01:25:24.050Z
---

# Roadmap

## Intake

### Assignee means who is executing — set at execution, not selection

- **Status:** planned
- **Spec:** docs/changes/assignee-execution-lifecycle/proposal.md
- **Summary:** Establish the invariant assignee ≠ null ⟺ in-progress via a centralized core authority: roadmap-pilot stops assigning at selection, harness-execution claims at execution start, machine claims never use the GitHub assignee field, inbound sync never clobbers a live machine claim, and RMH005 + groom enforce/migrate. Fixes the orchestrator silently skipping pilot-touched items.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#640

## v5.0 — Enforcement Hardening

### Rename quality-gate hook and ship a strict variant that blocks

- **Status:** done
- **Spec:** docs/changes/quality-warner-strict-gate/proposal.md
- **Summary:** `packages/cli/src/hooks/quality-gate.js:4-6` is literally documented as "Never blocks (always exits 0). Warnings go to stderr." This hook ships in the default **standard** profile. The hook NAMED "quality-gate" gates nothing. Rename to `quality-warner` or `format-checker`. Add a `strict-quality-gate` hook variant for strict-profile adopters that exits 2 on lint/format failure. Source: Pass 5 #1.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P0
- **External-ID:** github:Intense-Visions/harness-engineering#526
- **Updated-At:** 2026-06-25T23:56:30.691Z

### Make protect-config fail-closed in ambiguous cases

- **Status:** planned
- **Spec:** —
- **Summary:** `packages/cli/src/hooks/protect-config.js:36,41,49` — three branches currently fail-open (parse error → allow, empty stdin → allow, missing `file_path` → allow). The security-flavored hook that protects config silently yields whenever its input is malformed. Change to fail-closed with a clear error message. Defense-in-depth. Source: Pass 5 #2.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#527

### Reconcile health-snapshot.json passed flags with active signals

- **Status:** planned
- **Spec:** —
- **Summary:** `.harness/health-snapshot.json` reports `entropy.passed: true` while listing "dead-code" in `signals[]`; same for docs (`passed: true`, `undocumentedCount: 27481`) and security (`passed: true`, `findingCount: 16`). The harness's own dogfooded output says all checks "passed" while listing seven active drift signals. Make `checks.X.passed` return `false` when `signals[]` includes the corresponding signal name. Source: Pass 1 #2.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P0
- **External-ID:** github:Intense-Visions/harness-engineering#528

### Audit and cap the pre-commit --skip list

- **Status:** planned
- **Spec:** —
- **Summary:** `.husky/pre-commit:4` silently skips `entropy,docs,perf,security,deps,phase-gate` — six categories disabled at commit time. The skips may be justified individually, but the cumulative silence is the article's failure pattern #2: "every gap was once a known issue. Then it became background noise. Then it became invisible." Either move slow checks to pre-push with no auto-skip, or emit a one-line stderr warning per skipped category so the gaps remain visibly named. Source: Pass 1 #4.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#529

### Require --allow-regress flag on check-arch --update-baseline worsen

- **Status:** planned
- **Spec:** —
- **Summary:** `packages/cli/src/commands/check-arch.ts:109-126` — today `--update-baseline` silently accepts regressions. Change semantics so updating a baseline that worsens any metric requires `--allow-regress --reason "..."`. The reason is logged to `.harness/audit.log`. Forces the regression-acceptance decision into the open. Source: Pass 1 #5.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#530

### Harden BASELINE_AUTOAPPROVE_PAT self-approval scope

- **Status:** planned
- **Spec:** —
- **Summary:** `.github/workflows/ci.yml:158-176` — the refresh-baselines job opens a PR and self-approves using `BASELINE_AUTOAPPROVE_PAT` when branch protection blocks the direct push. Today the auto-approval fires regardless of what's in the PR. Constrain auto-approval to PRs whose diff is _exactly_ `*-baselines.json` and nothing else. Add a defensive check that fails if the PR diff touches anything outside baselines. Source: Pass 1 #8.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#531

### Build harness:rollback automated-revert primitive

- **Status:** planned
- **Spec:** —
- **Summary:** When a shipped PR fails post-merge eval (harness:outcome-eval) or triggers a defined signal threshold, automatically open a revert PR with full context. The article's "circuit breaker / automated rollback — a mechanism that physically stops the fall before it hits the ground." Currently the project has no automated rollback primitive — only human-mediated PR review. Needs a "revert ready" classification system and a trust model for auto-merging reverts. Source: Pass 2 #7.
- **Blockers:** Build harness:outcome-eval skill
- **Plan:** —
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#533

### Lift packages/cli branch coverage above the article's bar

- **Status:** planned
- **Spec:** —
- **Summary:** `coverage-baselines.json:14-19` — packages/cli currently 64.42% branches and 77.73% lines on the user-facing surface. The article: "if the team can't honestly say a green build is enough to push to production, the test suite isn't a harness — it's a comfort blanket." 64% branches on the CLI entry point doesn't pass that bar. Target ≥80% branches over the next quarter. Tighten the V8 variance tolerance for cli specifically (0.1% not 0.5%). Source: Pass 1 #6.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#544

### Make pre-push test:coverage gate deterministic — isolate parallel-unsafe tests

- **Status:** planned
- **Spec:** —
- **Summary:** The husky pre-push gate runs `turbo run test:coverage --concurrency=2` across all packages; several heavy IO/git tests are parallel-unsafe and flake non-deterministically under contention — the failing test/package moves run-to-run (observed: `cli#test:coverage`, then `orchestrator#test:coverage`, then cli again). All pass in isolation; CI (clean runner) tolerates them. Known offenders: `packages/cli/tests/hooks/adoption-tracker.test.ts` (writes shared project-root `.harness/metrics/adoption.jsonl` not its tmpdir), `packages/cli/tests/copy-craft/extract-commits.test.ts`, `packages/cli/tests/integration/cli.test.ts` (spawns the CLI; 30s timeout under load). A flaky gate that blocks good pushes is itself an anti-harness pattern — it erodes trust like the "warns but doesn't stop" hooks this milestone targets, inverted (stops, for the wrong reason); on 2026-06-24 it flaked 3+ consecutive times on docs-only changes, forcing API-side landing. Fix: make the heavy tests concurrency-safe (per-test tmpdir + `chdir`, never touch repo-root shared files), or pool-isolate via vitest `poolOptions`/`--no-file-parallelism`; also investigate the turbo-cache miss where `packages/cli/.harness/arch/baselines.json` (auto-mutated by the commit/push arch check) busts cli's `test:coverage` input hash and forces a full re-run. Source: dogfood 2026-06-24 (audit-harness-strength + roadmap-sync pushes).
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#620

## v5.0 — Catalog Rationalization

### Add architecture thresholds to basic and intermediate templates

- **Status:** done
- **Spec:** —
- **Summary:** Shipped in commit `0f8c6ef3` (2026-06-23, merged to main): `templates/basic` and `templates/intermediate` now ship full `architecture.thresholds` (complexity ≤ 20 basic / ≤ 15 intermediate), module-size caps, dependency-depth ≤ 8, plus security/entropy/performance blocks. Every adopter gets real gates from minute one. Source: Pass 2 #2 (CRITICAL).
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P0
- **External-ID:** github:Intense-Visions/harness-engineering#537

### Change init skill default recommendation away from "basic"

- **Status:** blocked
- **Spec:** —
- **Summary:** `agents/skills/claude-code/initialize-harness-project/SKILL.md:45,533` recommends "basic" by default for new projects. Combined with the no-thresholds basic template, this steers adopters directly into the configuration that does NOT deliver the article's harness. Change default recommendation to a new "load-bearing minimum" tier (item below). Source: Pass 3 #1.
- **Blockers:** Add "load-bearing minimum" tier
- **Plan:** —
- **Assignee:** —
- **Priority:** P0
- **External-ID:** github:Intense-Visions/harness-engineering#538

### Add "load-bearing minimum" tier between intermediate and advanced

- **Status:** blocked
- **Spec:** —
- **Summary:** Today: basic = layer linter; intermediate = layer linter + 1 forbidden import; advanced = full kit with all the dogfood-inherited overhead. What's missing is a tier between intermediate and advanced — a "load-bearing minimum" template that ships exactly: ESLint plugin + complexity cap (15) + module-size cap + multi-persona review wired into the CI workflow template + harness:outcome-eval skill. The minimum article-aligned harness without the advanced-tier surface area. Source: Pass 3 #12.
- **Blockers:** Build harness:outcome-eval skill, Ship a CI workflow template, Ship a required-review GitHub Action template
- **Plan:** —
- **Assignee:** —
- **Priority:** P0
- **External-ID:** github:Intense-Visions/harness-engineering#539

### Invert the implementation guide framing

- **Status:** blocked
- **Spec:** —
- **Summary:** `docs/standard/implementation.md:9-53` stages adoption as Level 1 (1-2 weeks) → Level 2 (2-4 weeks) → Level 3 (4-8 weeks). Total 7-14 weeks to reach what the article calls "the harness." The article: "Build the harness first. Then climb." The implementation guide: "Grow into the harness over three months." Rewrite so it doesn't sell weeks-to-the-harness. Lead with the load-bearing minimum tier as the starting point. Treat the rest as ambitious, not necessary. Source: Pass 3 #2 (CRITICAL — strategic positioning).
- **Blockers:** Add "load-bearing minimum" tier between intermediate and advanced
- **Plan:** —
- **Assignee:** —
- **Priority:** P0
- **External-ID:** github:Intense-Visions/harness-engineering#542

### Promote harness:strategy to gateway position in init

- **Status:** planned
- **Spec:** —
- **Summary:** `initialize-harness-project/SKILL.md` currently asks the strategy question as Phase 3, step 5c — buried after scaffolding and configuration. The article's gear item #1 is "specs operated FROM," and strategy is the foundational spec. Move the strategy prompt to the FIRST question init asks, not the fifth. Adopters who skip it end up with no strategic anchor, which means brainstorming/ideate/roadmap-pilot start cold. Source: Pass 3 #13.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#543

### Retire ~350 shelf-ware skills

- **Status:** blocked
- **Spec:** —
- **Summary:** Pass 4 catalog audit: 598 of 755 SKILL.md files (79%) self-declare `Type: knowledge — not a procedural workflow, no tools or state`; 493 of 755 (65%) end with the identical copy-paste Process boilerplate "Read / Apply / Verify"; only ~9% are genuine gear (Iron Law + gates + MCP calls). Concrete retire list: all 23 `gof-*` (LLM-prior, 1994 design patterns), pre-2020 `react-*` (`react-hoc-pattern`, `react-render-props-pattern`, `react-container-presentational`), most `otel-*` (duplicates OpenTelemetry docs), generic `astro-*`/`nuxt-*`/`svelte-*` unless actively shipped. Pair retire with item below (catalog-retrospective skill) to surface candidates and item further below (catalog tiering) to reorganize the remainder. Source: Pass 4 action 1.
- **Blockers:** Build harness:catalog-retrospective skill
- **Plan:** —
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#545

### Merge fragmented concept clusters in the catalog

- **Status:** planned
- **Spec:** —
- **Summary:** Three confirmed/suspected clusters of concept fragmentation in the catalog. CONFIRMED: `harness-i18n` + `harness-i18n-workflow` + `harness-i18n-process` — overlap is admitted in i18n SKILL.md:13-14. SUSPECTED: six `harness-design*` skills (`harness-design`, `harness-design-craft`, `harness-design-mobile`, `harness-design-pipeline`, `harness-design-system`, `harness-design-web`). SUSPECTED: `harness-verify` + `harness-verification` + `harness-integrity`. Audit each cluster and merge to one skill per concept. Source: Pass 4 action 2.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#546

### Promote 5 domain skills from advisory to load-bearing checks

- **Status:** planned
- **Spec:** —
- **Summary:** Five domain skills have genuine domain-specific assertions but are currently prose-only advisories. Wire them as load-bearing checks invoked by their parent harness skill: `api-idempotency-keys` → `harness-api-design`; `owasp-injection-prevention`, `owasp-csrf-protection`, `owasp-rate-limiting` → `harness-security-scan`; `a11y-aria-patterns` → `harness-accessibility`. Each is roughly one week of work to convert from advisory prose to a mechanical check. Source: Pass 4 action 3.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#547

### Strip copy-paste Process boilerplate from library skills

- **Status:** blocked
- **Spec:** —
- **Summary:** 493 of 755 skills end with identical boilerplate: "1. Read the instructions and examples 2. Apply the patterns 3. Verify your implementation." This is the textbook shelf-ware tell — every skill ends with the same hand-waving three steps instead of an actual procedure. For skills that should remain as library reference (post-retire-decisions), strip the Process section so the catalog stops cosplaying as workflows. Skills are then honestly typed as either gear (procedural) or library (reference). Source: Pass 4 action 4.
- **Blockers:** Retire ~350 shelf-ware skills
- **Plan:** —
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#548

### Tier the catalog with first-class metadata and fix discovery

- **Status:** planned
- **Spec:** —
- **Summary:** Catalog has 755 skills with no tier markers in the user-facing surface. Mark Tier-0 (load-bearing gear, ~12 skills: initialize-project, strategy, brainstorming, planning, execution, verification, code-review, tdd, outcome-eval, audit-harness-strength, debugging, compound), Tier-1 (library, on-demand reference), Tier-2 (deprecated/candidate for retire). Surface tier prominently in the dashboard catalog view and the README. Fix the naming inconsistency: rename `initialize-harness-project` skill to `harness-initialize-project` so it sorts with the workflow gear (slash command stays `/harness:initialize-project`). A senior engineer can hold 12 skills in their head; they cannot hold 755. Source: Pass 2 #9, Pass 3 #6, Pass 3 #7.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#549

## v5.0 — Telemetry & Effectiveness

### Build harness:catalog-retrospective skill

- **Status:** planned
- **Spec:** —
- **Summary:** Monthly retrospective that reads `.harness/metrics/adoption.jsonl` (1319 records in dogfood across 80+ days, captures skill+session+startedAt+duration+outcome+phasesReached) and produces a structured report: top-10-most-invoked, top-10-failing, top-10-abandoned-mid-workflow, skills inactive 90+ days. Compounding-via-learning at the catalog grain — the loop the article calls Honnold's "internal harness" applied to the skill catalog. Feeds into catalog cleanup items below. Source: Pass 5 #6.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#536

### Extend skill-effectiveness scorer to skill grain (not just personas)

- **Status:** blocked
- **Spec:** —
- **Summary:** `packages/intelligence/src/effectiveness/scorer.ts` currently scores personas using graph-attributed `execution_outcome` nodes. Extend the same Bayesian approach to score skills using `.harness/metrics/adoption.jsonl` data (skill+outcome+duration+phasesReached). Identify failing skills and skills abandoned mid-workflow. Feed into `harness:catalog-retrospective`. Closes the gap: the project has 1319 adoption records but no loop that uses them to improve the catalog. Source: Pass 5 #4.
- **Blockers:** Build harness:catalog-retrospective skill
- **Plan:** —
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#550

### Activate the skill-proposal pipeline in dogfood

- **Status:** planned
- **Spec:** —
- **Summary:** The skill-proposal infrastructure exists in full (`packages/orchestrator/src/proposals/`, `packages/core/src/proposals/`, `packages/cli/src/commands/proposals.ts`, ADR 0016 defining the workflow). The README markets it: "agents emit skill candidates that route through soundness gate." But `.harness/proposals/` is EMPTY in the dogfood repo — the loop the project advertises isn't observably running. Investigate why (emission disabled? soundness gate filtering all? proposals deleted?) and either fix or document. Without active proposals, the "learning catalog" claim is theoretical. Source: Pass 5 #5.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#551

### Add Holiday Confidence KPI to STRATEGY.md

- **Status:** planned
- **Spec:** —
- **Summary:** `STRATEGY.md:23-29` defines 5 KPIs (Agent Autonomy, Harness Coverage, Context Density, Drift Floor, External Adoption) — all measure inputs to the harness, none measures what the harness is FOR. Add KPI #6: "Holiday Confidence" — % of merged PRs in the last 30 days where (a) multi-persona review fired, (b) outcome-eval passed, (c) no auto-baseline-update occurred, (d) no signal exceeded threshold. The article's binary "if the senior disappears for two weeks, what holds?" made measurable. Source: Pass 1 #9.
- **Blockers:** Build harness:outcome-eval skill, Ship the 5-signal dashboard panel and signals.md doc
- **Plan:** —
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#552

### Ship aggregate-telemetry synthesis surface

- **Status:** planned
- **Spec:** —
- **Summary:** `packages/cli/src/hooks/telemetry-reporter.js` collects rich payload (skillName, duration, outcome, phasesReached, project, team, os, harnessVersion, installId) and streams to PostHog. **No public surface synthesizes this data back.** `core-library-design/proposal.md:1338` planned "Case studies and testimonials" but never delivered. Adopters cannot validate "is this working for teams like mine?" Ship: (a) public adoption dashboard at a known URL aggregating skillName/outcome/phasesReached across the adopter base (anonymized), (b) `docs/case-studies/` directory with quarterly updates derived from telemetry + opt-in interviews, (c) README "Adopters" section with logo wall and headline stats updated by a `harness telemetry publish` script. For a tool that markets compounding-via-learning, the synthesis loop must close. Source: Pass 7-C.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#563

### Extend adoption.jsonl with failure-reason categorization

- **Status:** blocked
- **Spec:** —
- **Summary:** `.harness/metrics/adoption.jsonl` currently captures `outcome: completed|failed` — the WHAT without the WHY. 1319 dogfood records, none with structured failure categorization. Extend the schema: add `failureCategory` field with enum (`prerequisite-missing`, `gate-rejected`, `user-cancelled`, `timeout`, `agent-error`, `dependency-failure`, `inconclusive`). Emitted by skills at gate-result events. Without this, the catalog-retrospective skill and skill-effectiveness scorer (other milestone items) operate on `outcome=failed` as undifferentiated noise. The data layer for compounding-via-learning has to record the WHY, not just the WHAT. Source: Pass 7 final-pass synthesis (collection without synthesis pattern).
- **Blockers:** Build harness:catalog-retrospective skill, Extend skill-effectiveness scorer to skill grain
- **Plan:** —
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#564

## v5.0 — Trust & Security Model

### Move sentinel-pre/post to standard hook profile

- **Status:** planned
- **Spec:** —
- **Summary:** `packages/cli/src/hooks/profiles.ts:31-32` — `sentinel-pre` and `sentinel-post` (prompt-injection defense covering zero-width chars, RTL/LTR overrides, role-reassignment, permission-escalation, base64 exfiltration, destructive-bash in tainted sessions) currently ship at STRICT profile only. Default-profile adopters get NONE of this defense. Move to standard. Cost-tracker can remain strict-only as a separate concern. Source: Pass 6 #1.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P0
- **External-ID:** github:Intense-Visions/harness-engineering#556

### Pin MCP server version in plugin install + document trust model

- **Status:** planned
- **Spec:** —
- **Summary:** `.claude-plugin/plugin.json:14-16` — `mcpServers.harness.command: "npx -y -p @harness-engineering/cli@latest harness-mcp"`. Every Claude Code session pulls the latest npm publish (subject to npx's ~24h cache). No version pinning by default. A compromised publish propagates to every active adopter within a day. Pin to a specific version; update via plugin update flow. Add `docs/security/trust-model.md` explaining what an adopter trusts when installing each marketplace plugin and how to verify integrity. Source: Pass 6 #4 + #6.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#557

### Add per-skill capability declarations

- **Status:** planned
- **Spec:** —
- **Summary:** Skills are markdown files; the agent reads them and may take any action the user permitted Claude Code. No skill manifest declares "this skill needs Bash + Edit + WebFetch and nothing else." Add a `capabilities:` manifest field to skill.yaml declaring tool/network/file requirements. The orchestrator/agent enforces it as bounds. Closes the article's gear #4 ("bounded, observable, reversible") at the skill grain — currently it only applies at the orchestrator-workspace grain, and only when the daemon is running. Source: Pass 6 #5.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#558

### Strengthen telemetry consent surface

- **Status:** planned
- **Spec:** —
- **Summary:** `packages/cli/src/hooks/telemetry-reporter.js` prints first-run privacy notice to stderr. In IDE sessions stderr is often invisible — adopters technically opted in by installing the plugin but the consent surface is weak. Move the notice to stdout. Optionally add a `harness.config.json` `telemetry.consented: true` field that the adopter must set before first batch send. The PostHog ingest is real (1319 dogfood records over 80 days); the consent surface should match the data flow. Source: Pass 5 #3.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#559

### Add harness mcp list-capabilities CLI for adopter audit

- **Status:** planned
- **Spec:** —
- **Summary:** MCP server has 101 tool files (`packages/cli/src/mcp/tools/`). Per-tool `trustedOutput` flag exists but per-tool capability declarations don't. Adopters have no easy way to audit what their agent can do via MCP. Add `harness mcp list-capabilities --by-permission` CLI command that surfaces each tool's read/write/exec scope, network access, and trust tag. Source: Pass 6 #3.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#560

### Require ADR for operational policy changes

- **Status:** planned
- **Spec:** —
- **Summary:** ADRs in `docs/knowledge/decisions/` capture architectural decisions. Changes to hook profiles, threshold values, `--skip` lists, and baseline-update policies are also load-bearing — and they accumulate silently in commits without ADR-grade artifacts. Add a `harness:check-operational-drift` check (or extend the existing `harness:enforce-architecture`) that flags PRs touching `.husky/`, `harness.config.json` thresholds, the pre-commit `--skip` list, or `packages/cli/src/hooks/profiles.ts` without a corresponding ADR. Forces the "we silently softened a gate" decision to surface as a deliberate ADR-grade record. Closes the surface where Pass 1 #1 (pre-commit auto-baseline) entered the codebase without a documented decision in the first place. Source: Pass 7 final-pass synthesis.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#565

## v5.0 — Article-Framing Docs & Personas

### Invert README lede to lead with the article's binary question

- **Status:** planned
- **Spec:** —
- **Summary:** `README.md:7-19` opens with feature copy: "Mechanical constraints for AI agents. Ship faster without the chaos." Compare against what an article-aligned adopter weighs hardest. Rewrite the top 20% to lead with: "If your senior engineer goes on holiday for two weeks and your agents keep shipping — do you trust what comes out the other side? This tool is the gear list that makes the answer yes." Then walk through the 7 pieces and what the tool ships for each. Today the README sells features; article-readers buy outcomes. Source: Pass 2 #8, Pass 3 #9.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#553

### Adopt the article's framing in docs/standard/principles.md

- **Status:** planned
- **Spec:** —
- **Summary:** `docs/standard/principles.md` opens with "Context Engineering" — an internal abstraction, not a binary test. The article's framing question ("if the senior disappears for two weeks, what holds?") appears nowhere in public-facing docs. Add a Principle #0 (or lift it to the top): "The harness is load-bearing. It catches when no human is watching." Use the article's vocabulary (load-bearing, gear, holiday test) in principles so adopters get the framing they came for. Source: Pass 3 #3.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#554

### Document the article's failure-pattern checklist

- **Status:** planned
- **Spec:** —
- **Summary:** New `docs/standard/article-failure-patterns.md`. Name the article's five failure modes (theatre, gaps stopped naming, happy-path-only, no eval, no safe failure mode). For each, point at how `harness:audit-harness-strength` (new skill above) detects it in the adopter's own project. Provides the conceptual scaffolding for the self-audit tool. Source: Pass 1 #10.
- **Blockers:** Build harness:audit-harness-strength self-audit skill
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#555

### Ship agent-rehearsal fixtures and harness:rehearse skill

- **Status:** planned
- **Spec:** —
- **Summary:** The article's deepest insight: Honnold rehearsed the crux moves on a rope until his body knew them, THEN soloed. The project has no analog. `examples/` (hello-world, multi-tenant-api, slack-echo-bridge, task-api) are showcase scaffolds, not failure-scenario fixtures. Ship `templates/rehearsal-fixtures/` containing deliberately-broken scaffolds across common failure modes (race condition, partial migration, edge-case data corruption, dependency cycle, layer violation, leaked secret). Build `harness:rehearse` skill that runs an agent against a chosen fixture and scores recovery. Used to (a) train agent personas before production trust, (b) regression-test the harness's own gates against known failure shapes, (c) give adopters a way to verify their gates fire before betting the climb on them. Source: Pass 7-A.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#561

### Build harness:offboarding skill symmetric to onboarding

- **Status:** planned
- **Spec:** —
- **Summary:** `harness:onboarding` exists for arrivals. There is no symmetric `harness:offboarding` for departures. Article framing is the team-shrinkage scenario; the transition is the load test. Without an extraction flow, the social knowledge the departing engineer enforced informally is lost the day they leave. Build `harness:offboarding` that conducts a structured debrief (recent decisions made, undocumented gotchas, conventions held in head, areas of expertise, known fragile components), generates ADR drafts and knowledge graph entries from the answers, and reviews the AGENTS.md / STRATEGY.md / learnings.md surfaces against the answers to identify gaps. Output: a structured `docs/knowledge/handoff-{person}-{date}.md` file plus graph ingestion. Source: Pass 7-B.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#562

### Build harness-pm persona for eval suite and acceptance criteria ownership

- **Status:** planned
- **Spec:** —
- **Summary:** The companion article "AI Ate My Role" defines three surviving Project Manager lanes: Taste PM (product thesis), **Harness PM (eval suite design + acceptance criteria)**, Boundary PM (compliance). The project ships 15 personas — all engineering-shaped (code-reviewer, architecture-enforcer, security-reviewer, performance-guardian, planner, task-executor, etc.). **Zero PM-shaped personas exist.** Build `harness-pm` persona that owns: (a) reviewing every spec's acceptance criteria for observability/testability/completeness, (b) ensuring eval suite coverage matches the spec's user-visible behavior section, (c) catching specs that ship without measurable success criteria. Pairs with `harness:outcome-eval` (which produces the eval verdicts) to give that eval an organizational owner. The article: "Quality became something that happened _to_ the work, not something that lived _inside_ the work. The new role sits at parity with engineering, not downstream." Source: Pass 8 (AI Ate My Role + Anatomy companion articles).
- **Blockers:** Build harness:outcome-eval skill
- **Plan:** —
- **Assignee:** —
- **Priority:** P0
- **External-ID:** github:Intense-Visions/harness-engineering#566

### Ship golden-build reference-state primitive

- **Status:** planned
- **Spec:** —
- **Summary:** The "Anatomy of an AI-Native Org" companion article lists four required gear pieces: "specifications, evaluation suites, golden builds, and agent-review patterns." The project has the first, partial second, fourth — but no golden build primitive. The existing baselines (`coverage-baselines.json`, `benchmark-baselines.json`, arch baselines) are **metric baselines, not build baselines**. A golden build is the canonical known-good reference state (last passing main with a full eval pass) that all proposed changes are validated against — closer to an immutable release-tag concept than a metric snapshot. Ship: (a) `harness golden-build promote` command that snapshots a verified-passing state to `.harness/golden/`, (b) `harness golden-build verify` that compares the working tree against the most recent golden, (c) CI integration that auto-promotes a golden build on every green main merge, (d) `harness golden-build diff` for reviewing what's drifted since the last golden. Closes the gap between "metrics didn't regress" and "the project as a whole is still the project we trust." Source: Pass 8 (Anatomy of AI-Native Org companion article).
- **Blockers:** Build harness:outcome-eval skill
- **Plan:** —
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#567

### Reframe principles.md around Why/What/How three-layer model

- **Status:** planned
- **Spec:** —
- **Summary:** "The Anatomy of an AI-Native Org" companion article structures AI-native orgs as three enduring layers: Why (strategic conviction, small), What (taste/judgement, growing — the "dominant middle"), How (architecture/trust-systems/harnesses, shrinking). The project's artifacts already map cleanly: STRATEGY.md = Why, specs in docs/changes/ + ADRs = What, code + skills + ESLint plugin = How. But `docs/standard/principles.md` opens with "Context Engineering" — an internal abstraction — and the Why/What/How vocabulary appears nowhere in public-facing docs (only coincidental matches in developer-quickstart table headers). Reframe `principles.md` so principle #0 names the three layers, maps the project's artifacts onto them, and explains that the harness is what makes each layer reliable. Adopters reading the article series land on this doc and immediately see "I know this framework." Source: Pass 8 (Anatomy of AI-Native Org companion article).
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#568

### Build senior-engineer accountability surface for PR push

- **Status:** planned
- **Spec:** —
- **Summary:** "The Tests We Skipped" companion article: _"the person who writes the code is the person who pushes it to production. Full stop."_ In the agent-shipping flow, the agent writes; the senior engineer pushes (merges). The accountability does not transfer to the agent — it stays with the human who clicks merge. The project today does not produce a senior-facing "you are pushing X; here's what you should look at before approving" surface. Build: (a) `harness:pre-merge-brief` skill that produces a senior-facing digest on every PR with the diff summary, multi-persona review verdict, outcome-eval result (when available), signal-deltas, and a "things specifically worth your eyes" section, (b) GitHub Action that posts this as a PR comment, (c) optional gating that the merge button requires the senior to acknowledge the brief. Closes the "harness for the human too" mandate Ajey states explicitly. The same gear that protects the agent also protects the senior who's accountable. Source: Pass 8 (The Tests We Skipped companion article).
- **Blockers:** Build harness:outcome-eval skill, Ship the 5-signal dashboard panel and signals.md doc
- **Plan:** —
- **Assignee:** —
- **Priority:** P0
- **External-ID:** github:Intense-Visions/harness-engineering#569

### Build harness:apprenticeship for the new junior-engineer pathway

- **Status:** planned
- **Spec:** —
- **Summary:** "AI Ate My Role" companion article on Junior Engineers: _"We're going to lose a generation if we don't think harder about this."_ The apprenticeship pipeline — code-writing as the learning mechanism — is broken. The new path is reading-and-judging muscle, outcome ownership, mentorship on _why_ not syntax. The project has `harness:onboarding` (technical orientation: read AGENTS.md, harness.config.json, learnings.md, state.json) but it serves arrivals at any skill level. There is no skill specifically designed to develop the _new_ junior-engineer capability: judging agent-generated code, reviewing for taste and architectural fit, articulating _why_ a change is right or wrong without writing the replacement themselves. Build `harness:apprenticeship` that (a) presents agent-generated PRs as judgment exercises, (b) scores the junior's review against the multi-persona review verdict, (c) compounds learning into a personalized judgment-skills graph, (d) flags judgment patterns that need mentor input. Strategic bet: the projects that ship this pathway will be where the next generation of senior engineers actually develops. Source: Pass 8 (AI Ate My Role companion article).
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#570

## Craft Pipeline

### harness:craft-pipeline orchestrator

- **Status:** blocked
- **Spec:** —
- **Summary:** Initiative parent. Cross-domain LLM-judgment ceiling pipeline that composes domain-specific craft skills the same way harness:docs-pipeline composes documentation skills and harness:design-pipeline composes design skills. Each sub-project is a domain-specific ceiling-raiser to a rule-based floor counterpart. Pattern established by design-craft-elevator (design-pipeline sub-project #6, the prototype) and codified in ADRs 0018 (LLM-judgment skill pattern), 0019 (3-axis output model), 0020 (living-catalog H pattern), 0021 (detect-and-offer B' pattern). Sub-projects: #1 naming-craft (cross-cutting), #2 docs-craft, #3 test-craft, #4 code-craft, #5 copy-craft (errors + log lines + commit messages), #6 spec-craft, #7 api-craft, #8 cli-ergonomics, #9 knowledge-craft, #10 security-craft (judgment-based threat modeling). design-craft-elevator (design-pipeline #6) is a peer member by composition (kept in design-pipeline initiative for cohesion with the rest of the design family). Each sub-project ships its own catalog (rubrics + patterns + exemplars) and shares the LLM provider, finding schema, and growth infrastructure from ADRs 0018-0021. Orchestrator phases mirror docs-pipeline / design-pipeline: FRESHEN catalog freshness → JUDGE (run each craft skill) → SUGGEST (POLISH-equivalent across all skills) → BENCHMARK (against per-domain exemplars) → REPORT.
- **Blockers:** craft-pipeline sub-project #2: docs-craft, craft-pipeline sub-project #4: code-craft, craft-pipeline sub-project #7: api-craft, craft-pipeline sub-project #8: cli-ergonomics
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#374

### craft-pipeline sub-project #2: docs-craft

- **Status:** planned
- **Spec:** —
- **Summary:** LLM-judgment skill for documentation quality — the ceiling counterpart to harness-detect-doc-drift / harness-check-docs / harness-docs-pipeline (which enforce existence, link freshness, coverage). Ceiling questions: does this doc teach? does the order match the reader's mental model? are examples earning their place? is prose alive or bureaucratic? does the API doc predict the response shape? would a stranger walk away with the same understanding? Direct structural twin of design-craft-elevator — same B' progressive upgrade to a docs intent skill if no doc style guide exists, same 3-axis findings, same growth catalog. Exemplars include Stripe Docs, Vercel Academy, MDN, Linear docs, Tailwind docs. Follows ADRs 0018-0021. ~3-4 week build (catalog-heavy).
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#376

### craft-pipeline sub-project #4: code-craft

- **Status:** planned
- **Spec:** —
- **Summary:** LLM-judgment skill for code quality / readability — the ceiling counterpart to harness-entropy-cleaner (dead code, drift), harness-architecture-enforcer (boundaries, deps), complexity thresholds (cyclomatic, cognitive). Ceiling questions: is this code as simple as it could be? does this function tell a story? is this abstraction earned or premature? are these conditionals load-bearing or accidental? is there an obvious-in-retrospect simplification? does the code reveal intent? Possibly the largest-scope craft skill — touches every PR. Follows ADRs 0018-0021. Has overlap with #1 naming-craft (defers naming-specific findings) and #2 docs-craft (defers doc-comment findings). Exemplars: well-cited "good code" from notable codebases (Linear's, Stripe's open work, Vercel's, Anthropic's SDK code).
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#379

### craft-pipeline sub-project #7: api-craft

- **Status:** planned
- **Spec:** —
- **Summary:** LLM-judgment skill for API quality — the ceiling counterpart to harness-api-openapi-design and harness-api-webhook-design (knowledge skills, rule-based about format / OpenAPI compliance). Ceiling questions: is this endpoint at the right abstraction? is this HTTP verb honest? does the resource name belong in the URL or should it be a query param? would a stranger predict this response shape from the request? does this error code tell the consumer what to do? is this idempotency-honest? does the API shape match the domain or leak implementation details? Follows ADRs 0018-0021. Exemplars: Stripe API, Linear GraphQL API, GitHub REST v3, Resend API, Anthropic SDK.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#382

### craft-pipeline sub-project #8: cli-ergonomics

- **Status:** planned
- **Spec:** —
- **Summary:** LLM-judgment skill for CLI quality — for projects that ship CLIs (including harness itself). NO rule-based floor counterpart. Ceiling questions: does this CLI discover itself? are flag names consistent across subcommands? is help text earning its space or just listing flags? does the output respect the user's terminal (width, color, structure)? does the error path teach what to do next? would a power-user pipe this output to grep/awk and get useful results? would a beginner not piping anywhere understand what happened? Follows ADRs 0018-0021. Exemplars: gh, fly, rg, eza, fd, bun, Linear CLI, the Stripe CLI, mise.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#383

## Parallel Execution & State

### Append-Only Session Audit Trail

- **Status:** planned
- **Spec:** —
- **Summary:** Session-scoped append-only audit log capturing raw user input verbatim plus every approval prompt/response with ISO timestamps, written at the emit_interaction/state-write level. Compliance-grade provenance complementing .harness/state.json machine state. Session-scoped per the handoff-deprecation lesson. Adapted from AI-DLC's audit.md mandate. Adoption #2 from docs/research/aidlc-comparison-analysis.md [AIDLC-2]
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#580

### Event-Sourced State Model with Deterministic Reducer

- **Status:** planned
- **Spec:** —
- **Summary:** Replace harness's mutated .harness/state.json with an append-only event log + pure deterministic reducer + materialized snapshot, plus an explicit guarded state machine for autopilot/orchestrator task lanes (forced-transition rules, dependency guards, mandatory evidence to reach terminal states). Highest-leverage hardening of harness's weakest subsystem (state/provenance); subsumes and complements the Append-Only Session Audit Trail (#580). Modeled on Spec Kitty's status/{emit,store,reducer,transitions}.py. Adoption #1 from docs/research/spec-kitty-comparison-analysis.md [SPECKITTY-1]
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#598

### Live Work-in-Flight Kanban for Parallel/Autopilot Runs

- **Status:** done
- **Spec:** docs/changes/work-in-flight-kanban/proposal.md
- **Summary:** Add a live work-in-flight kanban to the harness dashboard fed by orchestrator/parallel-coordinator state: per-task lane, owning agent, worktree, blockers, and dependency edges — surfacing in-flight agent work rather than only retrospective health signals. Reuses the existing dashboard package and orchestrator state machine. Complements Dashboard v3: Team & Stakeholder Views (#124). Adapted from Spec Kitty's local kanban control plane. Adoption #2 from docs/research/spec-kitty-comparison-analysis.md [SPECKITTY-2]
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#599
- **Updated-At:** 2026-06-25T22:03:47.094Z

### Smart-Merge Engine for Parallel-Coordinator Integration

- **Status:** planned
- **Spec:** —
- **Summary:** Port a preflight -> conflict-forecast -> classify -> resolve -> resumable-merge-state pipeline into harness's worktree integration path, replacing the current basic git 3-way + cherry-pick. Predicts conflicts before merging and persists resumable state so an interrupted multi-agent integration can recover. Closes the integration bottleneck for parallel-coordinator execution. Adapted from Spec Kitty's merge/ smart-merge engine. Adoption #3 from docs/research/spec-kitty-comparison-analysis.md [SPECKITTY-3]
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#600

### Owned-Files Declaration in Plans/Tasks

- **Status:** planned
- **Spec:** —
- **Summary:** Add an owns:[paths] field to harness plan tasks declaring the source files each task owns, enabling cheap deterministic pre-execution conflict forecasting alongside the heavier graph-based independence check (check_task_independence). A near-free parallel-safety guardrail. Adapted from Spec Kitty's per-work-package owned-files frontmatter. Adoption #4 from docs/research/spec-kitty-comparison-analysis.md [SPECKITTY-4]
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#601

### ULID Identity for Sessions and Worktrees

- **Status:** planned
- **Spec:** —
- **Summary:** Adopt collision-free immutable ULID identity for harness sessions and worktree-isolated tasks, with human-friendly numbering assigned only at completion — fixing the worktree/branch/dashboard disambiguation problem that slug-prefix schemes collide on. Adapted from Spec Kitty's ULID mission identity (mission_id immutable, mission_number at merge). Adoption #6 from docs/research/spec-kitty-comparison-analysis.md [SPECKITTY-6]
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#603

### Orchestrator Gateway Policy Envelope and Subprocess Air-Gap

- **Status:** planned
- **Spec:** —
- **Summary:** Add a per-call PolicyMetadata envelope (approval mode, sandbox mode, network mode, dangerous-flags, agent family/version) and a zero-import subprocess boundary to the harness orchestrator gateway API (ADR 0011), validated on both ends for safe agent isolation and a full governance audit trail. Complements MCP server version pinning + trust model (#557). Adapted from Spec Kitty's orchestrator-api subprocess air-gap. Adoption #7 from docs/research/spec-kitty-comparison-analysis.md [SPECKITTY-7]
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#604

## Planning & Process

### Init design + roadmap polish follow-ups

- **Status:** planned
- **Spec:** docs/changes/init-design-roadmap-polish/proposal.md
- **Summary:** Carry-forward polish from init-design-roadmap-config: (S2) refresh proposal.md:146 stale Registrations bullet to reflect harness-roadmap skill invocation, (S3) add harness-roadmap to initialize-harness-project skill.yaml depends_on for symmetry with harness-design-system, plus FINAL-S1 helper extraction, FINAL-S2 'not sure' vocabulary homogenization, FINAL-S3 catalog-consistency test docstring clarification.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#257

### Diagnose pipeline node-path loss for domain inference

- **Status:** planned
- **Spec:** —
- **Summary:** Phase 6 verification of knowledge-domain-classifier showed SC#15 missed: real-repo unknown bucket went 7500 → 7553 instead of dropping to <100. Helper + wiring + config + integration test all pass; the gap is somewhere between KnowledgePipelineRunner.extract and KnowledgeStagingAggregator.generateGapReport — likely BusinessKnowledgeIngestor / DiagramParser / KnowledgeLinker creating business\_\* nodes without setting node.path. A 30-line diagnostic sampling business nodes post-extraction will localize it in minutes.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#259

### Skill Regression Evaluator

- **Status:** planned
- **Spec:** —
- **Summary:** Golden-fixture evaluation framework for skills: canonical inputs per major skill (brainstorming, planning, spec-craft), semantic scoring @k against golden baselines, token/duration tracking, CI gate on prompt/rule PRs. Adapted from AI-DLC's aidlc-evaluator — the one capability where AWS is categorically ahead. Adoption #1 from docs/research/aidlc-comparison-analysis.md [AIDLC-1]
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#579

### NFR Elicitation in Planning

- **Status:** planned
- **Spec:** —
- **Summary:** Explicit NFR-requirements step in harness-planning eliciting performance, security, scalability, and resilience targets whose outputs become verifiable plan tasks wired to existing perf baselines and security scan machinery — NFRs as proactive design inputs rather than reactive review findings. Adapted from AI-DLC's per-unit NFR requirements/design stages. Adoption #3 from docs/research/aidlc-comparison-analysis.md [AIDLC-3]
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#581

### Question-File Interview Mode

- **Status:** planned
- **Spec:** —
- **Summary:** File-based question/answer mode for strategy, pulse, and brainstorming interviews — durable, team-reviewable, async-friendly decision capture — plus a cross-answer contradiction-detection pass added to existing pushback rules. Adapted from AI-DLC's [Answer]: tag question-file ritual and mandatory ambiguity analysis. Adoption #4 from docs/research/aidlc-comparison-analysis.md [AIDLC-4]
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#582

### Opt-In Constraint Packs

- **Status:** planned
- **Spec:** —
- **Summary:** Opt-in gating for blocking constraint rule packs: lightweight opt-in prompt loaded up front, full rules lazy-loaded only on user consent, then enforced as blocking constraints with per-stage compliance summaries (compliant / non-compliant / N/A). Mapped onto harness security/resiliency rule sets. Adapted from AI-DLC's \*.opt-in.md extension pattern. Adoption #5 from docs/research/aidlc-comparison-analysis.md [AIDLC-5]
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#583

### Strategy Writing-Inputs Guides

- **Status:** planned
- **Spec:** —
- **Summary:** "Here's what a good input looks like" guides for the STRATEGY interview with full and minimal examples, greenfield and brownfield variants — lowering the quality bar's entry cost for new users. Adapted from AI-DLC's docs/writing-inputs vision and tech-env document guides. Adoption #6 from docs/research/aidlc-comparison-analysis.md [AIDLC-6]
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#584

### Auto-Triggered Retrospection with Applyable Proposals

- **Status:** planned
- **Spec:** —
- **Summary:** Fire harness:compound automatically at the session/phase terminus (rather than only on human invocation) and emit applyable synthesis proposals that can propagate to the knowledge graph or other in-flight work, not just written to docs/solutions/. Complements the harness:compound skill, harness:outcome-eval (#532), and harness:catalog-retrospective (#536). Adapted from Spec Kitty's retrospective_hook auto-trigger + applyable-proposal shape. Adoption #5 from docs/research/spec-kitty-comparison-analysis.md [SPECKITTY-5]
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#602

### Semantic-Vocabulary CI Gate

- **Status:** planned
- **Spec:** —
- **Summary:** Add a harness analog of Spec Kitty's test_no_legacy_terminology architectural test: a CI gate that fails when deprecated or renamed canonical terms reappear in skills/docs, protecting the glossary and naming-craft investment from vocabulary drift over time. Adapted from Spec Kitty's semantic-terminology architectural test. Adoption #8 from docs/research/spec-kitty-comparison-analysis.md [SPECKITTY-8]
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#605

## Dashboard & Visualization

### Dashboard v3: Team & Stakeholder Views

- **Status:** planned
- **Spec:** —
- **Summary:** Persistent hosting option, multi-project aggregation, and presentation polish for the harness dashboard targeting team reviews and stakeholder visibility
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#124

### Dashboard graph chart

- **Status:** planned
- **Spec:** —
- **Summary:** Implement a scalable visual charting component on the graph dashboard to derive and display insights from the underlying core graph structure.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#197

## Maintenance: Lint & Deps

### ESLint Rule: no-spread-in-variadic

- **Status:** planned
- **Spec:** —
- **Summary:** New ESLint rule to flag Math.min(...arr) and Math.max(...arr) patterns that throw RangeError when arrays exceed the JS engine call stack argument limit (~65K). 10 instances in codebase. Suggest reduce-based alternatives.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#220

### ESLint Rule: prefer-execfile-over-exec

- **Status:** planned
- **Spec:** —
- **Summary:** New ESLint rule to flag execSync/exec with string commands (shell invocation) and suggest execFileSync/execFile with array args (no shell). Reduces shell injection surface and avoids broken exit code handling with shell redirects. 15+ instances in codebase.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#222

### ESLint Rule: no-undefined-optional-assignment

- **Status:** planned
- **Spec:** —
- **Summary:** New ESLint rule to flag `{ optionalField: valueOrUndefined }` assignments that fail with `exactOptionalPropertyTypes`. 5 recurring gotchas in learnings. Suggest conditional spread `...(val !== undefined && { field: val })` instead.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#223

### ESLint Rule: no-hardcoded-test-count

- **Status:** planned
- **Spec:** —
- **Summary:** New ESLint rule to flag magic-number `toHaveLength(N)` assertions in test files where N matches a registry/array size. Fragile to additions — 2 recurring gotchas in learnings where tool count assertions broke on every new tool. Suggest dynamic `TOOL_DEFINITIONS.length` references.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#224

### Migrate to @google/genai SDK

- **Status:** planned
- **Spec:** —
- **Summary:** Migrate from deprecated @google/generative-ai@0.24.1 to @google/genai@2.x in packages/orchestrator and packages/intelligence; upstream has stopped publishing the old package
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#298

### Upgrade @hono/node-server to v2

- **Status:** planned
- **Spec:** —
- **Summary:** Major version bump from @hono/node-server@1.19.x to v2.x in packages/dashboard; audit breaking changes and relax pnpm.overrides "@hono/node-server" pin
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#299

## Knowledge Federation

### Cross-Project Knowledge Federation

- **Status:** blocked
- **Spec:** docs/changes/cross-project-knowledge-federation/proposal.md
- **Summary:** Decentralized knowledge sharing via package-native federation. PackageResolver interface for language-agnostic discovery. Four knowledge types (learnings, constraints, patterns, structural summaries) with visibility tags. Background sync via hooks + optional cron. [D2]
- **Blockers:** Needs 5+ active harness-managed projects for adoption density
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#88

## v1.0 Foundation

### Core Library Design & Modules

- **Status:** done
- **Spec:** docs/changes/core-library-design/proposal.md
- **Summary:** Core library architecture with validation, context engineering, architectural constraints, entropy management, and agent feedback modules
- **Blockers:** —
- **Plan:** docs/changes/framework-bootstrap/plans/2026-03-11-phase1-foundation-and-docs.md
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#2

### Module 1: Validation

- **Status:** done
- **Spec:** docs/changes/core-library-design/proposal.md
- **Summary:** Schema validation engine for harness configuration and project artifacts
- **Blockers:** —
- **Plan:** docs/changes/framework-bootstrap/plans/2026-03-11-module1-validation.md
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#3

### Module 2: Context Engineering

- **Status:** done
- **Spec:** docs/changes/core-library-implementation/proposal.md
- **Summary:** Context assembly and management for AI agent interactions
- **Blockers:** —
- **Plan:** docs/changes/framework-bootstrap/plans/2026-03-12-module2-context-engineering.md
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#4

### Module 3: Architectural Constraints

- **Status:** done
- **Spec:** docs/changes/architectural-constraints/proposal.md
- **Summary:** Layer boundary enforcement and dependency rule validation
- **Blockers:** —
- **Plan:** docs/changes/framework-bootstrap/plans/2026-03-12-module3-architectural-constraints.md
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#5

### Module 4: Entropy Management

- **Status:** done
- **Spec:** docs/changes/entropy-management/proposal.md
- **Summary:** Codebase entropy detection including dead code, drift, and pattern violations
- **Blockers:** —
- **Plan:** docs/changes/framework-bootstrap/plans/2026-03-12-module4-entropy-management.md
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#6

### Module 5: Agent Feedback

- **Status:** done
- **Spec:** docs/changes/agent-feedback/proposal.md
- **Summary:** Structured feedback loops between AI agents and harness validation
- **Blockers:** —
- **Plan:** docs/changes/agent-feedback/plans/2026-03-12-module5-agent-feedback.md
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#7

### CLI & Tooling

- **Status:** done
- **Spec:** docs/changes/cli-tooling/proposal.md
- **Summary:** CLI package for running harness commands and automation tooling
- **Blockers:** —
- **Plan:** docs/changes/framework-bootstrap/plans/2026-03-12-phase2-cli.md
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#8

### Agent Skills

- **Status:** done
- **Spec:** docs/changes/agent-skills/proposal.md
- **Summary:** Skill system enabling AI agents to execute structured workflows
- **Blockers:** —
- **Plan:** docs/changes/agent-skills/plans/2026-03-13-agent-skills.md
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#9

### ESLint Plugin

- **Status:** done
- **Spec:** docs/changes/eslint-plugin/proposal.md
- **Summary:** ESLint plugin for enforcing harness architectural constraints in code
- **Blockers:** —
- **Plan:** docs/changes/eslint-plugin/plans/2026-03-13-eslint-plugin.md
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#10

### Linter Generator

- **Status:** done
- **Spec:** docs/changes/linter-generator/proposal.md
- **Summary:** Dynamic linter configuration generation from harness project constraints
- **Blockers:** —
- **Plan:** docs/changes/linter-gen/plans/2026-03-13-linter-gen.md
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#11

### Framework-Inspired Enhancements

- **Status:** done
- **Spec:** docs/changes/framework-inspired-enhancements/proposal.md
- **Summary:** Enhancements drawn from competitor framework research (Spec Kit, BMAD, etc.)
- **Blockers:** —
- **Plan:** docs/changes/framework-inspired-enhancements/plans/2026-03-14-framework-inspired-enhancements.md
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#12

### Pattern Adoption

- **Status:** done
- **Spec:** docs/changes/pattern-adoption/proposal.md
- **Summary:** Adoption of proven patterns from framework research into harness core
- **Blockers:** —
- **Plan:** docs/changes/pattern-adoption/plans/2026-03-14-pattern-adoption.md
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#13

### Templates & Agents

- **Status:** done
- **Spec:** docs/changes/templates-and-agents/proposal.md
- **Summary:** Project templates and agent persona definitions for common workflows
- **Blockers:** —
- **Plan:** docs/changes/framework-bootstrap/plans/2026-03-14-phase3-templates-and-agents.md
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#14

### Rich Skill Format

- **Status:** done
- **Spec:** docs/changes/rich-skill-format/proposal.md
- **Summary:** Structured skill format with YAML metadata, phases, gates, and cognitive modes
- **Blockers:** —
- **Plan:** docs/changes/rich-skill-format/plans/2026-03-14-rich-skill-format.md
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#15

## v1.0 Distribution

### Examples & Documentation

- **Status:** done
- **Spec:** docs/changes/examples-and-docs/proposal.md
- **Summary:** Example projects and comprehensive documentation for onboarding
- **Blockers:** —
- **Plan:** docs/changes/examples-and-docs/plans/2026-03-15-examples-and-docs.md
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#16

### Framework Research Round 3

- **Status:** done
- **Spec:** docs/changes/framework-research-round-3/proposal.md
- **Summary:** Third round of competitive framework analysis driving final v1 enhancements
- **Blockers:** —
- **Plan:** docs/changes/framework-research-round-3/plans/2026-03-15-framework-research-round-3.md
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#17

### Research Roadmap Groups A-E

- **Status:** done
- **Spec:** docs/changes/research-roadmap/proposal.md
- **Summary:** Implementation of 20 prioritized research recommendations across 5 theme groups
- **Blockers:** —
- **Plan:** docs/changes/research-roadmap/plans/2026-03-16-group-a-review-system.md
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#18

### Release Readiness

- **Status:** done
- **Spec:** docs/changes/release-readiness-prep/proposal.md
- **Summary:** Audit and preparation for general consumption including packaging and docs
- **Blockers:** —
- **Plan:** docs/changes/release-readiness-prep/plans/2026-03-16-release-readiness.md
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#19

### MCP Setup & Documentation

- **Status:** done
- **Spec:** docs/changes/mcp-setup/proposal.md
- **Summary:** MCP server setup documentation and scaffolding for tool integration
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#20

### Slash Command Generation

- **Status:** done
- **Spec:** docs/changes/slash-command-generation/proposal.md
- **Summary:** Automatic slash command generation for Claude Code and Gemini CLI from skills
- **Blockers:** —
- **Plan:** docs/changes/slash-command-generation/plans/2026-03-16-slash-command-generation.md
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#21

### MCP Server Expansion

- **Status:** done
- **Spec:** docs/changes/mcp-server-expansion/proposal.md
- **Summary:** Expanding MCP server with additional harness tools and capabilities
- **Blockers:** —
- **Plan:** docs/changes/mcp-server-expansion/plans/2026-03-16-mcp-server-expansion.md
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#22

### Day-to-Day Workflow Tutorial

- **Status:** done
- **Spec:** docs/changes/day-to-day-workflow-tutorial/proposal.md
- **Summary:** Step-by-step tutorial for common developer workflows using harness
- **Blockers:** —
- **Plan:** docs/changes/day-to-day-workflow-tutorial/plans/2026-03-17-day-to-day-workflow-tutorial.md
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#23

### CLI Self-Update

- **Status:** done
- **Spec:** docs/changes/cli-self-update/proposal.md
- **Summary:** Self-update command for the harness CLI to pull latest versions
- **Blockers:** —
- **Plan:** docs/changes/cli-self-update/plans/2026-03-17-cli-self-update.md
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#24

## v2.0 Knowledge Graph & Personas

### Knowledge Graph System

- **Status:** done
- **Spec:** none
- **Summary:** 10-phase graph-based knowledge system replacing file-based context with structured relationships
- **Blockers:** —
- **Plan:** docs/changes/graph-context-system/plans/2026-03-18-graph-foundation-plan.md
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#25

### Project-Local Skill Discovery

- **Status:** done
- **Spec:** docs/changes/project-local-skill-discovery/proposal.md
- **Summary:** Automatic discovery and loading of project-specific skills from local directories
- **Blockers:** —
- **Plan:** docs/changes/project-local-skill-discovery/plans/2026-03-18-project-local-skill-discovery-plan.md
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#26

### Code Reviewer Persona

- **Status:** done
- **Spec:** docs/changes/code-reviewer-persona/proposal.md
- **Summary:** Specialized AI persona for multi-phase code review with conditional steps
- **Blockers:** —
- **Plan:** docs/changes/code-reviewer-persona/plans/2026-03-18-code-reviewer-persona-plan.md
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#27

### Executor Personas

- **Status:** done
- **Spec:** docs/changes/executor-personas/proposal.md
- **Summary:** Task executor and parallel coordinator personas for plan execution
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#28

### Agent Definition Generator

- **Status:** done
- **Spec:** docs/changes/agent-definition-generator/proposal.md
- **Summary:** Generates agent definitions for persona-based routing in Claude Code and Gemini CLI
- **Blockers:** —
- **Plan:** docs/changes/agent-definition-generator/plans/2026-03-18-agent-definition-generator-plan.md
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#29

## v2.0 Advanced Features

### Security: First-Class Concern

- **Status:** done
- **Spec:** docs/changes/security-first-class/proposal.md
- **Summary:** Elevating code security to a first-class harness concern with scanning, review, and enforcement
- **Blockers:** —
- **Plan:** docs/changes/security-first-class/plans/2026-03-19-security-scanner-core-plan.md
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#30

### State Streams

- **Status:** done
- **Spec:** docs/changes/state-streams/proposal.md
- **Summary:** Multi-session isolation for independent work items with scoped state management
- **Blockers:** —
- **Plan:** docs/changes/state-streams/plans/2026-03-19-state-streams-plan.md
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#31

### Performance Enforcement

- **Status:** done
- **Spec:** docs/changes/performance-enforcement/proposal.md
- **Summary:** Performance budgets, benchmark management, and regression detection
- **Blockers:** —
- **Plan:** docs/changes/performance-enforcement/plans/2026-03-19-performance-enforcement-part1-plan.md
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#32

### Health Analyst Security Integration

- **Status:** done
- **Spec:** docs/changes/health-analyst-security/proposal.md
- **Summary:** Integrating security scanning into the codebase health analyst workflow
- **Blockers:** —
- **Plan:** docs/changes/health-analyst-security/plans/2026-03-19-health-analyst-security-plan.md
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#33

### Autopilot

- **Status:** done
- **Spec:** docs/changes/autopilot/proposal.md
- **Summary:** Autonomous phase execution loop chaining planning, execution, verification, and review
- **Blockers:** —
- **Plan:** docs/changes/autopilot/plans/2026-03-19-autopilot-plan.md
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#34

### Release Readiness Skill

- **Status:** done
- **Spec:** docs/changes/release-readiness/proposal.md
- **Summary:** Skill for auditing npm release readiness with maintenance checks and auto-fixes
- **Blockers:** —
- **Plan:** docs/changes/release-readiness/plans/2026-03-19-release-readiness-skill.md
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#35

### Design System Skills

- **Status:** done
- **Spec:** docs/changes/design-system-skills/proposal.md
- **Summary:** Design token generation, palette selection, typography, and component generation skills
- **Blockers:** —
- **Plan:** docs/changes/design-system-skills/plans/2026-03-19-design-system-phase1-shared-foundation-plan.md
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#36

### Autopilot Session Scoping

- **Status:** done
- **Spec:** docs/changes/autopilot-session-scoping/proposal.md
- **Summary:** Per-spec session directories for isolated autopilot state management
- **Blockers:** —
- **Plan:** docs/changes/autopilot-session-scoping/plans/2026-03-19-autopilot-session-scoping-phase1-skill-md-plan.md
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#37

### i18n & Localization Skills

- **Status:** done
- **Spec:** docs/changes/i18n-localization-skills/proposal.md
- **Summary:** Internationalization scanning, translation lifecycle management, and process injection
- **Blockers:** —
- **Plan:** docs/changes/i18n-localization-skills/plans/2026-03-20-i18n-core-skill-plan.md
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#38

### Spec & Plan Soundness Review

- **Status:** done
- **Spec:** docs/changes/spec-plan-soundness-review/proposal.md
- **Summary:** Deep soundness analysis of specs and plans with auto-fix and convergence loops
- **Blockers:** —
- **Plan:** docs/changes/spec-plan-soundness-review/plans/2026-03-20-autofix-convergence-plan.md
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#39

### Update Check Notification

- **Status:** done
- **Spec:** docs/changes/update-check-notification/proposal.md
- **Summary:** Version update checking with CLI notification and configuration options
- **Blockers:** —
- **Plan:** docs/changes/update-check-notification/plans/2026-03-20-update-checker-core-plan.md
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#40

## v2.0 Pipeline Unification

### Unified Code Review Pipeline

- **Status:** done
- **Spec:** docs/changes/unified-code-review-pipeline/proposal.md
- **Summary:** Multi-phase code review pipeline with mechanical checks, graph-scoped context, and parallel agents
- **Blockers:** —
- **Plan:** docs/changes/unified-code-review-pipeline/plans/2026-03-20-pipeline-skeleton-plan.md
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#41

### Detection & Remediation

- **Status:** done
- **Spec:** docs/changes/detection-remediation-dead-code-architecture/proposal.md
- **Summary:** Unified detection-to-remediation flow for dead code removal and architecture violation fixes
- **Blockers:** —
- **Plan:** docs/changes/detection-remediation-dead-code-architecture/plans/2026-03-21-detection-remediation-plan.md
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#42

### Development Loop Chaining

- **Status:** done
- **Spec:** docs/changes/development-loop-chaining/proposal.md
- **Summary:** Chaining development loops (brainstorm, plan, execute, review) into continuous workflows
- **Blockers:** —
- **Plan:** docs/changes/development-loop-chaining/plans/2026-03-21-development-loop-chaining-plan.md
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#43

### Graph Fallback Implementation

- **Status:** done
- **Spec:** docs/changes/graph-fallback-implementation/proposal.md
- **Summary:** Graceful degradation when graph database is unavailable with file-based fallbacks
- **Blockers:** —
- **Plan:** docs/changes/graph-fallback-implementation/plans/2026-03-21-graph-fallback-implementation-plan.md
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#44

### Interaction Surface Abstraction

- **Status:** done
- **Spec:** docs/changes/interaction-surface-abstraction/proposal.md
- **Summary:** Abstracting interaction surfaces to support Claude Code, Gemini CLI, and future platforms
- **Blockers:** —
- **Plan:** docs/changes/interaction-surface-abstraction/plans/2026-03-21-interaction-surface-abstraction-plan.md
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#45

### Performance Pipeline Unification

- **Status:** done
- **Spec:** docs/changes/performance-pipeline-unification/proposal.md
- **Summary:** Unifying performance checks into a single pipeline with budget enforcement
- **Blockers:** —
- **Plan:** docs/changes/performance-pipeline-unification/plans/2026-03-21-performance-pipeline-unification-plan.md
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#46

### Security Pipeline Unification

- **Status:** done
- **Spec:** docs/changes/security-pipeline-unification/proposal.md
- **Summary:** Unifying security scanning into a single pipeline with OWASP baseline
- **Blockers:** —
- **Plan:** docs/changes/security-pipeline-unification/plans/2026-03-21-security-pipeline-unification-plan.md
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#47

### Unified Documentation Pipeline

- **Status:** done
- **Spec:** docs/changes/unified-documentation-pipeline/proposal.md
- **Summary:** Automated documentation drift detection, coverage validation, and alignment
- **Blockers:** —
- **Plan:** docs/changes/unified-documentation-pipeline/plans/2026-03-21-unified-documentation-pipeline-plan.md
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#48

### Unified Project Roadmap

- **Status:** done
- **Spec:** docs/changes/unified-project-roadmap/proposal.md
- **Summary:** Roadmap management system with interactive creation, sync, and MCP integration
- **Blockers:** —
- **Plan:** docs/changes/unified-project-roadmap/plans/2026-03-21-roadmap-core-types-parser-plan.md
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#49

### Cross-Platform Enforcement

- **Status:** done
- **Spec:** docs/changes/cross-platform-enforcement/proposal.md
- **Summary:** Cross-platform support with ESLint rules, platform parity tests, and 3-OS CI matrix enforcement
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#50

### Agent Workflow Acceleration

- **Status:** done
- **Spec:** docs/changes/agent-workflow-acceleration/proposal.md
- **Summary:** Composite MCP tools, structured decision UX, and tool consolidation reducing agent round-trips from 10-15 to 3-5 calls
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#51

### Harness v2 Patterns

- **Status:** done
- **Spec:** docs/changes/harness-v2-patterns/proposal.md
- **Summary:** Design patterns and conventions for harness v2 architecture
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#52

## Hermes Adoption

### Hermes Phase 0: Gateway API + Telemetry

- **Status:** done
- **Spec:** docs/changes/hermes-phase-0-gateway-api/proposal.md
- **Summary:** Versioned external REST API on orchestrator with token-scoped auth and outbound webhook fanout; OpenTelemetry/Langfuse exporter for skill_invocation events; prompt-cache hit-rate analytics. Foundation for Phases 3, 4, and observability across all subsequent phases. From Hermes adoption meta-spec.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#310

### Hermes Phase 0.1: Reference Slack Bridge

- **Status:** done
- **Spec:** docs/changes/hermes-phase-0-gateway-api/proposal.md
- **Summary:** External test consumer `examples/slack-echo-bridge/` — ~150 LOC Node bridge that subscribes to `maintenance.completed` webhooks, verifies HMAC SHA-256 signatures, posts to Slack. Validates the Phase 0 API contract is usable from an external bridge author's perspective (anti-success #4). Deferred from Phase 0 to ship Phase 0 surface promptly.
- **Blockers:** —
- **Plan:** docs/changes/hermes-phase-0-gateway-api/plans/2026-05-15-phase-6-reference-slack-bridge-plan.md
- **Assignee:** —
- **Priority:** —
- **External-ID:** —

### Hermes Phase 0.2: Gateway Tunnel Guide

- **Status:** done
- **Spec:** docs/changes/hermes-phase-0-2-gateway-tunnel-guide/proposal.md
- **Summary:** `docs/guides/gateway-tunnel.md` covering Cloudflare Tunnel, Tailscale, and ngrok as canonical bridge-exposure patterns. Completes the parent spec §D5 "localhost-by-default + tunnel-pattern guide" decision (parent: docs/changes/hermes-phase-0-gateway-api/proposal.md). Slack echo bridge is the worked end-to-end example.
- **Blockers:** —
- **Plan:** docs/changes/hermes-phase-0-2-gateway-tunnel-guide/plans/2026-05-16-gateway-tunnel-guide-plan.md
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#328

### Hermes Phase 1: Session Search + Insights

- **Status:** done
- **Spec:** docs/changes/hermes-phase-1-session-search/proposal.md
- **Summary:** SQLite FTS5 index over .harness/sessions/ with auto-LLM summarization on session close; harness search CLI and dashboard search; harness insights aggregator composing entropy/decay/attention/impact/health views. Independent of Phase 0 — can run in parallel. From Hermes adoption meta-spec.
- **Blockers:** —
- **Plan:** docs/changes/hermes-phase-1-session-search/plans/2026-05-16-phase-1-foundation-plan.md
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#311

### Hermes Phase 2: Custom Maintenance Jobs

- **Status:** done
- **Spec:** docs/changes/hermes-phase-2-custom-jobs/proposal.md
- **Summary:** Extend MaintenanceScheduler beyond 21 built-in tasks: user-defined custom jobs with output persistence, context_from chaining, skill-content injection, origin tracking, arbitrary pre-check scripts. Plus pre-launch OSV malware guard on MCP/npx packages and expanded cleanup-sessions to general .harness disk hygiene. From Hermes adoption meta-spec.
- **Blockers:** —
- **Plan:** docs/changes/hermes-phase-2-custom-jobs/plans/2026-05-17-main-plan.md
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#312

### Hermes Phase 3: Multi-Sink Notifications

- **Status:** done
- **Spec:** docs/changes/hermes-phase-3-notifications/proposal.md
- **Summary:** Generalize CINotifier to NotificationSink interface with Slack-first concrete adapter; wrap_response envelope option for platform-shape delivery formatting; harden harness doctor with live pings, hook validity, baseline freshness, session corruption check. Requires Phase 0 webhook fanout. From Hermes adoption meta-spec.
- **Blockers:** —
- **Plan:** docs/changes/hermes-phase-3-notifications/plans/main.md
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#313

### Hermes Phase 4: Skill Proposal Loop

- **Status:** done
- **Spec:** docs/changes/hermes-adoption/proposal.md
- **Summary:** Agent-emitted skill proposals routed through review queue gated by harness:soundness-review; per-skill provenance (community/agent-proposed/user-authored) and usage telemetry; refinement deltas use same flow. Dashboard review queue page with approve/reject/edit actions. From Hermes adoption meta-spec.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#314
- **Updated-At:** 2026-05-18T11:28:52.297Z

### Hermes Phase 5: Dispatch Hardening

- **Status:** done
- **Spec:** docs/changes/hermes-phase-5-dispatch-hardening/proposal.md
- **Summary:** SSH agent dispatch backend, serverless backend interface (Modal-style not Modal-coupled), isolation tier as fourth axis on BackendRouter (local/container/remote-sandbox), per-task cost ceiling with abort-on-exceed. Cost ceiling requires Phase 0 telemetry. From Hermes adoption meta-spec.
- **Blockers:** —
- **Plan:** docs/changes/hermes-phase-5-dispatch-hardening/plans/2026-05-16-main-plan.md
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#315

### Branch Naming Convention and Compliance Verification

- **Status:** done
- **Spec:** docs/changes/branch-naming-convention/proposal.md
- **Summary:** Standardize branch naming prefixes (feat/, fix/, etc.) and kebab-case slugs. Implement harness verify command and @harness-engineering/core validation logic.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#329

## v3.0 Graph Intelligence

### Graph Anomaly Detection

- **Status:** done
- **Spec:** docs/architecture/framework-gaps-assessment/ADR-001.md
- **Summary:** Z-score outlier detection over complexity, coupling, fanIn/fanOut metrics plus articulation point identification via knowledge graph. New MCP tool: detect_anomalies. [C15]
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#69

### Automatic Task Independence Detection

- **Status:** done
- **Spec:** docs/changes/task-independence-detection/proposal.md
- **Summary:** Pairwise file-overlap, import-chain, and call-graph reachability analysis to verify parallel tasks won't conflict. New MCP tool: check_task_independence. [F5]
- **Blockers:** —
- **Plan:** docs/changes/task-independence-detection/plans/2026-03-23-phase1-core-analyzer-plan.md
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#70

### Conflict Prediction

- **Status:** done
- **Spec:** docs/changes/conflict-prediction/proposal.md
- **Summary:** Returns conflict matrix with reasoning before parallel agent dispatch. Integrates into harness-parallel-agents skill. [F9]
- **Blockers:** —
- **Plan:** docs/changes/conflict-prediction/plans/2026-03-23-conflict-predictor-core-plan.md, docs/changes/conflict-prediction/plans/2026-03-23-conflict-predictor-tests-plan.md, docs/changes/conflict-prediction/plans/2026-03-23-conflict-predictor-integration-plan.md
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#71

### Natural Language Graph Queries

- **Status:** done
- **Spec:** docs/changes/natural-language-graph-queries/proposal.md
- **Summary:** English-to-ContextQL translation via scored multi-signal classifier enabling conversational codebase exploration. Ask 'what breaks if I change auth?' and get graph-backed answers with NL summaries. New MCP tool: ask_graph. No external LLM dependency — works on both Claude Code and Gemini CLI. [K7]
- **Blockers:** —
- **Plan:** docs/changes/natural-language-graph-queries/plans/2026-03-23-nlq-\*.md
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#72

### Architecture Assertion Framework

- **Status:** done
- **Spec:** docs/changes/architecture-assertion-framework/proposal.md
- **Summary:** Assertion library for structural testing — assert module size, coupling limits, complexity ceilings. Compare against baselines and fail CI on architectural regression. [L3]
- **Blockers:** —
- **Plan:** docs/changes/architecture-assertion-framework/plans/2026-03-23-arch-assertion-\*.md, docs/changes/architecture-assertion-framework/plans/2026-03-24-arch-assertion-integration-plan.md
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#73

### Pre-Commit Impact Preview

- **Status:** done
- **Spec:** docs/changes/pre-commit-impact-preview/proposal.md
- **Summary:** CLI command `harness impact-preview` showing blast radius of staged changes (affected files, tests, docs) with compact/detailed/per-file modes. Integrated into harness-pre-commit-review skill. [J6]
- **Blockers:** —
- **Plan:** docs/changes/pre-commit-impact-preview/plans/2026-03-23-impact-preview-cli-plan.md
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#74

### Constraint Deprecation Detection

- **Status:** done
- **Spec:** docs/changes/constraint-deprecation-detection/proposal.md
- **Summary:** First-class constraint rule nodes in the knowledge graph with lastViolatedAt timestamps, auto-populated from collectors via getRules(). New detect_stale_constraints MCP tool queries for constraints with no violations within a configurable window (default 30 days). [L2]
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#75

## v3.0 Viral Flywheel

### harness:blueprint — Automated Architectural Learning

- **Status:** done
- **Spec:** docs/changes/harness-blueprint/proposal.md
- **Summary:** Generates interactive, offline-first HTML blueprints/courses of a codebase. Uses the Knowledge Graph for pedagogical ordering, impact-aware exercises, and code-to-English translations.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#76

### Skill Marketplace

- **Status:** done
- **Spec:** docs/changes/skill-marketplace/proposal.md
- **Summary:** Community skill registry via @harness-skills/\* npm namespace. harness install/uninstall with dependency resolution, semver version ranges, bundled skill collision prevention. harness skill search with platform/trigger filters, harness skill create with README generation, harness skill publish with 6-check validation pipeline. Community skills integrate into slash command generation (project > community > global priority). [H1]
- **Blockers:** —
- **Plan:** docs/changes/skill-marketplace/plans/2026-03-24-skill-marketplace-install-plan.md
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#77

### Constraint Sharing

- **Status:** done
- **Spec:** docs/changes/constraint-sharing/proposal.md
- **Summary:** Export constraint subsets from harness.config.json as shareable bundles; import and merge with per-rule provenance tracking. [H3]
- **Blockers:** —
- **Plan:** docs/changes/constraint-sharing/plans/2026-03-24-constraint-sharing-types-plan.md
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#78

### Architecture Decay Timeline

- **Status:** done
- **Spec:** docs/changes/architecture-decay-timeline/proposal.md
- **Summary:** Time-series tracking of architectural health via standalone TimelineManager, category-level snapshots in `.harness/arch/timeline.json`, composite 0-100 stability score, CLI commands (`harness snapshot`), and `get_decay_trends` MCP tool. Weekly CI captures. [J1]
- **Blockers:** —
- **Plan:** docs/changes/architecture-decay-timeline/plans/2026-04-04-architecture-decay-timeline-phase1-plan.md
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#79

### Predictive Architecture Failure

- **Status:** done
- **Spec:** docs/changes/predictive-architecture-failure/proposal.md
- **Summary:** Extrapolate decay trends from timeline plus planned roadmap features to predict which constraints will break and when. Warns before architectural violations become reality. [J2]
- **Blockers:** Architecture Decay Timeline
- **Plan:** docs/changes/predictive-architecture-failure/plans/2026-04-04-predictive-failure-phase1-regression-math-plan.md
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#80

### Spec-to-Implementation Traceability

- **Status:** done
- **Spec:** docs/changes/spec-to-implementation-traceability/proposal.md
- **Summary:** Requirement-to-code-to-test mapping via knowledge graph — requirement nodes, requires/verified_by/tested_by edges, RequirementIngestor, coverage matrix CLI/MCP/CI, hybrid test linking with confidence signals. [E2]
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#81

### Skill Recommendation Engine

- **Status:** done
- **Spec:** docs/changes/skill-recommendation-engine/proposal.md
- **Summary:** Maps codebase characteristics (coupling score, test coverage, violation types, complexity distribution) to optimal skill sequences via decision-tree scoring. Recommends the right skills for the current codebase state. [D11]
- **Blockers:** —
- **Plan:** docs/changes/skill-recommendation-engine/plans/2026-04-04-skill-recommendation-engine-phase1-types-plan.md
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#82

### Intelligent Skill Dispatch

- **Status:** done
- **Spec:** docs/changes/intelligent-skill-dispatch/proposal.md
- **Summary:** Change-triggered automatic skill selection via extended recommendation engine signals. New `dispatch_skills` MCP tool with session-start auto-invocation, annotated skill sequences with parallel-safe flags. [L4]
- **Blockers:** Skill Recommendation Engine
- **Plan:** docs/changes/intelligent-skill-dispatch/plans/2026-04-06-intelligent-skill-dispatch-phase1-signal-type-foundation-plan.md
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#83

### Constraint Emergence from Patterns

- **Status:** done
- **Spec:** docs/architecture/framework-gaps-assessment/ADR-001.md
- **Summary:** Clusters recurring violations by pattern. When N similar violations appear in M weeks, suggests a new constraint rule. Learns architectural norms from team behavior rather than requiring hand-coded rules. [L1]
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#84
- **Updated-At:** 2026-04-18T00:44:19.169Z

### Cascading Failure Simulation

- **Status:** done
- **Spec:** docs/changes/cascading-failure-simulation/proposal.md
- **Summary:** Probabilistic BFS traversal with failure probability annotations synthesized from change frequency. New tool: compute_blast_radius. Shows transitive downstream impact with confidence scores — not just direct dependencies but the full cascade chain. [C9]
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#85

### Community Detection

- **Status:** done
- **Spec:** docs/architecture/framework-gaps-assessment/ADR-001.md
- **Summary:** Label propagation algorithm over import/call graph to auto-discover natural module boundaries. Validates or challenges existing layer definitions by revealing the actual clustering in the codebase. [C6]
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#86

### Knowledge Skills Category & Schema Enrichment

- **Status:** done
- **Spec:** docs/changes/knowledge-skills-schema-enrichment/proposal.md
- **Summary:** Add paths, related_skills, metadata fields to skill.yaml schema + progressive disclosure in SKILL.md. Add type: knowledge to skill type enum. Import 58 PatternsDev/skills (JS/React/Vue patterns) as seed knowledge catalog. Update dispatch engine for file-glob activation. ADR: docs/architecture/patternsdev-skills-adoption/ADR-001.md
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#122

## v3.0 Deep Intelligence

### Self-Improving Agent Skills

- **Status:** done
- **Spec:** docs/architecture/framework-gaps-assessment/ADR-001.md
- **Summary:** Outcome attribution mapping review findings to actual bugs via issue tracker. Skill effectiveness baselines (like perf baselines). Dynamic prompt injection into skill preamble based on historical outcomes. Skills measurably improve over time. [D4/D5]
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#87

### Spec-to-Code Semantic Verification

- **Status:** done
- **Spec:** docs/architecture/framework-gaps-assessment/ADR-001.md
- **Summary:** EARS grammar parser for machine-verifiable requirements. Test assertion semantic analysis via Claude API. Detects gaps between what the spec says and what the tests actually assert. Extends spec-to-implementation traceability with behavioral matching. [E1]
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#89

### Trust Scoring for Agent Output

- **Status:** done
- **Spec:** docs/architecture/framework-gaps-assessment/ADR-001.md
- **Summary:** Explicit confidence model per review finding: validation method (mechanical > graph > heuristic) x evidence quality x cross-agent agreement x historical accuracy. Every finding shows a visible confidence percentage for human triage. [E6]
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#90
- **Updated-At:** 2026-04-19T22:15:02.628Z

### Skill Effectiveness Tracking

- **Status:** done
- **Spec:** docs/architecture/framework-gaps-assessment/ADR-001.md
- **Summary:** Links review findings to actual bugs via git history and issue tracker. Builds effectiveness baselines per skill per task type. Feeds back into prompt selection. Quantifies which skills produce good outcomes and which need calibration. [D3/D9]
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#91

### Anti-Pattern Inference

- **Status:** done
- **Spec:** docs/architecture/framework-gaps-assessment/ADR-001.md
- **Summary:** Failure feature extraction and clustering to auto-discover constraints from project history. Identifies patterns like 'when files matching X are changed without updating Y, failures occur 80% of the time.' Learned constraints, not hand-coded ones. [D7]
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#92

### Architectural Debt Quantification

- **Status:** done
- **Spec:** docs/architecture/framework-gaps-assessment/ADR-001.md
- **Summary:** Cost model mapping violation types to developer-hours based on historical fix times. Compound interest calculation for deferred fixes. ROI scoring that translates abstract code quality into concrete dollar amounts. [J4]
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#93

### Developer Velocity Analysis

- **Status:** done
- **Spec:** docs/architecture/framework-gaps-assessment/ADR-001.md
- **Summary:** Git history temporal analysis, PR/review time integration, and friction zone identification. Identifies which codebase areas slow development most and quantifies the productivity gains from targeted refactoring. [K1]
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#94

### Multi-Language Support

- **Status:** done
- **Spec:** docs/architecture/framework-gaps-assessment/ADR-001.md
- **Summary:** Tree-sitter integration for Python, Go, Rust, and Java parsing. Language-agnostic constraint enforcement. Cross-language dependency tracking in knowledge graph. Same architectural rules apply regardless of implementation language. [B1/B6]
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#95

### Persistent Agent Specialization

- **Status:** done
- **Spec:** docs/architecture/framework-gaps-assessment/ADR-001.md
- **Summary:** Agent memory system tracking task-type performance over time. Specialization scoring and dynamic persona weighting. Agents develop expertise in specific codebase areas through accumulated experience. [F10]
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#96
- **Updated-At:** 2026-04-18T11:43:48.349Z

### Security Posture Timeline

- **Status:** done
- **Spec:** docs/architecture/framework-gaps-assessment/ADR-001.md
- **Summary:** Security metric snapshots over time with supply chain monitoring and vulnerability time-to-fix analysis. Tracks whether the codebase is getting more or less secure over months with trend attribution. [L6]
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#97

### Agent Effectiveness Introspection

- **Status:** done
- **Spec:** docs/architecture/framework-gaps-assessment/ADR-001.md
- **Summary:** Domain-specific accuracy tracking and blind spot detection with automatic persona switching triggers. Identifies where agents consistently fail and routes to better-suited personas automatically. [L7]
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#98

## v3.0 Supporting Work

### Community Infrastructure

- **Status:** done
- **Spec:** docs/architecture/framework-gaps-assessment/ADR-001.md
- **Summary:** Discord community server, built-with-harness showcase gallery, social media presence, educational content series, GitHub Sponsors/Open Collective, and contribution gamification with badges and milestones. [H2/H4-H8]
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#99

### Domain Skill Tiers & Catalog System

- **Status:** done
- **Spec:** docs/changes/domain-skill-tiers/proposal.md
- **Summary:** Three-tier skill loading (30 always-loaded slash commands, 43 catalog-only discoverable via search_skills, 6 dependency-only), intelligent dispatcher, and 30 new domain skills covering backend, infrastructure, reliability, auth, compliance, testing, soft domains, data engineering, ML/AI, and mobile. Cross-platform (Claude Code + Gemini CLI).
- **Blockers:** —
- **Plan:** docs/changes/domain-skill-tiers/plans/2026-03-27-tier-infrastructure-plan.md
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#100

### Platform Expansion

- **Status:** done
- **Spec:** docs/architecture/framework-gaps-assessment/ADR-001.md
- **Summary:** VS Code extension with sidebar and skill launcher, multi-CI recipes (GitLab, Jenkins, CircleCI, Azure DevOps), per-package config overrides for monorepos, and config inheritance chain (global to org to project to package). [B3/B7-B9]
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#101

## v4.0 Business Knowledge System

### Phase 1: Knowledge Foundation

- **Status:** done
- **Spec:** docs/architecture/business-knowledge-system/ADR-001.md
- **Summary:** Graph schema extensions (5 node types, 2 edge types), BusinessKnowledgeIngestor reading from docs/knowledge/, harness://business-knowledge MCP resource, gather_context integration, pilot authoring for 1-2 domains
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#225
- **Updated-At:** 2026-04-21T14:12:28.459Z

### Phase 2: Code Signal Extractors

- **Status:** done
- **Spec:** docs/changes/code-signal-extractors/proposal.md
- **Summary:** Test description extractor, enum/constant extractor, validation rule extractor, API path extractor writing to .harness/knowledge/extracted/
- **Blockers:** Phase 1: Knowledge Foundation
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#226
- **Updated-At:** 2026-04-23T02:04:58.806Z

### Phase 3: Connector Enhancement

- **Status:** done
- **Spec:** docs/changes/connector-enhancement/proposal.md
- **Summary:** Configurable truncation limits with tiered LLM summarization, Jira comments/custom fields/acceptance criteria, Confluence full content/hierarchy/labels, Slack thread structure/reactions, KnowledgeLinker post-processing pass
- **Blockers:** Phase 1: Knowledge Foundation
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#227
- **Updated-At:** 2026-04-23T17:38:57.275Z

### Phase 4: Knowledge Pipeline & Diagrams

- **Status:** done
- **Spec:** docs/architecture/business-knowledge-system/ADR-001.md
- **Summary:** /harness:knowledge-pipeline skill (4-phase convergence loop), diagram-as-code parser (Mermaid/D2/PlantUML), staging workflow, drift detection and gap reporting
- **Blockers:** —
- **Plan:** docs/changes/business-knowledge-foundation/plans/2026-04-23-phase-4-knowledge-pipeline-diagrams-plan.md
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#228
- **Updated-At:** 2026-04-24T02:10:03.701Z

### Phase 5: Visual & Advanced

- **Status:** done
- **Spec:** docs/architecture/business-knowledge-system/ADR-001.md
- **Summary:** Vision model analysis of image attachments, design tool API connectors (Figma, Miro), cross-source contradiction detection, knowledge coverage scoring per domain
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#229
- **Updated-At:** 2026-04-24T11:23:48.933Z

## Assignment History

| Feature                                                          | Assignee                      | Action     | Date       |
| ---------------------------------------------------------------- | ----------------------------- | ---------- | ---------- |
| Performance Engineering Knowledge Skills                         | @chadjw                       | assigned   | 2026-04-09 |
| Phase 2: Code Signal Extractors                                  | @chadjw                       | assigned   | 2026-04-23 |
| Phase 3: Connector Enhancement                                   | @chadjw                       | assigned   | 2026-04-22 |
| Phase 4: Knowledge Pipeline & Diagrams                           | @chadjw                       | assigned   | 2026-04-23 |
| Hermes Phase 0.1: Reference Slack Bridge                         | @cwarner                      | assigned   | 2026-05-15 |
| design-pipeline sub-project #2: audit-component-anatomy          | @chadjw                       | assigned   | 2026-05-23 |
| design-pipeline sub-project #0: brand-guidelines source-of-truth | @chadjw                       | assigned   | 2026-05-23 |
| design-pipeline sub-project #3: audit-brand-compliance           | @chadjw                       | assigned   | 2026-06-02 |
| Init design + roadmap polish follow-ups                          | @chadjw                       | assigned   | 2026-06-03 |
| Build harness:outcome-eval skill                                 | chad.warner@capillarytech.com | assigned   | 2026-06-22 |
| Build harness:audit-harness-strength self-audit skill            | chad.warner@capillarytech.com | assigned   | 2026-06-23 |
| Ship the 5-signal dashboard panel and signals.md doc             | chad.warner@capillarytech.com | assigned   | 2026-06-22 |
| Ship a required-review GitHub Action template                    | chad.warner@gmail.com         | assigned   | 2026-06-23 |
| Stop the pre-commit auto-baseline-update for arch                | chad.warner@gmail.com         | assigned   | 2026-06-23 |
| Add architecture thresholds to basic and intermediate templates  | chad.warner@gmail.com         | assigned   | 2026-06-23 |
| Add architecture thresholds to basic and intermediate templates  | @chadjw                       | assigned   | 2026-06-25 |
| Add architecture thresholds to basic and intermediate templates  | @chadjw                       | unassigned | 2026-06-25 |
