---
project: harness-engineering
version: 1
created: 2026-03-21
updated: 2026-06-26
last_synced: 2026-06-23T18:05:08.357Z
last_manual_edit: 2026-06-27T12:51:51.967Z
---

# Roadmap

## Intake

## v5.0 — Enforcement Hardening

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

- **Status:** done
- **Spec:** docs/changes/sentinel-standard-profile/proposal.md
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

- **Status:** done
- **Spec:** docs/changes/harness-pm-persona/proposal.md
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

- **Status:** done
- **Spec:** docs/changes/senior-accountability-surface/proposal.md
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

### Wire outcome-eval into the lifecycle as an automatic spec-satisfaction gate

- **Status:** planned
- **Spec:** —
- **Summary:** outcome-eval is the harness's first blocking post-execution spec-satisfaction gate, but nothing invokes it automatically — verified 2026-06 it is absent from .husky/, .github/workflows/, AND the harness-autopilot VERIFY/INTEGRATE/REVIEW loop. Its blocking authority (high-confidence NOT_SATISFIED) only bites when a human or agent chooses to run /harness:outcome-eval or mcp**harness**outcome_eval. Wire it in: (a) call outcome_eval in harness-autopilot after REVIEW (post-execution, before PHASE_COMPLETE), gathering diff+testOutput from the session and halting on a blocking verdict; (b) add a pre-merge CI job (sibling to .github/workflows/required-review.yml) that runs it on PRs and surfaces the verdict, blocking only on high-confidence NOT_SATISFIED. This makes the #1-gap gate actually load-bearing and unblocks the assumptions baked into #569 (pre-merge-brief surfaces 'outcome-eval result when available'), #533 (post-merge rollback on failed eval), and #552 (Holiday Confidence KPI measures 'outcome-eval passed'). Recommended priority: P1.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#662

### Honor persona-declared triggers — emit and commit persona CI workflows and scheduled jobs

- **Status:** planned
- **Spec:** —
- **Summary:** Persona YAMLs (agents/personas/\*.yaml) declare on_pr/on_commit/scheduled(cron) triggers and outputs.ci-workflow: true, and a generator exists (packages/cli/src/persona/generators/ci-workflow.ts), but — verified 2026-06 — NO generated persona workflow is committed and nothing honors the triggers; they are dead declarations. Make them real: run the persona CI-workflow generator and commit the resulting .github/workflows/ so declared triggers actually fire, plus a check that fails when a persona's declared trigger has no committed workflow (drift guard, mirrors generate:plugin:check). First consumer: the new harness-pm persona (#566) auto-runs acceptance-eval on PRs touching docs/changes/\*\* — closing the manual-only gap for the upstream acceptance-criteria gate. Also lights up the currently-dormant declarations on codebase-health-analyst (dependency-health, hotspot-detector, cleanup-dead-code — weekly sweep), performance-guardian (perf), entropy-cleaner (cleanup), graph-maintainer, and security-reviewer (on_pr deep OWASP/threat-model review beyond CI's lightweight security-scan). Today the project's strongest gear is opt-in; this makes it load-bearing without a human remembering to invoke each persona. Recommended priority: P1.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#663

### Auto-wire standalone drift and audit pipelines on PRs

- **Status:** planned
- **Spec:** —
- **Summary:** Several high-value checks have no owning persona, so the persona-trigger work (above) does not cover them, and — verified 2026-06 — none runs automatically on PRs: detect-design-drift / design-pipeline (design-system drift), detect-doc-drift / docs-pipeline (doc drift; only a lightweight slice runs today inside the entropy check in harness.yml), supply-chain-audit (6-factor dependency risk), and test-advisor (test-strategy/coverage advice). Add PR-scoped CI jobs (path-filtered where sensible: design-drift on UI/token paths, supply-chain-audit on dependency-manifest changes, doc-drift on docs/source changes, test-advisor on test/source changes) that run these and surface findings, advisory-by-default with opt-in blocking. Note the agent-runtime constraint: the full LLM-judgment pipelines need an agent runner (the required-review.yml 'harness review-ci' pattern), not just the lightweight CLI validators GitHub Actions can run unaided. Recommended priority: P2.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#664

### Add pre-merge-brief acknowledgment merge gate

- **Status:** planned
- **Spec:** —
- **Summary:** Follow-up to the senior accountability surface (#569, D3): a hard merge gate requiring the senior to acknowledge the pre-merge brief. Needs an ack-observing webhook/bot and a branch-protection ruleset. Deferred from v1 (shipped non-blocking first, matching required-review's rollout). The brief it acks already exists once #569 ships.
- **Blockers:** Build senior-engineer accountability surface for PR push
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#731

### Graduate pre-merge-brief to adopter template + ruleset

- **Status:** planned
- **Spec:** —
- **Summary:** Follow-up to the senior accountability surface (#569, D5): ship the adopter-facing pre-merge-brief as a templates/ci/*.yml.hbs rendered by `harness init`, plus a ruleset for the eventual gate. Deferred so the brief's Markdown format bakes on dogfood PRs before adopters are locked in — mirrors how required-review graduated. Natural companion to fully extracting signal providers into shared core.
- **Blockers:** Build senior-engineer accountability surface for PR push
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#732

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

## v1.0 Distribution

## v2.0 Knowledge Graph & Personas

## v2.0 Advanced Features

## v2.0 Pipeline Unification

## Hermes Adoption

## v3.0 Graph Intelligence

## v3.0 Viral Flywheel

## v3.0 Deep Intelligence

## v3.0 Supporting Work

## v4.0 Business Knowledge System

## Assignment History
| Feature | Assignee | Action | Date |
|---------|----------|--------|------|
| Performance Engineering Knowledge Skills | @chadjw | assigned | 2026-04-09 |
| Phase 2: Code Signal Extractors | @chadjw | assigned | 2026-04-23 |
| Phase 3: Connector Enhancement | @chadjw | assigned | 2026-04-22 |
| Phase 4: Knowledge Pipeline & Diagrams | @chadjw | assigned | 2026-04-23 |
| Hermes Phase 0.1: Reference Slack Bridge | @cwarner | assigned | 2026-05-15 |
| design-pipeline sub-project #2: audit-component-anatomy | @chadjw | assigned | 2026-05-23 |
| design-pipeline sub-project #0: brand-guidelines source-of-truth | @chadjw | assigned | 2026-05-23 |
| design-pipeline sub-project #3: audit-brand-compliance | @chadjw | assigned | 2026-06-02 |
| Init design + roadmap polish follow-ups | @chadjw | assigned | 2026-06-03 |
| Build harness:outcome-eval skill | chad.warner@capillarytech.com | assigned | 2026-06-22 |
| Build harness:audit-harness-strength self-audit skill | chad.warner@capillarytech.com | assigned | 2026-06-23 |
| Ship the 5-signal dashboard panel and signals.md doc | chad.warner@capillarytech.com | assigned | 2026-06-22 |
| Ship a required-review GitHub Action template | chad.warner@gmail.com | assigned | 2026-06-23 |
| Stop the pre-commit auto-baseline-update for arch | chad.warner@gmail.com | assigned | 2026-06-23 |
| Add architecture thresholds to basic and intermediate templates | chad.warner@gmail.com | assigned | 2026-06-23 |
| Add architecture thresholds to basic and intermediate templates | @chadjw | assigned | 2026-06-25 |
| Add architecture thresholds to basic and intermediate templates | @chadjw | unassigned | 2026-06-25 |
