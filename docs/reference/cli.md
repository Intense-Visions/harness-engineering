# CLI Reference

Complete reference for Harness Engineering CLI commands, options, and usage.

> **Note:** The Harness Engineering CLI is currently in development. This document describes the intended command structure and functionality. Actual commands and options may vary. See your project's documentation for currently available commands.

## Command Structure

All Harness Engineering CLI commands follow this structure:

```
harness [global-options] <command> [command-options]
```

## Global Options

These options are available for all commands:

```
--help, -h              Show command help
--version, -v           Show CLI version
--config, -c <file>     Path to harness.config.yml
--verbose               Enable verbose output
--quiet, -q             Suppress non-error output
--json                  Output results as JSON
--no-color              Disable colored output
```

### Examples

```bash
# Show help for a specific command
harness validate --help

# Use custom config file
harness validate --config=my-config.yml

# Get verbose output
harness validate --verbose

# Output as JSON for scripting
harness validate --json
```

## Project Commands

### harness init

Initialize a new Harness Engineering project.

```
harness init [options] [directory]
```

**Options:**
```
--template <template>   Project template (basic, monorepo, full)
--interactive, -i       Interactive setup wizard
--skip-install          Skip dependency installation
--git                   Initialize git repository
```

**Examples:**

```bash
# Interactive setup
harness init --interactive

# Create with monorepo template
harness init my-project --template=monorepo

# Skip dependency installation
harness init --skip-install
```

**Output:**
```
✓ Created project structure
✓ Generated harness.config.yml
✓ Installed dependencies
✓ Initialized git repository
Project ready at: ./my-project
```

---

### harness validate

Validate project configuration and structure.

```
harness validate [options]
```

**Options:**
```
--strict                Strict validation (fail on warnings)
--fix                   Attempt to fix validation issues
--check-docs            Validate documentation
--check-types           Validate TypeScript configuration
--check-constraints     Validate architectural constraints
```

**Examples:**

```bash
# Validate all aspects
harness validate

# Strict mode (fail on any warning)
harness validate --strict

# Auto-fix issues
harness validate --fix

# Check only documentation
harness validate --check-docs
```

**Output:**
```
Validating project configuration...

✓ Configuration file valid
✓ Project structure correct
✓ Dependencies configured
⚠ Documentation: 2 pages need updating
✓ Constraints: 15 rules defined

Validation complete: 3 warnings, 0 errors
```

---

## Code Generation Commands

### harness generate

Generate boilerplate and scaffold code.

```
harness generate <generator> [options]
```

**Available Generators:**
```
component        Generate a new component
service          Generate a service class
repository       Generate a repository interface
test             Generate test file
config           Generate configuration module
```

**Global Options for all generators:**
```
--force, -f             Overwrite existing files
--dry-run               Show what would be created without creating
--verbose               Show detailed output
```

**Examples:**

```bash
# Generate a new service
harness generate service UserService --package=core

# Generate tests for existing file
harness generate test src/UserService.ts

# Dry run to preview changes
harness generate component Button --dry-run
```

---

### harness generate service

Generate a new service class with tests and types.

```
harness generate service <name> [options]
```

**Options:**
```
--package <name>        Target package (required)
--interfaces            Generate interface definitions
--tests                 Generate test file
--mock-repository       Generate mock repository
```

**Example:**

```bash
harness generate service UserService \
  --package=core \
  --interfaces \
  --tests
```

**Generates:**
```
src/
├── service/
│   └── UserService.ts
├── types/
│   └── User.ts
└── __tests__/
    └── UserService.test.ts
```

---

## Analysis Commands

### harness analyze

Analyze project structure, dependencies, and metrics.

```
harness analyze [options]
```

**Options:**
```
--metrics               Show project metrics
--dependencies          Show dependency graph
--coverage              Show test coverage
--complexity            Show code complexity
--format <format>       Output format (text, json, html)
```

**Examples:**

```bash
# Full analysis
harness analyze

# Show metrics only
harness analyze --metrics

# Generate HTML report
harness analyze --format=html
```

**Output:**
```
Project Analysis for: my-project

📊 Metrics
  - Files: 247
  - Lines of Code: 15,243
  - Test Coverage: 82%
  - Packages: 5

🔗 Dependencies
  - External: 23
  - Internal: 45
  - Circular: 0 ✓

📈 Complexity
  - Average Cyclomatic: 3.2
  - Max Complexity: 12 (in UserService)
```

---

## Agent Commands

### harness agent run

Run agents to execute tasks and maintain the codebase.

```
harness agent run [options]
```

**Options:**
```
--mode <mode>           Execution mode (interactive, batch, watch)
--max-depth <n>         Maximum recursion depth
--auto-commit           Auto-commit changes
--branch <branch>       Work on specific branch
--task <task>           Specific task to run
```

**Examples:**

```bash
# Interactive agent mode
harness agent run --mode=interactive

# Batch mode (non-interactive)
harness agent run --mode=batch --auto-commit

# Watch mode (continuous)
harness agent run --mode=watch
```

---

### harness agent validate

Validate agent output and changes before committing.

```
harness agent validate [options]
```

**Options:**
```
--branch <branch>       Branch to validate
--strict                Strict validation
--report                Generate validation report
```

**Example:**

```bash
harness agent validate --branch=agent/task-123 --strict
```

---

## Constraint and Enforcement Commands

### harness constraints

Manage and validate architectural constraints.

```
harness constraints <action> [options]
```

**Actions:**
```
list                    List all defined constraints
validate                Validate constraints
enforce                 Enforce constraint rules
report                  Generate constraint report
```

**Examples:**

```bash
# List all constraints
harness constraints list

# Validate that code follows constraints
harness constraints validate

# Generate HTML report
harness constraints report --format=html
```

---

## Documentation Commands

### harness docs

Generate and manage documentation.

```
harness docs <action> [options]
```

**Actions:**
```
build                   Build documentation site
serve                   Start documentation server
validate                Validate documentation
generate-toc            Generate table of contents
```

**Options:**
```
--port <port>           Port for docs server
--output <dir>          Output directory for build
--watch                 Watch for changes
```

**Examples:**

```bash
# Start documentation server
harness docs serve --port=3000

# Build static documentation
harness docs build --output=dist

# Validate documentation
harness docs validate
```

---

## Configuration Commands

### harness config

Manage project configuration.

```
harness config <action> [options]
```

**Actions:**
```
show                    Show current configuration
set <key> <value>       Set configuration value
get <key>               Get specific configuration value
reset                   Reset to defaults
```

**Examples:**

```bash
# Show all configuration
harness config show

# Get specific value
harness config get agent.autoReview

# Set configuration
harness config set agent.autoReview true

# Reset to defaults
harness config reset
```

---

## Utility Commands

### harness version

Show CLI version and environment information.

```
harness version [options]
```

**Options:**
```
--verbose               Show detailed version info
--json                  Output as JSON
```

**Example:**

```bash
$ harness version
Harness Engineering CLI v1.0.0
Node.js: v18.12.0
Platform: darwin (arm64)
```

---

### harness help

Show help information.

```
harness help [command]
```

**Examples:**

```bash
# Show main help
harness help

# Show help for specific command
harness help validate

# List all available commands
harness help --list
```

---

## Exit Codes

The CLI uses standard exit codes:

```
0       Success
1       General error
2       Command not found
3       Configuration error
4       Validation failed
5       Build failed
```

Use exit codes for scripting:

```bash
harness validate
if [ $? -ne 0 ]; then
  echo "Validation failed"
  exit 1
fi
```

---

## Performance Considerations

For large projects, use these options:

```bash
# Parallel execution (if supported)
harness validate --parallel

# Skip expensive checks
harness validate --skip-complexity

# Batch operations
harness generate --batch <file>
```

---

## Troubleshooting

### Command Not Recognized

Ensure CLI is installed and in PATH:
```bash
harness --version
which harness
```

### Configuration Not Found

Specify config path explicitly:
```bash
harness validate --config=/path/to/harness.config.yml
```

### Permission Denied

Ensure proper file permissions:
```bash
chmod +x node_modules/.bin/harness
```

### See Also

- [Configuration Reference](./configuration.md)
- [Best Practices Guide](/guides/best-practices.md)
- [Implementation Guide](/standard/implementation.md)

---

*Last Updated: 2026-03-11*
