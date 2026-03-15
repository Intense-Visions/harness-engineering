# Hello World: AI Agent Knowledge Map

A minimal project demonstrating harness engineering at the **basic** adoption level.

## Project Overview

This is a greeting library with two functions (`greet` and `formatName`). It exists to demonstrate what a harness-managed project looks like at the simplest level.

## Repository Structure

```
hello-world/
├── src/
│   ├── index.ts      # greet() — entry point
│   └── utils.ts      # formatName() — helper
├── tests/
│   └── index.test.ts # Unit tests
├── harness.config.json
└── AGENTS.md          # This file
```

## Conventions

- TypeScript strict mode
- Tests live in `tests/` mirroring `src/` structure
- Run `harness validate` to check project health

## Key Commands

```bash
npm test              # Run tests
npm run typecheck     # Check types
harness validate      # Validate harness configuration
harness check-deps    # Check dependency boundaries
```
