---
schemaVersion: 1
module: 'packages/cli/src/exports'
sourceHash: '848621af102eb40debe7657d1b28548684379eba9d4ac6b44a2138bf4a2cff2c'
compiledAt: '2026-08-28T01:22:09.225Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['commands.ts', 'graph.ts', 'persona.ts', 'registry.ts']
---

## Summary

This is the public API barrel for the CLI package, organizing re-exports into four cohesive domains: Commands (validation gates, code generation, analysis), Graph Operations (knowledge graph lifecycle), Personas (multi-step workflow orchestration), and Skills (registry management). The module acts as a clean pass-through that CLI commands, MCP tools, and external integrations consume as the primary surface.

## Invariants

- Types follow implementations — every command/orchestrator export includes its result type (e.g., CheckArchResult + runCheckArch). Consumers need both for integration.
- Personas are the orchestration primitive — Persona schema + runPersona executor form a closed loop; detectTrigger and executeSkill are helper operands, not independent primitives.
- Skill execution is distinct from skill management — executeSkill (runtime) is separate from install/uninstall/constraints operations (registry). Mixing these breaks the phase boundary.
- Agent definitions are personas-adjacent — agent generators and persona runners co-export because personas execute agents as steps; their lifetimes are locked.
- Graph and command domains don't cross — graph operations are read-only analysis; commands are mutating actions. No export bridges them; callers must orchestrate separately.
- Exports are organized by domain, not by caller — the four-group organization (commands, graph, persona, registry) is a stability contract; changing it breaks import paths.

## Interface Contract

```ts
export AGENT_DESCRIPTIONS
export ALLOWED_PERSONA_COMMANDS
export AgentDefinition
export CheckArchResult
export CommandExecutor
export CommandStep
export CreateSkillOptions
export DEFAULT_TOOLS
export GEMINI_TOOL_MAP
export GenerateAgentDefsOptions
export GenerateAgentDefsResult
export GenerateResult
export HandoffContext
export InstallConstraintsOptions
export InstallConstraintsSuccess
export InstallResult
export Persona
export PersonaMetadata
export PersonaRunReport
export SkillExecutionContext
export SkillExecutionResult
export SkillExecutor
export SkillSource
export SkillStep
export SnapshotCaptureResult
export Step
export StepExecutionContext
export StepReport
export TriggerContext
export TriggerDetectionResult
export UninstallConstraintsOptions
export UninstallConstraintsSuccess
export UninstallResult
export detectTrigger
export executeSkill
export generateAgentDefinition
export generateAgentDefinitions
export generateAgentsMd
export generateCIWorkflow
export generateRuntime
export generateSkillFiles
export generateSlashCommands
export listPersonas
export loadPersona
export renderClaudeCodeAgent
export renderGeminiAgent
export runCheckArch
export runCheckPhaseGate
export runCrossCheck
export runGraphExport
export runGraphStatus
export runImpactPreview
export runIngest
export runInstall
export runInstallConstraints
export runPersona
export runQuery
export runScan
export runSnapshotCapture
export runUninstall
export runUninstallConstraints
```

## Dependency Slice

```

```
