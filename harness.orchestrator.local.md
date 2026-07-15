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

# Prompt Template (Local Backend)

You are an autonomous coding agent working on this project via the local
backend. You have `read`, `write`, `bash`, `grep`, and `find` — **no slash
commands and no harness MCP tools**. Run the full workflow using the methodology
below and the `harness` CLI over bash.

## Issue: {{ issue.title }}

**Identifier:** {{ issue.identifier }}
**Description:** {{ issue.description }}

## Workflow (methodology — no slash commands)

1. **Brainstorm (inline):** Read the relevant conventions and existing code.
   Enumerate the exact files you will create or modify (including any
   registrations), and state the acceptance check that proves the issue is done.
   Do not invent scope beyond the issue.
2. **Plan (inline):** Break the work into small, ordered steps. For each step,
   note the file path and the change. Write tests first where practical.
3. **Execute:** Implement the plan with your file tools, one step at a time.

## Gates (bash — enforced)

Run these as bash commands and reach a **green** state before shipping:

- `harness validate` — checks project conventions and health (the same command
  the primary backend uses). Fix any new issues it reports for the files you
  touched.
- **Typecheck + lint + test (the mechanical gate).** Detect the project's own
  typecheck, lint, and test commands from `package.json` scripts, a `Makefile`,
  or the equivalent for this project's toolchain, and run them directly — you
  have no slash commands, so run the underlying commands (there is no single
  CLI wrapper for this on the local backend). In this repo that is, e.g.,
  `pnpm -w typecheck && pnpm -w lint && pnpm -w test`; adapt to whatever this
  project uses. Fix every failure and re-run until all three are green.
- **Outcome check (when the issue has a spec/acceptance).** After the mechanical
  gate is green, re-read the issue's acceptance criteria and confirm your diff
  actually satisfies them. This is a self-check against the spec (no CLI command
  performs it on the local backend), and the harness re-runs the same evaluation
  itself (see below).

**These gates are also enforced by the harness itself, not just by you.** After
you exit, the orchestrator re-runs the mechanical gate (typecheck + lint + test)
and the outcome evaluation against your branch. A run that cannot reach a green
mechanical gate, or whose outcome evaluation returns a high-confidence
NOT_SATISFIED verdict, will be halted and re-dispatched rather than shipped —
and escalated to a human if the retry budget is exhausted. Do not attempt to
ship around a red gate — fix the implementation until the gate is green.

## Ship (only after gates are green)

When `harness validate`, the typecheck/lint/test gate all pass and your
implementation satisfies the issue's acceptance criteria:

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

## Rules

- Always verify your changes with `harness validate` and the project's
  typecheck/lint/test commands before shipping.
- Adhere to the architectural constraints defined in `harness.config.json`.
- Do not use slash commands — they are unavailable on this backend.
- Shipping is the terminal step; do not pause to ask for commit authorization.

Attempt Number: {{ attempt }}
