# @harness-engineering/cli

CLI for Harness Engineering toolkit.

## Installation

```bash
npm install -g @harness-engineering/cli
```

## Commands

### `harness init`

Initialize a new harness-engineering project.

```bash
harness init
harness init --name my-project
```

### `harness validate`

Run all validation checks.

```bash
harness validate
harness validate --json
harness validate --verbose
```

### `harness check-deps`

Validate dependency layers and detect circular dependencies.

```bash
harness check-deps
```

### `harness check-docs`

Check documentation coverage.

```bash
harness check-docs
harness check-docs --min-coverage 90
```

### `harness cleanup`

Detect entropy issues.

```bash
harness cleanup
harness cleanup --type drift
harness cleanup --type dead-code
```

### `harness fix-drift`

Auto-fix entropy issues.

```bash
harness fix-drift           # Dry run
harness fix-drift --no-dry-run  # Apply fixes
```

### `harness add`

Add components to the project.

```bash
harness add layer services
harness add module user
harness add doc architecture
```

### `harness agent`

Agent orchestration commands.

```bash
harness agent run review
harness agent review
```

## Global Options

- `--config <path>` - Path to config file
- `--json` - Output as JSON
- `--verbose` - Verbose output
- `--quiet` - Minimal output

## Configuration

Create `harness.config.json` in your project root:

```json
{
  "version": 1,
  "name": "my-project",
  "layers": [
    { "name": "types", "pattern": "src/types/**", "allowedDependencies": [] },
    { "name": "domain", "pattern": "src/domain/**", "allowedDependencies": ["types"] }
  ],
  "agentsMapPath": "./AGENTS.md",
  "docsDir": "./docs"
}
```

## Exit Codes

- `0` - Success
- `1` - Validation failed
- `2` - Error
