# Ecosystem-aware self-verify prose in the local stage prompt

**Status:** proposed
**Keywords:** local-dispatch, stage-prompt, self-verify, ecosystem-detection, strict-variables, liquidjs, verify-gate, polyglot

## Overview

Follow-up to #1115 (roadmap #1002). PR #1115 made the _enforced_ local-dispatch
verify GATE ecosystem-aware: `defaultLocalVerifyRunner` now calls
`detectEcosystem(workspacePath)` and, for a non-node workspace, runs THAT
toolchain's verify commands (`uv run pytest`, `cargo build`/`cargo test`, …)
instead of shelling `pnpm -w run …` at a workspace that has no pnpm.

The local per-stage prompt's **self-verify PROSE** was not updated in the same
pass. `LOCAL_STAGE_PROMPT_TEMPLATE` (in
`packages/orchestrator/src/workflow/local-stage-prompt.ts`) still hardcodes:

```
pnpm --filter <changed-package-name> typecheck
pnpm --filter <changed-package-name> lint
pnpm --filter <changed-package-name> test
```

So on a Python/Rust/Go/Ruby/Java workspace the model is TOLD to self-verify with
`pnpm --filter …` — a command that does not exist in that ecosystem — while the
gate it is trying to satisfy actually runs `uv run pytest` (etc.). The guidance
contradicts the gate, guaranteeing a wasted first attempt and a re-dispatch.

## Problem boundary

**In scope:** make the self-verify command block in the LOCAL stage-prompt render
the detected ecosystem's verify commands, reusing the ecosystem detector added by
#1115. No duplication of detection logic.

**Out of scope:** the enforced gate (already ecosystem-aware, #1115); the default
(cloud) `STAGE_PROMPT_TEMPLATE`, which has no local self-verify block; the
ecosystem detection table itself; adding new ecosystems.

## Decisions made

- **Mirror the gate's node / non-node split in the prose.** The enforced node gate
  is deliberately _scoped per changed package_ (`pnpm --filter <name> run <script>`);
  #1115 preserved that node path byte-for-byte and only diverted NON-node
  workspaces to `ecosystem.verifyCommands`. The prose should describe what the gate
  actually does, so we apply the identical split:
  - non-node ecosystem detected → render `ecosystem.verifyCommands` verbatim
    (the exact command set the gate runs for that toolchain);
  - node ecosystem, or nothing detected → keep the existing scoped
    `pnpm --filter <changed-package-name> …` prose.

  Rendering node's `ecosystem.verifyCommands` (`pnpm -w run …`, workspace-wide)
  instead would tell node agents to verify the whole monorepo — slower than, and
  divergent from, the scoped gate they must satisfy. Rejected.

- **Strict-variables renderer change = one new context variable.** Per #1115's
  note, LiquidJS runs with `strictVariables: true`, so the template can only
  reference variables the renderer supplies. We thread a single new
  `verifyCommands: string[]` into the render context in `renderStagePromptFactory`
  and iterate it in the template. LiquidJS throws only on _referenced-but-absent_
  variables; an extra bag entry the default template does not reference is safe, so
  both templates keep rendering.

- **Fallback when no ecosystem is detected.** A worktree whose root cannot be read,
  or that carries no recognized manifest, yields `detectEcosystem(...) === null`.
  We fall back to the existing scoped pnpm prose — identical to the gate's own
  fallthrough-to-node behavior and to the current shipped text (graceful
  degradation / no behavior change for the common node case).

- **Reuse `detectEcosystem`, do not duplicate.** Detection happens once inside the
  `renderStagePromptFactory` closure using the `workspacePath` already available in
  `buildWorkflowContext`.

## Technical design

1. `renderStagePromptFactory(promptRenderer, issue, priorGateFailure)` gains a
   `workspacePath` parameter. `buildWorkflowContext` already destructures
   `workspacePath` from its deps and passes it to other factories; thread it here
   too.

2. Inside the render closure, compute the command set:

   ```ts
   const ecosystem = detectEcosystem(workspacePath);
   const verifyCommands =
     ecosystem !== null && ecosystem.language !== 'node'
       ? [...ecosystem.verifyCommands]
       : [
           'pnpm --filter <changed-package-name> typecheck',
           'pnpm --filter <changed-package-name> lint',
           'pnpm --filter <changed-package-name> test',
         ];
   ```

   Add `verifyCommands` to the render context bag.

3. In `LOCAL_STAGE_PROMPT_TEMPLATE`, replace the hardcoded three-line bash block
   with a LiquidJS loop:

   ```
   {% for cmd in verifyCommands %}{{ cmd }}
   {% endfor %}
   ```

   The default `STAGE_PROMPT_TEMPLATE` is unchanged and never references
   `verifyCommands`.

## Success criteria

1. On a non-node workspace (e.g. `uv.lock` / `Cargo.toml` present) the rendered
   LOCAL stage prompt's self-verify block contains that ecosystem's commands
   (`uv run pytest`, `cargo build`, `cargo test`, …) and NO `pnpm --filter` line.
2. On a node workspace (or a workspace with no recognized manifest) the rendered
   block is byte-identical to today's scoped `pnpm --filter <changed-package-name>`
   prose.
3. The default (cloud) `STAGE_PROMPT_TEMPLATE` render path is byte-identical to
   before (no `verifyCommands` reference; strictVariables does not trip).
4. Detection reuses `detectEcosystem` from `workspace/ecosystem.ts`; no duplicated
   detection logic is introduced.
5. Existing orchestrator tests pass; new unit coverage asserts criteria 1–3.

## Implementation order

1. Thread `workspacePath` into `renderStagePromptFactory` and derive
   `verifyCommands`; add it to the render context.
2. Replace the hardcoded command block in `LOCAL_STAGE_PROMPT_TEMPLATE` with the
   `verifyCommands` loop.
3. Add unit tests (non-node commands rendered; node/undetected fallback unchanged;
   default template unaffected).
4. Self-verify (typecheck + lint + test on the orchestrator package) and add a
   changeset.
