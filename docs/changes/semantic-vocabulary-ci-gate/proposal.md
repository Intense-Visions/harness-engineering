# Semantic-Vocabulary CI Gate

**Keywords:** vocabulary-drift, glossary, naming-craft, terminology-gate, deprecated-terms, canonical-terms, adopter-facing, check-command, skills, docs, prose-scan

## Overview

A harness analog of Spec Kitty's `test_no_legacy_terminology.py`, rebuilt as a
**shipped, adopter-facing CLI command** — `harness check-vocabulary`. It fails when a
deprecated or renamed canonical term reappears in an adopter's skill or doc prose,
protecting a glossary and naming-craft investment from vocabulary drift over time.
Once a term is renamed, the gate keeps the old spelling from creeping back in, and
points the author at the canonical replacement with the exact file and line.

Harness is a framework that adopters install in their own projects, so its checks
must ship as `harness check-*` commands that read the adopter's
`harness.config.json` — not as harness-repo-internal tests wired into harness's own
`ci.yml`. This gate follows the same shape as `check-docs`, `check-security`, and
`check-arch`: it reads a config block, scans the configured surfaces, prints
findings, supports `--json`, and exits non-zero on any violation. Harness itself
**dogfoods** the command through its own `vocabulary` config block, wired into
harness CI as `node packages/cli/dist/bin/harness.js check-vocabulary`.

### Goals

1. A pure, unit-testable scanner (`packages/cli/src/vocabulary/scanner.ts`) that
   ships in `@harness-engineering/cli`, finds deprecated terms in Markdown prose,
   and reports `{file, line, deprecated, canonical, reason?, excerpt}`.
2. A `vocabulary` config block in the harness config schema — the extension point —
   with `enabled`, `rules` (`{deprecated, canonical, reason?, allow?}`), and
   `paths` / `exclude` globs (sensible defaults).
3. A `harness check-vocabulary` command mirroring `check-docs`: `resolveConfig`,
   scan, per-violation reporting, `--json`, exit `VALIDATION_FAILED` on any finding.
4. Low false-positive by construction: prose-only matching (fenced code blocks and
   inline code stripped), case-insensitive word-boundary matching, per-rule allow
   exemptions, and default exclusion of historical/archival surfaces.
5. Harness dogfoods the shipped command via its own five seed rules + a CI step.

### Non-Goals

- A general natural-language style linter or spell-checker.
- Enforcing vocabulary in source-code identifiers (naming-craft critiques those).
- Auto-fixing / rewriting offending prose (the gate reports; the author edits).
- A harness-repo-internal vitest suite wired into harness's own CI (the rejected
  first design — it shipped nothing to adopters).

## Assumptions

- **The gate must stay green on `main`.** Each of harness's five seed rules'
  deprecated forms has zero occurrences across the in-scope Markdown surfaces. New
  rules must clear the same bar (or the offenders must be fixed) before landing.
- **Markdown prose is the canonical vocabulary surface.** Skills
  (`agents/skills/**`) and docs (`docs/**`) are where terminology is authored and
  read; scanning them catches drift where it matters without the false-positive
  risk of scanning code.
- **Historical surfaces legitimately reference old/external vocabulary.** ADRs,
  change proposals (this proposal cites the deprecated terms), and research
  analyses are excluded by default rather than exempted line-by-line.

## Decisions

| #   | Decision                                                                                                          | Rationale                                                                                                                                                                                                  |
| --- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Ship as a `harness check-vocabulary` CLI command reading `harness.config.json`, not a harness-internal test**   | Harness is a framework adopters install; its checks must run in _their_ projects against _their_ config. A repo-internal vitest test ships nothing to adopters. Mirrors the established `check-*` pattern. |
| 2   | **Config-driven `vocabulary` block** (`enabled`, `rules`, `paths`, `exclude`) as the extension point              | Adopters register their own renames declaratively in JSON. `allow` regex sources + `reason` are expressible in JSON so the whole rule set is data, no code changes to extend.                              |
| 3   | **Pure scanner module in `packages/cli/src/vocabulary/`** so it ships and stays unit-testable                     | `scanText` is pure and sync (fixture-testable); `scanFiles`/`resolveScanFiles` do I/O via the `glob` dependency for portability across adopter Node versions.                                              |
| 4   | **Prose-only matching** — strip fenced (` ``` `/`~~~`) and inline `` `code` `` before matching                    | A deprecated spelling inside a code sample or identifier is not vocabulary drift. Stripping code removes the dominant false-positive source while preserving original line numbers.                        |
| 5   | **Case-insensitive, word-boundary matching; interior whitespace matches any run of whitespace**                   | "codebase" must never match a "code base" rule as a substring; "code base" (or a line-wrapped variant) must still be caught. Word boundaries + `\s+` normalization give both.                              |
| 6   | **Trivial pass when `enabled: false` or `rules` is empty (including an absent block)**                            | The gate is inert until an adopter opts in with rules, so it is safe to ship on by default and safe to run in any project.                                                                                 |
| 7   | **Seed harness's own config with the five closed-compound / branch-name rules; wire the shipped command into CI** | Dogfooding proves the command works end-to-end against a real config, and the five rules carry real value (they catch the drift) while keeping harness's baseline green.                                   |

## Technical Design

### Module layout

```
packages/cli/src/
  vocabulary/scanner.ts              # pure scanner: types + scanText/scanFiles/resolveScanFiles/formatViolations
  config/schema.ts                   # VocabularyConfigSchema + VocabularyRuleSchema, wired into HarnessConfigSchema
  commands/check-vocabulary.ts       # the `harness check-vocabulary` command (mirrors check-docs)
  commands/_registry.ts              # registers createCheckVocabularyCommand
packages/cli/tests/
  commands/check-vocabulary.test.ts  # scanner unit tests + command tests
  fixtures/semantic-vocabulary/      # deprecated/clean samples + enabled/clean/disabled/empty configs
```

### Config block

```jsonc
"vocabulary": {
  "enabled": true,               // default true; false ⇒ trivial pass
  "rules": [                     // default []; empty ⇒ trivial pass
    { "deprecated": "sub-agent", "canonical": "subagent", "reason": "closed compound", "allow": ["..."] }
  ],
  "paths":   ["agents/skills/**/*.md", "docs/**/*.md"],          // default
  "exclude": ["**/node_modules/**", "docs/knowledge/decisions/**",
              "docs/changes/**", "docs/research/**", "docs/roadmap-archive.md"] // default
}
```

### Algorithm

1. The command calls `resolveConfig`, reads the `vocabulary` block (defaulting an
   absent block through the schema). If disabled or ruleless, it returns a trivial
   `valid: true, skipped: true` result.
2. `resolveScanFiles(root, {include, exclude})` expands `paths` via `glob` with
   `ignore: exclude`, de-dupes, and sorts.
3. For each file, `scanText` splits into lines, `stripCode` blanks fenced-block and
   inline-code content (line indices preserved), then each rule's word-boundary
   matcher runs against the stripped prose. A hit is skipped if any `allow` regex
   (compiled case-insensitively) matches the original line.
4. The command prints an actionable `file:line — "x" is deprecated; use "y"` block
   (or JSON with `--json`) and exits `VALIDATION_FAILED` when any violation exists.

### Seeded rules (harness dogfood)

| Deprecated      | Canonical     | Reason                                        |
| --------------- | ------------- | --------------------------------------------- |
| `sub-agent`     | `subagent`    | canonical closed compound                     |
| `sub-task`      | `subtask`     | canonical closed compound                     |
| `code base`     | `codebase`    | canonical closed compound                     |
| `green field`   | `greenfield`  | canonical closed compound                     |
| `master branch` | `main branch` | default branch is `main`; `master` is retired |

Each deprecated form has zero in-scope occurrences — so the gate is immediately
green and immediately useful.

## Integration Points

- **CLI:** `harness check-vocabulary` (registered in `_registry.ts`), shipped in
  `@harness-engineering/cli`.
- **Config schema:** `VocabularyConfigSchema` on `HarnessConfigSchema.vocabulary`.
- **Harness CI:** `.github/workflows/ci.yml` runs the shipped command
  (`node packages/cli/dist/bin/harness.js check-vocabulary`) next to the other
  gates — dogfooding, not a bespoke vitest step.
- **Adopters:** add a `vocabulary` block to their own `harness.config.json` and run
  `harness check-vocabulary` in their CI.

## Success Criteria

1. `harness check-vocabulary` passes on harness's own repo with the five seed rules.
2. A deprecated term added to a scanned Markdown file fails the gate with the file,
   line, and suggested canonical term.
3. Clean prose and canonical spellings pass; deprecated spellings inside code blocks
   / inline code do not trip the gate.
4. `--json` emits a machine-readable result; disabled/ruleless config passes trivially.
5. The rule set is extended by adding one object to `vocabulary.rules` in config —
   no scanner or command changes required.

## Implementation Order

1. Pure scanner + types (`packages/cli/src/vocabulary/scanner.ts`).
2. `VocabularyConfigSchema` in `packages/cli/src/config/schema.ts`.
3. `check-vocabulary` command + registry registration.
4. Fixtures + tests (scanner unit + command).
5. Harness dogfood: `vocabulary` block in `harness.config.json` + CI step.
6. Regenerate reference docs; verify green baseline, typecheck, lint.
