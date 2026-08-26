# Plan: security-fleet skill

**Date:** 2026-08-08 · **Spec:** `docs/changes/security-fleet/proposal.md` · **Tasks:** 16 · **Time:** ~75 min · **Integration Tier:** large

## Goal

Author the `security-fleet` claude-code rigid orchestrator skill (`SKILL.md` + `skill.yaml`) — a quality-queue member of the `-fleet` family — that turns a noisy security backlog into a small batch of **evidence-backed** outcomes through the five-phase SELECT → CONFIRM → DISPATCH → VERIFY → REPORT loop: a two-sourced queue (risk-ranked code areas + the dependency graph), a **hard evidence gate** with three named classes, a **tiered terminal act** (bounded fix → reviewable PR; structural finding → filed evidence packet), and security-shaped verification (pipeline artifact + evidence cleared + no new findings + all-OS CI green). Compose `harness-security-scan`, `harness-supply-chain-audit`, `security-craft`, and `harness-security-review`; cite the documented family spine (`docs/reference/fleet-family.md`) rather than restating it. No new shared reference doc, no new ADR.

## Observable Truths (Acceptance Criteria)

1. `node packages/cli/dist/bin/harness.js skill validate security-fleet` exits 0 (schema parses, `name` matches directory, all required behavioral + rigid sections present, capabilities consistent with `tools`), and the whole-suite `node packages/cli/dist/bin/harness.js skill validate` still exits 0.
2. `agents/skills/claude-code/security-fleet/SKILL.md` contains, in order: `# heading` + `> summary`, `## When to Use` (positive + negative bullets), `## Flags`, `## Process` with `### Iron Law` and five named phases (SELECT, CONFIRM, DISPATCH, VERIFY, REPORT), `## Harness Integration`, `## Success Criteria`, `## Gates`, `## Escalation`, `## Rationalizations to Reject`, `## Red Flags`, `## Examples`, `## Test Scenarios`.
3. The `## Rationalizations to Reject` section is domain-specific (7–9 rows, security-shaped: evidence gate, suppression, secret handling, structural remedies, self-report) — none of the universal filler rows.
4. The three evidence classes appear verbatim as named mechanisms in SELECT: `reachable-sink`, `exploitable-path`, `advisory-match`; and the SKILL states that a candidate with no class is **discarded**, with the discard count reported in aggregate.
5. The tiered terminal act is stated explicitly: FIX tier → reviewable PR built through the real `harness-brainstorming` → `harness-autopilot` pipeline; FILE tier → filed issue carrying the evidence packet and **no code change**; a mid-flight structural discovery **re-tiers to FILE and parks**.
6. The secret-handling rule is stated as a Gate: a secret's **value** never appears in a PR description, issue body, report row, or commit message — location and type only, with rotation named as a human action the fleet does not perform.
7. The SKILL.md and skill.yaml bodies contain **zero** internal roadmap/PR/issue numbers (they ship to adopter projects); the spine doc and the family ADRs are cited by name/title only. `agents/skills/tests/internal-refs.test.ts` passes.
8. `agents/skills/{codex,cursor,gemini-cli}/security-fleet` each resolve as symlinks to `../claude-code/security-fleet`; `agents/skills/tests/platform-parity.test.ts` passes.
9. The full skills suite passes from `agents/skills/`: `npx vitest run` → 10 test files passed (structure, schema, references, platform-parity, internal-refs, interaction-channel, …).
10. `docs/reference/fleet-family.md` lists `security-fleet` in the Members table **and** names it among the quality-queue members in the conveyor sentence.
11. `docs/reference/skills-catalog.md` is regenerated (never hand-edited) and contains a `### security-fleet` entry.
12. All five plugin targets report no drift: `node scripts/generate-plugin.mjs --target <claude|cursor|gemini|codex|antigravity> --check` each exit 0, with `security-fleet` command files present under `.claude-plugin/commands/`, `.cursor-plugin/commands/`, `.gemini-extension/commands/`, `.antigravity-extension/commands/`.
13. `npx prettier --check` reports no formatting diffs for every created/edited file.
14. `harness validate` exits 0 and the working tree contains no collateral changes — `git status --porcelain` lists only the files in the File Map.

## Uncertainties

- [ASSUMPTION] Platform skill-source dirs are exactly `codex`, `cursor`, `gemini-cli` (matches the merged siblings); `antigravity` is a plugin-generation target, not a skill-symlink source. Verified: `agents/skills/` contains only those four platform dirs.
- [ASSUMPTION] No new ADR. Family-level design is already fixed by the fan-out ADR (subagent worktree fan-out) and the interaction-model ADR (front-load / park-unforeseen), plus the documented spine; security-fleet's stage-specific choices (evidence gate, tiered terminal, security-shaped verification, secret handling) are member-local and recorded in the proposal + SKILL.md. This also avoids ADR-number collision with concurrent sibling members.
- [ASSUMPTION] `depends_on` is the five composed skills that exist in this tree: `harness-security-scan`, `harness-supply-chain-audit`, `security-craft`, `harness-security-review`, `harness-roadmap-pilot`. Verified present; `references.test.ts` enforces that every `depends_on` name resolves.
- [ASSUMPTION] The OWASP/CWE security reviewer referenced by the spec is `harness-security-review` ("Deep security audit with OWASP baseline and stack-adaptive analysis"). The OWASP knowledge skills (`owasp-*`) are the taxonomy library it draws on, not a dependency edge.
- [ASSUMPTION] `addresses` signals are `security-findings` (0.5) and `backlog-pressure` (0.2) — both already in use by shipped skills; the signal field is a free string, so no enum blocks this.
- [ASSUMPTION] `capabilities.network: false` even though the fleet drives `gh` and advisory data, because the capability envelope is **derived from the `tools:` list** (`Bash`, `Read`, `Glob`, `Grep`) and the validator fails on drift from that derivation. Every merged sibling declares `network: false` for the same reason.
- [ASSUMPTION] Flags mirror the family (`--concurrency`, `--report-only`, `--dry-run`). The spec does not enumerate flags; `--report-only` already covers "enumerate and rank without dispatching", so no member-specific flag is invented.
- [ASSUMPTION] `advisory-match` weakening (lockfile-only match on an unreached code path) is expressed as a **labeling rule inside the class**, not a fourth evidence class — the spec names exactly three classes.
- [DEFERRABLE] Exact per-phase prose wording and the example transcript's numbers — finalized during authoring; does not change task structure.
- [DEFERRABLE] Whether the `SecurityFinding` record is rendered as a fenced pseudo-record block (as test-fleet renders `CoverageTarget`) or a bullet list. Fenced block chosen for sibling parity; either passes every gate.

## File Map

- CREATE `agents/skills/claude-code/security-fleet/skill.yaml`
- CREATE `agents/skills/claude-code/security-fleet/SKILL.md`
- CREATE `agents/skills/codex/security-fleet` (symlink → `../claude-code/security-fleet`)
- CREATE `agents/skills/cursor/security-fleet` (symlink → `../claude-code/security-fleet`)
- CREATE `agents/skills/gemini-cli/security-fleet` (symlink → `../claude-code/security-fleet`)
- CREATE `.claude-plugin/commands/security-fleet.md` (generated)
- CREATE `.cursor-plugin/commands/security-fleet.md` (generated)
- CREATE `.gemini-extension/commands/security-fleet.toml` (generated)
- CREATE `.antigravity-extension/commands/security-fleet.toml` (generated, byte-identical to the gemini TOML)
- MODIFY `docs/reference/fleet-family.md` (Members-table row + conveyor sentence)
- MODIFY `docs/reference/skills-catalog.md` (REGENERATED — never hand-edit)

Nothing else. `git status --porcelain` at the end must list exactly these paths.

## Skeleton

1. **Foundation** — skill dir + `skill.yaml`; SKILL.md scaffold (h1, summary, framing, When to Use, Flags) (~2 tasks, ~9 min)
2. **Process spine** — Iron Law, phase diagram, phase table, spine-citation sentence (~1 task, ~5 min)
3. **SELECT + CONFIRM** — two-sourced queue, the evidence gate and its three classes, cross-check, bounded-fix tiering, scoring, `SecurityFinding` record; the single human gate (~2 tasks, ~11 min)
4. **DISPATCH** — FIX-tier fan-out (re-confirm evidence → real pipeline → regression test → OWASP/CWE self-review), FILE-tier evidence packets, mid-flight re-tiering, secret rule, concurrency + push-path (~1 task, ~6 min)
5. **VERIFY + REPORT** — four security-shaped checks, FILE-tier verification, batch table + discard count, never-merge, degrade (~1 task, ~6 min)
6. **Discipline sections** — Harness Integration, Success Criteria, Gates, Escalation, Rationalizations, Red Flags, Examples, Test Scenarios (~4 tasks, ~18 min)
7. **Registration + regeneration** — symlinks, CLI validate, `fleet-family.md`, plugin command files, catalog regen, final gate sweep + commit (~5 tasks, ~20 min)

**Estimated total:** 16 tasks, ~75 minutes.

---

## Tasks

> **Every command below is run from the worktree root** `/Users/cwarner/Projects/harness-engineering/.git-worktrees/security-fleet` unless the task says otherwise, under **Node 22** (`export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use 22`). `$SKILL` = `agents/skills/claude-code/security-fleet`.

### Task 1: Create the skill directory and `skill.yaml`

**Depends on:** none · **Files:** `agents/skills/claude-code/security-fleet/skill.yaml` · **Owns:** `agents/skills/claude-code/security-fleet/**`

1. `mkdir -p agents/skills/claude-code/security-fleet`
2. Write `agents/skills/claude-code/security-fleet/skill.yaml` exactly:

```yaml
name: security-fleet
version: '1.0.0'
description: Autonomous security backlog sweep — enumerate risk-ranked code areas plus the resolved dependency tree, discard every candidate that cannot produce concrete evidence, confirm one ranked batch with the human, then route each survivor by a bounded-fix test — safe bounded fixes are built through the real pipeline into independently verified PRs, risky or structural findings are filed with their evidence packet instead of force-fixed. Never auto-merges, never closes a finding by suppression, and never reports a secret's value.
stability: static
cognitive_mode: systematic-orchestrator
triggers:
  - manual
platforms:
  - claude-code
  - codex
  - cursor
  - gemini-cli
tools:
  - Bash
  - Read
  - Glob
  - Grep
cli:
  command: harness skill run security-fleet
  args:
    - name: path
      description: Project root path
      required: false
    - name: --concurrency
      description: 'Cap on concurrent fix subagents (default: 2, max recommended 3 — the machine-storm limit)'
      required: false
    - name: --report-only
      description: Enumerate, gate on evidence, tier, and present the ranked finding batch without dispatching fix subagents or filing issues
      required: false
    - name: --dry-run
      description: Run SELECT and CONFIRM only; do not fan out, verify, file, or report
      required: false
mcp:
  tool: run_skill
  input:
    skill: security-fleet
    path: string
type: rigid
tier: 2
phases:
  - name: select
    description: Enumerate the two-sourced queue — mechanical code scan plus judgment critique over graph-ranked high-exposure areas, and dependency risk plus advisory matching over the resolved tree — apply the evidence gate discarding every candidate without a named evidence class, cross-check survivors against already-fixed, in-flight, and already-filed state, assign a FIX or FILE tier by the bounded-fix test, and order by severity times evidence strength times exposure via roadmap-pilot impact scoring
    required: true
  - name: confirm
    description: Present the ranked finding batch in one round — each item with its evidence class and proposed tier, the aggregate evidence-gate discard count, duplicates and superseded items flagged for drop or closure, decision forks as questions, proposed concurrency — for a single up-front human approval that may also re-tier an item
    required: true
  - name: dispatch
    description: Fan out worktree-isolated subagents for FIX-tier findings that re-confirm the evidence in their own worktree, run the real brainstorming then autopilot pipeline, add a regression test that fails before the fix where the finding is code-side, and self-review their own diff with the OWASP and CWE security reviewer; FILE-tier findings produce evidence packets instead of branches, and any item that proves structural mid-flight re-tiers to FILE and parks
    required: true
  - name: verify
    description: Independently confirm each returned FIX-tier branch has a plan artifact plus autopilot-state, that the original evidence no longer reproduces, that the branch introduces no new security finding, and that CI is green across all OS; confirm each FILE-tier item exists with a named evidence class and trace and is not a duplicate — never by subagent self-report
    required: true
  - name: report
    description: Emit a one-row-per-item batch summary with evidence class, tier, verdict, PR or issue link, assumptions, and parked or re-tiered items, plus the aggregate evidence-gate discard count, reporting any secret by location and type only, and never merge
    required: true
state:
  persistent: false
  files: []
depends_on:
  - harness-security-scan
  - harness-supply-chain-audit
  - security-craft
  - harness-security-review
  - harness-roadmap-pilot
addresses:
  - signal: security-findings
    weight: 0.5
  - signal: backlog-pressure
    weight: 0.2
capabilities:
  tools:
    - Bash
    - Read
    - Glob
    - Grep
  network: false
  filesystem: read-write
```

3. **Verify (schema + dependency resolution, no SKILL.md required yet):**

```bash
cd agents/skills && npx vitest run tests/references.test.ts
```

Expected: 2 test files' worth of assertions pass — `security-fleet/skill.yaml conforms to schema` and `security-fleet/skill.yaml depends_on references existing skills`. If `Cannot find package 'glob'` appears, run the node_modules bootstrap in **Notes for the executor** first.

4. `npx prettier --check agents/skills/claude-code/security-fleet/skill.yaml`

---

### Task 2: SKILL.md scaffold — heading, summary, framing, `## When to Use`, `## Flags`

**Depends on:** Task 1 · **Files:** `agents/skills/claude-code/security-fleet/SKILL.md` · **Owns:** `agents/skills/claude-code/security-fleet/**`

1. Create `$SKILL/SKILL.md` starting with `# Security Fleet`, then a `>` blockquote summary (one paragraph, mirrors the `description` but reads as prose), then one framing paragraph that:
   - names the attention slog (a loud scanner + a noisy audit + a judgment critique, and human triage as the bottleneck);
   - states it is a **quality-queue** member working alongside the core conveyor (intake → decide → build → land);
   - names the two things that make it distinct: it is **evidence-gated**, and its **terminal act is tiered**;
   - closes by pointing at the shared spine: "The shared, stage-agnostic scaffolding it builds on is documented in the `-fleet` family spine reference (`docs/reference/fleet-family.md`)."
2. `## When to Use` — 4 positive bullets and 5 `NOT for …` bullets drawn from the spec's Non-goals:
   - NOT for auditing a single file or one dependency (invoke `harness-security-scan` / `harness-supply-chain-audit` directly);
   - NOT for general correctness bugs (domain split — park and hand off);
   - NOT for exploit development, live-system probing, or penetration testing;
   - NOT for reporting speculative hardening opportunities (no evidence class → discarded);
   - NOT for converging one module's security posture through repeated rounds — that is a pipeline, not a fleet.
3. `## Flags` — a three-row table for `--concurrency`, `--report-only`, `--dry-run`, worded to match `skill.yaml`.
4. **Verify:**

```bash
head -1 agents/skills/claude-code/security-fleet/SKILL.md | grep -qx '# Security Fleet' \
  && grep -qF '## When to Use' agents/skills/claude-code/security-fleet/SKILL.md \
  && grep -qF '## Flags' agents/skills/claude-code/security-fleet/SKILL.md \
  && grep -qF 'docs/reference/fleet-family.md' agents/skills/claude-code/security-fleet/SKILL.md \
  && echo OK
npx prettier --check agents/skills/claude-code/security-fleet/SKILL.md
```

---

### Task 3: `## Process` — Iron Law, phase diagram, phase table, spine citation

**Depends on:** Task 2 · **Files:** `agents/skills/claude-code/security-fleet/SKILL.md`

1. Append `## Process` then `### Iron Law`. The Iron Law is security-shaped and must assert both halves:
   > **A finding enters the batch only when it carries a named evidence class, and a fix PR is "merge-ready" only after independent confirmation that the original evidence no longer reproduces, that the branch introduces no new security finding, and that CI is green across all OS. The fleet never auto-merges, never closes a finding by suppression, and never accepts a subagent's self-report as proof.**
2. Follow with a short paragraph explaining why: security tooling's failure mode is volume, so the gate is a mechanism, not a hope; and "the sink is unreachable / the advisory is clear" is the only proof a vulnerability is closed rather than merely unscanned.
3. Add the ASCII phase diagram (copy the family spine's shape, terminal = REPORT).
4. Add the five-row phase table with columns `Phase | Purpose | Exit Condition`. Exit conditions:
   - SELECT → `Ranked SecurityFinding[]` with evidence classes, tiers, cross-check verdicts, detected forks, and an aggregate discard count
   - CONFIRM → Human-approved batch with answered forks, confirmed tiers, agreed concurrency
   - DISPATCH → Every confirmed item returned a branch, an evidence packet, parked, or re-tiered (all recorded)
   - VERIFY → Each item marked verified / rejected / retry
   - REPORT → Report delivered with discard count; nothing merged
5. Close the section with the citation sentence naming what is shared (five-phase spine, concurrency governor, artifact + all-OS-CI discipline, worktree fan-out with its push-path caveat, never-silent-merge) and what is stage-specific here (evidence-gated two-sourced queue, tiered terminal act, security-shaped verification, secret handling).
6. **Verify:**

```bash
grep -qF '### Iron Law' agents/skills/claude-code/security-fleet/SKILL.md \
  && grep -qF 'never accepts a subagent' agents/skills/claude-code/security-fleet/SKILL.md \
  && grep -c '^| ' agents/skills/claude-code/security-fleet/SKILL.md
npx prettier --check agents/skills/claude-code/security-fleet/SKILL.md
```

---

### Task 4: `### Phase 1: SELECT` — two-sourced queue, evidence gate, cross-check, tiering, scoring

**Depends on:** Task 3 · **Files:** `agents/skills/claude-code/security-fleet/SKILL.md`

Write six numbered steps:

1. **Enumerate from both halves.** Code side: `harness-security-scan` (mechanical) + `security-craft` (trust-boundary / least-authority judgment critique) over the areas the graph ranks as highest-exposure (entry points, trust boundaries, critical paths), with `harness-security-review` supplying the OWASP/CWE finding taxonomy. Supply-chain side: `harness-supply-chain-audit`'s 6-factor dependency risk evaluation + advisory matching over the **resolved** dependency tree. A missing scanner or unavailable advisory source degrades to the remaining half and is **recorded**, never presented as a complete queue.
2. **Apply the evidence gate — a hard filter.** Assign exactly one of three named classes or discard:
   - `reachable-sink` — an untrusted source reaches a dangerous sink along a path that actually exists in the code (not "this function looks dangerous").
   - `exploitable-path` — a trust boundary is crossed without the control that boundary requires, with the crossing named concretely (which entry point, which missing control). "Exploitable" means demonstrated **in the code**; building a working exploit is an explicit non-goal.
   - `advisory-match` — a resolved dependency version falls inside an advisory's affected range **and** the vulnerable API surface is actually reached from this codebase. A lockfile-only match on an unused path is a **weaker** finding and must be labeled as such, never inflated.

   A candidate with no class is **discarded** — not downgraded, not carried as an FYI. Keep an **aggregate discard count** so the gate itself stays auditable.

3. **Cross-check survivors** against already-fixed/superseded state on the default branch, in-flight security PRs, and existing open security issues. A duplicate is **flagged for closure or dropped, never re-filed**.
4. **Tier by the bounded-fix test.** FIX = safe, bounded, mechanically verifiable (dependency bump within a compatible range, input-validation/encoding patch at identified call sites, removal of a hardcoded credential from source). FILE = risky or structural (authn/authz model change, trust-boundary redesign, cryptographic scheme replacement, or any remedy whose blast radius crosses module boundaries or changes a security contract). The tier is decided here and confirmed in CONFIRM — **never chosen mid-flight**.
5. **Score and order** by **severity × evidence strength × exposure** using `harness-roadmap-pilot`-style impact scoring. State the worked comparison: a high-severity advisory on an unreached dev-only dependency ranks **below** a moderate reachable injection sink at a public entry point.
6. **Build the `SecurityFinding` record** as a fenced pseudo-record block with the fields from the spec: `id`, `title`, `source`, `evidenceClass`, `evidence`, `severity`, `cweOrAdvisory`, `exposure`, `score`, `tier`, `crossCheck`, `locations` (+ post-DISPATCH `branch`, `regressionTest`, `evidenceCleared`, `assumptions`, `parkedForks`, `reTieredTo`). Detect known decision forks here; do not answer them.

**Verify:**

```bash
F=agents/skills/claude-code/security-fleet/SKILL.md
for s in '### Phase 1: SELECT' 'reachable-sink' 'exploitable-path' 'advisory-match' 'SecurityFinding' 'discarded'; do
  grep -qF "$s" "$F" || echo "MISSING: $s"
done; echo checked
npx prettier --check "$F"
```

---

### Task 5: `### Phase 2: CONFIRM` — the single up-front human gate

**Depends on:** Task 4 · **Files:** `agents/skills/claude-code/security-fleet/SKILL.md`

1. Heading: `### Phase 2: CONFIRM — The Single Up-Front Human Gate` followed by `` `[checkpoint:human-verify]` ``.
2. Step 1 — present in one surface: the ranked findings with evidence class, score, and **proposed tier**; the **aggregate evidence-gate discard count**; duplicates/superseded items flagged for drop or closure; each known fork as a multiple-choice question with a recommended default; the **proposed concurrency** (default 2, capped ~3).
3. Step 2 — the human approves or trims **once**, may **re-tier** an item (FIX ↔ FILE), and answers the forks. Answered forks feed each item's DISPATCH brief.
4. Step 3 — from here it is autonomous; the only thing that re-surfaces before REPORT is an unforeseen fork or a mid-flight re-tier, which parks a single item without blocking the batch. `--dry-run` stops at the end of this phase.
5. Add the degraded-`gh` note: if `gh` is unauthenticated the fleet still runs SELECT and CONFIRM, opens no PRs and files no issues, and reports the queue with the blocked terminal act named.
6. **Verify:**

```bash
F=agents/skills/claude-code/security-fleet/SKILL.md
grep -qF '### Phase 2: CONFIRM' "$F" && grep -qF '[checkpoint:human-verify]' "$F" \
  && grep -qF 're-tier' "$F" && echo OK
npx prettier --check "$F"
```

---

### Task 6: `### Phase 3: DISPATCH` — tiered fan-out, secret rule, governor, push path

**Depends on:** Task 5 · **Files:** `agents/skills/claude-code/security-fleet/SKILL.md`

Write seven numbered steps:

1. **FIX-tier: one worktree-isolated subagent per finding**, briefed to run, in order: (a) **re-confirm the evidence reproduces in its own worktree before changing anything** — inherited evidence is not evidence; (b) the **real** `harness-brainstorming` → `harness-autopilot` build pipeline (this is what leaves the plan directory + autopilot-state VERIFY requires); (c) a **regression test that fails before the fix and passes after**, where the finding is code-side — the only proof the vulnerability is closed rather than merely unscanned; (d) an OWASP/CWE **self-review of its own diff** (`harness-security-review`) before pushing, so a fix that introduces a new weakness never reaches VERIFY.
2. **The `advisory-match` degradation.** For a dependency bump with no code-side sink, step (c) degrades to the advisory clearing plus all-OS CI green (no behavior regression) — a bump has no call site to characterize. Say this explicitly so it is not read as an excuse to skip regression tests generally.
3. **FILE-tier: an evidence packet, not a build.** No branch, no build pipeline. The work product is a filed issue containing the evidence class and its concrete trace, the affected locations, the advisory/CWE reference, the reason it is structural, and the options a human would need to decide between. Filed through the project's configured security-disclosure channel when one exists, otherwise the normal issue tracker.
4. **Re-tier and park, never grow the fix.** A FIX-tier item that proves structural mid-flight **re-tiers to FILE and parks**. An item whose only available remedy is a suppression, ignore rule, or advisory mute **re-tiers to FILE with that constraint stated** — it is never closed by suppression. Any other unforeseen fork parks that one item; the batch continues.
5. **Never publish a secret's value.** A leaked-credential finding's evidence _is_ the secret. Report file, line, and credential **type** only — never the value — in every surface: PR description, issue body, report row, commit message. State that **rotation is a required human action the fleet does not perform**.
6. **Domain boundary.** A non-security correctness defect found incidentally **parks and is reported** for the build pipeline, never fixed inside the security sweep.
7. **Concurrency governor and push path.** Cap at the confirmed governor (default 2, max ~3) — the shared machine-storm limit. A `.claude/`-nested worktree breaks the local pre-push `check-docs` gate (it self-excludes and scans zero files); subagents push via the GitHub API or a non-`.claude` worktree. **Never `--no-verify`.**

**Verify:**

```bash
F=agents/skills/claude-code/security-fleet/SKILL.md
for s in '### Phase 3: DISPATCH' 're-confirm' 'regression test' 're-tier' 'suppression' 'rotation' '--no-verify'; do
  grep -qiF "$s" "$F" || echo "MISSING: $s"
done; echo checked
npx prettier --check "$F"
```

---

### Task 7: `### Phase 4: VERIFY` + `### Phase 5: REPORT`

**Depends on:** Task 6 · **Files:** `agents/skills/claude-code/security-fleet/SKILL.md`

1. **VERIFY** — open with "never accept a subagent's self-report", then the four independent FIX-tier checks, each as its own numbered step:
   1. **Pipeline artifact** — a plan directory under `docs/changes/<slug>/plans/` and an autopilot-state exist on the branch.
   2. **Evidence cleared** — the original evidence **no longer reproduces**: the sink is unreachable / the advisory is clear / the boundary control is present. This is the security analogue of a coverage delta.
   3. **No new finding** — a re-scan of the branch is **not worse than the base**. A fix that clears its own evidence but introduces a new weakness is **rejected, not reported as merge-ready**.
   4. **All-OS CI green** — all operating systems plus the enforce and harness checks, with the **full** test suite passing. Green on one OS is not green.

   Then the FILE-tier verification: the issue exists, carries a **named evidence class with its trace**, and is not a duplicate of an existing open item. Close with the classification: `verified` / `rejected` / `retry` (at most one retry).

2. **REPORT** — the one-row-per-item table with columns `Finding | Evidence class | Tier | Verdict | PR / Issue | Assumptions made | Parked / re-tiered`, plus:
   - the **aggregate evidence-gate discard count** printed alongside the table;
   - duplicates/already-remediated items annotated as dropped or closed **with a citation**, never re-filed;
   - the secret-handling restatement (location and type only);
   - **never merge** — the fleet delivers verified, reviewable PRs and filed evidence packets; the human lands them;
   - **degrade gracefully** — a missing scanner, unavailable advisory data, missing `gh` auth, or one item's failed fix is reported while the batch continues.
3. **Verify:**

```bash
F=agents/skills/claude-code/security-fleet/SKILL.md
for s in '### Phase 4: VERIFY' '### Phase 5: REPORT' 'no longer reproduces' 'not worse than the base' 'discard count' 'Never merge'; do
  grep -qiF "$s" "$F" || echo "MISSING: $s"
done; echo checked
npx prettier --check "$F"
```

---

### Task 8: `## Harness Integration` + `## Success Criteria`

**Depends on:** Task 7 · **Files:** `agents/skills/claude-code/security-fleet/SKILL.md`

1. `## Harness Integration` bullets — one line each for: `harness skill run security-fleet`; `harness-security-scan` (SELECT enumeration + VERIFY re-scan); `harness-supply-chain-audit` (dependency risk + advisory matching); `security-craft` (trust-boundary / least-authority critique); `harness-security-review` (OWASP/CWE taxonomy in SELECT, diff self-review in DISPATCH); `harness-roadmap-pilot` (impact scoring); `harness-brainstorming` → `harness-autopilot` (the FIX-tier per-item pipeline); the graph (exposure weighting); `gh` (cross-check, `gh pr checks`, PRs and issues); `docs/reference/fleet-family.md` (the shared spine); `harness skill validate` (the authoring-time gate for this skill's own structure).
2. `## Success Criteria` — port every bullet from the spec's Success Criteria section, keeping the emphasis markers: named evidence class on every batch item, exactly one human round, no structural remedy applied autonomously, assumptions note + regression test on every FIX PR, no secret value anywhere, no finding closed by suppression, duplicates dropped/closed with citation, never auto-merges, degrades gracefully, concurrency never exceeds the governor, nothing marked fixed on a self-report.
3. **Verify:**

```bash
F=agents/skills/claude-code/security-fleet/SKILL.md
grep -qF '## Harness Integration' "$F" && grep -qF '## Success Criteria' "$F" \
  && grep -qF 'docs/reference/fleet-family.md' "$F" && echo OK
npx prettier --check "$F"
```

---

### Task 9: `## Gates` + `## Escalation`

**Depends on:** Task 8 · **Files:** `agents/skills/claude-code/security-fleet/SKILL.md`

1. `## Gates` — bold-led bullets, at least these eight:
   - **No item in the batch without a named evidence class.** No evidence, no item — discarded, never downgraded to "low confidence".
   - **No "merge-ready" without the original evidence cleared.** A branch whose sink is still reachable / advisory still matching is not a fix.
   - **No "merge-ready" when the branch introduces a new security finding.** Clearing one weakness while adding another is a rejection, not a trade.
   - **No "merge-ready" without the pipeline artifact and all-OS CI green.**
   - **Never close a finding by suppression.** An ignore rule, advisory mute, or scanner exclusion added to clear an item is a gate violation — re-tier to FILE with the constraint stated.
   - **Never apply a structural remedy autonomously.** Auth-model, trust-boundary, and cryptographic-scheme changes are filed with evidence, never patched inside the sweep.
   - **Never publish a secret's value.** Location and type only, in every surface. Rotation is a human action.
   - **Never auto-merge**, **never exceed the concurrency governor**, **never `--no-verify`**, and **a self-report is never verification**.
2. `## Escalation` — one bullet per spec failure mode: scanner/advisory source unavailable; `gh` unauthenticated; evidence not reproducible in the subagent's worktree (drop as false positive, never fix on inherited evidence); FIX proves structural mid-flight; fix clears evidence but adds a new finding; only remedy is a suppression; a non-security correctness defect surfaces; CI red on a subset of OS; the batch appears coupled (findings share a fix — sequence them, they are a pipeline).
3. **Verify:**

```bash
F=agents/skills/claude-code/security-fleet/SKILL.md
grep -qF '## Gates' "$F" && grep -qF '## Escalation' "$F" \
  && grep -qiF 'suppression' "$F" && echo OK
npx prettier --check "$F"
```

---

### Task 10: `## Rationalizations to Reject` + `## Red Flags`

**Depends on:** Task 9 · **Files:** `agents/skills/claude-code/security-fleet/SKILL.md`

1. `## Rationalizations to Reject` — a two-column table (`Rationalization | Reality`) with **7–9 domain-specific rows**. None of the universal filler rows. Required coverage:
   - "The scanner flagged it, so it goes in the batch" → no evidence class, no item; volume is the failure mode the gate exists to stop.
   - "It's probably reachable — I'll include it at low confidence" → low confidence is not an evidence class; discard and count it.
   - "Adding an ignore rule clears the finding" → suppression closes a count, not a vulnerability; re-tier to FILE with the constraint stated.
   - "The auth model is the real problem — I'll just redesign it while I'm in here" → a sweep that redesigns an auth model is a larger risk than the finding; file it with evidence.
   - "The subagent says the fix works and CI is green" → a self-report is a claim; independently confirm the evidence no longer reproduces and the re-scan is not worse than base.
   - "The bump clears the advisory, so no test is needed" → true only for an `advisory-match` with no code-side sink; a code-side finding needs a regression test that fails before the fix.
   - "I'll paste the leaked key into the issue so the reviewer can confirm it" → the evidence _is_ the secret; location and type only. Rotation is a human action.
   - "This crash is a bug, not a security issue, but I'm already in the file" → domain split; park it and report it for the build pipeline.
   - "Bumping concurrency to six will close the backlog sooner" → machine-storm zone.
2. `## Red Flags` — a `Flag | Corrective Action` table with 5–6 STOP rows mirroring the highest-risk shortcuts (self-report accepted, suppression, structural redesign inside the sweep, secret value pasted, `--no-verify`, auto-merge).
3. **Verify:**

```bash
F=agents/skills/claude-code/security-fleet/SKILL.md
grep -qF '## Rationalizations to Reject' "$F" && grep -qF '## Red Flags' "$F" && echo OK
# Row count for the Rationalizations table must land in 7..9 (excludes header + separator):
awk '/^## Rationalizations to Reject/{f=1;next} /^## /{f=0} f&&/^\| /{n++} END{print "rows(incl header+sep):", n}' "$F"
npx prettier --check "$F"
```

---

### Task 11: `## Examples` + `## Test Scenarios` — completes the SKILL.md body

**Depends on:** Task 10 · **Files:** `agents/skills/claude-code/security-fleet/SKILL.md`

1. `## Examples` — two examples:
   - A fenced transcript, "A mixed-tier security backlog batch": SELECT enumerates from both halves and shows the **discard count** (e.g. 31 candidates → 9 with an evidence class, 22 discarded), cross-check drops a duplicate and an already-remediated advisory, tiers 6 FIX / 3 FILE, CONFIRM re-tiers one item, DISPATCH shows one item **re-tiering to FILE mid-flight**, VERIFY shows one rejection for "evidence cleared but new finding introduced", REPORT prints the table and never merges. Use invented, obviously-illustrative names — **no real advisory IDs and no internal tracker numbers**.
   - A short narrative, "Rejecting a fix that silenced the scanner": the subagent's diff adds a scanner exclusion; VERIFY sees the evidence still reproduces with the exclusion removed → rejected and re-tiered to FILE.
2. `## Test Scenarios` — four `### Scenario N: …` subsections, each naming the gate it guards:
   1. **Gate — a candidate with no evidence class carried into CONFIRM** (must be discarded and counted).
   2. **Rationalization — closing a finding by suppression** (must re-tier to FILE with the constraint stated).
   3. **Park/re-tier — a FIX-tier item proves structural mid-flight** (must re-tier to FILE and park, never grow the fix).
   4. **Secret handling — a leaked credential is echoed into an issue body** (must report location and type only; rotation named as a human action).
3. **Verify — the SKILL.md body is now structurally complete:**

```bash
cd agents/skills && npx vitest run tests/structure.test.ts tests/internal-refs.test.ts tests/interaction-channel.test.ts tests/schema.test.ts
```

Expected: 4 test files passed, 0 failed. `platform-parity` is expected to fail until Task 12 and is deliberately not in this run.

```bash
npx prettier --check agents/skills/claude-code/security-fleet/SKILL.md
```

---

### Task 12: Create the three platform-variant symlinks

**Depends on:** Task 11 · **Files:** `agents/skills/codex/security-fleet`, `agents/skills/cursor/security-fleet`, `agents/skills/gemini-cli/security-fleet` · **Owns:** `agents/skills/{codex,cursor,gemini-cli}/security-fleet`

1. From the worktree root:

```bash
for p in codex cursor gemini-cli; do
  ln -s ../claude-code/security-fleet "agents/skills/$p/security-fleet"
done
ls -l agents/skills/codex/security-fleet agents/skills/cursor/security-fleet agents/skills/gemini-cli/security-fleet
```

Each must print `-> ../claude-code/security-fleet` (relative target, matching the merged siblings).

2. **Verify — the full skills suite now passes:**

```bash
cd agents/skills && npx vitest run
```

Expected: `Test Files 10 passed (10)`, including `platform-parity`.

---

### Task 13: Validate the skill through the locally-built CLI `[checkpoint:human-verify]`

**Depends on:** Task 12 · **Files:** none (verification only)

1. Single-skill gate:

```bash
node packages/cli/dist/bin/harness.js skill validate security-fleet
```

Expected: `Validated 1 skill(s) in <worktree>/agents/skills/claude-code.` and exit 0. If `packages/cli/dist` is stale or missing, fall back to `./node_modules/.bin/tsx packages/cli/src/bin/harness.ts skill validate security-fleet`.

2. Whole-suite regression gate:

```bash
node packages/cli/dist/bin/harness.js skill validate
```

Expected: exit 0, and the reported count is the previous count **+1**.

3. `[checkpoint:human-verify]` — **pause and show the human the finished `SKILL.md`.** The prose is the deliverable here; the gates prove structure, not judgment. Ask (plain text) whether the evidence-gate wording, the tiering rule, and the secret-handling rule read correctly before the change is wired into the generated artifacts. Wait for the reply.

> **Do not run `harness` from `PATH`.** The globally installed `harness` binary is a stale published bundle that validates its **own** bundled ~79 skills, not this worktree's `agents/skills/`. It will report success without ever looking at `security-fleet`.

---

### Task 14: Add `security-fleet` to `docs/reference/fleet-family.md`

**Depends on:** Task 13 · **Files:** `docs/reference/fleet-family.md` · **Owns:** `docs/reference/fleet-family.md`

1. **Conveyor sentence** — in the `## The conveyor` section, change:

   `` `cicd-fleet`, `test-fleet`, and `cleanup-fleet` work quality queues alongside. ``

   to:

   `` `cicd-fleet`, `test-fleet`, `security-fleet`, and `cleanup-fleet` work quality queues alongside. ``

2. **Members table** — insert one row after the `test-fleet` row (keeping the existing five-column shape `Member | Stage | Queue | Per-item pipeline | Terminal act`):

```
| `security-fleet` | —      | evidence-gated security findings + supply chain | `security-scan` / `supply-chain-audit` / `security-craft` → `brainstorming` → `autopilot` | fix PRs + filed evidence packets |
```

3. Change nothing else in this file — no new section, no ADR reference addition.
4. **Verify:**

```bash
grep -qF '`security-fleet`, and `cleanup-fleet` work quality queues alongside' docs/reference/fleet-family.md \
  && grep -qF '| `security-fleet` |' docs/reference/fleet-family.md && echo OK
npx prettier --write docs/reference/fleet-family.md && npx prettier --check docs/reference/fleet-family.md
git diff --stat docs/reference/fleet-family.md   # expect exactly 1 file, ~2 insertions / 1 deletion + table realignment
```

---

### Task 15: Generate the four plugin command files (staging recipe — never write-mode)

**Depends on:** Task 14 · **Files:** `.claude-plugin/commands/security-fleet.md`, `.cursor-plugin/commands/security-fleet.md`, `.gemini-extension/commands/security-fleet.toml`, `.antigravity-extension/commands/security-fleet.toml`

> **Do NOT run `pnpm generate:plugin --target <t>` (write mode) in this worktree.** Verified behavior: it `rmSync`s the whole `<pluginDir>/commands/` directory and the replacement files do not land — `.claude-plugin/commands/` went from 78 files to **0**, with exit code 0 and a misleading `Wrote 78 commands` log. Only `--check` mode is safe here. The recipe below produces the same bytes non-destructively and was verified byte-identical against the committed `test-fleet` command files.

1. **The staging dir must live inside the repo root** (`tmp-plugin-*-commands/` is already gitignored) so prettier resolves the repo `.prettierrc` — with `singleQuote: true`. A staging dir outside the repo produces double-quoted frontmatter and will not match.

2. Run once per platform, copying out only `security-fleet`:

```bash
run_one() {  # $1 = platform, $2 = skills dir, $3 = ext
  S="tmp-plugin-security-$1-commands"
  rm -rf "$S"
  ./node_modules/.bin/tsx packages/cli/src/bin/harness.ts generate-slash-commands \
    --platforms "$1" --skills-dir "$2" --skills-dir-only --output "$S" --yes
  [ "$3" = ".md" ] && node node_modules/prettier/bin/prettier.cjs --write --ignore-path .prettierignore "$S/harness"
  echo "generated: $S/harness/security-fleet$3"
}
run_one claude-code agents/skills/claude-code .md
run_one cursor      agents/skills/cursor      .md
run_one gemini-cli  agents/skills/gemini-cli  .toml
```

(Cursor additionally needs `--cursor-mode commands`; append it to the cursor invocation. Prettier is deliberately skipped for TOML — the generator's own output is authoritative there, matching `generate-plugin.mjs`.)

3. Copy exactly four files out, then delete every staging dir:

```bash
cp tmp-plugin-security-claude-code-commands/harness/security-fleet.md .claude-plugin/commands/security-fleet.md
cp tmp-plugin-security-cursor-commands/harness/security-fleet.md      .cursor-plugin/commands/security-fleet.md
cp tmp-plugin-security-gemini-cli-commands/harness/security-fleet.toml .gemini-extension/commands/security-fleet.toml
cp tmp-plugin-security-gemini-cli-commands/harness/security-fleet.toml .antigravity-extension/commands/security-fleet.toml
rm -rf tmp-plugin-security-*-commands
```

(The gemini and antigravity TOMLs are byte-identical — verified against the committed `test-fleet` pair.)

4. **Verify — all five targets report no drift, and no collateral files moved:**

```bash
for t in claude cursor gemini codex antigravity; do
  node scripts/generate-plugin.mjs --target "$t" --check >/dev/null 2>&1; echo "$t exit=$?"
done
git status --porcelain
```

Expected: every target `exit=0`, and `git status --porcelain` lists **only** the four new command files plus the files from Tasks 1–14. If any pre-existing command file shows as deleted or modified, restore it immediately with `git checkout -- .claude-plugin .cursor-plugin .gemini-extension .antigravity-extension` and re-run the staging recipe.

---

### Task 16: Regenerate the skills catalog, run the full gate sweep, and commit `[checkpoint:human-verify]`

**Depends on:** Task 15 · **Files:** `docs/reference/skills-catalog.md` (regenerated) · **Owns:** `docs/reference/skills-catalog.md`

1. Regenerate (never hand-edit):

```bash
node scripts/generate-docs.mjs
git diff --stat
```

Expected: `docs/reference/skills-catalog.md` is the **only** file this step changes.

2. Inspect the catalog diff:

```bash
git diff docs/reference/skills-catalog.md | head -60
grep -qF '### security-fleet' docs/reference/skills-catalog.md && echo "catalog entry OK"
```

Expected: a new `### security-fleet` entry, the header count `781 → 783`, and `Tier 2 — Maintenance (61 → 63 skills)`.

> **The `+2` is correct, not a bug.** The committed catalog on `main` is already stale by one (regenerating on a clean tree, before any of this work, yields `781 → 782` with no `security-fleet` present). This change fixes that pre-existing off-by-one **and** adds `security-fleet`. Note it in the PR body so a reviewer does not read the second increment as an accident.

3. **Full gate sweep:**

```bash
(cd agents/skills && npx vitest run)                      # expect 10 files passed
node packages/cli/dist/bin/harness.js skill validate      # expect exit 0
harness validate                                          # expect "validation passed"
npx prettier --check $(git status --porcelain | awk '{print $2}' | grep -E '\.(md|json|ya?ml|toml)$')
for t in claude cursor gemini codex antigravity; do node scripts/generate-plugin.mjs --target "$t" --check >/dev/null 2>&1; echo "$t exit=$?"; done
git status --porcelain                                    # must match the File Map exactly
```

4. `[checkpoint:human-verify]` — present the final `git status --porcelain`, the catalog count delta, and the gate results. Ask (plain text) for authorization to commit. Wait for the reply.

5. Commit (**never `--no-verify`**):

```bash
git add agents/skills/claude-code/security-fleet \
        agents/skills/codex/security-fleet agents/skills/cursor/security-fleet agents/skills/gemini-cli/security-fleet \
        .claude-plugin/commands/security-fleet.md .cursor-plugin/commands/security-fleet.md \
        .gemini-extension/commands/security-fleet.toml .antigravity-extension/commands/security-fleet.toml \
        docs/reference/fleet-family.md docs/reference/skills-catalog.md \
        docs/changes/security-fleet
git commit -m "feat(skills): security-fleet — evidence-gated vulnerability & supply-chain sweep"
```

If a pre-commit hook reformats a file, re-`git add` the file and re-commit. If the commit hangs (known local-core graph-schema rebuild symptom), stop and escalate — do not bypass the hook.

---

## Notes for the executor

- **This is skill authoring** (markdown instructions), not TypeScript package code. There is no code-level TDD. The verification equivalents, in the order they get strict, are:
  1. `agents/skills` vitest suite — `structure` (required sections per type), `schema` + `references` (skill.yaml + `depends_on` resolution), `platform-parity` (symlinked variants byte-identical), `internal-refs` (no leaked roadmap/PR/issue numbers), `interaction-channel` (no `emit_interaction` `type: question`/`confirmation`);
  2. `node packages/cli/dist/bin/harness.js skill validate security-fleet` (schema + required-section + capabilities-drift gates);
  3. the SKILL.md's own embedded `## Test Scenarios`;
  4. `prettier --check`;
  5. `generate-plugin.mjs --check` for all five targets.

- **Bootstrap the skills test deps first.** This worktree has no `agents/skills/node_modules` — `npx vitest run` there fails with `Cannot find package 'glob'`. Symlink them from the primary checkout (verified working, and the directory is gitignored):

  ```bash
  W=/Users/cwarner/Projects/harness-engineering/.git-worktrees/security-fleet
  M=/Users/cwarner/Projects/harness-engineering
  mkdir -p "$W/agents/skills/node_modules"
  for d in @harness-engineering @vitest glob vitest yaml zod; do
    ln -sfn "$M/agents/skills/node_modules/$d" "$W/agents/skills/node_modules/$d"
  done
  ```

  Baseline after bootstrap: `Test Files 10 passed (10)`, `Tests 34058 passed`.

- **Use the locally-built CLI, never `PATH`.** `which harness` resolves to a globally installed published bundle that validates its own ~79 bundled skills, not this worktree's 781. It reports success without ever reading `security-fleet`. Use `node packages/cli/dist/bin/harness.js …` (verified: resolves `<worktree>/agents/skills/claude-code`) or `./node_modules/.bin/tsx packages/cli/src/bin/harness.ts …`. The one exception is `harness validate`, which is project-level and safe from `PATH`.

- **Write-mode plugin generation is destructive here — verified, not theoretical.** `node scripts/generate-plugin.mjs --target claude` (no `--check`) emptied `.claude-plugin/commands/` (78 → 0 files) while exiting 0 and logging `Wrote 78 commands`. Task 15's staging recipe is the only sanctioned path. If it ever happens anyway: `git checkout -- .claude-plugin .cursor-plugin .gemini-extension .antigravity-extension` restores the tracked files (verified), then re-run the staging recipe.

- **Keep the SKILL.md self-contained.** The shared spine lives in `docs/reference/fleet-family.md` and is _cited_, but the SKILL.md must still carry every required section to pass validation and to run standalone in an adopter project that has no such reference doc.

- **Zero internal references in the shipped body.** `SKILL.md` and `skill.yaml` ship verbatim into adopter projects. `internal-refs.test.ts` greps for `(roadmap|PR|pull request|issue) #NNNN`, `sub-project #N`, and `` `skill-name` (#N) `` shapes across `**/SKILL.md`, `**/skill.yaml`, and the generated plugin command files. Cite the family ADRs by **title** ("the subagent worktree fan-out ADR", "the front-load / park-unforeseen interaction-model ADR"), never by number, and keep example transcripts free of real advisory IDs.

- **Never `--no-verify`** on commit or push. This worktree is nested under `.git-worktrees/`, not `.claude/`, so the local `check-docs` push gate should behave — but if a push gate fails, push via the GitHub API or from a non-nested worktree rather than bypassing.

- **NFR elicitation: all four dimensions explicitly skipped.** The deliverable is markdown instructions with no hot path, no untrusted input parsing, no load profile, and no runtime failure mode of its own. Existing budgets stand: `check-perf` and `check-security` run at their configured floors as part of `harness validate`. No `category: nfr` tasks are emitted — deliberately, not by omission.

- **The advisor's `SKILLS.md` is not useful here.** `docs/changes/security-fleet/SKILLS.md` recommends only TypeScript pattern skills (`gof-*`, `ts-*`) at ≤0.57 relevance, matched on the repo's stack rather than the deliverable. No task carries a skill annotation; the real references are the merged siblings (`cicd-fleet`, `test-fleet`) and the family spine doc.

- **`docs:build` cannot run locally.** `docs/node_modules` is absent in this worktree, so the VitePress build is a CI-only gate. Guard it by inspection instead: no bare `<angle brackets>` outside code fences, no multi-line inline code, and no unescaped `{{ }}` in the two edited docs. Both files edited here are tables and prose, which is the safe shape.

- **Expected final tree** — exactly 11 paths (2 skill files, 3 symlinks, 4 generated command files, 2 modified docs), plus the spec/plan artifacts under `docs/changes/security-fleet/`. Anything else in `git status --porcelain` is collateral and must be reverted before committing.
