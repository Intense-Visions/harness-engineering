# Plan: Conductor member wiring — Phase 1 (Manifests)

**Date:** 2026-09-07
**Spec:** `docs/changes/conductor-member-wiring/proposal.md` (SP2), _Implementation order_ → **Phase 1 — Manifests**; _Technical design_ → **Edit 1**, **Edit 3**, **Edit 5**
**Scope:** Phase 1 only. Phases 2-5 (wave table, spine reconciliation, ADR 0125, run-verification) are out of scope.
**Tasks:** 5 | **Checkpoints:** 1 | **Time:** ~18 min | **Integration Tier:** small
**Base:** `spec/conductor-member-wiring` @ `bb442e094` (on `origin/main` @ `f6af75423`)

---

## Goal

`fleet-command`'s manifest names all **13** installed members, and all four fleet manifests **declare** `--lease-seconds` and `--no-claim`, with every one of the **five** generated artifact trees regenerated in step and committed drift-free.

---

## Observable Truths (Acceptance Criteria)

Phase 1's bar is the spec's criteria **6** and **8**. Restated as checkable truths:

1. **[Ubiquitous]** `agents/skills/claude-code/fleet-command/skill.yaml` `depends_on` shall list exactly **13** entries, including `perf-fleet` and `docs-fleet`.
2. **[Ubiquitous]** `cli.args` shall contain `--lease-seconds` and `--no-claim` in all four manifests — `fleet-command` (6 → **8** args), `roadmap-fleet` / `issue-fleet` / `pr-fleet` (4 → **6** args each).
3. **[Ubiquitous]** Each member's declared description shall match the description already in that member's `SKILL.md` Flags table (spec Edit 3), and `fleet-command`'s shall match the two strings given verbatim in spec Edit 1.
4. **[Event-driven]** When `pnpm generate:plugin:all` runs, `.claude-plugin/commands/{fleet-command,roadmap-fleet,issue-fleet,pr-fleet}.md` shall each carry `----lease-seconds` and `----no-claim` in their `argument-hint` line. _(The `----` double-dash mangling is pre-existing generator defect #1969 — see "Explicitly not claimed".)_
5. **[Event-driven]** When `pnpm generate:plugin:all` runs, the embedded `skill.yaml` dump inside `.gemini-extension/commands/<skill>.toml` and `.antigravity-extension/commands/<skill>.toml` shall contain the lines `    - name: --lease-seconds` and `    - name: --no-claim` for all four skills, and `fleet-command`'s embedded `depends_on:` block shall list 13 entries.
6. **[Ubiquitous — spec criterion 8]** `pnpm generate:plugin:check` shall exit `0`, and `git status --porcelain` shall be empty for **all five** artifact directories — `.claude-plugin/`, `.cursor-plugin/`, `.gemini-extension/`, `.codex-plugin/`, **`.antigravity-extension/`** — measured **after** the commit.
7. **[Unwanted]** If a file outside the four `skill.yaml`s and the five artifact directories appears in the commit, then the commit shall not be made.

### Explicitly not claimed

- **The two flags remain non-functional.** `harness skill run` declares a fixed option set and rejects skill-declared args (spec, _Scope boundary_). Truths 2-5 test **declaration and rendering**, never behaviour. This is fixed by SP3, not here.
- **The rendered `argument-hint` is malformed.** It renders `[----lease-seconds <--lease-seconds>]`, exactly as it already renders `[----fleets <--fleets>]` today. Truth 4 passes on malformed output by design; it is evidence the arg was _declared and rendered_, not that the hint is correct. Pre-existing, filed as **#1969**.
- **`perf-fleet` and `docs-fleet` are not yet schedulable after this phase.** The wave table is Phase 2. `depends_on` is manifest/index consistency only.

---

## Verified Facts (established during scoping — do not re-derive)

| Fact                                                                                                                                                                                      | Evidence                                                                                                      |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `cursor` / `codex` / `gemini-cli` skill trees are symlinks to `claude-code`; editing the claude-code copy propagates. **Do not edit mirrors.**                                            | Spec _Technical design_; confirmed                                                                            |
| `.gemini-extension/` and `.antigravity-extension/` `.toml` command files embed the **full `skill.yaml`**, so both `depends_on` and `cli.args` changes are directly greppable there.       | `.gemini-extension/commands/fleet-command.toml:582` (`- name: --fleets`), `:626` (`depends_on:` + 11 entries) |
| `.claude-plugin/commands/*.md` surface `cli.args` **only** in the `argument-hint` frontmatter line (1 occurrence of `--fleets`).                                                          | `.claude-plugin/commands/fleet-command.md:4`                                                                  |
| `.cursor-plugin/commands/*.md` render **no** `cli.args` (0 occurrences of `--fleets`). Expected no-op.                                                                                    | `grep -c -- '--fleets' .cursor-plugin/commands/fleet-command.md` → `0`                                        |
| `.codex-plugin/` contains **no per-skill command files** — only `marketplace.json` and `plugin.json`. Expected no-op.                                                                     | `ls .codex-plugin/`                                                                                           |
| A naive `grep -- '--lease-seconds' <toml>` **already matches today** — the SKILL.md Flags table is embedded in the same file. Verification must anchor on `^    - name: --lease-seconds`. | `.gemini-extension/commands/fleet-command.toml:63` is the Flags-table row, not a declaration                  |
| All six planned description strings parse as **unquoted plain YAML scalars** (em-dashes, `§`, backticks, apostrophes, parentheses all safe) and **prettier leaves them unchanged**.       | Probe: `yaml.parse` round-trip OK ×6; `pnpm exec prettier --write` → `(unchanged)`                            |
| No test, barrel, route, or registry asserts `fleet-command`'s `depends_on` roster or arg list. No code changes required.                                                                  | `grep -rln 'depends_on' packages/cli/src --include='*.test.ts'` → empty                                       |
| **No changeset required.** `check:changesets` only fires on `^packages/([^/]+)/(src/.+\|package\.json)$`. This change touches neither.                                                    | `scripts/check-changesets.mjs:62` (`PUBLISHABLE_FILE`)                                                        |
| `.husky/pre-commit:145` stages only **four** dirs while `:144` regenerates **five**. `.antigravity-extension/` must be staged by hand.                                                    | `.husky/pre-commit:141-146`; filed as **#1968** — work around, do not fix here                                |
| `.husky/pre-push` does **not** gate plugin/command artifacts. No push-time safety net exists for truth 6.                                                                                 | Spec Edit 5; `grep` of `.husky/pre-push`                                                                      |

---

## Uncertainties

- **[BLOCKING — resolved during scoping]** `pnpm generate:plugin:check` **fails on this checkout** with
  `SyntaxError: The requested module '@harness-engineering/core' does not provide an export named 'diagnoseTrackerSyncConfig'`
  (`packages/cli/src/commands/roadmap/reconcile.ts:10`). This is **not** a source defect and **not** introduced by this branch: the export exists in `packages/core/src/roadmap/index.ts:75`, but `packages/core/dist/` was stale (the import landed in `d9cd07da6`, already on `origin/main`; `git diff --stat origin/main HEAD -- packages/` is empty).
  **Resolution:** `pnpm turbo build --filter=@harness-engineering/core` restores `dist` (turbo cache hit, ~4s), after which `pnpm generate:plugin:check` exits **0** on an unmodified tree. Encoded as **Task 1**. Without it, Task 4 fails and truth 6 is unmeasurable.
- **[ASSUMPTION]** Regeneration touches only the four skills' artifacts. Grounded in the verified **clean baseline** (`generate:plugin:check` exit 0 pre-edit), so any other file appearing in the diff is a real signal — Task 5 step 4 enforces this as truth 7.
- **[DEFERRABLE]** `harness validate` and `harness check-deps` are both **RED on `origin/main`** for reasons unrelated to YAML manifests: `harness validate` reports hardcoded-colour design-token drift in `packages/cli/src/drift/**` and `packages/cli/tests/align/**`; `harness check-deps` reports one cycle, `packages/core/src/solutions/scan-candidates/read-commits.ts → git-scan.ts`. **This plan therefore does not gate on either command.** Gating a manifest edit on a pre-existing unrelated red would either block the change or teach the executor to rubber-stamp a red gate. The real gate for this phase is `pnpm generate:plugin:check` (truth 6), which is deterministic, scoped to exactly what this phase produces, and verified green at baseline.

### Phases not run, and why

- **Phase 1.5 (Knowledge baseline)** — not run. This phase materializes no business rules; it edits four declarative manifests and their derived artifacts. There is no domain knowledge to extract that the spec has not already stated.
- **Phase 1.6 (NFR elicitation)** — all four dimensions **N/A, not elicited**. Phase 1 introduces no runtime code path: the two flags are inert until SP3, and `depends_on` is read by the skill index only. There is no hot path to benchmark, no untrusted input, no load surface, and no failure mode to degrade. **No `category: nfr` tasks are emitted.**
- **Skeleton pass** — not produced. Rigor is `standard`; task count is 5, below the 8-task threshold.
- **Skill advisor** — `docs/changes/conductor-member-wiring/SKILLS.md` exists but recommends only generic TypeScript/GoF design-pattern skills (`ts-performance-patterns`, `gof-builder-pattern`, …) scored ≤ 0.54. None apply to a YAML manifest edit. **No task is annotated with skills.**

---

## File Map

**Edit by hand (4 files):**

```
MODIFY agents/skills/claude-code/fleet-command/skill.yaml   (depends_on 11→13; cli.args 6→8)
MODIFY agents/skills/claude-code/roadmap-fleet/skill.yaml   (cli.args 4→6)
MODIFY agents/skills/claude-code/issue-fleet/skill.yaml     (cli.args 4→6)
MODIFY agents/skills/claude-code/pr-fleet/skill.yaml        (cli.args 4→6)
```

**Regenerated — never hand-edit (expected to change):**

```
REGEN .claude-plugin/commands/{fleet-command,roadmap-fleet,issue-fleet,pr-fleet}.md          (argument-hint line)
REGEN .gemini-extension/commands/{fleet-command,roadmap-fleet,issue-fleet,pr-fleet}.toml     (embedded skill.yaml)
REGEN .antigravity-extension/commands/{fleet-command,roadmap-fleet,issue-fleet,pr-fleet}.toml (embedded skill.yaml)
```

**Regenerated — expected no-op, must still be diff-free for truth 6:**

```
REGEN .cursor-plugin/**    (renders no cli.args)
REGEN .codex-plugin/**     (no per-skill command files)
```

**Not touched in this phase:** every `SKILL.md` (Phase 2), `docs/reference/fleet-family.md` (Phase 3), any ADR (Phase 4), any file under `packages/`, and every `agents/skills/{cursor,codex,gemini-cli}/**` mirror (symlinks).

---

## Tasks

### Task 1: Restore the generator's runtime prerequisite

**Depends on:** none | **Files:** none (build artifacts only) | **Owns:** `packages/core/dist/**`
**No commit.** This produces no tracked change.

1. Run: `pnpm turbo build --filter=@harness-engineering/core`
2. Confirm the stale-`dist` symptom is cleared:
   ```bash
   grep -c 'diagnoseTrackerSyncConfig' packages/core/dist/index.js
   ```
   Expect a non-zero count. If it is `0`, stop and escalate — the assumption that this is a stale-`dist` problem is wrong.
3. Establish the clean baseline that every later diff is measured against:
   ```bash
   pnpm generate:plugin:check >/tmp/gpc-baseline.log 2>&1; echo "EXIT=$?"
   ```
   **Expect `EXIT=0`.** If non-zero, stop and escalate: the tree is already drifted, and no diff produced by Tasks 2-4 is attributable to this change.
4. Confirm the check left no scratch dirs and no working-tree change:
   ```bash
   ls -d tmp-plugin-* 2>/dev/null; git status --porcelain -- .claude-plugin .cursor-plugin .gemini-extension .codex-plugin .antigravity-extension
   ```
   Expect no `tmp-plugin-*` and empty status output.

---

### Task 2: Declare the two new members and the two new flags on `fleet-command`

**Depends on:** Task 1 | **Files:** `agents/skills/claude-code/fleet-command/skill.yaml` | **Owns:** `agents/skills/claude-code/fleet-command/**`
**No commit** — see _Commit strategy_ below.

1. In `agents/skills/claude-code/fleet-command/skill.yaml`, **append two entries to `depends_on`** after the existing final entry `  - craft-fleet` (line 79), preserving spec Edit 1's ordering (existing 11 first, then the two new):

   ```yaml
   - craft-fleet
   - perf-fleet
   - docs-fleet
   ```

2. **Append two entries to `cli.args`** after the existing final `--dry-run` block (lines 39-41). The anchor block is unique within the file:

   ```yaml
   - name: --dry-run
     description: Run SELECT and CONFIRM; stop before any lane is dispatched. Unlike --report-only this presents the run-plan gate, so it is not a gate-free path
     required: false
   ```

   Insert immediately after it (descriptions are the two strings given verbatim in spec Edit 1; both are valid unquoted plain YAML scalars — do **not** add quotes):

   ```yaml
   - name: --lease-seconds
     description: Passed through verbatim to each ID-based member lane to override the cross-run claim-lease TTL
     required: false
   - name: --no-claim
     description: Passed through verbatim to each ID-based member lane, disabling the cross-run claim lease for that run
     required: false
   ```

   > Do **not** copy the `SKILL.md:42-43` rows verbatim into the manifest — they carry markdown emphasis (`**verbatim**`) and parenthetical cross-references that the spec deliberately trimmed for the manifest form.

3. Verify the file parses and the counts are right:
   ```bash
   node -e "const y=require('yaml'),fs=require('fs');const d=y.parse(fs.readFileSync('agents/skills/claude-code/fleet-command/skill.yaml','utf8'));const n=d.cli.args.map(a=>a.name);console.log('args',n.length,n.join(' '));console.log('depends_on',d.depends_on.length,d.depends_on.join(' '));"
   ```
   **Expect** `args 8 path --fleets --slots --max-fleets --wall-clock --report-only --dry-run --lease-seconds --no-claim`
   and `depends_on 13 … craft-fleet perf-fleet docs-fleet`.
4. Confirm prettier is a no-op (it was at probe time; a surprise here means the text drifted from plan):
   ```bash
   pnpm exec prettier --check agents/skills/claude-code/fleet-command/skill.yaml
   ```
5. Do **not** regenerate yet — Task 4 regenerates all four manifests in one pass.

---

### Task 3: Declare the two flags on the three ID-based members

**Depends on:** Task 2 | **Files:** `agents/skills/claude-code/roadmap-fleet/skill.yaml`, `agents/skills/claude-code/issue-fleet/skill.yaml`, `agents/skills/claude-code/pr-fleet/skill.yaml` | **Owns:** `agents/skills/claude-code/{roadmap-fleet,issue-fleet,pr-fleet}/**`
**No commit.** Three files, one identical mechanical edit shape, each anchored on that member's own unique `--dry-run` description — kept as one task rather than three because splitting produces three copies of the same instruction with no added review value. (At the 3-file limit, not over it.)

`--lease-seconds` is **identical in all three** members (their `SKILL.md:25` rows are byte-identical); `--no-claim` **differs per member** (`SKILL.md:26`). Insert after each file's `--dry-run` block.

1. **`roadmap-fleet`** — anchor `description: Run SELECT and CONFIRM only; do not fan out, verify, or report`; append:

   ```yaml
   - name: --lease-seconds
     description: Override the cross-run claim-lease TTL (default 720s); see §Cross-run claim lease in `docs/reference/fleet-family.md`
     required: false
   - name: --no-claim
     description: Disable the cross-run claim lease entirely — fall back to open-PR-cross-check-only coordination
     required: false
   ```

2. **`issue-fleet`** — anchor `description: Run SELECT and CONFIRM only; do not fan out, verify, or apply any mutation`; append:

   ```yaml
   - name: --lease-seconds
     description: Override the cross-run claim-lease TTL (default 720s); see §Cross-run claim lease in `docs/reference/fleet-family.md`
     required: false
   - name: --no-claim
     description: Disable the cross-run claim lease entirely — fall back to today's no-cross-run-coordination triage
     required: false
   ```

3. **`pr-fleet`** — anchor `description: Run SELECT and CONFIRM only; do not fan out, verify, or land`; append:

   ```yaml
   - name: --lease-seconds
     description: Override the cross-run claim-lease TTL (default 720s); see §Cross-run claim lease in `docs/reference/fleet-family.md`
     required: false
   - name: --no-claim
     description: Disable the cross-run claim lease entirely — pr-fleet then has no cross-run review-assist dedup (today's behavior)
     required: false
   ```

   > All three `--no-claim` strings and the shared `--lease-seconds` string are **unquoted plain YAML scalars**. The `§`, the em-dash `—`, the backticks, the apostrophe in `today's`, and the parentheses are all safe in plain scalar position — verified by `yaml.parse` round-trip. Adding single quotes would break `today's` in two of them.

4. Verify all four manifests at once:
   ```bash
   node -e "const y=require('yaml'),fs=require('fs');let bad=0;for(const s of ['fleet-command','roadmap-fleet','issue-fleet','pr-fleet']){const d=y.parse(fs.readFileSync('agents/skills/claude-code/'+s+'/skill.yaml','utf8'));const n=d.cli.args.map(a=>a.name);const ok=n.includes('--lease-seconds')&&n.includes('--no-claim');if(!ok)bad++;console.log((ok?'OK  ':'FAIL')+' '+s+' args='+n.length);}process.exit(bad?1:0);"
   ```
   **Expect** `OK fleet-command args=8`, `OK roadmap-fleet args=6`, `OK issue-fleet args=6`, `OK pr-fleet args=6`, exit 0.
5. Confirm prettier is a no-op:
   ```bash
   pnpm exec prettier --check agents/skills/claude-code/{fleet-command,roadmap-fleet,issue-fleet,pr-fleet}/skill.yaml
   ```

---

### Task 4: Regenerate all five artifact trees and stage the fifth by hand

**Depends on:** Task 3 | **Files:** `.claude-plugin/**`, `.cursor-plugin/**`, `.gemini-extension/**`, `.codex-plugin/**`, `.antigravity-extension/**` | **Owns:** all five artifact dirs
**No commit.**

1. Regenerate all five targets:
   ```bash
   pnpm generate:plugin:all
   ```
2. Stage the four manifests **and all five** artifact directories. `.antigravity-extension` is listed explicitly because `.husky/pre-commit:145` will **not** stage it for you (#1968) — omitting it lands the commit with a dirty tree and fails truth 6:
   ```bash
   git add agents/skills/claude-code/{fleet-command,roadmap-fleet,issue-fleet,pr-fleet}/skill.yaml \
           .claude-plugin .cursor-plugin .gemini-extension .codex-plugin .antigravity-extension
   ```
3. Confirm nothing is left unstaged in the five artifact dirs (column 2 of porcelain output must be blank for every line, and there must be no `??`):
   ```bash
   git status --porcelain -- .claude-plugin .cursor-plugin .gemini-extension .codex-plugin .antigravity-extension
   ```
4. Confirm no scratch dirs survived:
   ```bash
   ls -d tmp-plugin-* 2>/dev/null || echo "clean"
   ```
   Expect `clean`. If any `tmp-plugin-*` exists, remove it — it is untracked scratch and would surface as `??` at truth 6.

---

### Task 5: Verify criteria 6 and 8, then commit

**Depends on:** Task 4 | **Files:** none (verification + commit) | **Category:** integration

**`[checkpoint:human-verify]`** — after step 3, show the human the `argument-hint` diff, the staged file list, and the `generate:plugin:check` exit code, then wait for confirmation before step 5. The mangled `----lease-seconds` rendering is expected (#1969) and a human should see it once rather than have it discovered in review.

1. **Truth 4 — claude command files render the flags.** Expect `2` for each of the four files:
   ```bash
   for s in fleet-command roadmap-fleet issue-fleet pr-fleet; do
     printf '%s %s\n' "$s" "$(grep -o -- '----lease-seconds\|----no-claim' .claude-plugin/commands/$s.md | wc -l | tr -d ' ')"
   done
   ```
2. **Truth 5 — toml artifacts carry the declarations, not just the Flags table.** The `^    - name:` anchor is load-bearing: a bare `grep -- '--lease-seconds'` matches the embedded `SKILL.md` Flags row and passes even with the manifest unedited. Expect `2` for each of the eight files:
   ```bash
   for d in .gemini-extension .antigravity-extension; do
     for s in fleet-command roadmap-fleet issue-fleet pr-fleet; do
       printf '%s/%s %s\n' "$d" "$s" "$(grep -cE '^    - name: (--lease-seconds|--no-claim)$' $d/commands/$s.toml)"
     done
   done
   ```
   Then confirm the embedded roster is 13 in both — expect `13` twice:
   ```bash
   for d in .gemini-extension .antigravity-extension; do
     sed -n '/^depends_on:/,/^addresses:/p' $d/commands/fleet-command.toml | grep -c '^  - '
   done
   ```
3. **Truth 6 (pre-commit half) — the generator agrees with the tree.** Expect `EXIT=0`:
   ```bash
   pnpm generate:plugin:check >/tmp/gpc-verify.log 2>&1; echo "EXIT=$?"
   ```
4. **Truth 7 — nothing outside scope is staged.** Every path must start with `agents/skills/claude-code/` or one of the five artifact dirs:
   ```bash
   git diff --cached --name-only
   ```
   If any other path appears, unstage it and investigate before committing.
5. **`[checkpoint:human-verify]` — pause here.** Present steps 1-4 output. Wait for explicit confirmation.
6. Commit (no changeset needed — `check:changesets` scopes to `packages/*/src` and `package.json` only):
   ```bash
   git commit -m "feat(fleet-command): add perf-fleet and docs-fleet to the member roster, declare claim-lease flags"
   ```
   The `pre-commit` hook will re-run `generate:plugin:check`; because Task 4 already regenerated, it should find no drift and change nothing.
7. **Truth 6 (post-commit half) — the acceptance bar.** Both must hold:
   ```bash
   git status --porcelain -- .claude-plugin .cursor-plugin .gemini-extension .codex-plugin .antigravity-extension
   pnpm generate:plugin:check >/dev/null 2>&1; echo "EXIT=$?"
   ```
   **Expect empty output and `EXIT=0`.** A non-empty first command means the pre-commit hook regenerated something Task 4 missed and left `.antigravity-extension` unstaged (#1968) — amend with `git add .antigravity-extension && git commit --amend --no-edit`, then re-run this step.

---

## Commit strategy — a deliberate deviation

Tasks 2, 3 and 4 produce **no commit**; the whole phase lands as **one commit** in Task 5. This departs from the usual one-task-one-commit rule, deliberately:

The four `skill.yaml`s and the five generated artifact trees are not independent — the artifacts are _derived from_ the manifests. Committing a manifest without its regenerated artifacts leaves `HEAD` in exactly the drifted state that truth 6 (spec criterion 8) exists to exclude. Worse, `.husky/pre-commit:142` would fire on each manifest-only commit, regenerate, and stage four of the five dirs, producing a chain of commits each of which leaves `.antigravity-extension/` dirty. One commit is the only shape in which every intermediate state of `HEAD` satisfies the acceptance bar.

No TDD cycle appears in this plan because the phase produces **no executable code**. Truths 1-7 are enforced by the mechanical checks in Tasks 2, 3 and 5 — `yaml.parse` assertions on the manifests, anchored greps on the generated artifacts, and `generate:plugin:check` — which are this change's equivalent of a test, and which run before the commit rather than after it.

---

## Gates this plan deliberately does not use

| Gate                 | Why not                                                                                                                                                                     |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `harness validate`   | **Red on `origin/main`** (design-token drift across `packages/cli/src/drift/**` and `packages/cli/tests/align/**`) for reasons no YAML manifest edit can affect or resolve. |
| `harness check-deps` | **Red on `origin/main`** (one cycle: `read-commits.ts → git-scan.ts` in `packages/core`). Same reasoning.                                                                   |
| `.husky/pre-push`    | Does **not** gate plugin or command artifacts (spec Edit 5). It offers no protection for truth 6, so it is not relied on.                                                   |
| `pnpm changeset`     | Not required — `check:changesets` scopes to `packages/*/src` and `package.json` (`scripts/check-changesets.mjs:62`).                                                        |

The operative gate for this phase is `pnpm generate:plugin:check` plus the staged-path check, both in Task 5.

---

## Follow-ups (out of scope, already filed or to file)

- **#1968** — `.husky/pre-commit:145` stages four of the five dirs regenerated at `:144`. Worked around here (Task 4 step 2), not fixed.
- **#1969** — the slash-command generator emits `argument-hint` entries as `[----flag <--flag>]`. Pre-existing; visible today at `.claude-plugin/commands/fleet-command.md:4`.
- **New, discovered during planning:** `packages/core/dist` goes stale against `origin/main` in a way that hard-breaks `pnpm generate:plugin:*` with a misleading `does not provide an export named 'diagnoseTrackerSyncConfig'` error. The fix is a rebuild, but the error names a source-level symptom and sends readers to the barrel allowlist. Worth a one-line preflight (`turbo build --filter=@harness-engineering/core`) inside `scripts/generate-plugin.mjs`, or a clearer failure message. Not fixed here.

## Next phase

**Phase 2 — Wave table, exclusivity, deferral rule** (spec Edit 2). Rewrite `fleet-command/SKILL.md`'s wave table to seven waves; add the exclusivity + deferral-target rationale; reword the four index-free deferral-stop statements at `:197`, `:271`, `:294`, `:314`; rework the five worked-example sites at `:383-384`, `:405`, `:430`, `:434`, `:490`. Verifiable by spec criterion 5.
