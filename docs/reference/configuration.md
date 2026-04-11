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

### `updateCheckInterval`

- **Type:** `number` (integer, minimum `0`)
- **Required:** No

How often (in milliseconds) to check for CLI updates. Omit or set to `0` to disable update checks.

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
| `skills`   | `string[]`                              | --             | List of skill names available to the agent   |

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

## `security`

- **Type:** `SecurityConfig`
- **Required:** No

Configures security scanning for the project. When enabled, Harness scans source files for security issues such as hardcoded credentials, insecure patterns, and known vulnerabilities.

### SecurityConfig Object

| Field     | Type                                                      | Default | Description                                       |
| --------- | --------------------------------------------------------- | ------- | ------------------------------------------------- |
| `enabled` | `boolean`                                                 | `true`  | Whether security scanning is enabled              |
| `strict`  | `boolean`                                                 | `false` | When true, fail on any security warning           |
| `rules`   | `Record<string, "off" \| "error" \| "warning" \| "info">` | --      | Rule-specific severity overrides keyed by rule ID |
| `exclude` | `string[]`                                                | --      | Glob patterns to exclude from security scans      |

### Example

```json
{
  "security": {
    "enabled": true,
    "strict": false,
    "rules": {
      "SEC-CRY-001": "warning"
    },
    "exclude": ["**/node_modules/**", "**/dist/**", "**/*.test.ts", "**/tests/fixtures/**"]
  }
}
```

## `performance`

- **Type:** `PerformanceConfig`
- **Required:** No

Configures performance budgets and complexity thresholds. Each sub-field accepts a free-form record so you can define project-specific thresholds.

### PerformanceConfig Object

| Field        | Type                  | Default | Description                                 |
| ------------ | --------------------- | ------- | ------------------------------------------- |
| `complexity` | `Record<string, any>` | --      | Complexity thresholds per module or pattern |
| `coupling`   | `Record<string, any>` | --      | Coupling limits between modules             |
| `sizeBudget` | `Record<string, any>` | --      | Size budget for bundles or directories      |

Additional properties are allowed and passed through to performance analyzers.

### Example

```json
{
  "performance": {
    "complexity": {
      "enabled": true,
      "thresholds": {
        "cyclomaticComplexity": { "error": 15, "warn": 10 },
        "nestingDepth": { "warn": 4 },
        "functionLength": { "warn": 50 },
        "parameterCount": { "warn": 5 }
      }
    },
    "coupling": {
      "enabled": true,
      "thresholds": {
        "fanOut": { "warn": 15 },
        "fanIn": { "info": 20 },
        "couplingRatio": { "warn": 0.7 }
      }
    },
    "sizeBudget": {
      "enabled": false,
      "budgets": {}
    }
  }
}
```

## `design`

- **Type:** `DesignConfig`
- **Required:** No

Configures design system and aesthetic consistency enforcement.

### DesignConfig Object

| Field             | Type                                         | Default      | Description                                           |
| ----------------- | -------------------------------------------- | ------------ | ----------------------------------------------------- |
| `strictness`      | `"strict"` \| `"standard"` \| `"permissive"` | `"standard"` | Strictness of design system enforcement               |
| `platforms`       | `Array<"web" \| "mobile">`                   | `[]`         | Supported target platforms                            |
| `tokenPath`       | `string`                                     | --           | Path to design tokens file (JSON or CSS)              |
| `aestheticIntent` | `string`                                     | --           | Brief description of the intended aesthetic direction |

### Example

```json
{
  "design": {
    "strictness": "strict",
    "platforms": ["web", "mobile"],
    "tokenPath": "src/tokens/design-tokens.json",
    "aestheticIntent": "Minimal, accessible, high-contrast"
  }
}
```

## `i18n`

- **Type:** `I18nConfig`
- **Required:** No

Configures internationalization management including locale settings, translation framework, and coverage requirements.

### I18nConfig Object

| Field              | Type                                                                                                                    | Default          | Description                                   |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------- | ---------------- | --------------------------------------------- |
| `enabled`          | `boolean`                                                                                                               | `false`          | Whether i18n management is enabled            |
| `strictness`       | `"strict"` \| `"standard"` \| `"permissive"`                                                                            | `"standard"`     | Strictness of i18n rule enforcement           |
| `sourceLocale`     | `string`                                                                                                                | `"en"`           | The primary language used for development     |
| `targetLocales`    | `string[]`                                                                                                              | `[]`             | Locales that translations are required for    |
| `framework`        | `"auto"` \| `"i18next"` \| `"react-intl"` \| `"vue-i18n"` \| `"flutter-intl"` \| `"apple"` \| `"android"` \| `"custom"` | `"auto"`         | The i18n framework in use                     |
| `format`           | `string`                                                                                                                | `"json"`         | Storage format for translation files          |
| `messageFormat`    | `"icu"` \| `"i18next"` \| `"custom"`                                                                                    | `"icu"`          | Syntax used for message formatting            |
| `keyConvention`    | `"dot-notation"` \| `"snake_case"` \| `"camelCase"` \| `"custom"`                                                       | `"dot-notation"` | Convention for translation keys               |
| `translationPaths` | `Record<string, string>`                                                                                                | --               | Mapping of locales to their file paths        |
| `platforms`        | `Array<"web" \| "mobile" \| "backend">`                                                                                 | `[]`             | Platforms targeted by this configuration      |
| `industry`         | `string`                                                                                                                | --               | Industry vertical for contextual translations |
| `coverage`         | `I18nCoverageConfig`                                                                                                    | --               | Translation coverage requirements             |
| `pseudoLocale`     | `string`                                                                                                                | --               | Locale used for pseudo-localization testing   |
| `mcp`              | `I18nMcpConfig`                                                                                                         | --               | MCP server for AI-assisted translation        |

### I18nCoverageConfig Object

| Field                | Type      | Default | Description                                      |
| -------------------- | --------- | ------- | ------------------------------------------------ |
| `minimumPercent`     | `number`  | `100`   | Minimum required translation percentage (0--100) |
| `requirePlurals`     | `boolean` | `true`  | Whether plural forms are required for all keys   |
| `detectUntranslated` | `boolean` | `true`  | Whether to detect untranslated strings in source |

### I18nMcpConfig Object

| Field       | Type     | Required | Description                            |
| ----------- | -------- | -------- | -------------------------------------- |
| `server`    | `string` | Yes      | Name or URL of the MCP server          |
| `projectId` | `string` | No       | Project ID on the remote i18n platform |

### Example

```json
{
  "i18n": {
    "enabled": true,
    "strictness": "strict",
    "sourceLocale": "en",
    "targetLocales": ["fr", "de", "ja"],
    "framework": "react-intl",
    "format": "json",
    "coverage": {
      "minimumPercent": 95,
      "requirePlurals": true,
      "detectUntranslated": true
    },
    "mcp": {
      "server": "crowdin-mcp",
      "projectId": "my-project-123"
    }
  }
}
```

## `review`

- **Type:** `ReviewConfig`
- **Required:** No

Configures code review orchestration, including which AI models to use at different tiers.

### ReviewConfig Object

| Field         | Type              | Required | Description                            |
| ------------- | ----------------- | -------- | -------------------------------------- |
| `model_tiers` | `ModelTierConfig` | No       | Custom model tier mappings for reviews |

### ModelTierConfig Object

| Field      | Type     | Required | Description                            |
| ---------- | -------- | -------- | -------------------------------------- |
| `fast`     | `string` | No       | Model ID for fast/cheap operations     |
| `standard` | `string` | No       | Model ID for standard reasoning tasks  |
| `strong`   | `string` | No       | Model ID for complex/critical analysis |

### Example

```json
{
  "review": {
    "model_tiers": {
      "fast": "claude-haiku-4",
      "standard": "claude-sonnet-4",
      "strong": "claude-opus-4"
    }
  }
}
```

## `integrations`

- **Type:** `IntegrationsConfig`
- **Required:** No

Tracks which MCP peer integrations are enabled and which have been dismissed by the user. Used by the `harness doctor` command to tailor integration suggestions.

### IntegrationsConfig Object

| Field       | Type       | Default | Description                                           |
| ----------- | ---------- | ------- | ----------------------------------------------------- |
| `enabled`   | `string[]` | `[]`    | Tier 1 integrations explicitly enabled by the user    |
| `dismissed` | `string[]` | `[]`    | Integrations the user does not want doctor to suggest |

### Example

```json
{
  "integrations": {
    "enabled": ["github-mcp", "linear-mcp"],
    "dismissed": ["jira-mcp"]
  }
}
```

## `architecture`

- **Type:** `ArchConfig`
- **Required:** No

Configures general architectural enforcement including metric thresholds and per-module overrides. Works alongside `layers` and `forbiddenImports` to provide comprehensive architecture health checks.

### ArchConfig Object

| Field          | Type                                                       | Default                          | Description                                |
| -------------- | ---------------------------------------------------------- | -------------------------------- | ------------------------------------------ |
| `enabled`      | `boolean`                                                  | `true`                           | Whether architecture checks are enabled    |
| `baselinePath` | `string`                                                   | `".harness/arch/baselines.json"` | Path to the architecture baselines file    |
| `thresholds`   | `Record<MetricCategory, number \| Record<string, number>>` | `{}`                             | Global metric thresholds keyed by category |
| `modules`      | `Record<string, ThresholdConfig>`                          | `{}`                             | Per-module threshold overrides             |

Threshold keys correspond to architecture metric categories such as `circular-deps`, `layer-violations`, `complexity`, `coupling`, `forbidden-imports`, `module-size`, and `dependency-depth`. Each value can be a single number or a record of named sub-thresholds.

### Example

```json
{
  "architecture": {
    "enabled": true,
    "baselinePath": ".harness/arch/baselines.json",
    "thresholds": {
      "circular-deps": { "max": 0 },
      "layer-violations": { "max": 0 },
      "complexity": { "max": 15 },
      "coupling": { "maxFanIn": 10, "maxFanOut": 8 },
      "forbidden-imports": { "max": 0 },
      "module-size": { "maxFiles": 30, "maxLoc": 3500 },
      "dependency-depth": { "max": 7 }
    },
    "modules": {}
  }
}
```

## `skills`

- **Type:** `SkillsConfig`
- **Required:** No

Controls how skills are loaded, suggested, and tiered in the skill dispatcher.

### SkillsConfig Object

| Field           | Type                     | Default | Description                                                       |
| --------------- | ------------------------ | ------- | ----------------------------------------------------------------- |
| `alwaysSuggest` | `string[]`               | `[]`    | Skills to always suggest in the dispatcher, regardless of scoring |
| `neverSuggest`  | `string[]`               | `[]`    | Skills to never suggest, even if they score highly                |
| `tierOverrides` | `Record<string, number>` | `{}`    | Override the tier (1--3) of specific skills by skill name         |

### Example

```json
{
  "skills": {
    "alwaysSuggest": ["detect-doc-drift", "check-dependencies"],
    "neverSuggest": ["experimental-refactor"],
    "tierOverrides": {
      "my-custom-skill": 1
    }
  }
}
```

## `traceability`

- **Type:** `TraceabilityConfig`
- **Required:** No

Configures spec-to-implementation traceability checks. Ensures that specification documents have corresponding implementations and tracks coverage.

### TraceabilityConfig Object

| Field          | Type                     | Default                          | Description                                                 |
| -------------- | ------------------------ | -------------------------------- | ----------------------------------------------------------- |
| `enabled`      | `boolean`                | `true`                           | Whether traceability checks are enabled                     |
| `severity`     | `"error"` \| `"warning"` | `"warning"`                      | Severity level when coverage is below threshold             |
| `minCoverage`  | `number`                 | `0`                              | Minimum required coverage percentage (0--100)               |
| `includeSpecs` | `string[]`               | `["docs/changes/*/proposal.md"]` | Glob patterns for specs to include in traceability checks   |
| `excludeSpecs` | `string[]`               | `[]`                             | Glob patterns for specs to exclude from traceability checks |

### Example

```json
{
  "traceability": {
    "enabled": true,
    "severity": "error",
    "minCoverage": 80,
    "includeSpecs": ["docs/changes/*/proposal.md", "docs/api/*.md"],
    "excludeSpecs": ["docs/changes/archived/**"]
  }
}
```

## `roadmap`

- **Type:** `RoadmapConfig`
- **Required:** No

Configures roadmap management and external tracker synchronization.

### RoadmapConfig Object

| Field     | Type            | Required | Description                    |
| --------- | --------------- | -------- | ------------------------------ |
| `tracker` | `TrackerConfig` | No       | External tracker sync settings |

### TrackerConfig Object

| Field              | Type                            | Required | Description                                           |
| ------------------ | ------------------------------- | -------- | ----------------------------------------------------- |
| `kind`             | `"github"` (literal)            | Yes      | Tracker kind (currently only `"github"` is supported) |
| `repo`             | `string`                        | No       | Repository in `"owner/repo"` format                   |
| `labels`           | `string[]`                      | No       | Labels auto-applied to synced issues for filtering    |
| `statusMap`        | `Record<RoadmapStatus, string>` | Yes      | Maps roadmap status to external tracker status        |
| `reverseStatusMap` | `Record<string, string>`        | No       | Maps external status back to roadmap status           |

The `statusMap` keys are roadmap statuses: `"backlog"`, `"planned"`, `"in-progress"`, `"done"`, `"blocked"`. Values are the corresponding external tracker statuses (e.g., `"open"`, `"closed"`).

### Example

```json
{
  "roadmap": {
    "tracker": {
      "kind": "github",
      "repo": "my-org/my-project",
      "labels": ["roadmap"],
      "statusMap": {
        "backlog": "open",
        "planned": "open",
        "in-progress": "open",
        "done": "closed",
        "blocked": "open"
      },
      "reverseStatusMap": {
        "open": "planned",
        "closed": "done"
      }
    }
  }
}
```

## `telemetry`

- **Type:** `TelemetryConfig`
- **Required:** No

Configures anonymous usage telemetry. Telemetry is enabled by default and sends anonymized product analytics (skill usage, session duration, outcome) to a central PostHog instance via HTTP. No personally identifiable information is sent unless the user explicitly opts in via `.harness/telemetry.json`.

### TelemetryConfig Object

| Field     | Type      | Default | Description                                  |
| --------- | --------- | ------- | -------------------------------------------- |
| `enabled` | `boolean` | `true`  | Whether anonymous telemetry collection is on |

### Opting Out

There are three ways to disable telemetry (checked in this order):

1. **Environment variable:** `DO_NOT_TRACK=1` (ecosystem standard)
2. **Environment variable:** `HARNESS_TELEMETRY_OPTOUT=1`
3. **Config file:** Set `telemetry.enabled` to `false` in `harness.config.json`

Any of these disables all telemetry -- no HTTP requests are made.

### Identity (Optional Opt-In)

Users who want to associate telemetry with a project, team, or alias can configure identity fields in `.harness/telemetry.json` (gitignored, never committed):

```json
{
  "identity": {
    "project": "myapp",
    "team": "platform",
    "alias": "cwarner"
  }
}
```

Use the CLI to manage identity:

```bash
# Set identity fields
harness telemetry identify --project myapp --team platform --alias cwarner

# Clear all identity fields
harness telemetry identify --clear

# View current telemetry state
harness telemetry status
harness telemetry status --json
```

### First-Run Notice

On first use, a one-time notice is printed to stderr explaining that anonymous telemetry is collected and how to disable it. The notice is not repeated after the flag file `.harness/.telemetry-notice-shown` is created.

### Example

```json
{
  "telemetry": {
    "enabled": true
  }
}
```

To disable:

```json
{
  "telemetry": {
    "enabled": false
  }
}
```

## `phaseGates`

- **Type:** `PhaseGatesConfig`
- **Required:** No

Phase gates enforce that implementation files have corresponding specification documents. This ensures a spec-first development workflow.

### PhaseGatesConfig Object

| Field      | Type                      | Default                                                                               | Description                                 |
| ---------- | ------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------- |
| `enabled`  | `boolean`                 | `false`                                                                               | Enable phase gate checks                    |
| `severity` | `"error"` \| `"warning"`  | `"error"`                                                                             | Severity level for violations               |
| `mappings` | `Array<PhaseGateMapping>` | `[{ implPattern: "src/**/*.ts", specPattern: "docs/changes/{feature}/proposal.md" }]` | Maps implementation files to spec documents |

### PhaseGateMapping Object

| Field               | Type      | Default | Description                                                                                                             |
| ------------------- | --------- | ------- | ----------------------------------------------------------------------------------------------------------------------- |
| `implPattern`       | `string`  | --      | Glob pattern matching implementation files                                                                              |
| `specPattern`       | `string`  | --      | Pattern for the required spec file (`{feature}` is replaced with the feature name derived from the implementation path) |
| `contentValidation` | `boolean` | `false` | When true, validate that the spec file contains a numbered requirements section                                         |

### Example

```json
{
  "phaseGates": {
    "enabled": true,
    "severity": "warning",
    "mappings": [
      { "implPattern": "src/**/*.ts", "specPattern": "docs/changes/{feature}/proposal.md" },
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

| Field       | Type                                                           | Required | Description                             |
| ----------- | -------------------------------------------------------------- | -------- | --------------------------------------- |
| `level`     | `"basic"` \| `"intermediate"` \| `"advanced"`                  | No       | Template complexity level (JS/TS only)  |
| `language`  | `"typescript"` \| `"python"` \| `"go"` \| `"rust"` \| `"java"` | No       | Target language                         |
| `framework` | `string`                                                       | No       | Primary technology framework            |
| `version`   | `number`                                                       | Yes      | Template version number                 |
| `tooling`   | `ToolingConfig`                                                | No       | Language-specific tooling configuration |

### ToolingConfig Object

| Field            | Type     | Required | Description                                    |
| ---------------- | -------- | -------- | ---------------------------------------------- |
| `packageManager` | `string` | No       | Package manager (e.g., `"npm"`, `"pnpm"`)      |
| `linter`         | `string` | No       | Linter tool (e.g., `"eslint"`, `"ruff"`)       |
| `formatter`      | `string` | No       | Formatter tool (e.g., `"prettier"`, `"black"`) |
| `buildTool`      | `string` | No       | Build tool (e.g., `"tsc"`, `"vite"`)           |
| `testRunner`     | `string` | No       | Test runner (e.g., `"vitest"`, `"pytest"`)     |
| `lockFile`       | `string` | No       | Lock file name (e.g., `"pnpm-lock.yaml"`)      |

### Example

```json
{
  "template": {
    "level": "intermediate",
    "language": "typescript",
    "framework": "express",
    "version": 1,
    "tooling": {
      "packageManager": "pnpm",
      "linter": "eslint",
      "formatter": "prettier",
      "buildTool": "tsc",
      "testRunner": "vitest",
      "lockFile": "pnpm-lock.yaml"
    }
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
  "security": {
    "enabled": true,
    "strict": false,
    "rules": { "SEC-CRY-001": "warning" },
    "exclude": ["**/node_modules/**", "**/dist/**"]
  },
  "performance": {
    "complexity": {
      "enabled": true,
      "thresholds": { "cyclomaticComplexity": { "error": 15, "warn": 10 } }
    },
    "coupling": {
      "enabled": true,
      "thresholds": { "fanOut": { "warn": 15 } }
    },
    "sizeBudget": { "enabled": false, "budgets": {} }
  },
  "architecture": {
    "enabled": true,
    "thresholds": {
      "circular-deps": { "max": 0 },
      "layer-violations": { "max": 0 },
      "complexity": { "max": 15 }
    }
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
    "mappings": [
      { "implPattern": "src/**/*.ts", "specPattern": "docs/changes/{feature}/proposal.md" }
    ]
  },
  "traceability": {
    "enabled": true,
    "severity": "warning",
    "minCoverage": 80,
    "includeSpecs": ["docs/changes/*/proposal.md"]
  },
  "skills": {
    "alwaysSuggest": ["detect-doc-drift"],
    "neverSuggest": [],
    "tierOverrides": {}
  },
  "design": {
    "strictness": "standard",
    "platforms": ["web"]
  },
  "i18n": {
    "enabled": false,
    "sourceLocale": "en",
    "targetLocales": []
  },
  "review": {
    "model_tiers": {
      "fast": "claude-haiku-4",
      "standard": "claude-sonnet-4"
    }
  },
  "integrations": {
    "enabled": ["github-mcp"],
    "dismissed": []
  },
  "roadmap": {
    "tracker": {
      "kind": "github",
      "repo": "my-org/my-project",
      "labels": ["roadmap"],
      "statusMap": {
        "backlog": "open",
        "planned": "open",
        "in-progress": "open",
        "done": "closed",
        "blocked": "open"
      },
      "reverseStatusMap": {
        "open": "planned",
        "closed": "done"
      }
    }
  },
  "telemetry": {
    "enabled": true
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

_Last Updated: 2026-04-10_
