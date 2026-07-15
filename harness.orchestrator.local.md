---
tracker:
  kind: roadmap
  filePath: docs/roadmap.md
  activeStates: [planned, in-progress]
  terminalStates: [done]
polling:
  intervalMs: 30000
workspace:
  root: .harness/workspaces
hooks:
  afterCreate: null
  beforeRun: null
  afterRun: null
  beforeRemove: null
  timeoutMs: 60000
agent:
  # Named backend definitions (Spec 2). See docs/guides/multi-backend-routing.md.
  # `capabilities` (tier/cost/privacy/context) let AMR compare backends and select a
  # capability tier per dispatch — a backend without one is invisible to tier selection.
  backends:
    primary:
      type: claude
      command: claude
      capabilities:
        { tier: strong, costPer1kTokens: 15, privacyClass: shared-cloud, contextWindow: 200000 }
    # Local backend for autonomous execution of simple tasks.
    # `model` accepts a string OR a prefer-and-fallback array — first
    # match wins after a `/v1/models` probe.
    local:
      type: pi
      # Ollama's OpenAI-compatible API lives under /v1 (the resolver probes
      # `${endpoint}/models`). Names must match `ollama list` exactly.
      endpoint: http://127.0.0.1:11434/v1
      # Prefer-and-fallback: first name present in /v1/models wins. Coder model
      # first (local routes are quick-fix/diagnostic), general model as fallback.
      # Quote the names — the ':tag' colon otherwise breaks YAML flow parsing.
      model: ['qwen2.5-coder:7b', 'gemma3n:e4b']
      capabilities:
        { tier: fast, costPer1kTokens: 0, privacyClass: on-device, contextWindow: 32768 }
  # Routing — controls WHICH backend handles each use case.
  routing:
    default: primary
    quick-fix: local
    diagnostic: local
    # Route the intelligence pipeline (sel/pesl) to the local backend.
    intelligence:
      sel: local
      pesl: local
    # AMR (Adaptive Model Routing) — opt-in; its PRESENCE flips dispatch from the
    # identity/default chain to complexity-aware tier selection. trivial/simple →
    # local (fast, free); moderate/complex → claude (no `standard` backend, so a
    # `standard` requirement resolves to the cheapest backend at-or-above it =
    # primary). The always-on baseline-relative security-defect feeder climbs a
    # unit's tier after `escalationThreshold` consecutive quality failures
    # (strong-capped, then hard-fails to a human). Budget cap + LLM acceptance-eval
    # are available opt-ins (docs/guides/adaptive-model-routing.md) — left off here.
    policy:
      complexityTierMatrix: { trivial: fast, simple: fast, moderate: standard, complex: strong }
      escalationThreshold: 2
  # Escalation — controls WHETHER a tier dispatches at all (orthogonal to routing).
  escalation:
    alwaysHuman: [full-exploration]
    autoExecute: [quick-fix, diagnostic]
    primaryExecute: [guided-change]
    signalGated: []
    diagnosticRetryBudget: 1
  maxConcurrentAgents: 1
  maxTurns: 10
  maxRetryBackoffMs: 5000
  maxConcurrentAgentsByState: {}
  globalCooldownMs: 60000
  maxRequestsPerMinute: 50
  maxRequestsPerSecond: 1
  # Default limits based on Anthropic Tier 3. Adjust according to your account tier.
  # Tier 1: 40k ITPM / 10k OTPM
  # Tier 2: 200k ITPM / 40k OTPM
  # Tier 3: 400k ITPM / 80k OTPM
  # Tier 4: 1m ITPM / 200k OTPM
  maxInputTokensPerMinute: 400000
  maxOutputTokensPerMinute: 80000
  turnTimeoutMs: 300000
  readTimeoutMs: 30000
  stallTimeoutMs: 60000
intelligence:
  enabled: true
  requestTimeoutMs: 180000
server:
  port: 8080
localModels:
  enabled: true
  pool:
    diskBudgetGb: 100
    allowedOrgs: [Qwen, deepseek-ai, meta-llama, google]
    allowedFamilies: []
  refresh:
    intervalMs: 86400000
    proposalThreshold: 5
    jitterMs: 600000
  installer:
    backend: ollama
    ollamaEndpoint: http://127.0.0.1:11434
# Built-in maintenance tasks run on cron when `maintenance.enabled: true`.
# Notable housekeeping tasks: `main-sync` (every 15 min) fast-forwards the
# orchestrator's local default branch from origin so files read from `cwd`
# (e.g., docs/roadmap.md, harness.orchestrator.md) stay current. Sync is
# fast-forward-only — never destructive — and skips with a structured
# warning event if the working tree is dirty, the branch is wrong, or the
# local default has diverged. Disable all maintenance via `maintenance.enabled: false`.
#
# Per-task Run Now (since 2026-05-09): the dashboard Maintenance page renders
# a Run Now button on every row of the schedule table. The previous single-
# button affordance (which always triggered `project-health`) has been
# removed. Each button is disabled while a `maintenance:started` event is in
# flight for that task ID and re-enables on the matching `maintenance:completed`
# or `maintenance:error` event.
maintenance:
  enabled: true
---

# Prompt Template (Local Backend — bootstrap shim)

You are a local agent with `bash`, `read`, `write`, `grep`, and `find`. You do
NOT have `/harness:*` slash commands or harness MCP tools. You run the REAL
harness workflow skills by reading them over bash — this template carries no
methodology of its own.

## Issue: {{ issue.title }}

**Identifier:** {{ issue.identifier }}
**Description:** {{ issue.description }}

## How to run a harness skill (the indirection rule)

To run any harness workflow skill, execute it over bash and follow its output
**verbatim**:

```bash
harness skill run <skill-name> --autonomous --path .
```

`harness skill run` prints the skill's full instructions (the same content the
primary backend gets from a `/harness:*` slash command) to stdout as a plain CLI
read. `--autonomous` prepends the headless-decider preamble: you do the full
analysis at full rigor but YOU decide every fork and record it in the spec — you
never pause for a human.

**Redirect rule.** Whenever a skill's output instructs you to run `/harness:X`,
instead run `harness skill run harness-X --autonomous`. Slash commands are
unavailable on this backend; the skill-run indirection is their equivalent.

## Full-workflow entry sequence

Run these in order, each via `harness skill run <name> --autonomous --path .`,
following each skill's output before moving on:

1. `harness-brainstorming` — runs at full rigor (≥2 approaches, YAGNI, persona
   council, soundness), but YOU decide the forks (autonomous) and record each
   decision in the spec.
2. `harness-planning`
3. `harness-execution` (or `harness-tdd` for test-driven work)
4. `harness-verification`
5. `harness-code-review`

Run `harness skill list` to see the full roster of available skills.

## Gates (enforced by the harness, not just by you)

The orchestrator INDEPENDENTLY enforces `harness validate` plus the
verify/outcome-eval gates against your branch after you exit — you cannot ship
past a red gate. Reach a green state: run `harness validate` and the project's
own typecheck/lint/test yourself and fix every failure before shipping. A run
that cannot reach green is halted and re-dispatched rather than shipped, and
escalated to a human if the retry budget is exhausted.

## Ship (only after the gates are green)

- Create a topic branch if you are still on `main`/`master`
  (e.g. `feat/{{ issue.identifier }}`).
- Stage your changes and create a descriptive commit (Conventional Commits style).
- Push the branch with `git push -u origin HEAD`.
- Open a pull request with `gh pr create`. Use a HEREDOC for the body:

  ```bash
  gh pr create --title "<title>" --body "$(cat <<'EOF'
  ## Summary

  <body content with real newlines>
  EOF
  )"
  ```

- Report the PR URL as your final output, then stop.

Attempt Number: {{ attempt }}
