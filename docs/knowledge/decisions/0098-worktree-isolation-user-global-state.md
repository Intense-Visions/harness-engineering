---
number: 0098
title: The worktree isolation boundary vs user-global state
date: 2026-08-18
status: proposed
tier: medium
source: 'design routing of bug-backlog issue #1299'
---

## Context

The `-fleet` family's execution architecture (ADR 0087) fans out each build lane into
its own **git worktree** so lanes cannot collide, and it is precisely that isolation
guarantee that lets a fleet run N lanes concurrently _without reasoning about
interference between them_. The concurrency governor caps the machine storm; the
worktree is what makes the storm safe. But a git worktree isolates exactly one thing:
**the repository working tree**. It does not isolate the process's `$HOME`, its
XDG dirs, or `~/.claude/`. A lane whose feature exercises a code path that writes
**user-global state** writes straight through the worktree boundary to the operator's
real, live state — the boundary was never there.

The concrete incident (#1299): a `roadmap-fleet` lane building per-subagent token
attribution for `burn` ran its verification through `burn`'s own writer, which resolves
its store from `$HOME`/`homedir()` (`packages/burn/src/config.ts` →
`~/.claude/hud/state/summary.json`). The lane's verification rewrote the operator's live
HUD summary with attribution fields present in **neither** the installed CLI **nor**
`origin/main`; a later scan by the released CLI overwrote it back. This particular store
is a derived cache that rebuilds in seconds, so impact _this time_ was low.

The low impact is a property of _which_ store was hit, not of the boundary. The general
case is not low-impact: two concurrent lanes that both touch user-global state race each
other with no worktree to separate them, and a single lane's _verification run_ can
corrupt user state that is not a cheap derived cache (settings, credentials, non-derived
stores). "The worktree isolates the lane" is currently a half-truth the family relies on
as if it were whole.

## Decision

Adopt a **per-lane state-isolation boundary that extends beyond the git worktree to
user-global state**, and state it explicitly in the family's isolation contract.

1. **The isolation contract covers repo _and_ user-global state.** A lane is isolated
   only when neither its execution nor its verification can reach the operator's real
   `$HOME`/`~/.claude`/XDG state. `docs/reference/fleet-family.md` is updated: the
   worktree covers the repo; a per-lane state-dir override covers everything a worktree
   does not, and the two together — not the worktree alone — are "lane isolation."

2. **Recommended mechanism — a per-lane state directory via environment override.** For
   the duration of a lane, redirect user-global state to a per-worktree sandbox by
   setting the process environment the lane and its subagents inherit (a per-lane `HOME`,
   and/or a dedicated `HARNESS_STATE_DIR` that state-writers honor). This is the most
   general option: it isolates _every_ user-global writer at once rather than teaching
   each one about workspaces, and it matches the git-worktree intent — one throwaway
   sandbox per lane, discarded with the lane. The seam already exists for the store that
   triggered this: `burn`'s `resolvePaths()` reads `env.HOME` and `CLAUDE_HUD_*` before
   falling back to `homedir()`, so a per-lane `HOME`/`CLAUDE_HUD_HOME` redirects it with
   no code change. The remaining work is to make that override the _contract_ a fan-out
   parent injects, not an incidental capability, and to hold user-global writers to
   reading it.

3. **Verification runs inside the boundary.** Because the incident's write came from a
   _verification_ run, the override must be in force for VERIFY as well as DISPATCH — the
   phase that exercises the built code against real writers is exactly where the boundary
   must hold.

## Consequences

- **Positive:** the isolation guarantee the family already leans on becomes true rather
  than half-true — N lanes touching user-global state no longer interfere, and no lane's
  verification can corrupt the operator's real HUD, settings, or credentials. The
  boundary is uniform (one env contract) instead of per-tool.
- **Negative / tradeoffs:** environment-plumbing complexity — a fan-out parent must
  construct and inject the per-lane env into every subagent and child process, and a lane
  that inherits the wrong `HOME` fails in ways that look like flaky subagents (the same
  failure shape the runtime-preconditions section already warns about for the interpreter
  path). Tools that hardcode `homedir()` instead of reading `env.HOME`/an override escape
  the sandbox silently; closing the hole fully means auditing user-global writers, and any
  writer that ignores the override is a latent leak that no test currently catches.
- **Reversibility:** high — the boundary is an injected environment contract plus a
  documented isolation clause, not a structural change. Tightening it to option (c) below,
  or per-tool scoping (option b), remains open.

## Alternatives Considered

- **(b) Make `burn` (and each user-global writer) workspace-scope-aware so a lane writes
  to a lane-local store.** Rejected as the primary mechanism — it fixes one writer at a
  time and re-opens the hole every time a new user-global writer is added or a lane
  exercises one nobody scoped. It is a fine _complement_ (a writer that also honors a
  workspace scope is more robust) but a poor _boundary_, because the boundary must hold
  for writers the fleet author never enumerated.
- **(c) Declare user-global state out of scope for isolation and forbid lanes from
  exercising code paths that write it during verification.** Rejected — it makes the
  isolation guarantee conditional on every lane author correctly identifying every
  user-global write path, which is precisely the reasoning the worktree exists to spare
  them; and it would forbid legitimately verifying a feature like `burn` attribution,
  whose whole point is to write that state.
- **Do nothing (accept the incident as low-impact).** Rejected — the low impact was
  incidental to hitting a rebuildable cache; the boundary hole is real for
  non-derived state and for concurrent same-store lanes.

## References

- Source issue: **#1299** — the `burn`-HUD write-through incident.
- Family isolation contract: `docs/reference/fleet-family.md` (the worktree isolation
  guarantee and its push-path caveat) — updated by this decision to cover user-global
  state.
- Companion: [`0087-subagent-fanout-vs-workflow-primitive.md`](0087-subagent-fanout-vs-workflow-primitive.md)
  — the worktree fan-out execution model whose isolation boundary this ADR extends.
- First instance to plumb: `packages/burn/src/config.ts` `resolvePaths()` (already reads
  `env.HOME` / `CLAUDE_HUD_*`) and `packages/cli/src/commands/burn/install.ts` (writes via
  `homedir()`).
- ADR convention: `docs/knowledge/decisions/README.md`.
