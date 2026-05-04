# Integration: Harness Engineering $\rightarrow$ OpenCode (Parity Model)

## Overview

Establish full integration parity between Harness Engineering and OpenCode, mirroring the seamless experience available in Claude Code. The goal is to ensure that any project using Harness can be worked on within OpenCode with all workflows, tools, and skills automatically provisioned and ready for use.

## Design Goals

- **Zero-Config Setup**: Automate the provisioning of slash commands and MCP servers.
- **Skill Parity**: Ensure 1:1 availability of Tier 1 workflow skills as native opencode commands.
- **Tooling Access**: Provide direct, seamless access to the Harness CLI and Knowledge Graph via MCP.
- **Workflow Consistency**: Use `AGENTS.md` as the primary mechanism for guiding agent behavior across platforms.

## Technical Design

### 1. Automatic Skill Provisioning

Leverage the existing Harness slash-command generation pipeline (`packages/cli/src/slash-commands/`) to populate OpenCode's custom commands.

**Pipeline**:
`Harness Registry` $\rightarrow$ `normalizeSkills()` $\rightarrow$ `renderOpencode()` $\rightarrow$ `.opencode/commands/<name>.md`.

**Implementation**:

- Implement the `renderOpencode` renderer to map `SlashCommandSpec` (description, agent, model) to OpenCode's markdown frontmatter and template format.
- Automate this sync during project initialization (`/init`) or via a dedicated `harness setup` command.

### 2. MCP Auto-Provisioning

Ensure the Harness MCP server is automatically registered within the OpenCode environment.

**Logic**:

- The adapter will detect if the `harness` CLI is installed on the system.
- It will automatically inject/update the MCP server configuration in `opencode.json` or the global config directory, ensuring tools like `knowledge_graph`, `traceability`, and `manage_roadmap` are available to the agent without manual JSON editing.

### 3. Workflow Integration via AGENTS.md

Since OpenCode relies on `AGENTS.md` for project-specific guidance, we will treat this file as the "Control Plane" for Harness workflows.

**Integration**:

- Provide a template/standard for the "Harness Section" of `AGENTS.md`.
- Guide agents to use the newly provisioned `/harness:*` commands as their primary entry points for brainstorming, planning, and verification.

## Integration Points

### Entry Points

- **Custom Commands**: A full suite of `/harness:*` slash commands in `.opencode/commands/`.
- **MCP Tools**: Native access to the Harness CLI tools via the MCP server.
- **Project Config**: Automatic updates to `opencode.json` for MCP and tool configuration.

### Registrations Required

- Addition of the `renderOpencode` renderer to the `packages/cli/src/slash-commands` pipeline.
- Mapping of Tier 1 skills in the registry to ensure they are flagged for command generation.

### Documentation Updates

- Update adoption guides to explain how to enable Harness within OpenCode.
- Create a "Quick Start" guide for transitioning from Claude Code to OpenCode while maintaining Harness workflows.

## Success Criteria

- [ ] Typing `/` in the OpenCode TUI reveals all Tier 1 Harness skills as available commands.
- [ ] The agent can successfully call Harness MCP tools (e.g., querying the graph) without manual config.
- [ ] New projects initialized with Harness automatically have their `.opencode/commands/` populated.
- [ ] Workflow transition (Brainstorm $\rightarrow$ Plan $\rightarrow$ Execute) is identical to the Claude Code experience.

## Implementation Order

1. **Phase 1: Opencode Renderer**: Implement `renderOpencode` in the slash-command pipeline.
2. **Phase 2: Command Sync**: Build the utility to write these commands into `.opencode/commands/`.
3. **Phase 3: MCP Auto-Config**: Implement the logic to automatically register the Harness MCP server in OpenCode config.
4. **Phase 4: Integration Testing**: Verify that a fresh project can be "Harness-enabled" and all tools/commands are functional.
5. **Phase 5: Documentation**: Update `AGENTS.md` templates and user guides.
