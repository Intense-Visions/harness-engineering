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
  backend: claude
  command: claude
  # Local model for autonomous execution of simple tasks
  localBackend: pi
  localEndpoint: http://localhost:1234/v1
  localModel: gemma-4-e4b
  # Escalation routing — controls what runs locally vs primary vs human
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
- Document your progress and any learnings in `.harness/learnings.md`.
- Step 7 (Ship) is part of the standard workflow. Do not pause to ask for commit authorization — completing the issue means the PR has been opened.

Attempt Number: {{ attempt }}
