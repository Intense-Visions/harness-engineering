# Reference Documentation

Welcome to the Harness Engineering Reference section. These documents provide detailed, authoritative information about CLI commands, configuration options, and system APIs.

## Available References

### [CLI Reference](./cli.md)

Complete reference for Harness Engineering CLI commands and options:

- Command overview and structure
- Global options and flags
- Available commands
- Usage examples

Use this when you need to look up specific CLI command syntax or options.

### [Configuration Reference](./configuration.md)

Complete reference for configuring Harness Engineering projects:

- Configuration file formats (harness.config.json)
- All available configuration options
- Environment variables
- Configuration examples
- Validation and defaults

Use this when setting up or modifying your project configuration.

### [ESLint Rules Reference](./eslint-rules.md)

Complete reference for all 12 rules in `@harness-engineering/eslint-plugin`:

- Architecture rules (layer violations, circular deps, forbidden imports)
- Boundary rules (Zod schema validation at API boundaries)
- Documentation rules (JSDoc on exports)
- Performance rules (nested loops, sync I/O, unbounded array chains)
- Cross-platform rules (shell commands, path separators, path normalization)
- Configuration examples, inline suppression, and violation/correct code pairs

Use this when configuring or troubleshooting ESLint rules from the harness plugin.

### [CLI Commands Reference](./cli-commands.md)

Auto-generated comprehensive reference for all CLI commands with full option details.

### [MCP Tools Reference](./mcp-tools.md)

Auto-generated reference for all MCP tools exposed by the harness server.

### [Tool & Skill Catalog](./tool-catalog.md)

Canonical, regenerate-and-gated catalog serializing each MCP tool's full live input schema and each skill's full declared contract. Unlike the summary in the MCP Tools Reference, a divergence between a definition's real schema and this catalog fails the build (`pnpm run generate:tool-catalog:check`).

### [Skills Catalog](./skills-catalog.md)

Complete catalog of all 741 skills across all tiers.

### [Provenance Commit Trailer](./provenance-trailer.md)

The governed, machine-readable `Harness-*` git commit trailer emitted by the autonomous ship path — its schema, parse contract, and squash-merge survival.

### [Source Map](./source-map.md)

Comprehensive source file index for navigating the codebase.

### [The `-fleet` Family Spine](./fleet-family.md)

The shared, stage-agnostic contract every `-fleet` skill builds on — what is common across the family versus what each member defines for itself.

## Package Reference

Per-package source indexes. Each page lists individual source files, links each one, and summarizes its purpose and key exports. Packages with many files are split across numbered pages; each row names the source areas (directories under `src/`) that page covers.

### `@harness-engineering/cli`

| Page                             | Covers                                                                                           |
| -------------------------------- | ------------------------------------------------------------------------------------------------ |
| [cli / 1](./packages-cli-1.md)   | `align/`, `audit/`                                                                               |
| [cli / 2](./packages-cli-2.md)   | `audit/`, `brand/`, `commands/`                                                                  |
| [cli / 3](./packages-cli-3.md)   | `commands/`                                                                                      |
| [cli / 4](./packages-cli-4.md)   | `commands/` (incl. roadmap subcommands), `copy-craft/`, `config/`                                |
| [cli / 5](./packages-cli-5.md)   | `copy-craft/`, `design-craft/`                                                                   |
| [cli / 6](./packages-cli-6.md)   | `design-craft/`                                                                                  |
| [cli / 7](./packages-cli-7.md)   | `knowledge-craft/`, `drift/`, `design-pipeline/`, `design-craft/`, `git/`                        |
| [cli / 8](./packages-cli-8.md)   | `mcp/`, `knowledge-craft/`                                                                       |
| [cli / 9](./packages-cli-9.md)   | `mcp/` (incl. MCP tools), `naming-craft/`                                                        |
| [cli / 10](./packages-cli-10.md) | `security-craft/`, `naming-craft/`, `shared/`                                                    |
| [cli / 11](./packages-cli-11.md) | `spec-craft/`, `shared/` (craft LLM contracts), `slash-commands/`                                |
| [cli / 12](./packages-cli-12.md) | `test-craft/`, `spec-craft/`                                                                     |
| [cli / 13](./packages-cli-13.md) | `commands/` (23 command modules)                                                                 |
| [cli / 14](./packages-cli-14.md) | `design-craft/`, `api-craft/`                                                                    |
| [cli / 15](./packages-cli-15.md) | `code-craft/`, `docs-craft/`, `cli-ergonomics-craft/`                                            |
| [cli / 16](./packages-cli-16.md) | `comprehension/`, `test-craft/`, `utils/`, `shared/`, `setup/`, `config/`, and other CLI modules |
| [cli / 17](./packages-cli-17.md) | `mcp/` (21 MCP modules)                                                                          |
| [cli / 18](./packages-cli-18.md) | `commands/` (roadmap and burn subcommands)                                                       |
| [cli / 19](./packages-cli-19.md) | `commands/` (16 command modules)                                                                 |

### `@harness-engineering/core`

| Page                             | Covers                                                                                                               |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| [core / 1](./packages-core-1.md) | `harness-strength/`, `pulse/`, `review/`, `proposals/`, `locks/`                                                     |
| [core / 2](./packages-core-2.md) | `roadmap/`, `review/` (CI parsers)                                                                                   |
| [core / 3](./packages-core-3.md) | `roadmap/` (incl. roadmap store), `security/`                                                                        |
| [core / 4](./packages-core-4.md) | `state/`, `solutions/`, `telemetry/`, `validation/`, `strategy/`, `shared/`                                          |
| [core / 5](./packages-core-5.md) | `validation/`, `deployment/`, `ci/`, `architecture/`, `constraints/`, `compaction/`, `adoption/`                     |
| [core / 6](./packages-core-6.md) | `waypoint/`, `dictionary/`, `hooks/`, `security/`, `state/`, `rollback/`, `parallelization/`, and other core modules |

### `@harness-engineering/dashboard`

| Page                                       | Covers                                    |
| ------------------------------------------ | ----------------------------------------- |
| [dashboard / 1](./packages-dashboard-1.md) | `client/` (components)                    |
| [dashboard / 2](./packages-dashboard-2.md) | `client/` (components, hooks)             |
| [dashboard / 3](./packages-dashboard-3.md) | `server/`, `client/` (utils), `shared/`   |
| [dashboard / 4](./packages-dashboard-4.md) | `client/` (incl. Analyze page components) |

### `@harness-engineering/orchestrator`

| Page                                             | Covers                                                                            |
| ------------------------------------------------ | --------------------------------------------------------------------------------- |
| [orchestrator / 1](./packages-orchestrator-1.md) | `agent/`, `auth/`, `core/`, `cost/`                                               |
| [orchestrator / 2](./packages-orchestrator-2.md) | `maintenance/`, `gateway/`, `proposals/`, `server/`, `routing/`, `notifications/` |
| [orchestrator / 3](./packages-orchestrator-3.md) | `server/`, `sessions/`, `workflow/`, `tracker/`                                   |

### Other packages

| Page                                       | Covers                                                                                                     |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| [graph](./packages-graph.md)               | `@harness-engineering/graph` — `ingest/` and extractor fixtures                                            |
| [intelligence](./packages-intelligence.md) | `@harness-engineering/intelligence` — `outcome-eval/`, `acceptance-eval/`, `adapters/`                     |
| [local-models](./packages-local-models.md) | `packages/local-models` — `ranker/`, `hardware/`, `installer/`, `pool/`, `huggingface/`                    |
| [stats](./packages-stats.md)               | `@harness-engineering/stats` — `bandit/`, `sprt/`, package entry and config                                |
| [types](./packages-types.md)               | `@harness-engineering/types` — strategy, stats, solutions, pulse, proposals, notifications, auth, and more |

### Repository scripts and examples

| Page                      | Covers                                                                       |
| ------------------------- | ---------------------------------------------------------------------------- |
| [scripts](./scripts.md)   | Build and maintenance scripts under `scripts/` (generators, gates, ratchets) |
| [examples](./examples.md) | `examples/slack-echo-bridge/` source modules                                 |

## How to Use This Reference

1. **Look up CLI commands** - See [CLI Reference](./cli.md)
2. **Configure your project** - See [Configuration Reference](./configuration.md)
3. **Check option details** - Use Ctrl+F to search within pages
4. **Find examples** - Scroll to the "Examples" section on each page

## Quick Navigation

- **Getting Started?** → [Getting Started Guide](/guides/getting-started.md)
- **Need Best Practices?** → [Best Practices Guide](/guides/best-practices.md)
- **Learning Principles?** → [Standard Documentation](/standard/)

## Command Categories

The Harness Engineering CLI is organized into logical command categories:

- **Project Management** - Init, validate, and analyze projects
- **Code Generation** - Generate boilerplate and scaffolding
- **Validation** - Check configuration and constraints
- **Agent Control** - Manage agent execution and workflows

See [CLI Reference](./cli.md) for the complete command list.

## Configuration Categories

The harness.config.json file is organized into these sections:

- **Project** - Basic project information
- **Architecture** - Constraint and dependency rules
- **Agent** - Agent behavior and settings
- **Build** - Build and test configuration
- **Documentation** - Documentation generation settings

See [Configuration Reference](./configuration.md) for all options.

## Environment Variables

Key environment variables for Harness Engineering:

| Variable             | Purpose                                            |
| -------------------- | -------------------------------------------------- |
| `HARNESS_CONFIG`     | Path to config file (default: harness.config.json) |
| `HARNESS_LOG_LEVEL`  | Logging level (debug, info, warn, error)           |
| `HARNESS_AGENT_MODE` | Agent execution mode (interactive, batch, watch)   |
| `NODE_ENV`           | Node environment (development, production, test)   |

For complete list, see [Configuration Reference](./configuration.md).

## Examples

### Basic CLI Usage

```bash
# Initialize a new Harness project
harness init my-project

# Validate current configuration
harness validate

# Run agent on current branch
harness agent run
```

### Configuration Example

```json
// harness.config.json
{
  "project": {
    "name": "my-project",
    "version": "1.0.0"
  },
  "architecture": {
    "layers": ["types", "config", "repository", "service", "ui"]
  },
  "agent": {
    "autoReview": true,
    "maxDepth": 5
  }
}
```

See the respective reference pages for detailed examples and options.

## Troubleshooting

### Command Not Found

Ensure Harness Engineering CLI is installed:

```bash
npm install -g @harness-engineering/cli
harness --version
```

### Configuration Error

Validate your configuration file:

```bash
harness validate
```

For detailed error messages:

```bash
harness validate --verbose
```

### Check Logs

View detailed logs:

```bash
HARNESS_LOG_LEVEL=debug harness <command>
```

## Getting Help

For each command, use the `--help` flag:

```bash
harness <command> --help
```

For detailed documentation:

- [CLI Reference](./cli.md)
- [Configuration Reference](./configuration.md)
- [Best Practices Guide](/guides/best-practices.md)

---

_Last Updated: 2026-03-11_
