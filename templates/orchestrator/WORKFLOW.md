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
  maxConcurrentAgents: 1
  maxTurns: 10
  maxRetryBackoffMs: 5000
  maxConcurrentAgentsByState: {}
  turnTimeoutMs: 300000
  readTimeoutMs: 30000
  stallTimeoutMs: 60000
server:
  port: 8080
---

# Prompt Template

You are an expert coding agent working on the Harness Engineering project.
Your goal is to implement the following issue:

## Issue: {{ issue.title }}

**Identifier:** {{ issue.identifier }}
**Summary:** {{ issue.summary }}

## Instructions

1. Research the codebase to understand the requirements.
2. Implement the changes following the project's engineering standards.
3. Write tests to verify your changes.
4. Ensure `harness validate` passes.

Attempt Number: {{ attempt }}
