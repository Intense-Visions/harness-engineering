# CLI Reference

Complete reference for Harness Engineering CLI commands, options, and usage.

## Command Structure

All Harness Engineering CLI commands follow this structure:

```
harness [global-options] <command> [command-options]
```

## Global Options

These options are available for all commands:

```
--config, -c <path>     Path to harness.config.json
--json                  Output results as JSON
--verbose               Enable verbose output
--quiet                 Suppress non-error output
```

### Examples

```bash
# Use custom config file
harness validate --config=./custom/harness.config.json

# Get verbose output
harness validate --verbose

# Output as JSON for scripting
harness validate --json
```

## Project Commands

### harness init

Initialize a new Harness Engineering project.

```
harness init [options]
```

**Options:**

```
-n, --name <name>       Project name
-l, --level <level>     Project level
--framework             Include framework scaffolding
-f, --force             Overwrite existing files
-y, --yes               Skip confirmation prompts
```

**Examples:**

```bash
# Initialize with defaults (interactive)
harness init

# Initialize with a specific name and level
harness init --name my-project --level 3

# Non-interactive, overwrite existing
harness init --name my-project --yes --force
```

---

### harness validate

Run all validation checks on the project.

```
harness validate [options]
```

**Options:**

```
--cross-check           Enable cross-check validation
```

**Examples:**

```bash
# Run all validation checks
harness validate

# Run with cross-check validation
harness validate --cross-check

# Output results as JSON
harness validate --json
```

---

### harness check-deps

Validate dependency layers and detect circular dependencies.

```
harness check-deps
```

**Examples:**

```bash
# Check for dependency issues
harness check-deps

# Verbose output for debugging
harness check-deps --verbose
```

---

### harness check-docs

Check documentation coverage across the project.

```
harness check-docs [options]
```

**Options:**

```
--min-coverage <percent>   Minimum required documentation coverage (0-100)
```

**Examples:**

```bash
# Check documentation coverage
harness check-docs

# Require at least 80% coverage
harness check-docs --min-coverage 80
```

---

### harness check-phase-gate

Verify that implementation files have matching spec documents.

```
harness check-phase-gate
```

**Examples:**

```bash
# Verify phase gate compliance
harness check-phase-gate
```

---

### harness add

Add a component to the project.

```
harness add <type> <name>
```

**Types:**

```
layer          Add a new architectural layer
doc            Add a new documentation file
component      Add a new component
```

**Examples:**

```bash
# Add a new layer
harness add layer data-access

# Add a documentation file
harness add doc api-reference

# Add a component
harness add component UserService
```

---

## Entropy and Drift Commands

### harness cleanup

Detect entropy issues such as documentation drift, dead code, and inconsistent patterns.

```
harness cleanup [options]
```

**Options:**

```
-t, --type <type>       Type of entropy to check (doc-drift, dead-code, patterns)
```

**Examples:**

```bash
# Detect all entropy issues
harness cleanup

# Check only for documentation drift
harness cleanup --type doc-drift

# Check only for dead code
harness cleanup --type dead-code
```

---

### harness fix-drift

Auto-fix detected entropy issues including documentation drift and dead code.

```
harness fix-drift [options]
```

**Options:**

```
--no-dry-run            Apply fixes (default behavior is dry-run)
```

**Examples:**

```bash
# Preview fixes (dry run)
harness fix-drift

# Apply fixes
harness fix-drift --no-dry-run
```

---

## Agent Commands

### harness agent run

Run an agent task.

```
harness agent run [options]
```

**Options:**

```
--timeout <ms>          Timeout in milliseconds
--persona <name>        Agent persona to use
```

**Examples:**

```bash
# Run an agent task
harness agent run

# Run with a specific persona and timeout
harness agent run --persona architect --timeout 60000
```

---

### harness agent review

Run self-review on current changes.

```
harness agent review
```

**Examples:**

```bash
# Review current changes
harness agent review
```

---

## Persona Commands

### harness persona list

List available agent personas.

```
harness persona list
```

---

### harness persona generate

Generate artifacts from a persona configuration.

```
harness persona generate <name> [options]
```

**Options:**

```
--output-dir <dir>      Output directory for generated artifacts
--only <type>           Generate only a specific artifact type
```

**Examples:**

```bash
# Generate all artifacts for a persona
harness persona generate architect

# Generate only prompts to a custom directory
harness persona generate architect --only prompts --output-dir ./out
```

---

## Skill Commands

### harness skill list

List available skills.

```
harness skill list
```

---

### harness skill run

Run a skill, outputting SKILL.md content with a context preamble.

```
harness skill run <name> [options]
```

**Options:**

```
--path <path>           Project path
--complexity <level>    Complexity level
--phase <name>          Phase name
--party                 Enable party mode
```

**Examples:**

```bash
# Run a skill
harness skill run code-review

# Run with complexity and phase context
harness skill run implementation --complexity high --phase build
```

---

### harness skill validate

Validate all skill.yaml files and SKILL.md structure.

```
harness skill validate
```

---

### harness skill info

Show metadata for a specific skill.

```
harness skill info <name>
```

**Examples:**

```bash
# Show info about a skill
harness skill info code-review
```

---

### harness create-skill

Scaffold a new skill with skill.yaml and SKILL.md files.

```
harness create-skill <path> [options]
```

**Options:**

```
--name <name>           Skill name
--description <desc>    Skill description
--cognitive-mode <mode> Cognitive mode for the skill
--reads <files>         Files the skill reads
--produces <files>      Files the skill produces
--pre-checks <checks>   Pre-check commands
--post-checks <checks>  Post-check commands
```

**Examples:**

```bash
# Scaffold a new skill
harness create-skill ./skills/my-skill --name my-skill --description "Does a thing"

# Scaffold with full metadata
harness create-skill ./skills/review \
  --name review \
  --cognitive-mode analytical \
  --reads "src/**/*.ts" \
  --produces "reports/review.md"
```

---

## Linter Commands

### harness linter generate

Generate ESLint rules from a harness-linter.yml configuration.

```
harness linter generate [options]
```

**Options:**

```
-c, --config <path>     Path to harness-linter.yml config
-o, --output <dir>      Output directory for generated rules
--clean                 Remove existing generated rules before generating
--dry-run               Preview what would be generated without writing files
--json                  Output results as JSON
--verbose               Verbose output
```

**Examples:**

```bash
# Generate rules from default config
harness linter generate

# Generate with custom config and output directory
harness linter generate --config ./my-linter.yml --output ./eslint-rules

# Preview without writing
harness linter generate --dry-run
```

---

### harness linter validate

Validate a harness-linter.yml configuration file.

```
harness linter validate [options]
```

**Options:**

```
-c, --config <path>     Path to harness-linter.yml config
--json                  Output results as JSON
```

**Examples:**

```bash
# Validate default config
harness linter validate

# Validate a specific config file
harness linter validate --config ./my-linter.yml
```

---

## State Commands

### harness state show

Show current project state.

```
harness state show [options]
```

**Options:**

```
--path <path>           Project path
```

---

### harness state reset

Reset project state.

```
harness state reset [options]
```

**Options:**

```
--path <path>           Project path
--yes                   Skip confirmation prompt
```

**Examples:**

```bash
# Reset state (with confirmation)
harness state reset

# Reset without confirmation
harness state reset --yes
```

---

### harness state learn

Append a learning to .harness/learnings.md.

```
harness state learn <learning> [options]
```

**Options:**

```
--path <path>           Project path
```

**Examples:**

```bash
# Record a learning
harness state learn "Circular deps in data layer resolved by extracting interfaces"
```

---

## Integration Commands

### harness setup-mcp

Configure MCP server for AI agent integration.

```
harness setup-mcp [options]
```

**Options:**

```
--client <client>       Target AI client to configure
```

**Examples:**

```bash
# Set up MCP integration
harness setup-mcp

# Set up for a specific client
harness setup-mcp --client claude
```

---

### harness generate-slash-commands

Generate native slash commands for Claude Code and Gemini CLI from skill metadata.

```
harness generate-slash-commands [options]
```

**Options:**

```
--platforms <platforms>  Target platforms (e.g., claude, gemini)
--global                Install commands globally
--output <dir>          Output directory
--skills-dir <dir>      Directory containing skills
--dry-run               Preview without writing files
--yes                   Skip confirmation prompts
```

**Examples:**

```bash
# Generate slash commands for all platforms
harness generate-slash-commands

# Generate only for Claude Code, dry run
harness generate-slash-commands --platforms claude --dry-run

# Generate globally with custom skills directory
harness generate-slash-commands --global --skills-dir ./my-skills
```

---

## Exit Codes

The CLI uses the following exit codes:

```
0       Success
1       General error
2       Validation failed
```

Use exit codes in scripts:

```bash
harness validate
if [ $? -ne 0 ]; then
  echo "Validation failed"
  exit 1
fi
```

---

## Troubleshooting

### Command Not Recognized

Ensure the CLI is installed and in your PATH:

```bash
npx harness --help
which harness
```

### Configuration Not Found

Specify the config path explicitly:

```bash
harness validate --config=/path/to/harness.config.json
```

### See Also

- [Configuration Reference](./configuration.md)

---

_Last Updated: 2026-03-17_
