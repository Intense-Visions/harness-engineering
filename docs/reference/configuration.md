# Configuration Reference

Complete reference for configuring Harness Engineering projects.

> **Note:** Configuration options and formats are subject to change. This document describes the intended configuration structure. See your project's harness.config.yml for currently configured options.

## Configuration File

Harness Engineering projects are configured via `harness.config.yml` in the project root.

```yaml
# harness.config.yml - Harness Engineering Configuration
project:
  # Your configuration here
```

## Configuration Sections

The harness.config.yml file is organized into these main sections:

- **[Project](#project)** - Basic project information
- **[Architecture](#architecture)** - Architectural constraints and rules
- **[Layers](#layers)** - Dependency layers and boundaries
- **[Agent](#agent)** - Agent behavior and settings
- **[Build](#build)** - Build and test configuration
- **[Documentation](#documentation)** - Documentation generation
- **[Environment](#environment)** - Environment variables and secrets

## Project

Basic project information and metadata.

### Schema

```yaml
project:
  name: string # Project name (required)
  version: string # Project version
  description: string # Project description
  author: string # Project author
  license: string # License type
  homepage: string # Project homepage URL
  repository: string # Repository URL
```

### Example

```yaml
project:
  name: my-harness-project
  version: 1.0.0
  description: Example Harness Engineering project
  author: Your Team
  license: MIT
  homepage: https://github.com/yourorg/my-harness-project
  repository: https://github.com/yourorg/my-harness-project.git
```

## Architecture

Define architectural constraints and dependency rules.

### Schema

```yaml
architecture:
  enforce: boolean # Enforce constraints
  strict: boolean # Strict mode
  maxCyclomaticComplexity: number # Max complexity
  maxDepth: number # Max dependency depth
  rules:
    - pattern: string # File pattern
      layer: string # Target layer
      canDependOn: string[] # Allowed dependencies
      forbidden: string[] # Forbidden dependencies
```

### Example

```yaml
architecture:
  enforce: true
  strict: false
  maxCyclomaticComplexity: 15
  maxDepth: 5
  rules:
    - pattern: src/types/**
      layer: types
      canDependOn: []
      forbidden: [types, config, repository, service, ui]

    - pattern: src/config/**
      layer: config
      canDependOn: [types]
      forbidden: [repository, service, ui]

    - pattern: src/repository/**
      layer: repository
      canDependOn: [types, config]
      forbidden: [service, ui]

    - pattern: src/service/**
      layer: service
      canDependOn: [types, config, repository]
      forbidden: [ui]

    - pattern: src/ui/**
      layer: ui
      canDependOn: [types, config, repository, service]
      forbidden: []
```

## Layers

Define the dependency layers in your project.

### Schema

```yaml
layers:
  - name: string # Layer name
    description: string # Layer description
    path: string # Directory pattern
    dependencies: string[] # Allowed dependencies
```

### Example

```yaml
layers:
  - name: types
    description: Type definitions and interfaces
    path: src/types/**
    dependencies: []

  - name: config
    description: Configuration and environment
    path: src/config/**
    dependencies: [types]

  - name: repository
    description: Data access layer
    path: src/repository/**
    dependencies: [types, config]

  - name: service
    description: Business logic layer
    path: src/service/**
    dependencies: [types, config, repository]

  - name: ui
    description: User interface layer
    path: src/ui/**
    dependencies: [types, config, repository, service]
```

## Agent

Configure agent behavior and execution.

### Schema

```yaml
agent:
  enabled: boolean # Enable agents
  mode: string # Execution mode (interactive, batch, watch)
  maxDepth: number # Max recursion depth
  autoReview: boolean # Auto-review changes
  autoCommit: boolean # Auto-commit changes
  parallelization: number # Max parallel tasks
  timeout: number # Task timeout in seconds
  retryAttempts: number # Number of retry attempts
  reviewRules:
    - pattern: string # File pattern
      requiresApproval: boolean # Requires approval
      reviewer: string # Reviewer
```

### Example

```yaml
agent:
  enabled: true
  mode: interactive
  maxDepth: 10
  autoReview: true
  autoCommit: false
  parallelization: 4
  timeout: 300
  retryAttempts: 3
  reviewRules:
    - pattern: src/**/*.ts
      requiresApproval: false
      reviewer: auto

    - pattern: docs/**
      requiresApproval: true
      reviewer: human

    - pattern: AGENTS.md
      requiresApproval: true
      reviewer: human
```

## Build

Configure build and test settings.

### Schema

```yaml
build:
  target: string # Build target (es2020, node16, etc)
  module: string # Module format (commonjs, esnext, etc)
  outDir: string # Output directory
  sourceMap: boolean # Generate source maps
  declaration: boolean # Generate type declarations
  test:
    framework: string # Test framework (jest, vitest, etc)
    coverage: number # Coverage threshold (0-100)
    timeout: number # Test timeout in ms
    parallel: number # Parallel test execution
```

### Example

```yaml
build:
  target: es2020
  module: esnext
  outDir: dist
  sourceMap: true
  declaration: true
  test:
    framework: jest
    coverage: 80
    timeout: 10000
    parallel: 4
```

## Documentation

Configure documentation generation and validation.

### Schema

```yaml
documentation:
  enabled: boolean # Enable doc generation
  outputDir: string # Output directory
  title: string # Site title
  description: string # Site description
  theme: string # Theme name
  validation:
    checkLinks: boolean # Check for broken links
    checkTitles: boolean # Check missing titles
    checkImages: boolean # Check missing images
    maxLength: number # Max page length
```

### Example

```yaml
documentation:
  enabled: true
  outputDir: docs/.vitepress/dist
  title: My Project Documentation
  description: Harness Engineering Example Project
  theme: default
  validation:
    checkLinks: true
    checkTitles: true
    checkImages: true
    maxLength: 10000
```

## Environment

Define environment variables and secrets.

### Schema

```yaml
environment:
  variables:
    KEY: string # Environment variable
  secrets:
    - name: string # Secret name
      required: boolean # Is required
      source: string # Source (.env, vault, etc)
  profiles:
    - name: string # Profile name
      variables:
        KEY: string
```

### Example

```yaml
environment:
  variables:
    NODE_ENV: development
    LOG_LEVEL: info
    API_URL: http://localhost:3000

  secrets:
    - name: DATABASE_URL
      required: true
      source: .env

    - name: API_KEY
      required: true
      source: vault

  profiles:
    - name: development
      variables:
        NODE_ENV: development
        LOG_LEVEL: debug
        API_URL: http://localhost:3000

    - name: production
      variables:
        NODE_ENV: production
        LOG_LEVEL: warn
        API_URL: https://api.example.com
```

## Complete Example

Here's a complete harness.config.yml example:

```yaml
# Harness Engineering Configuration
project:
  name: my-harness-project
  version: 1.0.0
  description: Example Harness Engineering project
  author: Your Team
  license: MIT

architecture:
  enforce: true
  strict: false
  maxCyclomaticComplexity: 15
  maxDepth: 5
  rules:
    - pattern: src/types/**
      layer: types
      canDependOn: []
    - pattern: src/config/**
      layer: config
      canDependOn: [types]
    - pattern: src/repository/**
      layer: repository
      canDependOn: [types, config]
    - pattern: src/service/**
      layer: service
      canDependOn: [types, config, repository]
    - pattern: src/ui/**
      layer: ui
      canDependOn: [types, config, repository, service]

layers:
  - name: types
    description: Type definitions and interfaces
    path: src/types/**
    dependencies: []
  - name: config
    description: Configuration and environment
    path: src/config/**
    dependencies: [types]
  - name: repository
    description: Data access layer
    path: src/repository/**
    dependencies: [types, config]
  - name: service
    description: Business logic layer
    path: src/service/**
    dependencies: [types, config, repository]
  - name: ui
    description: User interface layer
    path: src/ui/**
    dependencies: [types, config, repository, service]

agent:
  enabled: true
  mode: interactive
  maxDepth: 10
  autoReview: true
  autoCommit: false
  parallelization: 4
  timeout: 300
  retryAttempts: 3

build:
  target: es2020
  module: esnext
  outDir: dist
  sourceMap: true
  declaration: true
  test:
    framework: jest
    coverage: 80
    timeout: 10000
    parallel: 4

documentation:
  enabled: true
  outputDir: docs/.vitepress/dist
  title: My Project Documentation
  theme: default
  validation:
    checkLinks: true
    checkTitles: true

environment:
  variables:
    NODE_ENV: development
    LOG_LEVEL: info
  secrets:
    - name: DATABASE_URL
      required: true
      source: .env
  profiles:
    - name: development
      variables:
        NODE_ENV: development
        LOG_LEVEL: debug
    - name: production
      variables:
        NODE_ENV: production
        LOG_LEVEL: warn
```

## Environment Variables

Override configuration using environment variables. Format: `HARNESS_<SECTION>_<KEY>`

```bash
# Set project name
export HARNESS_PROJECT_NAME=my-project

# Enable agent
export HARNESS_AGENT_ENABLED=true

# Set log level
export HARNESS_BUILD_TEST_COVERAGE=85

# Use custom config file
export HARNESS_CONFIG=/path/to/custom.yml
```

## Configuration Validation

Validate your configuration:

```bash
harness validate --check-config

# Strict validation
harness validate --strict

# Show config after loading
harness config show
```

## Configuration Profiles

Use profiles for different environments:

```bash
# Use development profile
harness validate --profile=development

# Use production profile
harness validate --profile=production
```

## Best Practices

1. **Version Control** - Commit harness.config.yml to git
2. **Documentation** - Document why configuration choices were made
3. **Validation** - Run `harness validate` before committing
4. **Profiles** - Use profiles for development, staging, production
5. **Secrets** - Never commit secrets; use environment variables
6. **Gradual Adoption** - Start with minimal configuration, add as needed

## Troubleshooting

### Config Not Found

Ensure harness.config.yml exists in project root:

```bash
ls -la harness.config.yml
```

### Invalid Configuration

Validate configuration file:

```bash
harness validate --check-config --verbose
```

### Override Not Working

Check environment variable format:

```bash
# Correct format
export HARNESS_AGENT_ENABLED=true

# Incorrect format (won't work)
export HARNESS_AGENT.ENABLED=true
```

## See Also

- [CLI Reference](./cli.md)
- [Getting Started Guide](/guides/getting-started.md)
- [Best Practices Guide](/guides/best-practices.md)
- [Implementation Guide](/standard/implementation.md)

---

_Last Updated: 2026-03-11_
