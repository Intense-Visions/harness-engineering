# Configuration Reference

Complete reference for configuring Harness Engineering projects via `harness.config.json`.

## Configuration File

Harness Engineering projects are configured via `harness.config.json` in the project root. The configuration is validated against a Zod schema at runtime.

```json
{
  "version": 1,
  "name": "my-project",
  "rootDir": "."
}
```

## Top-Level Fields

### `version`

- **Type:** `1` (literal)
- **Required:** Yes

Schema version number. Must be `1`.

### `name`

- **Type:** `string`
- **Required:** No

Human-readable project name used in logs and reports.

### `rootDir`

- **Type:** `string`
- **Default:** `"."`
- **Required:** No

Root directory of the project, relative to the config file location. All patterns in other fields are resolved relative to this directory.

### `agentsMapPath`

- **Type:** `string`
- **Default:** `"./AGENTS.md"`
- **Required:** No

Path to the AGENTS.md file that defines agent roles and responsibilities.

### `docsDir`

- **Type:** `string`
- **Default:** `"./docs"`
- **Required:** No

Path to the documentation directory used by doc validation and generation tools.

## `layers`

- **Type:** `Array<Layer>`
- **Required:** No

Defines the dependency layers in your project. Each layer declares which other layers it may depend on, enabling enforcement of a strict dependency hierarchy.

### Layer Object

| Field                 | Type       | Required | Description                                |
| --------------------- | ---------- | -------- | ------------------------------------------ |
| `name`                | `string`   | Yes      | Unique layer identifier                    |
| `pattern`             | `string`   | Yes      | Glob pattern matching files in this layer  |
| `allowedDependencies` | `string[]` | Yes      | Names of layers this layer may import from |

### Example

```json
{
  "layers": [
    { "name": "types", "pattern": "src/types/**", "allowedDependencies": [] },
    { "name": "repository", "pattern": "src/repository/**", "allowedDependencies": ["types"] },
    {
      "name": "service",
      "pattern": "src/service/**",
      "allowedDependencies": ["types", "repository"]
    },
    {
      "name": "api",
      "pattern": "src/api/**",
      "allowedDependencies": ["types", "repository", "service"]
    }
  ]
}
```

Layers are evaluated top-down. A file matching the `api` pattern that imports from a module matching `types` is allowed because `"types"` appears in `allowedDependencies`. An import from `api` into `repository` that is not listed would be flagged as a violation.

## `forbiddenImports`

- **Type:** `Array<ForbiddenImport>`
- **Required:** No

Defines import restrictions that prevent specific file patterns from importing certain modules. Useful for keeping layers free of heavy runtime dependencies.

### ForbiddenImport Object

| Field      | Type       | Required | Description                                          |
| ---------- | ---------- | -------- | ---------------------------------------------------- |
| `from`     | `string`   | Yes      | Glob pattern of source files the rule applies to     |
| `disallow` | `string[]` | Yes      | Module names or patterns that must not be imported   |
| `message`  | `string`   | No       | Custom error message shown when the rule is violated |

### Example

```json
{
  "forbiddenImports": [
    {
      "from": "src/types/**",
      "disallow": ["express", "pg"],
      "message": "Types layer must not depend on runtime libraries"
    },
    {
      "from": "src/repository/**",
      "disallow": ["express"],
      "message": "Repository layer must not depend on the HTTP framework"
    }
  ]
}
```

## `boundaries`

- **Type:** `BoundaryConfig`
- **Required:** No

Configures boundary enforcement for files that must have a corresponding schema definition.

### BoundaryConfig Object

| Field           | Type       | Required | Description                                     |
| --------------- | ---------- | -------- | ----------------------------------------------- |
| `requireSchema` | `string[]` | Yes      | Glob patterns for files that must have a schema |

### Example

```json
{
  "boundaries": {
    "requireSchema": ["src/api/**", "src/events/**"]
  }
}
```

## `agent`

- **Type:** `AgentConfig`
- **Required:** No

Controls how agent tasks are executed.

### AgentConfig Object

| Field      | Type                                    | Default        | Description                                  |
| ---------- | --------------------------------------- | -------------- | -------------------------------------------- |
| `executor` | `"subprocess"` \| `"cloud"` \| `"noop"` | `"subprocess"` | Execution backend for agent tasks            |
| `timeout`  | `number`                                | `300000`       | Task timeout in milliseconds (5 min default) |
| `skills`   | `string[]`                              | —              | List of skill names available to the agent   |

### Example

```json
{
  "agent": {
    "executor": "subprocess",
    "timeout": 600000,
    "skills": ["check-dependencies", "detect-entropy", "analyze-diff"]
  }
}
```

## `entropy`

- **Type:** `EntropyConfig`
- **Required:** No

Configures entropy detection, which identifies high-entropy strings (potential secrets or credentials) in source files.

### EntropyConfig Object

| Field             | Type       | Default                                  | Description                                 |
| ----------------- | ---------- | ---------------------------------------- | ------------------------------------------- |
| `excludePatterns` | `string[]` | `["**/node_modules/**", "**/*.test.ts"]` | Glob patterns to exclude from entropy scans |
| `autoFix`         | `boolean`  | `false`                                  | Automatically apply fixes when detected     |

### Example

```json
{
  "entropy": {
    "excludePatterns": ["**/node_modules/**", "**/*.test.ts", "**/fixtures/**", "**/*.snap"],
    "autoFix": false
  }
}
```

## `phaseGates`

- **Type:** `PhaseGatesConfig`
- **Required:** No

Phase gates enforce that implementation files have corresponding specification documents. This ensures a spec-first development workflow.

### PhaseGatesConfig Object

| Field      | Type                      | Default                                                                    | Description                                 |
| ---------- | ------------------------- | -------------------------------------------------------------------------- | ------------------------------------------- |
| `enabled`  | `boolean`                 | `false`                                                                    | Enable phase gate checks                    |
| `severity` | `"error"` \| `"warning"`  | `"error"`                                                                  | Severity level for violations               |
| `mappings` | `Array<PhaseGateMapping>` | `[{ implPattern: "src/**/*.ts", specPattern: "docs/specs/{feature}.md" }]` | Maps implementation files to spec documents |

### PhaseGateMapping Object

| Field         | Type     | Required | Description                                                                                                             |
| ------------- | -------- | -------- | ----------------------------------------------------------------------------------------------------------------------- |
| `implPattern` | `string` | Yes      | Glob pattern matching implementation files                                                                              |
| `specPattern` | `string` | Yes      | Pattern for the required spec file (`{feature}` is replaced with the feature name derived from the implementation path) |

### Example

```json
{
  "phaseGates": {
    "enabled": true,
    "severity": "warning",
    "mappings": [
      { "implPattern": "src/**/*.ts", "specPattern": "docs/specs/{feature}.md" },
      { "implPattern": "src/api/**/*.ts", "specPattern": "docs/api/{feature}.md" }
    ]
  }
}
```

## `template`

- **Type:** `TemplateConfig`
- **Required:** No

Metadata about the project template used to initialize this configuration. Typically set by `harness init` and not edited manually.

### TemplateConfig Object

| Field       | Type                                          | Required | Description                    |
| ----------- | --------------------------------------------- | -------- | ------------------------------ |
| `level`     | `"basic"` \| `"intermediate"` \| `"advanced"` | Yes      | Template complexity level      |
| `framework` | `string`                                      | No       | Framework the template targets |
| `version`   | `number`                                      | Yes      | Template version number        |

### Example

```json
{
  "template": {
    "level": "intermediate",
    "framework": "express",
    "version": 1
  }
}
```

## Complete Example

A full `harness.config.json` for a layered API project:

```json
{
  "version": 1,
  "name": "task-api",
  "rootDir": ".",
  "agentsMapPath": "./AGENTS.md",
  "docsDir": "./docs",
  "layers": [
    { "name": "types", "pattern": "src/types/**", "allowedDependencies": [] },
    { "name": "repository", "pattern": "src/repository/**", "allowedDependencies": ["types"] },
    {
      "name": "service",
      "pattern": "src/service/**",
      "allowedDependencies": ["types", "repository"]
    },
    {
      "name": "api",
      "pattern": "src/api/**",
      "allowedDependencies": ["types", "repository", "service"]
    }
  ],
  "forbiddenImports": [
    {
      "from": "src/types/**",
      "disallow": ["express", "pg"],
      "message": "Types layer must not depend on runtime libraries"
    }
  ],
  "boundaries": {
    "requireSchema": ["src/api/**"]
  },
  "agent": {
    "executor": "subprocess",
    "timeout": 300000,
    "skills": ["check-dependencies", "detect-entropy"]
  },
  "entropy": {
    "excludePatterns": ["**/node_modules/**", "**/*.test.ts"],
    "autoFix": false
  },
  "phaseGates": {
    "enabled": true,
    "severity": "error",
    "mappings": [{ "implPattern": "src/**/*.ts", "specPattern": "docs/specs/{feature}.md" }]
  },
  "template": {
    "level": "intermediate",
    "framework": "express",
    "version": 1
  }
}
```

## Minimal Example

The smallest valid configuration:

```json
{
  "version": 1
}
```

All other fields are optional and fall back to their defaults. This is useful when you want to adopt Harness Engineering incrementally, starting with just the AGENTS.md workflow and adding layers or gates later.

## Validation

The configuration file is validated automatically when any Harness CLI command runs. You can also validate it explicitly:

```bash
npx harness validate --check-config
```

If validation fails, the error message will indicate which field has an invalid value and what was expected.

## See Also

- [CLI Reference](./cli.md)
- [Getting Started Guide](/guides/getting-started.md)
- [Best Practices Guide](/guides/best-practices.md)
- [Implementation Guide](/standard/implementation.md)

---

_Last Updated: 2026-03-17_
