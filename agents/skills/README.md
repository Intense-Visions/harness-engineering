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

### Skill Catalog

The library contains **540 skills** across all 4 platforms (claude-code, gemini-cli, cursor, codex), including:

- **74 harness-\* skills** — methodology, workflow, and operational skills (brainstorming, planning, execution, code-review, debugging, release-readiness, etc.)
- **55 design-\* skills** — design knowledge across color, typography, layout, Gestalt, interaction, motion, design systems, platform languages, and process
- **Framework skills** — react, vue, angular, svelte, astro, next, nuxt, node, nestjs, graphql, trpc, prisma, drizzle, tanstack, redux, xstate, zod, and more
- **Knowledge skills** — gof patterns, owasp security, otel observability, test patterns, microservices, events, resilience, typescript, and more

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
