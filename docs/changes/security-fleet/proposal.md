# security-fleet — proactive vulnerability & supply-chain sweep

**Status:** Draft · **Tier:** Large · **Type:** rigid skill (orchestrator)
**Family:** `-fleet` (a quality-queue member that works alongside the core conveyor)
**Keywords:** fleet, orchestration, security, vulnerability, supply-chain, evidence-gated, reachability, advisory, owasp, cwe, trust-boundary, worktree, artifact-verification, batch-review

## Overview

A security backlog is the worst kind of attention slog. The signal is loud — a mechanical scanner emits dozens of findings, a dependency audit emits dozens more, a judgment-based critique emits dozens beyond that — and most of it is noise. Someone has to decide, per finding, whether the flagged sink is actually reachable, whether the advisory's affected code path is actually imported, whether the trust-boundary concern is real or theoretical. Then, for the survivors, decide whether this is a two-line fix or an auth-model redesign. Then fix, test, and ship them one at a time. The scanner is fast; the human triage in the middle is the bottleneck, and it is the step most often skipped — which is how a repo ends up with "40 vulnerabilities" on its default branch that nobody has read.

`security-fleet` is a **quality-queue** member of the `-fleet` family. It works alongside the core conveyor (`issue-fleet` intake → `adr-fleet` decide → `roadmap-fleet` build → `pr-fleet` land), sweeping the **security backlog of the standing codebase**: it enumerates risk-ranked code areas and the dependency graph, composes `harness-security-scan`, `harness-supply-chain-audit`, `security-craft`, and the OWASP/CWE security reviewer to produce candidate findings, **discards every finding that cannot produce concrete evidence**, then routes each survivor by a bounded-fix test — a safe bounded fix is built into a reviewable PR through the real build pipeline; a risky or structural finding is **filed as an issue carrying its evidence packet** rather than force-fixed inside a sweep.

Two things make it a distinct member rather than a re-skin of `roadmap-fleet`:

- **It is evidence-gated.** Security tooling's failure mode is not missing findings, it is drowning the reader in speculative ones. A candidate enters the batch only when it carries a **reachable sink**, an **exploitable path**, or an **advisory match on code that is actually used**. No evidence, no item — discarded, not "reported at low confidence."
- **Its terminal act is tiered.** Not every real finding should become a PR. A dependency bump or an input-validation patch is a bounded change a reviewer can check in a minute. An auth-model change or a trust-boundary redesign is a decision, not a patch — the fleet files it with the evidence and lets a human decide, because a sweep that quietly redesigns an auth model is more dangerous than the vulnerability.

### Goals

- Turn a noisy security backlog into a small batch of **evidence-backed** outcomes — reviewable fix PRs plus filed structural findings — with a single up-front human touchpoint (approve/trim the ranked queue, answer known forks, set concurrency).
- Make false-positive suppression a **mechanism, not a hope**: the evidence gate is a hard filter with named evidence classes, applied before an item ever costs a human a second of attention.
- Dogfood the real per-item security machinery (`harness-security-scan`, `harness-supply-chain-audit`, `security-craft`, the OWASP/CWE security reviewer) and the real build pipeline for fixes — never hand-patch a "fix" that only silences a scanner.
- Make each outcome's adherence auditable: every fix PR is independently verified to have run the real pipeline, to **clear the original evidence**, to introduce no new security finding, and to be CI-green across all platforms — never on a subagent's self-report.
- Keep the ship decision, and every structural security decision, with a human.

### Non-goals (YAGNI)

- Auto-merging any security PR — the family never-silent-merge invariant applies with extra force here.
- Fixing risky or structural findings inside the sweep (auth model, trust-boundary redesign, cryptographic scheme replacement) — those are **filed with evidence**, not patched autonomously.
- General correctness bugs — that is the general-bug domain. Overlap with a bug-shaped queue is resolved by **domain**: security-fleet owns security-specific machinery and the supply chain; a non-security correctness defect found incidentally is parked and handed off, never fixed here.
- Exploit development, live-system probing, or penetration testing against running systems — analysis is static plus advisory-based over the **standing codebase**. Producing a working exploit is explicitly out of scope.
- Reporting speculative "hardening opportunities" — a finding with no evidence class is discarded. A sweep that emits maybes is the problem it exists to solve.
- Auditing a single file or one dependency on request — that is `harness-security-scan` / `harness-supply-chain-audit` directly; a fleet's overhead only pays off across a backlog.
- Chasing a vulnerability-count-to-zero number — suppressing, ignore-listing, or advisory-muting a finding to lower a count is explicitly rejected.
- Deterministic workflow-engine execution — named as a future upgrade (per the fan-out ADR); v1 is model-driven fan-out.

### Assumptions

- **Runtime and tooling.** Node.js LTS with the harness CLI available; `gh` (authenticated) for PR and issue operations. Each is degraded-over, not required: a missing tool reduces the queue or the terminal act and is reported, never silently skipped.
- **Advisory data source.** Advisory matching uses whatever advisory database the project's package manager already exposes (the audit surface `harness-supply-chain-audit` already consumes). No new advisory provider is introduced, and no network dependency is added beyond what that skill already declares.
- **Ecosystem.** The dependency-graph half assumes a lockfile-based package manager; a project without one degrades to the code-side half of the queue only.
- **Issue destination.** FILE-tier findings go to the project's configured security-disclosure channel when one exists, otherwise the normal issue tracker. No exploit payloads and no secret values are ever included in a filed item, regardless of channel.
- **Single repository scope.** A sweep covers one repository's standing codebase; multi-repo sweeps are out of scope for v1.

## Decisions made

1. **Family-shared spine, cited from the documented contract — not re-extracted, not a code library.** `security-fleet` builds on the same five-phase spine (SELECT → CONFIRM → DISPATCH → VERIFY → terminal), concurrency governor (default 2, max ~3 — the machine-storm cap), artifact + all-OS-CI verification discipline, worktree fan-out with its `.claude/`-nested push-path caveat, and never-silent-merge invariant that the family captures once in `docs/reference/fleet-family.md`. The `SKILL.md` **cites** that reference and states only security-fleet's stage-specific parts; it does not restate the spine and does not introduce a physical shared library (skills are self-contained prose that must validate and run standalone in adopter projects). Rationale: this is the proven family pattern; a new member extends it at zero framework cost. _Evidence: `docs/reference/fleet-family.md`; `agents/skills/claude-code/cicd-fleet/SKILL.md`, `agents/skills/claude-code/test-fleet/SKILL.md` (both cite rather than restate)._

2. **The queue is two-sourced: risk-ranked code areas plus the dependency graph.** SELECT enumerates from both halves of the security surface and merges them into one ranked queue:
   - **Code side** — `harness-security-scan` (mechanical) and `security-craft` (LLM-judgment trust-boundary/least-authority critique) over the areas the graph ranks as highest-exposure (entry points, trust boundaries, critical paths), with the OWASP/CWE security reviewer supplying the finding taxonomy.
   - **Supply-chain side** — `harness-supply-chain-audit`'s 6-factor dependency risk evaluation plus advisory matching against the resolved dependency tree.

   Rationale: both composable halves already exist as skills; the graph supplies the exposure weighting that turns a flat finding list into a risk-ranked queue. _Evidence: `agents/skills/claude-code/harness-security-scan/skill.yaml`, `agents/skills/claude-code/harness-supply-chain-audit/skill.yaml` ("6-factor dependency risk evaluation"), `agents/skills/claude-code/security-craft/skill.yaml` ("AST-driven signal detection … conservative confidence defaults manage the FP risk inherent in judgment-based security")._

3. **The evidence gate is a hard filter with three named evidence classes.** A candidate enters the batch only if it carries at least one of:
   - **`reachable-sink`** — an untrusted source reaches a dangerous sink along a path that actually exists in the code (not "this function looks dangerous").
   - **`exploitable-path`** — a trust boundary is crossed without the control that boundary requires, with the crossing named concretely (which entry point, which missing control). "Exploitable" means the path is demonstrated in the code, **not** that a working exploit was built — building one is an explicit non-goal.
   - **`advisory-match`** — a resolved dependency version falls inside an advisory's affected range **and** the vulnerable API surface is actually reached from this codebase. A lockfile-only match on an unused code path is a **weaker** finding and must be labeled as such, never inflated.

   A candidate with no evidence class is **discarded** — not downgraded, not reported as low-confidence, not carried into CONFIRM as an FYI. Rationale: the failure mode of security tooling is volume, and a human who learns the queue contains maybes stops reading the queue. Making the gate a mechanism (named classes, applied pre-CONFIRM) is what makes the batch worth a human's attention. Discard counts are reported in aggregate so the gate itself stays auditable.

4. **Rank surviving findings by (severity × evidence strength × exposure), reusing roadmap-pilot-style impact scoring.** Do not rank ad-hoc and do not rank by scanner severity alone. A high-severity advisory on an unreached dev-only dependency ranks below a moderate reachable injection sink at a public entry point. Cross-check each finding against already-fixed/superseded state (an advisory already remediated on the default branch), in-flight security PRs, and existing open security issues — a duplicate is **flagged for closure or dropped, never re-filed**. Rationale: principled, reproducible ordering, and duplicate security issues are actively corrosive to a triage queue.

5. **The terminal act is tiered, and the tier is decided in SELECT and confirmed in CONFIRM — never chosen mid-flight.** Every surviving finding is routed by a bounded-fix test:
   - **FIX tier** — the remedy is safe, bounded, and mechanically verifiable: a dependency bump within a compatible range, an input-validation/encoding patch at identified call sites, removal of a hardcoded credential from source. Terminal act: a **reviewable PR** built through the real pipeline.
   - **FILE tier** — the remedy is risky or structural: an authentication/authorization model change, a trust-boundary redesign, a cryptographic scheme replacement, or any remedy whose blast radius crosses module boundaries or changes a security contract. Terminal act: a **filed issue carrying the full evidence packet** (evidence class, affected locations, advisory/CWE reference, why it is structural) and no code change.

   A subagent that discovers mid-flight that its FIX-tier item is actually structural **parks and re-tiers it to FILE** — it never grows the fix to fit. Rationale: an autonomous sweep that redesigns an auth model is a larger risk than the finding it is closing; tiering keeps the machinery on the changes a reviewer can actually check.

6. **The per-item pipeline for FIX tier is the real build pipeline plus a mandatory security review of the resulting diff.** DISPATCH fans out one worktree-isolated subagent per FIX-tier finding, briefed to: (a) **re-confirm the evidence reproduces in its own worktree** before changing anything — inherited evidence is not evidence; (b) run the **real** `harness-brainstorming` → `harness-autopilot` build pipeline to author the fix (this is what leaves the plan directory + autopilot-state that VERIFY requires); (c) where the finding is code-side, add a **regression test that fails before the fix and passes after** — the security analogue of a behavior-asserting test, and the only proof the vulnerability is closed rather than merely unscanned; (d) run the OWASP/CWE **security reviewer over its own diff** before pushing, so a fix that introduces a new weakness never reaches VERIFY. For an `advisory-match` dependency bump with no code-side sink, (c) degrades to the advisory clearing plus all-OS CI green (no behavior regression) — a bump has no call site to characterize. Rationale: dogfooding the real pipeline is the family invariant and the source of the verification artifact; the added regression-test and self-review steps are what distinguish a security fix from a scanner-silencing edit.

7. **The per-item pipeline for FILE tier is the evidence packet, not a build.** A FILE-tier item runs no build pipeline and opens no branch. Its work product is a filed issue containing the evidence class and its concrete trace, the affected locations, the advisory/CWE reference, the reason it is structural, and the options a human would need to decide between. It is filed through the project's configured security-disclosure channel when one exists, otherwise the normal issue tracker. Rationale: the value of a structural finding is the evidence, and the decision belongs to a human; a filed issue with no evidence is exactly the speculative flag the gate exists to reject.

8. **Verification is security-shaped: pipeline artifact + evidence cleared + no new findings + all-OS CI green.** For each returned FIX-tier item the orchestrator independently confirms — never by self-report — that (i) a plan directory under `docs/changes/<slug>/plans/` and an autopilot-state exist (the branch actually ran the real pipeline); (ii) the **original evidence no longer reproduces** on the branch (the sink is unreachable / the advisory is clear / the boundary control is present) — the security analogue of test-fleet's coverage delta; (iii) the fix introduces **no new security finding** (a re-scan of the branch is not worse than the base); and (iv) CI is green across **all** operating systems including the full test suite. FILE-tier items are verified differently: the issue exists, carries a named evidence class with its trace, and is not a duplicate of an existing open item. Rationale: this is the security analogue of the family's "verify by artifact, never self-report" discipline — and (ii) plus (iii) are what stop a "fix" that suppressed a rule or introduced a worse weakness from being reported as merge-ready.

9. **Secret findings are reported by location and type, never by value.** A leaked-credential finding's evidence _is_ the secret. It must never be echoed into a PR description, an issue body, a report row, or a commit message — the report names the file, the line, and the credential type, and states that rotation is a required human action the fleet does not perform. Rationale: a sweep that publishes the secrets it found has converted a contained leak into a broadcast one. This is member-specific machinery no other fleet member needs.

10. **Boundary vs the general-bug domain is resolved by domain, and crossings park.** security-fleet owns security-specific machinery and the supply chain. A general correctness defect discovered incidentally during a sweep is **parked and reported** for the build pipeline, not fixed inside the security sweep — and symmetrically, a security finding surfaced by a non-security sweep belongs here. Rationale: two fleets fixing the same file from different queues produce conflicting PRs; a clean domain split is what keeps their batches independent.

11. **Hard invariants (shared with the family, per `docs/reference/fleet-family.md`).** Dogfood the real per-item skills; verify adherence by artifact + all-OS CI green before any terminal action; a self-report is never verification; never silently merge. A `-fleet` fans out across many independent items into many outcomes for one batch review — distinct from a convergence _pipeline_ that loops on one target.

## Technical design

### Skill shape

A claude-code rigid skill at `agents/skills/claude-code/security-fleet/` (`SKILL.md` plus `skill.yaml`), orchestrator-tier (`tier: 2`), `cognitive_mode: systematic-orchestrator`, with a domain-specific `## Rationalizations to Reject`. Platform variants (codex, cursor, gemini-cli) are symlinks to the claude-code source, exactly as the merged siblings ship. The skill body carries **no** internal roadmap/PR/issue numbers (it runs in adopter projects) and cites the shared spine doc and the family ADRs by name/title, not by tracking number.

### The loop — five phases

1. **SELECT.** Enumerate the two-sourced queue (code-side scan + craft critique over graph-ranked high-exposure areas; supply-chain audit + advisory match over the resolved dependency tree). Apply the **evidence gate** — assign each candidate an evidence class (`reachable-sink` / `exploitable-path` / `advisory-match`) or discard it, keeping an aggregate discard count. Cross-check survivors against already-fixed/superseded state, in-flight security PRs, and existing open security issues. Assign each survivor a **tier** (FIX / FILE) via the bounded-fix test. Score and order by (severity × evidence strength × exposure) with roadmap-pilot-style impact scoring. Detect known decision forks.
2. **CONFIRM.** One round: the ranked queue with each item's evidence class and proposed tier, the aggregate count of evidence-gate discards, duplicates/superseded items flagged for drop or closure, known forks as multiple-choice questions with recommended defaults, and the proposed concurrency. The human approves/trims once, can re-tier an item, and answers the forks. Only guaranteed human touchpoint before review.
3. **DISPATCH.** FIX-tier items fan out to worktree-isolated subagents (capped at the governor) that re-confirm evidence, run the real `harness-brainstorming` → `harness-autopilot` pipeline, add a failing-before/passing-after regression test where the finding is code-side, self-review the diff with the OWASP/CWE reviewer, record an "assumptions made" note, and push a branch. FILE-tier items produce evidence packets, not branches. An item that proves structural mid-flight **re-tiers to FILE and parks**; any other unforeseen fork parks that one item. The batch continues.
4. **VERIFY.** For each FIX-tier branch, independently confirm plan artifact + autopilot-state, evidence cleared, no new security findings, and all-OS CI green. For each FILE-tier item, confirm the issue exists with a named evidence class and trace and is not a duplicate. Classify verified / rejected / retry.
5. **REPORT.** One row per item (finding, evidence class, tier, verdict, PR or issue link, assumptions, parked/re-tiered) plus the aggregate evidence-gate discard count, for bulk human review. Secrets reported by location and type only. Never merge.

### Key seams and data

- **`SecurityFinding`** record: `id`, `title`, `source` (`code-scan` | `craft-critique` | `supply-chain` | `advisory`), `evidenceClass` (`reachable-sink` | `exploitable-path` | `advisory-match`), `evidence` (the concrete trace — sink path, boundary crossing, or advisory id + affected range + usage site), `severity`, `cweOrAdvisory`, `exposure` (graph-derived), `score`, `tier` (`fix` | `file`), `crossCheck` (`novel` | `already-fixed` | `duplicate-issue` | `in-progress-elsewhere`), `locations`, and — after DISPATCH — `branch`, `regressionTest`, `evidenceCleared`, `assumptions`, `parkedForks`, `reTieredTo`.
- **Reuses:** `harness-security-scan` (mechanical code findings, SELECT + VERIFY re-scan); `harness-supply-chain-audit` (dependency risk + advisory matching); `security-craft` (trust-boundary / least-authority judgment critique); the OWASP/CWE security reviewer (finding taxonomy in SELECT, diff self-review in DISPATCH); the graph for exposure weighting; `roadmap-pilot`-style scoring for ordering; `harness-brainstorming` → `harness-autopilot` as the FIX-tier per-item pipeline; the subagent worktree-isolation primitive; `gh` for PR and issue operations.
- **Concurrency governor** at 2 (max ~3) — the shared machine-storm cap.
- **Push path:** subagents in a `.claude/`-nested worktree hit the pre-push `check-docs` self-exclusion caveat; they push via the GitHub API or a non-`.claude` worktree. Never `--no-verify`.

### Failure modes (EARS "unwanted" behaviors)

- If a scanner or the advisory source is unavailable, then the fleet shall build the queue from the remaining source, record the gap in CONFIRM and REPORT, and shall not present a partial queue as complete.
- If `gh` is unauthenticated, then the fleet shall run SELECT and CONFIRM, shall not open PRs or file issues, and shall report the queue with the blocked terminal act named.
- If a candidate's evidence cannot be reproduced in the subagent's own worktree, then that item shall be dropped as a false positive and reported as such — never fixed on inherited evidence.
- If a FIX-tier item proves structural mid-flight, then it shall re-tier to FILE and park; it shall not grow the fix to fit.
- If a fix clears the original evidence but introduces a new security finding, then the item shall be rejected, not reported as merge-ready.
- If a finding's only available remedy is a suppression, ignore rule, or advisory mute, then the item shall be re-tiered to FILE with that constraint stated; it shall never be closed by suppression.
- If a sweep discovers a non-security correctness defect, then the item shall park and be reported for the build pipeline rather than fixed inside the security sweep.

### File layout

`agents/skills/claude-code/security-fleet/{SKILL.md,skill.yaml}`; symlinked platform variants under `agents/skills/{codex,cursor,gemini-cli}/security-fleet`; regenerated plugin command files (`.claude-plugin/`, `.cursor-plugin/`, `.gemini-extension/`, `.antigravity-extension/`); a regenerated `docs/reference/skills-catalog.md`; a one-row addition to the members table in `docs/reference/fleet-family.md`. No new shared reference doc and no new ADR.

## Integration Points

- **Entry Points.** A new skill `security-fleet`, invocable as `/harness:security-fleet`, via the `run_skill` MCP tool, and via `harness skill run security-fleet`. No new MCP tool is required in v1 (it orchestrates existing skills/tools + `gh`).
- **Registrations Required.** Skill tier assignment in `skill.yaml`; platform-variant symlinks; plugin-artifact regeneration; `skills-catalog.md` regeneration.
- **Documentation Updates.** The skills catalog (regenerated). `docs/reference/fleet-family.md` — add the `security-fleet` row to the members table and name it among the quality-queue members in the conveyor sentence. No other doc changes.
- **Architectural Decisions.** **No new ADR.** security-fleet's family-level design is already fixed by the fan-out ADR (subagent worktree fan-out) and the interaction-model ADR (front-load / park-unforeseen), both cited by title, and by the documented family spine. Its stage-specific choices (evidence gate, tiered terminal, security-shaped verification, secret-handling rule) are member-local and are recorded here and in the SKILL.md rather than elevated to a family-committing ADR. **(Recorded as an assumption; see Assumptions in the PR.)**
- **Knowledge Impact.** Two patterns enter the knowledge graph: the **evidence-gated queue** (a finding without a named evidence class is discarded, not downgraded) and the **tiered terminal** (bounded fix → PR, structural → filed evidence packet), related to `harness-security-scan`, `harness-supply-chain-audit`, `security-craft`, and `roadmap-fleet`.

## Success Criteria

- Given a confirmed batch of N findings, the fleet produces up to N outcomes — FIX-tier PRs each independently verified for pipeline artifact, cleared evidence, no new findings, and all-OS-green CI; FILE-tier issues each carrying a named evidence class with its trace.
- **Every item in the batch carries a named evidence class**; candidates without one are discarded before CONFIRM and reported only as an aggregate count.
- There is **exactly one** up-front human decision round; no per-item interactive pauses except a genuinely-new fork or a mid-flight re-tier parked to its own item.
- **No structural remedy is applied autonomously** — an auth-model or trust-boundary change is filed with evidence, never patched inside the sweep.
- **Every FIX-tier PR carries an "assumptions made" note** and, where the finding is code-side, a regression test that fails before the fix.
- **No secret value appears** in any PR description, issue body, report row, or commit message — secrets are reported by location and type only.
- **No finding is closed by suppression** — adding an ignore rule, an advisory mute, or a scanner exclusion to clear an item is rejected.
- Duplicates and already-remediated findings are **dropped or closed with a citation**, never re-filed or re-fixed.
- The skill **never auto-merges** a security PR.
- It **degrades gracefully**: a missing scanner, unavailable advisory data, missing `gh` auth, or a single item's failed fix is reported while the batch continues.
- Concurrency never exceeds the confirmed governor (default 2, max ~3).
- No item is marked fixed on a subagent self-report — every verdict is backed by independently-checked evidence.
- `harness skill validate security-fleet` exits 0, and the whole-suite validation still exits 0.

## Implementation Order

1. **Foundation** — skill directory, `skill.yaml` (phases, deps, flags), SKILL heading + `## When to Use` + `## Flags`.
2. **SELECT + CONFIRM prose** — two-sourced enumeration, the evidence gate and its three classes, cross-check, tiering by the bounded-fix test, scoring, the single human gate.
3. **DISPATCH prose** — FIX-tier fan-out (re-confirm evidence → real build pipeline → regression test → OWASP/CWE self-review), FILE-tier evidence packets, mid-flight re-tiering, the secret-handling rule, concurrency and push-path caveats.
4. **VERIFY + REPORT prose** — security-shaped verification (artifact, evidence cleared, no new findings, all-OS CI), FILE-tier verification, the batch summary and discard count, never-merge.
5. **Discipline sections** — Harness Integration, Success Criteria, Gates, Escalation, Rationalizations to Reject, Red Flags, Examples, Test Scenarios.
6. **Registration + regeneration** — validate, symlinks, `fleet-family.md` members row, catalog and plugin regeneration, format sweep, changeset.
