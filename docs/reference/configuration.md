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

### `mcp`

- **Type:** `object`
- **Required:** No

Harness MCP server settings for manual AI sessions (Claude Code / Cursor / Codex / Gemini running against the harness MCP server).

- `contextBudget.maxTokens` (`number`, positive integer) — the per-response context-replay budget. The manual-session counterpart to the orchestrator's per-leaf budget (`agent.contextBudget`, issue #1524). When set, any MCP tool response whose estimated token load exceeds `maxTokens` gets a loud steer notice appended pointing the session at graph-scoped retrieval (`code_outline` / `code_unfold` / `find_context_for`) instead of raw file reads. The check WARNs, it never blocks. Omit to disable — with no budget configured, MCP behavior is byte-identical to before this field existed.

```json
{
  "mcp": {
    "contextBudget": { "maxTokens": 200000 }
  }
}
```

### `toolchain`

- **Type:** `object`
- **Required:** No

Toolchain expectations this workspace declares.

| Key          | Type     | Description                                                        |
| ------------ | -------- | ------------------------------------------------------------------ |
| `cliVersion` | `string` | Semver range naming the `@harness-engineering/cli` line to expect. |

```json
{
  "toolchain": {
    "cliVersion": ">=11"
  }
}
```

A stale scanner does not fail — it re-reports findings the workspace has already
justified and suppressed, so its output is well-formed, confident, and wrong.
When `cliVersion` is set, the CLI compares its own version against the range
before running any findings-producing command (`check-arch`,
`check-deployment`, `check-deps`, `check-docs`, `check-harness-strength`,
`check-perf`, `check-security`, `cleanup`, `cross-check`, `review-ci`,
`validate`):

- Range satisfied — silent.
- Two or more majors below the range minimum — **refuses** and exits `3`
  (the abstain code: the command examined nothing, so it must never read as
  green, and must not be confused with exit `1`, which is what these commands
  return when they found real findings).
- Exactly one major below, or unsatisfied at a smaller distance — warns and
  proceeds. Being one major behind is the normal state of a repository partway
  through an upgrade.

`doctor`, `update`, `setup`, and `init` are never gated — those are the commands
you need when the toolchain is wrong.

When `cliVersion` is omitted, the CLI falls back to a `@harness-engineering/cli`
range declared in the project's `package.json` (`devDependencies`, then
`dependencies`). Non-semver specifiers such as `workspace:*`, `file:`, `link:`,
`git+`, `*`, and `latest` are ignored rather than coerced. When no expected
version can be resolved at all, the check is silent.

Set `HARNESS_NO_VERSION_GUARD=1` to downgrade a refusal to a warning. It does not
silence the warning — a variable that hid the message entirely would restore the
silent failure the check exists to prevent.

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

## `deps`

- **Type:** `DepsConfig`
- **Required:** No

Tunes `harness check-deps` discovery — the set of files considered for both layer-boundary validation and circular-dependency detection.

`check-deps` **always** skips vendored and generated directories (`node_modules`, `dist`, virtualenvs, caches — the shared default skip-list documented under [`ingest`](#ingest)). This means a broad layer `pattern` such as `packages/**` no longer walks into `packages/foo/node_modules/**`, so circular dependencies inside third-party packages (e.g. `yargs`, `@grpc/grpc-js`) never fail the gate — they are not the consuming repo's to fix.

### DepsConfig Object

| Field     | Type       | Default | Description                                                                                                                                                         |
| --------- | ---------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `exclude` | `string[]` | `[]`    | Extra glob patterns (minimatch) excluded from `check-deps` discovery, stacked on top of the built-in skip-list. Lets you scope without shrinking a layer `pattern`. |

Mirrors [`analysis.exclude`](#analysis) and [`design.exclude`](#design). Prefer `deps.exclude` over narrowing a layer `pattern` to silence a finding — narrowing the pattern also shrinks what the gate actually checks.

`check-deps` reports the analyzed-module count ("Analyzed N module(s) across M layer(s).") so the scanned denominator is observable. A run with layers configured that discovers **zero** modules fails rather than reporting clean.

### Example

```json
{
  "deps": {
    "exclude": ["packages/*/generated/**", "**/*.pb.ts"]
  }
}
```

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

## `ingest`

- **Type:** `IngestConfig`
- **Required:** No

Controls which directories and files `harness scan` and `harness ingest --source code` walk when building the knowledge graph.

The default skip-list is comprehensive — it excludes `node_modules`, `.git`, framework caches (`.turbo`, `.vite`, `.next`, `.nuxt`, `.svelte-kit`, `.parcel-cache`, `.docusaurus`, `.wrangler`, `.astro`, `.remix`, `storybook-static`), test/coverage outputs (`coverage`, `.nyc_output`, `playwright-report`, `test-results`, `.pytest_cache`), Python virtualenvs and bytecode (`__pycache__`, `.venv`, `venv`, `.tox`, `.mypy_cache`, `.ruff_cache`), JVM build outputs (`.gradle`, `.gradle-home`, `target`, `build`, `out`, `bin`, `obj`, `_build`, `deps`), package-manager stores (`.pnpm-store`, `.yarn`, `vendor`), IDE metadata (`.idea`, `.vscode`, `.vs`), the `.harness` directory itself, and AI agent sandboxes (`.claude`, `.cursor`, `.codex`, `.gemini`, `.aider`, `.agents`, `.agentastic`, `.playwright-mcp`).

These fields are escape hatches for projects with non-standard cache or output directories.

### IngestConfig Object

| Field                | Type       | Default | Description                                                                                                      |
| -------------------- | ---------- | ------- | ---------------------------------------------------------------------------------------------------------------- |
| `skipDirs`           | `string[]` | --      | Replace the default skip-dirs set entirely. Each entry is a single path segment matched as a directory name.     |
| `additionalSkipDirs` | `string[]` | --      | Extend the default skip-dirs set. The recommended extension point.                                               |
| `excludePatterns`    | `string[]` | --      | Glob patterns (minimatch syntax) excluded from ingestion. Matched against the project-relative POSIX-style path. |
| `respectGitignore`   | `boolean`  | `true`  | Treat lines in `<rootDir>/.gitignore` as additional exclude patterns. Negation (`!pattern`) is not supported.    |

### Example

```json
{
  "ingest": {
    "additionalSkipDirs": ["my-custom-cache", "vendored-deps"],
    "excludePatterns": ["apps/legacy/**", "**/*.snap"],
    "respectGitignore": true
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

## `constraintPacks`

- **Type:** `string[]`
- **Required:** No

Opts the project into named **constraint packs** — bundles of blocking rules enforced per lifecycle stage rather than all-or-nothing. Each pack maps onto existing security rule sets and elevates a set of rules to blocking at the stage(s) it declares (`pre-commit`, `pre-merge`, `pre-release`). Leaving this empty or absent changes nothing — no pack rules are enforced.

Opting into a pack is equivalent to setting **only** that pack's `security.rules` overrides by hand — no more. A pack elevates exactly the rule prefixes it names (for example `web-hardening` blocks `SEC-XSS-*`, `SEC-PTH-*`, `SEC-NET-*`, and `SEC-CRY-*`); it never promotes unrelated rules. A project's own explicit `security.rules` entry always wins over a pack, so you can still dial an individual rule back down.

If a pack is opted in while `security.enabled` is `false`, the pack turns the security check back on — but only its own rule prefixes block. Every other rule the scanner would run by default is held at `off`, so opting into one pack never enables the whole scanner. When security is already enabled, the pack's elevations are layered on top of your existing rules and defaults.

`harness ci check --stage <stage>` enforces only the packs that apply at that stage; without `--stage`, every stage of every opted-in pack is enforced (the most conservative combined gate). An unrecognized `--stage` value is rejected with an error rather than silently running every stage. The check report includes a per-pack, per-stage compliance summary (`compliant` / `non-compliant` / `n/a`); a stage is marked `non-compliant` only when a failing security finding belongs to one of that pack's own rule prefixes. If packs are opted in but the security check is skipped, `harness ci check` warns that their rules were not enforced.

### Built-in packs

| Pack                    | Blocks                                                                 | Stage(s)                   |
| ----------------------- | ---------------------------------------------------------------------- | -------------------------- |
| `secrets-and-injection` | Hardcoded secrets and injection vulnerabilities                        | `pre-merge`, `pre-release` |
| `ai-agent-safety`       | Unsafe AI-agent and MCP configurations (prompt-injection, tool access) | `pre-merge`                |
| `web-hardening`         | XSS, path traversal, unsafe network calls, weak crypto                 | `pre-release`              |

### Example

```json
{
  "constraintPacks": ["secrets-and-injection", "web-hardening"]
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

## `comprehension`

- **Type:** `ComprehensionConfig`
- **Required:** No

Configures the **compiled comprehension substrate** — the per-module understanding
layer (summary, invariants, interface contract, dependency slice) compiled by
`harness comprehend`, served to agents as primary context via `gather_context` /
`get_comprehension`, and kept correct by a serve-time source-hash gate. Every knob
defaults to a sane, adopter-safe value; the substrate delivers value with zero
configuration and **never requires a credential in its default posture** —
correctness, `git push`, and CI run with no LLM and no API token.

### ComprehensionConfig Object

| Field             | Type                             | Default       | Description                                                                                                                                                                                                                                                         |
| ----------------- | -------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `storage`         | `"committed" \| "cache"`         | `"committed"` | Where units live. `committed` writes git-tracked units under `.harness/comprehension/` (versioned alongside the code); `cache` writes disposable, git-ignored units.                                                                                                |
| `semantic`        | `boolean`                        | `true`        | Whether to generate the advisory LLM half (summary + invariants). `false` ⇒ **static-only**, never resolves a provider or calls an LLM.                                                                                                                             |
| `model`           | `string \| null`                 | `null`        | Override the semantic-tier model. `null` uses the default cheap/fast tier (comprehension summarizes, it does not reason).                                                                                                                                           |
| `maxTokensPerRun` | `number` (positive int)          | `200000`      | Per-run semantic token budget. When exhausted the run fails loud; remaining modules are left `semantic: absent`, never silently partial.                                                                                                                            |
| `concurrency`     | `number` (positive int)          | `4`           | Bounded concurrency for semantic generation.                                                                                                                                                                                                                        |
| `ci`              | `"verify" \| "refresh" \| "off"` | `"verify"`    | CI behavior. `verify` runs the token-free static/hash freshness backstop (non-blocking); `refresh` is an opt-in, token-gated regeneration job; `off` disables the CI step.                                                                                          |
| `hook`            | `boolean`                        | `false`       | Opt-in git pre-commit hook. When `true`, a config-gated, **static-only, non-blocking** step runs `harness comprehend --changed --static --stage` so a source change lands with its refreshed unit in the same commit. Never calls an LLM and never blocks a commit. |

### Example

```json
{
  "comprehension": {
    "storage": "committed",
    "semantic": true,
    "model": null,
    "maxTokensPerRun": 200000,
    "concurrency": 4,
    "ci": "verify",
    "hook": false
  }
}
```

For a static-only, credential-free posture (no LLM ever), set `"semantic": false`.
See the [comprehension substrate knowledge doc](../knowledge/comprehension/comprehension-substrate.md)
and ADRs 0106–0108 for the design.

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

> **Extra domain-specific reviewers** are no longer configured here. The old
> `review.additionalSkills` field was generalized into the top-level
> [`skillHooks`](#skillhooks) framework — declare extra reviewers as
> `skillHooks["harness-autopilot"]["after:REVIEW"]` (and `"after:FINAL_REVIEW"`).

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

## `skillHooks`

- **Type:** `SkillHooksConfig`
- **Required:** No

Cross-skill **lifecycle hooks**: a project attaches additional skills, commands,
and prompts at lifecycle points of any hook-supporting orchestrator skill.
Resolution and normalization are shared in `@harness-engineering/core`
(`resolveSkillHooks`) so every consuming skill honors the same contract. This is
the generalization of the former `review.additionalSkills` field — the review
case is now `skillHooks["harness-autopilot"]["after:REVIEW"]`.

```jsonc
{
  "skillHooks": {
    "harness-autopilot": {
      "before:EXECUTE": [
        "preflight-skill", // bare string = a `skill` hook (shorthand)
        { "type": "command", "run": "pnpm lint", "blocking": true },
        {
          "type": "prompt",
          "text": "Prefer existing helpers in packages/core/util over new ones.",
        },
      ],
      "after:REVIEW": [{ "type": "skill", "skill": "canary-cassandra", "blocking": true }],
      "after:FINAL_REVIEW": ["canary-cassandra"],
      "on:failure": [{ "type": "command", "run": "scripts/notify.sh" }],
    },
    "harness-code-review": { "after:mechanical": ["extra-domain-check"] },
  },
}
```

### Structure

- **Outer key** — the hook-supporting skill's name. Each skill declares its own
  hookable event vocabulary in its SKILL.md; there is no universal phase enum,
  so hooks are keyed by skill name. (A `"*"` wildcard outer key meaning "hooks
  for every skill" is RESERVED for v2.)
- **Inner key** — an event string. Grammar: `^(before|after|on):[A-Za-z0-9_-]+$`.
  - `before:<phase>` / `after:<phase>` — phase-boundary hooks (multi-phase skills).
  - `before:run` / `after:run` — the whole invocation, so single-shot
    (phase-less) skills are hookable too.
  - `on:<event>` — cross-cutting lifecycle events: `on:failure`, `on:park`,
    `on:checkpoint`, `on:retry`, …
  - RESERVED (v2): per-iteration granularity (`after:EXECUTE:task`,
    `after:dispatch:item`).
- **Value** — an ordered array of hook entries.

### Hook entry kinds

Each array entry is a bare skill-name string (shorthand for a `skill` hook) or
one of three discriminated objects. Every object kind accepts `"enabled": false`
to park a hook without deleting it (a disabled hook is skipped — never a hard halt):

| Kind      | Shape                                                   | Effect                                                                                                                       |
| --------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `skill`   | `{ "type": "skill", "skill", "blocking"?, "enabled"? }` | Dispatch the skill as an additional subagent (LLM path).                                                                     |
| `prompt`  | `{ "type": "prompt", "text", "enabled"? }`              | Mechanically append `text` to that phase's persona prompt. Never blocks. (Static in v1; `{{token}}` templating RESERVED v2.) |
| `command` | `{ "type": "command", "run", "blocking"?, "enabled"? }` | Mechanically run the shell command via the command-runner (honoring cwd), no LLM.                                            |

### Blocking & hard-halt policy

- **Default blocking** — for `skill` and `command` hooks, when `blocking` is
  unset it defaults to `true` at review/verify events and `false` elsewhere; a
  per-entry `blocking` always overrides. `prompt` hooks never block.
- **`skill`** — an unresolvable/undispatchable skill is a **hard halt** (config
  error; recorded in `.harness/failures.md`; never a silent skip, never routed
  through the fix/override/stop ask).
- **`command`** — two failure modes: a command that **cannot be spawned**
  (missing binary / spawn error) is a **hard halt** (same class as an
  unresolvable skill); a command that **ran and exited non-zero** is a normal
  **finding**, blocking per policy — not a hard halt.
- **`prompt`** — never blocks and never halts.

### Hook context (input contract)

When a hook fires, the host skill threads the invocation context.

- **`command`** hooks receive it as environment variables **and** the same
  context as a JSON object on **stdin**. Absent values are unset env keys (no
  empty-string placeholders):

  | Env var                  | Meaning                                  |
  | ------------------------ | ---------------------------------------- |
  | `HARNESS_HOOK_EVENT`     | the event key, e.g. `after:REVIEW`       |
  | `HARNESS_HOOK_SKILL`     | the host skill, e.g. `harness-autopilot` |
  | `HARNESS_PHASE`          | the current phase/state, when known      |
  | `HARNESS_PROJECT_ROOT`   | absolute project root                    |
  | `HARNESS_SESSION_DIR`    | the session directory, when known        |
  | `HARNESS_CHANGED_FILES`  | newline-separated list of changed files  |
  | `HARNESS_PLAN_PATH`      | the active plan path, when known         |
  | `HARNESS_FAILURE_REASON` | set only on `on:failure`                 |

  Conditional/glob scoping is achievable today by a command self-gating on
  `$HARNESS_CHANGED_FILES` (a dedicated conditional-glob field is RESERVED v2).

- **`skill`** hooks receive the same context (event, session dir, changed files,
  plan path) in the subagent brief, so a hooked reviewer is not blind.
- **`prompt`** hooks are the static text, appended verbatim.

### Reference consumers

`harness-autopilot` (events: `before:/after:` for `PLAN`/`EXECUTE`/`VERIFY`/
`INTEGRATE`/`REVIEW`/`FINAL_REVIEW`, plus `on:failure`) and `harness-code-review`
(`after:mechanical`) are the wired consumers. A skill becomes hook-supporting by
declaring its event vocabulary in its SKILL.md, calling `resolveSkillHooks`, and
honoring the blocking + hard-halt rules; remaining skills follow as a follow-up.

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

## `knowledge`

- **Type:** `KnowledgeConfig`
- **Required:** No

Configures the knowledge graph and domain inference. Domain inference classifies extracted nodes (files, signals, business facts) into a domain bucket (e.g. `payments`, `auth`, `skills`) used by drift detection, gap reporting, and the knowledge pipeline.

### KnowledgeConfig Object

| Field             | Type       | Default | Description                                                                   |
| ----------------- | ---------- | ------- | ----------------------------------------------------------------------------- |
| `domainPatterns`  | `string[]` | `[]`    | Additional path patterns whose captured directory becomes the inferred domain |
| `domainBlocklist` | `string[]` | `[]`    | Additional directory names that should never be treated as domains            |

Both fields **extend** (not replace) the built-in defaults.

#### Pattern syntax

Each entry in `domainPatterns` uses the form `prefix/<dir>` where `prefix` is a single path segment and `<dir>` is the literal placeholder that captures the next segment as the domain name. The full regex is `^[\w.-]+\/<dir>$`.

Built-in patterns (always active):

- `packages/<dir>` — e.g. `packages/auth/...` → `auth`
- `apps/<dir>`
- `services/<dir>`
- `src/<dir>`
- `lib/<dir>`

Built-in blocklist (always active): `node_modules`, `.harness`, `dist`, `build`, `.git`, `coverage`, `.next`, `.turbo`, `.cache`, `out`, `tmp`.

#### Precedence

Domain inference resolves in this order (first match wins):

1. Explicit `metadata.domain` on the node
2. User-configured `knowledge.domainPatterns`
3. Built-in patterns (`packages/<dir>`, `apps/<dir>`, etc.)
4. Generic first-segment fallback (the leading directory of the path)
5. `'unknown'` if every prior step fails

Two refinements apply to all stages:

- **Extension allowlist:** only files with `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, or `.cjs` extensions are inferred. Other extensions return `'unknown'`.
- **Symmetric blocklist:** if a path matches a pattern but the captured segment is on the blocklist, the result is `'unknown'` directly — it does not fall through to later steps.

The canonical implementation lives at `packages/graph/src/ingest/domain-inference.ts`.

### Example

A monorepo that publishes Claude Code skills under `agents/skills/<name>/` and wants those classified as the `skills` domain:

```json
{
  "knowledge": {
    "domainPatterns": ["agents/skills/<dir>"],
    "domainBlocklist": ["fixtures", "examples"]
  }
}
```

With this config:

- `agents/skills/harness-planning/SKILL.md` → domain `harness-planning`
- `agents/skills/fixtures/sample.ts` → `'unknown'` (segment is blocklisted)
- `packages/graph/src/ingest/domain-inference.ts` → domain `graph` (built-in pattern still wins for `packages/<dir>`)

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

| Field     | Type                           | Required | Default         | Description                                               |
| --------- | ------------------------------ | -------- | --------------- | --------------------------------------------------------- |
| `mode`    | `"file-backed" \| "file-less"` | No       | `"file-backed"` | Roadmap storage mode. See §"Mode validation rules" below. |
| `tracker` | `TrackerConfig`                | No       | —               | External tracker sync settings                            |

The canonical source of the `"file-backed"` default is `RoadmapConfigSchema` in `packages/cli/src/config/schema.ts` (`mode: z.enum([...]).default('file-backed')`). After Zod parses a config, `roadmap.mode` is always populated.

### TrackerConfig Object

| Field              | Type                            | Required | Description                                           |
| ------------------ | ------------------------------- | -------- | ----------------------------------------------------- |
| `kind`             | `"github"` (literal)            | Yes      | Tracker kind (currently only `"github"` is supported) |
| `repo`             | `string`                        | No       | Repository in `"owner/repo"` format                   |
| `labels`           | `string[]`                      | No       | Labels auto-applied to synced issues for filtering    |
| `statusMap`        | `Record<RoadmapStatus, string>` | Yes      | Maps roadmap status to external tracker status        |
| `reverseStatusMap` | `Record<string, string>`        | No       | Maps external status back to roadmap status           |

The `statusMap` keys are roadmap statuses: `"backlog"`, `"planned"`, `"in-progress"`, `"done"`, `"blocked"`. Values are the corresponding external tracker statuses (e.g., `"open"`, `"closed"`).

### Mode validation rules

Two cross-cutting invariants are enforced by `harness validate` (rule implementation in `packages/core/src/validation/roadmap-mode.ts`):

- **`ROADMAP_MODE_MISSING_TRACKER`** — When `roadmap.mode` is `"file-less"`, `roadmap.tracker` must be configured. File-less mode requires an external tracker as the source of truth.
- **`ROADMAP_MODE_FILE_PRESENT`** — When `roadmap.mode` is `"file-less"`, `docs/roadmap.md` must NOT exist. Run `harness roadmap migrate --to=file-less` to convert a file-backed project; the command archives `docs/roadmap.md` to `docs/roadmap.md.archived` as the final step.

See `docs/guides/roadmap-sync.md` §"File-less mode" for the operator walkthrough and ADRs 0008 (tracker abstraction in core), 0009 (audit history as issue comments), 0010 (`tracker.kind` schema decoupling).

### Example

```json
{
  "roadmap": {
    "mode": "file-backed", // optional; defaults to "file-backed"
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

## `adoption`

- **Type:** `AdoptionConfig`
- **Required:** No

Configures adoption tracking, which records skill invocation metrics to `.harness/metrics/adoption.jsonl` via the `adoption-tracker` stop hook.

### AdoptionConfig Object

| Field     | Type      | Default | Description                          |
| --------- | --------- | ------- | ------------------------------------ |
| `enabled` | `boolean` | `true`  | Whether adoption tracking is enabled |

### Example

```json
{
  "adoption": {
    "enabled": true
  }
}
```

To disable adoption tracking:

```json
{
  "adoption": {
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

| Field       | Type                                                                      | Required | Description                             |
| ----------- | ------------------------------------------------------------------------- | -------- | --------------------------------------- |
| `level`     | `"basic"` \| `"intermediate"` \| `"load-bearing-minimum"` \| `"advanced"` | No       | Template complexity level (JS/TS only)  |
| `language`  | `"typescript"` \| `"python"` \| `"go"` \| `"rust"` \| `"java"`            | No       | Target language                         |
| `framework` | `string`                                                                  | No       | Primary technology framework            |
| `version`   | `number`                                                                  | Yes      | Template version number                 |
| `tooling`   | `ToolingConfig`                                                           | No       | Language-specific tooling configuration |

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
npx harness validate
```

If validation fails, the error message will indicate which field has an invalid value and what was expected.

## See Also

- [CLI Reference](./cli.md)
- [Getting Started Guide](/guides/getting-started.md)
- [Best Practices Guide](/guides/best-practices.md)
- [Implementation Guide](/standard/implementation.md)

---

_Last Updated: 2026-04-10_
