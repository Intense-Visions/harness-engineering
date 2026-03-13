# Harness Engineering Agent Skills

Agent skills for Claude Code and Gemini CLI that implement harness engineering practices.

## Structure

```
agents/skills/
├── shared/           # Shared prompt fragments
├── claude-code/      # Claude Code skills
├── gemini-cli/       # Gemini CLI skills
└── tests/            # Validation tests
```

## Available Skills

### Enforcement
- `validate-context-engineering` - Validate AGENTS.md, doc coverage, knowledge map
- `enforce-architecture` - Check layer boundaries and circular deps
- `check-mechanical-constraints` - Run all mechanical checks

### Workflow
- `harness-tdd` - Test-driven development guidance
- `harness-code-review` - Structured code review
- `harness-refactoring` - Safe refactoring process

### Entropy
- `detect-doc-drift` - Find stale documentation
- `cleanup-dead-code` - Find unused code
- `align-documentation` - Auto-fix doc drift

### Setup
- `initialize-harness-project` - Scaffold new project
- `add-harness-component` - Add components

## Usage

### Claude Code

```
/validate-context-engineering
```

### Gemini CLI

```
@validate-context-engineering
```

## Testing

```bash
pnpm test
```

## Adding New Skills

1. Create directory under `claude-code/` and `gemini-cli/`
2. Add `skill.yaml`, `prompt.md`, `README.md`
3. Run tests to validate
