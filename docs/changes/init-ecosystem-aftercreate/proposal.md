---
title: Scaffold ecosystem-matched afterCreate install command + warn when neither install nor verify resolves
status: planned
tier: small
keywords: [init, ecosystem-detector, afterCreate, install-command, verify-gate, local-dispatch, orchestrator-config, workspace-bootstrap]
external-id: 1128
---

# Scaffold ecosystem-matched afterCreate install command + warn when neither install nor verify resolves

## Overview

The language-aware ecosystem detector (`packages/orchestrator/src/workspace/ecosystem.ts`)
returns, for every recognized workspace, BOTH the dependency-install command
(`installCommand` — "what a matching `hooks.afterCreate` should scaffold",
per the module docstring) AND the ordered verify command set (`verifyCommands`).

PR #1115 (roadmap #1002, `trustworthy-staged-local-dispatch`) wired the **verify**
half into the runtime enforced gate (`defaultLocalVerifyRunner` in
`packages/orchestrator/src/orchestrator.ts:358`): a non-node workspace now runs its
own toolchain's verify commands instead of a hardcoded `pnpm -w run …` that failed
environmentally. The **install** half is still unwired — the scaffolded orchestrator
config (`templates/orchestrator/harness.orchestrator.md:16`) hardcodes
`afterCreate: 'pnpm install --prefer-offline'` for every adopter regardless of
ecosystem. A Python/Rust/Go/Ruby/Java adopter who scaffolds the orchestrator config
gets a pnpm install hook that cannot run.

This change wires the install half symmetrically: `harness init`, when it scaffolds the
orchestrator config, derives `hooks.afterCreate` from the detected ecosystem's
`installCommand`; and any `harness init` warns loudly when the workspace has neither an
install nor a verify command resolvable (an unrecognized ecosystem), because that same
condition silently no-ops the runtime verify gate.

**Goals**

- `harness init` scaffolds a `hooks.afterCreate` matching the detected ecosystem's install command, reusing the existing detector (no duplication).
- `harness init` warns loudly, non-blocking, when neither an install nor a verify command is resolvable for the target workspace.

**Non-goals (YAGNI)**

- Making a plain `harness init` (without the orchestrator template) start emitting an orchestrator config file — out of scope; only the file that already carries `hooks.afterCreate` is made ecosystem-aware.
- Changing the ecosystem detector table, the runtime verify gate, or the `beforeRun`/`afterRun`/`beforeRemove` hooks.
- Adding new ecosystems or per-ecosystem install-flag tuning.

## Decisions made

1. **Reuse the existing detector, never duplicate it.** The CLI already declares
   `@harness-engineering/orchestrator` as a workspace dependency
   (`packages/cli/package.json:42`), and the detector is a public export
   (`detectEcosystem` from `@harness-engineering/orchestrator`). The init flow imports it.
   _Rationale:_ the detector is the single language-agnostic source of truth; the issue
   explicitly says reuse it.

2. **Scaffold afterCreate by rewriting the written orchestrator config, not by
   re-authoring the template.** `templates/orchestrator/harness.orchestrator.md` is a
   plain `.md` (YAML frontmatter), not a `.hbs`, so it is written verbatim by the template
   engine. A contained post-write step rewrites the single `afterCreate:` line in the
   file the engine just wrote, when that file is in the write set and an ecosystem is
   detected. _Rationale:_ smaller blast radius and directly unit-testable versus converting
   the template to Handlebars and threading a render variable through the engine.

3. **Warn condition = `detectEcosystem(cwd) === null`.** Both `installCommand` and
   `verifyCommands` are properties of the single `Ecosystem` descriptor, and every entry in
   the detector table carries a non-empty value for both. Therefore "neither an install nor
   a verify command resolvable" is exactly the null-detection case (no recognized lockfile
   or manifest at the workspace root). _Rationale:_ one precise, testable condition; no
   partial-resolution states exist to handle.

4. **Warn is non-blocking.** Per the issue ("warn loudly"), the warning is a
   `logger.warn` — `harness init` still succeeds and exits 0. _Rationale:_ init must remain
   usable on an as-yet-unrecognized workspace; the signal is advisory, matching how the
   runtime gate treats an unrecognized workspace as a clean pass.

5. **The detector table is the source of truth for the scaffolded command.** Rewriting
   `afterCreate` from `installCommand` replaces the template's `pnpm install --prefer-offline`
   with the table's `pnpm install` for node-pnpm (dropping the `--prefer-offline`
   optimization). _Rationale:_ the module docstring designates `installCommand` as the value a
   matching `afterCreate` should scaffold; a single source of truth beats a
   micro-optimization that would otherwise drift.

## Technical design

**New helper — `applyEcosystemAfterCreate`** (in `packages/cli/src/templates/post-write.ts`,
alongside the existing `persistToolingConfig` / `ensureHarnessGitignore` post-write steps):

```
export interface EcosystemAfterCreateResult {
  ecosystem: Ecosystem | null;      // detector result at cwd
  orchestratorConfigWritten: boolean; // was harness.orchestrator.md in the write set + on disk
  rewritten: boolean;               // did we replace the afterCreate line
  installCommand?: string;          // the value written, when rewritten
}

export function applyEcosystemAfterCreate(
  cwd: string,
  writtenFiles: string[]
): EcosystemAfterCreateResult
```

Behavior:
- `detectEcosystem(cwd)` (imported from `@harness-engineering/orchestrator`).
- If `harness.orchestrator.md` is among `writtenFiles` and exists on disk and an ecosystem
  was detected: read the file, replace the value on the single `afterCreate:` frontmatter
  line with `'<ecosystem.installCommand>'` (single-quoted, preserving indentation and the
  surrounding lines), write it back. Set `rewritten: true`.
- Never throws: a read/write failure or an absent `afterCreate:` line degrades to
  `rewritten: false` (init must not fail on a best-effort scaffold step).
- Returns the result for the caller to log from.

**Line rewrite** — match the existing frontmatter line
`^(\s*)afterCreate:\s.*$` and replace with `$1afterCreate: '<installCommand>'`. Anchored to
the `afterCreate:` key so the comment block above it and every sibling hook line are
untouched. Only the first match is rewritten (there is exactly one).

**Wiring in `init.ts` `scaffoldProject`** — after `ensureHarnessGitignore(cwd)` and using
the already-computed `writeResult.value.written`:

```
const eco = applyEcosystemAfterCreate(cwd, writeResult.value.written);
if (eco.rewritten) {
  logger.info(`Scaffolded afterCreate install hook for ${eco.ecosystem!.id}: ${eco.installCommand}`);
} else if (eco.ecosystem === null) {
  logger.warn(
    'No install or verify command could be resolved for this workspace ' +
    '(no recognized lockfile or manifest at the root). The local enforced verify gate ' +
    'has nothing to run and no afterCreate install hook was scaffolded. Configure ' +
    'hooks.afterCreate and the verify command manually for your toolchain.'
  );
}
```

The warn fires on ANY `harness init` whose target workspace is unrecognized (independent of
whether the orchestrator config is in the write set), because the null-ecosystem condition
also silently no-ops the runtime verify gate.

**File layout**

- `packages/cli/src/templates/post-write.ts` — add `applyEcosystemAfterCreate` + import `detectEcosystem`, `Ecosystem`.
- `packages/cli/src/commands/init.ts` — import and call the helper in `scaffoldProject`; log info/warn.
- `packages/cli/tests/templates/post-write.test.ts` (or a new sibling test) — unit tests for the helper.

## Integration points

- **Entry Points** — No new command. Extends the existing `harness init` scaffold path
  (`scaffoldProject`) and adds one exported helper in the CLI templates module.
- **Registrations Required** — None. `applyEcosystemAfterCreate` is an internal helper;
  no barrel/CLI/skill registration. `detectEcosystem` is already exported from the
  orchestrator index (`packages/orchestrator/src/index.ts:31`).
- **Documentation Updates** — None required for a small change. The orchestrator config
  guide already documents that adopters on other ecosystems set their own afterCreate; the
  scaffold now does that automatically. (Optional: a one-line note in the multi-backend /
  orchestrator config doc — deferred unless the docs gate flags it.)
- **Architectural Decisions** — None rise to a standalone ADR (small change; no new
  boundary or contract).
- **Knowledge Impact** — None. Related existing knowledge:
  `docs/knowledge/cli/hook-profiles.md` (Claude Code hook profiles — distinct from
  orchestrator lifecycle hooks; no change).

## Success criteria

1. When `harness init` scaffolds `harness.orchestrator.md` in a node-pnpm workspace, the
   written file's `hooks.afterCreate` equals the detected ecosystem's install command
   (`pnpm install`).
2. When `harness init` scaffolds `harness.orchestrator.md` in a non-node workspace (e.g. a
   `uv.lock` Python workspace), the written `hooks.afterCreate` equals that ecosystem's
   install command (`uv sync`), not `pnpm …`.
3. When the target workspace has no recognized lockfile or manifest, `harness init` emits a
   single loud, non-blocking warning naming that neither an install nor a verify command
   could be resolved, and still exits successfully.
4. When an ecosystem IS detected, no such warning is emitted.
5. The `applyEcosystemAfterCreate` helper is pure enough to unit-test against fixture
   directories (detected ecosystem, unrecognized workspace, orchestrator-config-present vs
   absent) without invoking the full init command, and never throws on a missing/garbled
   `afterCreate:` line.
6. `pnpm -w run typecheck`, `lint`, and `test` pass for the `cli` package; existing init
   tests are unaffected.

## Implementation order

1. Add `applyEcosystemAfterCreate` (+ imports) to `post-write.ts` with the anchored line rewrite and best-effort no-throw semantics.
2. Wire the call + info/warn logging into `init.ts` `scaffoldProject`.
3. Add unit tests for the helper (node-pnpm rewrite, non-node rewrite, unrecognized→warn path signal, orchestrator-config-absent no-op, garbled-line no-op).
4. Add a changeset; run typecheck/lint/test for the affected package.
