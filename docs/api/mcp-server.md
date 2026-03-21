# @harness-engineering/mcp-server

MCP (Model Context Protocol) server exposing 41 tools and 8 resources for AI agent integration with the Harness Engineering toolkit.

**Version:** 0.5.3

## Installation

```bash
npm install @harness-engineering/mcp-server
```

The package also provides a `harness-mcp` binary for standalone usage.

## Setup

Add to your MCP client configuration (e.g., Claude Desktop, Cursor):

```json
{
  "mcpServers": {
    "harness": {
      "command": "npx",
      "args": ["@harness-engineering/mcp-server"]
    }
  }
}
```

Or use the CLI setup command:

```bash
harness setup-mcp
```

## Programmatic API

### `createHarnessServer(projectRoot?)`

```typescript
function createHarnessServer(projectRoot?: string): Server;
```

Creates an MCP server instance. Uses `process.cwd()` if no project root is provided. Returns a `@modelcontextprotocol/sdk` `Server` instance.

### `startServer()`

```typescript
function startServer(): Promise<void>;
```

Creates a server and connects it to stdio transport. This is the main entry point for the `harness-mcp` binary.

### `getToolDefinitions()`

```typescript
function getToolDefinitions(): ToolDefinition[];
```

Returns the array of all MCP tool definitions (name, description, input schema).

### `resultToMcpResponse(result)`

Converts a `Result<T, E>` to an MCP-compatible response object.

### `resolveProjectConfig(rootDir)`

Resolves and loads the project configuration from a root directory.

## Tools (41)

### Validation & Architecture

| Tool                   | Description                                  |
| ---------------------- | -------------------------------------------- |
| `validate_project`     | Validate project structure and configuration |
| `check_dependencies`   | Check architectural dependency constraints   |
| `check_phase_gate`     | Run phase gate checks                        |
| `validate_cross_check` | Validate cross-references between documents  |

### Documentation

| Tool                     | Description                      |
| ------------------------ | -------------------------------- |
| `check_docs`             | Check documentation coverage     |
| `validate_knowledge_map` | Validate knowledge map integrity |

### Entropy & Code Quality

| Tool             | Description                                                  |
| ---------------- | ------------------------------------------------------------ |
| `detect_entropy` | Detect code entropy (drift, dead code, complexity, coupling) |
| `apply_fixes`    | Apply auto-fixes for entropy findings                        |

### Linting

| Tool                     | Description                            |
| ------------------------ | -------------------------------------- |
| `generate_linter`        | Generate ESLint rules from YAML config |
| `validate_linter_config` | Validate a linter YAML configuration   |

### Project Initialization

| Tool           | Description                             |
| -------------- | --------------------------------------- |
| `init_project` | Initialize a harness-engineered project |

### Personas

| Tool                         | Description                              |
| ---------------------------- | ---------------------------------------- |
| `list_personas`              | List available personas                  |
| `generate_persona_artifacts` | Generate runtime artifacts for a persona |
| `run_persona`                | Execute a persona workflow               |

### Agent & Skill Management

| Tool                         | Description                        |
| ---------------------------- | ---------------------------------- |
| `add_component`              | Add a component to the project     |
| `run_agent_task`             | Run a task using an agent          |
| `run_skill`                  | Execute a skill                    |
| `create_skill`               | Scaffold a new skill               |
| `generate_slash_commands`    | Generate slash command definitions |
| `generate_agent_definitions` | Generate agent definition files    |

### State Management

| Tool             | Description                 |
| ---------------- | --------------------------- |
| `manage_state`   | Read/write harness state    |
| `manage_handoff` | Save/load handoff documents |
| `list_streams`   | List all work streams       |

### Feedback & Review

| Tool                  | Description                    |
| --------------------- | ------------------------------ |
| `create_self_review`  | Create a self-review checklist |
| `analyze_diff`        | Analyze a code diff            |
| `request_peer_review` | Request a peer review          |
| `run_code_review`     | Run the full review pipeline   |

### Knowledge Graph

| Tool                | Description                                |
| ------------------- | ------------------------------------------ |
| `query_graph`       | Query the knowledge graph with ContextQL   |
| `search_similar`    | Vector similarity search                   |
| `find_context_for`  | Find relevant context for a file or symbol |
| `get_relationships` | Get relationships for a node               |
| `get_impact`        | Analyze impact of changes                  |
| `ingest_source`     | Ingest source code into the graph          |

### Security

| Tool                | Description         |
| ------------------- | ------------------- |
| `run_security_scan` | Run a security scan |

### Performance

| Tool                    | Description                         |
| ----------------------- | ----------------------------------- |
| `check_performance`     | Check performance against baselines |
| `get_perf_baselines`    | Get current performance baselines   |
| `update_perf_baselines` | Update performance baselines        |
| `get_critical_paths`    | Get critical execution paths        |

### Roadmap

| Tool             | Description                                 |
| ---------------- | ------------------------------------------- |
| `manage_roadmap` | Parse, sync, and manage the project roadmap |

### Interaction

| Tool               | Description                                                    |
| ------------------ | -------------------------------------------------------------- |
| `emit_interaction` | Emit an interaction event (question, confirmation, transition) |

## Resources (8)

| URI                       | Name                | Description                                          | MIME Type          |
| ------------------------- | ------------------- | ---------------------------------------------------- | ------------------ |
| `harness://skills`        | Harness Skills      | Available skills with metadata                       | `application/json` |
| `harness://rules`         | Harness Rules       | Active linter rules and constraints                  | `application/json` |
| `harness://project`       | Project Context     | Project structure and AGENTS.md                      | `text/markdown`    |
| `harness://learnings`     | Learnings           | Review learnings and anti-pattern log                | `text/markdown`    |
| `harness://state`         | Project State       | Current harness state (position, progress, blockers) | `application/json` |
| `harness://graph`         | Knowledge Graph     | Graph statistics (node/edge counts, staleness)       | `application/json` |
| `harness://entities`      | Graph Entities      | All entity nodes with types and metadata             | `application/json` |
| `harness://relationships` | Graph Relationships | All edges with types, confidence, timestamps         | `application/json` |
