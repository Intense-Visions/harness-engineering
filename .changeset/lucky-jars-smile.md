---
'@harness-engineering/cli': major
---

`audit_anatomy` no longer reports a clean audit of zero files.

`runAudit` defaulted its candidate set to `input.files ?? []`, so every caller that
omitted a `files` scope — `harness check-design`, `harness validate`, the
`design-pipeline` orchestrator, and the `audit_anatomy` MCP tool — got a scan loop
that never executed: `summary.totalFiles` stayed `0`, `findings` stayed empty, and
the run rendered as a pass. The published contract said the opposite; `-f, --files`
is documented as "Defaults to all project source files". It has been wrong since the
verifier shipped.

The default is now the project's source files, resolved by the same
`collectDesignScanFiles` helper `detect-design-drift` and `audit-brand-compliance`
now share, honouring `design.exclude` and `analysis.exclude`. One `check-design` run,
one file set. A scope that resolves to zero files throws instead of returning a clean
result — see the abstention rule below.

**This is breaking for anyone whose gate runs these commands.** Measured on this
repository with a freshly built CLI, the `audit-anatomy` verifier inside
`check-design --mode full` went from `audit-anatomy (0 findings)` over 0 files to
3,141 findings (2 error-severity, 3,139 warn) over 4,274 files. An adopter whose design gate is green
today can go red on the first run after upgrading, with no change to their code. To
stage the adoption, scope the run explicitly with `--files` (explicit paths — see the
glob note below), narrow it with `design.exclude` / `analysis.exclude`, or turn the
verifier off with `design.audit.componentAnatomy.enabled: false`.

This repository's own `check-design` exit code does **not** change: it was already 1
before this PR, because `detect-design-drift` emits 225 error-severity findings on
its own. The anatomy findings are additive here. An adopter whose only error-severity
findings would come from anatomy is the one who flips 0 → 1.

Major rather than patch: the fix is small, but the observable contract of a command
that gates CI changes from pass to fail, and `runAudit` gained a throw where it
previously always resolved.

## Sibling sweep: the explicit-scope door, and candidate counts

The same defect had a second door and two more verifiers, all fixed here.

Every design verifier skips a candidate it cannot open. Closing the omitted-scope
door left that skip intact, so a scope that resolved to nothing _readable_ still
rendered as a pass: `-f, --files` was documented as "file/glob" but no verifier has
ever expanded a glob, so `--files 'src/**/*.tsx'` audited zero files and reported
zero findings. A typo'd path did the same. All three verifiers now abstain when they
read no files, not just when they resolve no candidates. The flag's help no longer
claims glob support it does not have.

`detect-design-drift` and `audit-brand-compliance` also reported `totalFiles` as the
_candidate_ count rather than the count of files they read, so a scope of one
nonexistent path reported "1 file scanned, 0 findings" for a file never opened.
`totalFiles` is now bytes read, not paths offered.

### The abstention rule, and the one case it deliberately excludes

A zero-file run is an abstention when the verifier was ASKED to look at something and
looked at nothing, and "not applicable" when there was nothing of the kind to look at:

| why zero files                                                  | verdict                                        |
| --------------------------------------------------------------- | ---------------------------------------------- |
| candidates existed, an exclude glob discarded all of them       | abstain (throw)                                |
| an excluded directory was pruned, leaving nothing               | abstain (throw) — pruning is tracked           |
| explicit `files` list resolved to nothing readable (glob, typo) | abstain (throw)                                |
| the project holds no file in any scanned extension              | **not applicable** — truthful zero-file result |

Pruning an excluded directory is tracked, so `design.exclude: ['**/*']` cannot
turn "the config excluded everything" into "this project has no design surface"
and skip the abstention.

**And pruning is a strict subset of per-file exclusion.** The directory check
asks the _same_ `isExcluded` predicate the per-file filter uses, about two
synthetic paths under the directory (an immediate child and a deeply nested
one): a pattern that excludes both, for arbitrary names at two depths, excludes
everything below. An earlier revision instead stripped a trailing globstar and
matched with `matchBase`, which made a pattern's last segment match any
directory basename at any depth — so `vendor/**` pruned `src/vendor` while the
per-file filter _keeps_ `src/vendor/nested.css`, and a bare `vendor` (a complete
no-op before this change) deleted whole subtrees. A real DRIFT-T001 was silently
never read: the defect this module exists to remove, reintroduced by its own
optimisation. The property matters because the per-file filter can only remove
_more_ files — it can never restore a pruned one, so pruning is safe in exactly
one direction.

### Two scope widenings that change this repository's numbers

- **The scan set is gated by RULE APPLICABILITY, not by file exclusion.**
  `DESIGN_SCAN_EXTENSIONS` goes from 6 entries to 17: the module variants
  (`.mts`, `.cts`, `.mjs`, `.cjs`), the preprocessor dialects (`.less`, `.pcss`,
  `.sass`, `.styl`) and the single-file-component containers (`.vue`,
  `.svelte`, `.astro`). `token-bypass-rule.ts` is pure regex over the raw
  source with **no extension gate**, so DRIFT-T001..T004 produce identical,
  true findings on all of them — measured, 2 findings each for the same
  `.x { color: #ff0000; background: #00ff00; }` across css, scss, tsx, vue,
  svelte, astro, less, pcss, sass and styl. Excluding a dialect never protected
  anyone from a bad finding; it silently dropped a real one. The rules that do
  need a narrower surface already gate themselves
  (`primitive-adoption-rule.ts:54` returns `[]` unless jsx/tsx), and `.css` /
  `.scss` have always been scanned **despite** primitive-adoption not applying
  to them — the governing precedent. Accepted under-reporting: the anatomy
  conventions and BRAND-V001 key on JSX shapes, so on an SFC container they see
  `<script>` but not the template; and the token regex wants `prop: value`, so
  colon-less stylus is read but not matched. Both are rule limits to fix in the
  rules — under-reporting a component beats refusing to read it and calling the
  result clean. The TS/JS half is also exactly the set `check-deps`
  discovers, so the two commands no longer disagree about what counts as source
  in one repository.
- **The walk depth cap is GONE.** It was 8, then briefly 32-with-abstention.
  A cap that drops files without saying so is the same defect as auditing nothing
  and reporting clean, just partial — **two** files in THIS repository sat at
  depth 9 and were never scanned, one a `.tsx`, so the denominator was quietly
  short. (An earlier revision of this note said five; it is two, which is what
  the code and test comments say.) The cap's stated justification — protection
  from "a pathological or symlink-looping tree" — was **false**:
  `readdirSync(dir, { withFileTypes: true })` is lstat-based, so
  `Dirent.isDirectory()` is `false` for a symlink to a directory and the walk
  never follows one; a direct symlink cycle terminates immediately. Real depth
  is PATH_MAX-bounded and the cost of a repository walk is breadth, not depth.

Together these widen the scan by **+107 files**, which is the stable figure:
the absolute counts move every time this branch merges `main`, the delta does
not. Measured apples-to-apples on one tree at this head, the old walk
(6 extensions, depth cap 8) finds **4,167** and the new collector **4,274** —
identical with or without `design.exclude` applied, since the old walk had no
pruning. (An earlier revision said "from 4,152", a delta of +116; that
before-figure came from a different tree state. +107 is the honest one, measured
two independent ways that agree.)

The last row matters: `harness init` followed by `harness validate` is exactly that
case, and a brand-new project is not an incomplete validation run. This repository
already draws the same line for the roadmap doctor — an absent `docs/roadmap.md` is
"not applicable", not "could not check". `harness check-design` records a throwing
verifier under `verifiersFailed` and exits 2 (degraded) — though note
`commands/check-design.ts` resolves `hasErrors ? 1 : degraded ? 2 : 0`, so on any
project with an error-severity finding the exit code is 1 and the degraded code
never surfaces. On this repository, where `detect-design-drift` alone emits 225
error-severity findings, an abstention exits 1.

`harness validate` used to catch the throw into a severity-`warning` issue, which
left `valid: true`, `complete: true` and exit 0 over an audit that applied no rule —
the same defect one layer up. All three design abstentions now go through
`result.unavailableChecks`, the channel `roadmapHealth` already uses, which forces
`complete: false` and the incomplete-run exit code. A project with no design surface is not
applicable rather than abstaining, so `harness init` + `harness validate` still
exits 0; a project whose `design.exclude` discards its whole design surface changes
from exit 0 to the incomplete-run exit code.

## Also breaking: audit-brand-compliance's scope shrank

`audit-brand-compliance` never honoured any exclude config — its private `collectFiles`
walked the project and returned everything. Sharing `collectDesignScanFiles` means it
now honours `design.exclude ∪ analysis.exclude` like its two siblings. That is the
point of the extraction (one `check-design` run, one file set), but it is a scope
_reduction_ for brand specifically: an adopter who excludes a directory and relies on
`BRAND-T001` / `BRAND-V001` firing inside it will stop seeing those findings. On this
repository brand reports 0 findings either way, so the change is not observable here.

## Cost: the default scan is no longer free

`audit-anatomy` previously read zero files in ~0 ms. Measured on this repository
with a freshly built CLI, `runAudit({ mode: 'fast' })` is now **4,274 files, 2
findings, ~1-3 s** (warm vs cold); `--mode full` reports 3,141 findings in the
same order of time. Every `harness validate` and `harness check-design` caller pays that, and
`validate` runs all three widened verifiers. If the latency matters more than the
coverage, scope the run with `--files`, narrow it with `design.exclude` /
`analysis.exclude`, or disable a verifier via `design.audit.*.enabled: false`.

## Two consequences of abstaining honestly, both fixed here

**`check-design --json` stayed machine-readable.** Each verifier-failed branch
called `logger.warn`, which is `console.log` — stdout. An abstention therefore
prefixed `! audit-anatomy verifier failed: …` to the JSON payload and every
`--json` consumer got `SyntaxError: Unexpected token '!'` instead of a result.
Verifiers failing was near-unreachable before this change, so the warn had never
mattered; abstaining honestly made it live. The four warns are gone — the
abstention was already carried in `verifiersFailed`, rendered in the text report
and present in `--json`, so nothing is lost and the duplicate is removed.

**An abstained verifier is no longer rendered as `(0 findings)`.** The human
report printed `audit-anatomy (0 findings)` for a verifier that had read
nothing — the #2070 symptom one surface over, since a reader who skims past the
failure list below takes that as clean. Abstained verifiers now print
`audit-anatomy (did not run — see below)`, and the section heading went from
`Verifiers that failed:` to `Verifiers that did not run (this report is
incomplete):`. A verifier that genuinely ran and found nothing still prints its
real `(0 findings)`.

**A disabled verifier is not `(0 findings)` either.** `check-design` now reads
the same `design.audit.*.enabled` keys `harness validate` already honours — it
read **none** of them before, so the documented way to acknowledge a verifier
does not apply simply did not work on this command. A disabled verifier prints
`(disabled by config — did not run)` and is carried in `--json` as
`summary.verifiersDisabled`, because an acknowledged opt-out is not a clean
result any more than an abstention is.

**The abstention message names the real config keys.** It used to say
`design.audit.*.enabled: false`; that glob is not actionable, since the schema
names exactly `componentAnatomy`, `driftDetection` and `brandCompliance` and
anything else is rejected with `ignored unknown key`. All three are now spelled
out, and both levers are covered by tests that run the built CLI end to end
rather than asserting on the message string.

## Two cost notes and two known asymmetries

**Long lines are super-linear, and the widening extends the exposure.** The
per-line regex cost on a pathological single-line file is super-linear and
**pre-existing** — on a 360KB one-line file `.styl` and `.css` are
indistinguishable (44.8s vs 45.7s), so nothing here introduced it. But seven
more dialects are now in scope and the depth cap is gone, so more of a
repository can reach it. The ~1-3s figure above is this repository's happy path,
not a bound.

**`SKIPPED_DIRECTORIES` and dot-directories do not set the pruning flag.** A
project whose only design surface lives under `build/`, `coverage/` or
`.storybook/` therefore reports a truthful-looking `valid: true` over an unread
tree, rather than abstaining. This is pre-existing and not config-driven — those
skips are unconditional, so no adopter setting produced them — but it is an
asymmetry with the exclude path, which now does abstain. `.storybook/` is a
plausible real design surface and the most likely way to hit it.

**QUIET mode prints nothing**, so `(0 findings)`, `(did not run — see below)`
and `(disabled by config — did not run)` all collapse to silence with only the
exit code to tell them apart. Pre-existing; more reachable now that two of those
three states exist.
