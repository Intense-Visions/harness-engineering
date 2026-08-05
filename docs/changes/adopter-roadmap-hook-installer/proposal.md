# Adopter-facing git-hook installer for roadmap aggregate regeneration

**Keywords:** roadmap, sharding, git-hooks, husky, pre-commit, aggregate-regen, adopter-tooling

## Overview

Follow-up from #684 (roadmap sharding). When a project shards its roadmap
(`docs/roadmap.d/<slug>.md` + a generated `merge=ours` aggregate at
`docs/roadmap.md`), the aggregate must be regenerated whenever a shard changes so
it never drifts. This repo does that with a `.husky/pre-commit` step that runs
`harness roadmap regen` and re-stages `docs/roadmap.md`. Adopters who shard their
roadmap want the same local convenience, but harness ships no adopter-facing way
to install that hook.

This change adds `harness roadmap install-hook`: an idempotent installer that
wires the regen step into an adopter's `pre-commit` hook, composing safely with
an existing husky or raw `.git/hooks` setup.

### Goals

1. One command installs a `pre-commit` hook that runs `harness roadmap regen` and
   re-stages `docs/roadmap.md` when any `docs/roadmap.d/` shard is staged.
2. Compose safely with the adopter's existing setup — husky (`.husky/pre-commit`)
   or raw `.git/hooks/pre-commit` — never clobbering their own hook steps.
3. Idempotent: re-running replaces the managed block in place (fenced by markers)
   and is a no-op when nothing changed.
4. Degrade gracefully when the project is not sharded (`docs/roadmap.d/` absent):
   skip with a clear message, unless `--force` is used to pre-provision.

### Out of Scope

- Wiring the installer into `harness init` (opt-in for new projects) — a follow-up
  once the standalone command has proven out.
- A `post-merge` hook installer. The pre-commit path is the primary drift source;
  merges are already covered by the CI aggregate-drift check.
- Changing the freshness contract. **CI (`harness validate`) remains the
  authoritative, portable freshness mechanism** (read-source invariant R means a
  missed regen only yields a stale cosmetic aggregate, never wrong tooling). This
  hook is a local developer convenience, per the sharding guide.

## Decisions

| #   | Decision                                                                       | Rationale                                                                                                  |
| --- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| D1  | New `harness roadmap install-hook` subcommand (not a flag on `hooks init`)     | `harness hooks` manages Claude Code tool-use hooks, which cannot fire on `git commit`; this is a GIT hook  |
| D2  | Fenced managed block (`# >>> … >>>` / `# <<< … <<<`) merged into the hook      | Idempotent replace-in-place; never duplicates and never clobbers the adopter's own hook steps              |
| D3  | `--mechanism auto` picks husky when `.husky/` exists, else raw `.git/hooks`    | Matches whatever the adopter already uses; `--mechanism husky` / `--mechanism git` forces a choice         |
| D4  | Guarded regen (`git diff --cached … grep docs/roadmap.d`) + fail-closed        | No-op unless a shard is staged; a regen failure blocks the commit rather than committing a stale aggregate |
| D5  | Skip-with-warning when not sharded; `--force` installs anyway                  | Graceful degradation; `--force` lets an adopter pre-provision before `harness roadmap shard`               |
| D6  | Default regen command `npx harness roadmap regen`, overridable via `--command` | Resolves the local CLI bin in an adopter repo; override supports pnpm/yarn or a pinned path                |

## Technical Design

`packages/cli/src/commands/roadmap/install-hook.ts`:

- `runRoadmapInstallHook(opts)` — resolves the git repo, detects sharding,
  resolves the mechanism + hook path (`git rev-parse --git-path hooks` for
  worktree/submodule correctness, falling back to `.git/hooks`), merges the
  managed block, writes it, and `chmod +x`es the hook (best-effort on non-POSIX).
- `mergeHookContent(existing, block)` — the pure idempotent merge: fresh file →
  shebang + block (`created`); existing managed block → replace in place
  (`updated` / `unchanged`); adopter hook with no managed block → append
  (`updated`, preserving their steps).
- `buildRegenBlock(command)` — the fenced, guarded, fail-closed shell block.
- `createRoadmapInstallHookCommand()` — Commander wrapper with `--cwd`,
  `--mechanism`, `--command`, `--force`, `--format {human,json}`; registered in
  `roadmap/index.ts`.

## Success Criteria

1. `harness roadmap install-hook` in a sharded repo writes an executable
   `pre-commit` hook containing the guarded regen block; a real `git commit` that
   stages a shard regenerates and re-stages `docs/roadmap.md`.
2. Re-running is idempotent (`unchanged`) and never duplicates the block.
3. An existing husky / `.git/hooks` `pre-commit` keeps its own steps; the block is
   appended, not substituted.
4. In an unsharded repo the command skips gracefully (writes nothing) and
   `--force` installs anyway.
