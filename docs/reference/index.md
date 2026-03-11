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

- Configuration file formats (harness.config.yml)
- All available configuration options
- Environment variables
- Configuration examples
- Validation and defaults

Use this when setting up or modifying your project configuration.

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

The harness.config.yml file is organized into these sections:

- **Project** - Basic project information
- **Architecture** - Constraint and dependency rules
- **Agent** - Agent behavior and settings
- **Build** - Build and test configuration
- **Documentation** - Documentation generation settings

See [Configuration Reference](./configuration.md) for all options.

## Environment Variables

Key environment variables for Harness Engineering:

| Variable             | Purpose                                           |
| -------------------- | ------------------------------------------------- |
| `HARNESS_CONFIG`     | Path to config file (default: harness.config.yml) |
| `HARNESS_LOG_LEVEL`  | Logging level (debug, info, warn, error)          |
| `HARNESS_AGENT_MODE` | Agent execution mode (interactive, batch, watch)  |
| `NODE_ENV`           | Node environment (development, production, test)  |

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

```yaml
# harness.config.yml
project:
  name: my-project
  version: 1.0.0

architecture:
  layers:
    - types
    - config
    - repository
    - service
    - ui

agent:
  autoReview: true
  maxDepth: 5
```

See the respective reference pages for detailed examples and options.

## Troubleshooting

### Command Not Found

Ensure Harness Engineering CLI is installed:

```bash
npm install -g harness-cli
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
