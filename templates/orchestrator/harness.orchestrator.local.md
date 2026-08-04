---
# ─────────────────────────────────────────────────────────────────────────────
# LOCAL-EXECUTION orchestrator config — the validated, fully-local setup for
# autonomous CONTAINED maintenance/engineering tasks (on-device, NO cloud calls).
# The enforced gates make it SAFE: it blocks/retries/escalates and NEVER ships
# broken or spec-violating work. Full operator guide, task-fit envelope, operating
# rules, hardware notes, and the hybrid variant: docs/guides/local-execution.md.
#
# SCOPE IT: the orchestrator picks every planned/in-progress row by Status, so
# `tracker.filePath` points at a CURATED local-eligible QUEUE (only contained
# tasks — see the triage checklist in the guide), NOT your whole roadmap. Complex
# logic / cross-module refactors are above the local coder's ceiling — keep them
# out, or use the hybrid variant to escalate them to `primary`.
# ─────────────────────────────────────────────────────────────────────────────
tracker:
  kind: roadmap
  filePath: .harness/local-queue.roadmap.md
  activeStates: [planned, in-progress]
  terminalStates: [done]
polling:
  intervalMs: 30000
workspace:
  root: .harness/workspaces
hooks:
  # Install deps AND build the CLI so the worktree's pre-commit gate
  # (`harness ci check`) actually RUNS — the ship commits/pushes THROUGH the real
  # gates (no --no-verify). Adopters on other ecosystems substitute their install.
  afterCreate: 'pnpm install --prefer-offline && pnpm --filter @harness-engineering/cli... run build'
  beforeRun: null
  afterRun: null
  beforeRemove: null
  timeoutMs: 60000
agent:
  backends:
    # Cloud backend — present ONLY for the hybrid variant to escalate to; kept OUT
    # of `routing` below so this config is fully-local by default.
    primary:
      type: claude
      command: claude
      capabilities:
        { tier: strong, costPer1kTokens: 15, privacyClass: shared-cloud, contextWindow: 200000 }

    # Direct-ollama coder for quick-fix/diagnostic (single-shot) routes. Curated
    # MCP tool allowlist — NOT the full ~99-tool flood, which makes a local model
    # over-explore. Precise agentic-coding sampling (not ollama's hot default).
    local:
      type: ollama
      endpoint: http://127.0.0.1:11434/v1
      model: ['qwen3-coder:30b']
      disableReasoning: true
      temperature: 0.6
      topP: 0.95
      topK: 20
      numCtx: 65536
      capabilities:
        { tier: fast, costPer1kTokens: 0, privacyClass: on-device, contextWindow: 65536 }
      mcpServers:
        - name: context7
          command: npx
          args: ['-y', '@upstash/context7-mcp']
        - name: harness
          command: harness-mcp # dogfooding this repo? use: node packages/cli/dist/bin/harness-mcp.js
          tools:
            [
              manage_roadmap,
              code_search,
              code_outline,
              ask_graph,
              gather_context,
              find_context_for,
              review_changes,
              run_code_review,
              run_ci_checks,
              outcome_eval,
              acceptance_eval,
              spec_craft,
              test_craft,
            ]

    # CODER (execution + verification) — Codex driving the local coder. Codex's
    # edit + self-verify + retry loop converges where a bare tool-loop stalls.
    # `reasoningEffort: none` is REQUIRED: qwen3-coder does not support thinking and
    # current ollama rejects a reasoning request outright ("does not support
    # thinking"), zeroing the coder; codex's DEFAULT still sends one, so `none` (not
    # omission) is the fix. routing.default points here.
    codex-exec:
      type: codex
      model: ['qwen3-coder:30b']
      localProvider: ollama
      reasoningEffort: none
      mcpServers:
        - name: context7
          command: npx
          args: ['-y', '@upstash/context7-mcp']
        - name: harness
          command: harness-mcp # dogfooding this repo? use: node packages/cli/dist/bin/harness-mcp.js
          tools: [code_search, code_outline, ask_graph, gather_context, review_changes]

    # REASONER (design + planning + review — cognitiveMode: thinking). Thinking
    # model with reasoning LEFT ON; writes the spec/plan the coder builds against.
    reasoner:
      type: ollama
      endpoint: http://127.0.0.1:11434/v1
      model: ['qwen3.6:27b']
      disableReasoning: false
      capabilities:
        { tier: fast, costPer1kTokens: 0, privacyClass: on-device, contextWindow: 65536 }

    # JUDGE (the settle-gate outcome-eval / spec-vs-diff verdict). A FAST
    # NON-reasoning model — a reasoning model is unusable on /v1 (empty content or
    # multi-minute stalls). gpt-oss:20b returns a correct verdict in ~8s and is more
    # INDEPENDENT than the coder judging its own work.
    judge:
      type: ollama
      endpoint: http://127.0.0.1:11434/v1
      model: ['gpt-oss:20b', 'qwen3-coder:30b']
      disableReasoning: true
      capabilities:
        { tier: fast, costPer1kTokens: 0, privacyClass: on-device, contextWindow: 32768 }

  routing:
    # Fully-local: execution/verification → codex-exec. `primary` (claude) is kept
    # OUT of routing. HYBRID variant: set `default: primary` (or route only complex
    # tiers to it) to escalate hard work — see the guide.
    default: codex-exec
    quick-fix: local
    diagnostic: local
    # Per-phase: design/plan/review stages carry `cognitiveMode: thinking` → reasoner;
    # execution/verify carry none → routing.default.
    modes:
      thinking: reasoner
    # Analysis/judge layer (outcome-eval at the enforced gate) → the fast judge.
    intelligence:
      sel: judge
  # Bound the loop, then escalate — never grind forever. Exhaustion → needs-human
  # (or, in the hybrid variant, hand off to primary).
  escalation:
    maxLocalStageRetries: 4
    alwaysHuman: [full-exploration]
  maxConcurrentAgents: 1

# Staged local workflow — the real lifecycle as discrete, persona-routed stages.
# design/plan/review carry cognitiveMode: thinking (→ reasoner); execution/verify
# fall to routing.default (→ codex-exec). After review the orchestrator ENFORCES
# the gates: mechanical (typecheck+lint+test) + spec-vs-diff outcome-eval; a
# high-confidence NOT_SATISFIED blocks + re-dispatches with the failure threaded
# back. match identifierPrefix 'local-' — name local-eligible queue rows 'local-<slug>' (see the guide).
workflows:
  - name: local-full-workflow
    match: { identifierPrefix: 'local-' }
    stages:
      - { skill: harness-brainstorming, cognitiveMode: thinking, produces: spec, checkpoint: true }
      - {
          skill: harness-planning,
          cognitiveMode: thinking,
          expects: spec,
          produces: plan,
          checkpoint: true,
        }
      - { skill: harness-execution, expects: plan, produces: impl }
      - { skill: harness-verification, expects: impl, produces: verify }
      - { skill: harness-code-review, cognitiveMode: thinking, expects: impl, produces: review }

# Intelligence pipeline off by default (the enforced outcome-eval gate builds its
# provider from the judge backend directly — see the guide). Enable for AMR.
intelligence:
  enabled: false
server:
  enabled: false
---

# Prompt Template (local single-agent fallback)

This body is used ONLY for a unit that does NOT match a staged `workflows:` decl
(the staged path renders its own per-stage prompts). You are an autonomous agent
working exactly as a real harness session would. In addition to bash/read/write
you have the harness MCP toolset (namespaced `harness__*` on the ollama path; on
the codex path, use codex's own edit/patch + the injected read tools) — USE the
real tools when a skill calls for them instead of approximating with bash.

## Issue: {{ issue.title }}

**Identifier:** {{ issue.identifier }}
**Description:** {{ issue.description }}

## Run a harness skill (the indirection rule)

```bash
harness skill run <skill-name> --autonomous --path .
```

`harness skill run` prints the skill's full instructions to stdout; `--autonomous`
means YOU decide every fork at full rigor and never pause for a human. Whenever a
skill's output says to run `/harness:X`, run `harness skill run harness-X
--autonomous` instead.

## Editing existing files: surgical edits only, never rewrite a whole file

Change only the exact lines that must change; APPEND to existing docs/lists (never
regenerate a shared file from scratch — that drops other entries); never leave
backup/scratch files (`*.bak`, `temp_*`). Actually RUN any test you author and
confirm it passes against your implementation.

## Gates (enforced by the harness, not just by you)

The orchestrator INDEPENDENTLY enforces `harness validate` plus typecheck + lint +
the full test suite, and a spec-vs-diff outcome-eval, against your branch — you
cannot ship past a red gate. Reach a green state yourself (run `harness validate`
and the project's typecheck/lint/test and fix every failure); a run that can't is
halted and re-dispatched, and escalated to a human when the retry budget is
exhausted.

## Ship (only after the gates are green)

Create a topic branch, commit (Conventional Commits), `git push -u origin HEAD`,
open a PR with `gh pr create`, report the PR URL, then stop.

Attempt Number: {{ attempt }}
