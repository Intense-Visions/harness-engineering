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
  # Install workspace deps so the enforced verify gate can actually run — a fresh
  # git-worktree workspace has no node_modules, so verify would fail environmentally
  # and block EVERY local dispatch. Fast via the pnpm store. Adopters on other
  # ecosystems set their own command (npm ci / pip install -r … / cargo fetch / …).
  afterCreate: 'pnpm install --prefer-offline'
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
      type: ollama
      # Ollama's OpenAI-compatible API lives under /v1 (the resolver probes
      # `${endpoint}/models`). Names must match `ollama list` exactly.
      endpoint: http://127.0.0.1:11434/v1
      # Prefer-and-fallback: first name present in /v1/models wins. Coder model
      # first (local routes are quick-fix/diagnostic), general model as fallback.
      # Quote the names — the ':tag' colon otherwise breaks YAML flow parsing.
      model: ['qwen2.5-coder:7b', 'gemma3n:e4b']
      # Qwen3 reasons by default; Ollama /v1 ignores reasoning:false, so disable it
      disableReasoning: true
      capabilities:
        { tier: fast, costPer1kTokens: 0, privacyClass: on-device, contextWindow: 32768 }
      # Optional: give the local agent tools from MCP servers, merged with its
      # built-in bash/read_file/write_file. Tools are namespaced `<server>__<tool>`;
      # a server that fails to start is skipped (never breaks the dispatch). Default
      # (unset) = built-ins only. See docs/guides/multi-backend-routing.md#mcp-tools.
      # mcpServers:
      #   - name: context7        # live library docs — stop coding from stale memory
      #     command: npx
      #     args: ['-y', '@upstash/context7-mcp']
      #   - name: harness          # code_search / ask_graph / review_changes /
      #     command: harness-mcp    # outcome_eval, run against the agent's workspace
      #     tools: [code_search, ask_graph, review_changes, outcome_eval, gather_context]
      #                             # narrow harness's ~95 tools to the read-oriented set
      #                             # so a local model isn't flooded (omit tools = all).
    # Local REASONING backend for the DESIGN phases of a staged workflow
    # (cognitiveMode: thinking). A larger reasoning model (qwen3:32b) with
    # reasoning LEFT ON — the design stages benefit from the <think> trace, so
    # unlike the `local` coder we do NOT set disableReasoning. routing.modes.thinking
    # points here (see routing.modes below).
    reasoner:
      type: ollama
      endpoint: http://127.0.0.1:11434/v1
      model: ['qwen3:32b']
      # Reasoning stays ON for design (thinking) stages — this is the reasoner.
      disableReasoning: false
      capabilities:
        { tier: strong, costPer1kTokens: 0, privacyClass: on-device, contextWindow: 32768 }
  # Routing — controls WHICH backend handles each use case.
  routing:
    default: primary
    quick-fix: local
    diagnostic: local
    # Per-phase routing: a staged workflow's DESIGN stages (cognitiveMode: thinking)
    # route here — to the local reasoner — while its execution stages carry no
    # cognitiveMode and fall to routing.default. See the `workflows:` decl below.
    modes:
      thinking: reasoner
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
# Staged workflows (per-phase routing). A matched unit is dispatched as ONE
# multi-stage run on a single worktree instead of chained skill invocations:
# the DESIGN stages carry `cognitiveMode: thinking` and route to
# routing.modes.thinking (the local `reasoner`); the EXECUTION stages carry no
# cognitiveMode and fall to routing.default. Each stage's prior output threads
# to the next over the text channel (expects/produces). A local-endpoint routed
# stage renders the `harness skill run <skill> --autonomous` indirection prompt
# automatically. `workflowFor` only returns a plan for a decl with >= 2 stages.
workflows:
  - name: local-full-workflow
    match: { identifierPrefix: 'LOCAL-' }
    stages:
      - { skill: harness-brainstorming, cognitiveMode: thinking, produces: spec }
      - { skill: harness-planning, cognitiveMode: thinking, expects: spec, produces: plan }
      - { skill: harness-execution, expects: plan, produces: impl }
      - { skill: harness-verification, expects: impl, produces: verify }
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

# Prompt Template

You are an expert coding agent working on the Harness Engineering project.
Your goal is to implement the following issue using the standard Harness Engineering workflow.

## Issue: {{ issue.title }}

**Identifier:** {{ issue.identifier }}
**Description:** {{ issue.description }}

## Standard Workflow

Follow these steps exactly, using the corresponding slash commands to ensure
high-quality, architecturally sound delivery:

<!-- This slash-command workflow targets Claude-shaped backends. A backend-specific
     variant, `harness.orchestrator.local.md`, is auto-selected for `local`/`pi`
     backends (which lack `/harness:*` slash commands) and expresses the same
     workflow via bash `harness <gate>` CLI calls. See ADR 0071. -->

1. **Brainstorming:** Use `/harness:brainstorming` to explore the problem space
   and draft a technical proposal in `docs/changes/`. The spec MUST include an
   Integration Points section defining how the feature connects to the system.
2. **Planning:** Use `/harness:planning` to create a detailed implementation plan.
   The plan MUST include integration tasks derived from the spec's Integration Points.
3. **Execution:** Use `/harness:execution` to implement the changes task-by-task,
   including integration tasks (registrations, ADRs, doc updates).
4. **Verification:** Use `/harness:verification` to ensure the implementation is
   complete, wired correctly, and meets all requirements.
5. **Integration:** Use `/harness:integration` to verify that system wiring,
   knowledge materialization, and documentation updates are complete per the
   integration tier.
6. **Code Review:** Use `/harness:code-review` and `/harness:pre-commit-review`
   to perform a final quality check before completing the task.
   6b. **Compound (when applicable):** Run `/harness:compound` when ANY of these
   three concrete triggers fired during this issue:
   (a) `/harness:debugging` was invoked at any point (regardless of outcome),
   (b) the fix required more than one commit on the issue branch, or
   (c) execution involved >1 attempt (`Attempt Number` above is greater than 1).
   Otherwise skip silently. The triggers are mechanical — no judgment required.
   6.5. **Outcome Eval:** Use `/harness:outcome-eval` to judge whether the
   implementation satisfied its spec. It gathers the diff and test output,
   resolves the spec's acceptance section, and emits a confidence-rated
   `OutcomeVerdict`. **Verdict authority (derived in TypeScript, never from the
   LLM): a high-confidence `NOT_SATISFIED` BLOCKS ship — halt here and fix the
   implementation or spec before proceeding; every other verdict (all
   `SATISFIED`, all `INCONCLUSIVE`, and medium/low `NOT_SATISFIED`) is advisory
   — report it and continue.**
7. **Ship:** When the review is clean, you are pre-authorized to ship without asking:
   - Create a topic branch if you are still on `main`/`master` (e.g. `feat/{{ issue.identifier }}`).
   - Stage your changes and create a descriptive commit (Conventional Commits style).
   - Push the branch with `git push -u origin HEAD`.
   - Open a pull request. Use a HEREDOC for the body to preserve newlines:
     ```
     gh pr create --title "<title>" --body "$(cat <<'EOF'
     ## Summary
     <body content with real newlines>
     EOF
     )"
     ```
     Or use `gh pr create --fill` to auto-generate from commit messages.
   - Report the PR URL as your final output, then stop. Do not await further instructions — this is the terminal step of the workflow.

## Rules

- Always verify your changes with `harness validate`.
- Adhere to the architectural constraints defined in `harness.config.json`.
- For non-trivial learnings, run `/harness:compound` (writes structured docs to
  `docs/solutions/<track>/<category>/`). The `.harness/learnings.md` file remains
  for ephemeral session notes only and is not preserved as compounding knowledge.
- Step 7 (Ship) is part of the standard workflow. Do not pause to ask for commit authorization — completing the issue means the PR has been opened.
- Step 6.5 (Outcome Eval) is a gate: a high-confidence `NOT_SATISFIED` verdict blocks Ship. Do not proceed to step 7 until the verdict is non-blocking.

Attempt Number: {{ attempt }}
