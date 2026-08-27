<!-- AUTO-GENERATED — do not edit. Run `pnpm run generate:tool-catalog` to regenerate. -->

# Tool & Skill Catalog

Canonical, regenerated-and-gated reference for every shipped MCP tool and skill. Unlike the summary in [MCP Tools Reference](./mcp-tools.md), this catalog serializes each tool’s **full live input schema** and each skill’s **full declared contract**, so a divergence between a definition’s real schema and its documentation is caught by `pnpm run generate:tool-catalog:check` in CI rather than drifting silently.

## MCP Tools (113)

Every shipped MCP tool, booted live from the built server, with its full input schema. A drift between a tool’s real schema and this catalog fails the build.

### `acceptance_eval`

Pre-execution LLM-judgment: does a spec carry measurable, testable, complete acceptance criteria? The upstream twin of outcome_eval. Reads the spec's success/acceptance section, emits a confidence-rated AcceptanceVerdict (MEASURABLE | NOT_MEASURABLE | INCONCLUSIVE) with criteriaFindings (a, advisory), coverageFindings (b, advisory) and a rationale. Authority is DERIVED in TypeScript, never trusted from the LLM: a high-confidence NOT_MEASURABLE is blocking; every other verdict is advisory. testGlobs/testContent are optional evidence for (b) — omitting them degrades coverage findings to advisory-empty but never affects the measurability gate.

**Input schema:**

```json
{
  "properties": {
    "model": {
      "description": "Optional model override for the acceptance-eval LLM call",
      "type": "string"
    },
    "specPath": {
      "description": "Absolute or repo-relative path to the spec markdown to judge",
      "type": "string"
    },
    "testContent": {
      "description": "Optional pre-collected test snippets (the (b) evidence). Takes precedence over testGlobs.",
      "type": "string"
    },
    "testGlobs": {
      "description": "Optional globs locating test files; their contents supply the (b) coverage evidence. Ignored when testContent is provided. Absolute globs are recommended; relative globs resolve against the MCP server cwd.",
      "items": {
        "type": "string"
      },
      "type": "array"
    }
  },
  "required": [
    "specPath"
  ],
  "type": "object"
}
```

### `acquire_compound_lock`

Acquire a per-category compound lock at `.harness/locks/compound-&lt;category>.lock` under the project root. Returns `{ acquired, token, lockPath }` on success or `{ acquired: false, error, holderPid, lockPath }` on contention. The returned token must be passed to release_compound_lock when the write completes. Categories must be one of the documented bug-track/knowledge-track categories.

**Input schema:**

```json
{
  "properties": {
    "category": {
      "description": "Solution category (e.g., 'build-errors', 'architecture-patterns'). See packages/core/src/solutions/schema.ts for the full list.",
      "type": "string"
    },
    "path": {
      "description": "Project root directory",
      "type": "string"
    }
  },
  "required": [
    "path",
    "category"
  ],
  "type": "object"
}
```

### `add_component`

Add a component (layer, doc, or component type) to the project using the harness CLI

**Input schema:**

```json
{
  "properties": {
    "name": {
      "description": "Name of the component to add",
      "type": "string"
    },
    "path": {
      "description": "Path to project root directory",
      "type": "string"
    },
    "type": {
      "description": "Type of component to add",
      "enum": [
        "layer",
        "doc",
        "component"
      ],
      "type": "string"
    }
  },
  "required": [
    "path",
    "type",
    "name"
  ],
  "type": "object"
}
```

### `advise_skills`

Content-based skill recommendations for a spec or feature description. Returns tiered matches with purpose and timing guidance.

**Input schema:**

```json
{
  "properties": {
    "path": {
      "description": "Project root path (defaults to cwd)",
      "type": "string"
    },
    "specPath": {
      "description": "Path to the spec file (proposal.md), relative to project root",
      "type": "string"
    },
    "thorough": {
      "description": "Include Consider tier in output",
      "type": "boolean"
    },
    "top": {
      "description": "Max skills per tier (default 5 apply, 10 reference)",
      "type": "number"
    }
  },
  "required": [
    "specPath"
  ],
  "type": "object"
}
```

### `align_design_system`

Apply codemods for DRIFT-T001/T002/T003 (hex/font/spacing tokens) where pre-flight classifier deems the change safe; emit precise suggestions for DRIFT-T004 (deprecated tokens) and all DRIFT-P* (primitive adoption). Runs standalone (invokes detect-design-drift internally) or as the FIX step in a pipeline (reads pipeline.driftFindings from handoff.json).

**Input schema:**

```json
{
  "properties": {
    "designStrictness": {
      "description": "Overrides design.strictness from harness.config.json.",
      "enum": [
        "strict",
        "standard",
        "permissive"
      ],
      "type": "string"
    },
    "dryRun": {
      "description": "Compute diffs without writing to disk. Default: false (write is the default).",
      "type": "boolean"
    },
    "files": {
      "description": "Optional file scope (standalone mode passes through to detect-design-drift).",
      "items": {
        "type": "string"
      },
      "type": "array"
    },
    "fixBatch": {
      "description": "Optional list of finding keys (CODE@file:line) to limit application to a subset. Honored in pipeline mode.",
      "items": {
        "type": "string"
      },
      "type": "array"
    },
    "mode": {
      "description": "standalone (default): runs detect internally. pipeline: reads pipeline.driftFindings from .harness/handoff.json and writes pipeline.fixesApplied back.",
      "enum": [
        "standalone",
        "pipeline"
      ],
      "type": "string"
    },
    "path": {
      "description": "Project root path",
      "type": "string"
    },
    "revert": {
      "description": "When true, inverse-applies the most-recent batch recorded at .harness/align/last-batch.json instead of detecting + classifying + applying. Skips files edited externally since the apply.",
      "type": "boolean"
    }
  },
  "required": [
    "path"
  ],
  "type": "object"
}
```

### `analyze_diff`

Parse a git diff and check for forbidden patterns, oversized files, and missing test coverage

**Input schema:**

```json
{
  "properties": {
    "diff": {
      "description": "Git diff string to analyze",
      "type": "string"
    },
    "forbiddenPatterns": {
      "description": "List of regex patterns that are forbidden in the diff",
      "items": {
        "type": "string"
      },
      "type": "array"
    },
    "maxFileCount": {
      "description": "Maximum number of changed files before flagging",
      "type": "number"
    },
    "maxFileSize": {
      "description": "Maximum number of lines changed per file before flagging",
      "type": "number"
    },
    "path": {
      "description": "Path to project root (enables graph-enhanced analysis)",
      "type": "string"
    }
  },
  "required": [
    "diff"
  ],
  "type": "object"
}
```

### `api_craft`

LLM-judgment critique of API quality — the ceiling counterpart to rule-based API checks (OpenAPI-format and webhook-format compliance). Asks the ceiling questions a linter cannot: do resources model the domain rather than the implementation, is the resource naming and URL structure predictable (path vs query param), are HTTP methods honest, are status codes correct, do error responses tell the consumer what to do, are response shapes predictable and consistent, do collections paginate and filter consistently, are mutations idempotency-honest, and does the API evolve without breaking consumers. Discovers a project’s own API surface — OpenAPI/Swagger documents and route/handler definitions — and critiques each per file. 9 seed rubrics; a curated exemplar set (Stripe / Linear / GitHub / Resend / Anthropic) anchors the catalog. Emits 3-axis findings (tier x impact x confidence per ADR 0019). Structural twin of cli_ergonomics_craft. In-session mode (default in Claude Code) returns prompts for the calling agent to answer; call api_craft_finalize with the responses to get findings.

**Input schema:**

```json
{
  "properties": {
    "excludeDirs": {
      "description": "Extra subdir names to skip while walking",
      "items": {
        "type": "string"
      },
      "type": "array"
    },
    "files": {
      "description": "Optional file scope (overrides API-surface discovery)",
      "items": {
        "type": "string"
      },
      "type": "array"
    },
    "maxFiles": {
      "description": "Cap surface count (default: 60)",
      "type": "number"
    },
    "mode": {
      "description": "'in-session' (default): return prompts for the calling agent to answer, then call api_craft_finalize. 'inline': run end-to-end via the configured provider (HARNESS_CRAFT_LLM).",
      "enum": [
        "inline",
        "in-session"
      ],
      "type": "string"
    },
    "path": {
      "description": "Project root path",
      "type": "string"
    },
    "promptBudget": {
      "description": "Cap prompt count in in-session mode (default: 100)",
      "type": "number"
    },
    "routesDir": {
      "description": "Directory of route/handler definitions to critique",
      "type": "string"
    },
    "specFile": {
      "description": "Explicit OpenAPI/Swagger document to critique",
      "type": "string"
    }
  },
  "required": [
    "path"
  ],
  "type": "object"
}
```

### `api_craft_finalize`

Finalize an api_craft in-session run by submitting the calling agent's responses to the prompts collected by api_craft. Returns the standard ApiCraftOutput with findings.

**Input schema:**

```json
{
  "properties": {
    "path": {
      "description": "Project root path used in the collect call (must match)",
      "type": "string"
    },
    "responses": {
      "description": "Per-prompt responses. `raw` is the fenced JSON block the calling agent produced.",
      "items": {
        "properties": {
          "promptId": {
            "type": "string"
          },
          "raw": {
            "type": "string"
          }
        },
        "required": [
          "promptId",
          "raw"
        ],
        "type": "object"
      },
      "type": "array"
    },
    "runId": {
      "description": "runId returned by the api_craft collect call",
      "type": "string"
    }
  },
  "required": [
    "path",
    "runId",
    "responses"
  ],
  "type": "object"
}
```

### `ask_graph`

Ask a natural language question about the codebase knowledge graph. Supports questions about impact ("what breaks if I change X?"), finding entities ("where is the auth middleware?"), relationships ("what calls UserService?"), explanations ("what is GraphStore?"), and anomalies ("what looks wrong?"). Returns a human-readable summary and raw graph data.

**Input schema:**

```json
{
  "properties": {
    "path": {
      "description": "Path to project root",
      "type": "string"
    },
    "question": {
      "description": "Natural language question about the codebase",
      "type": "string"
    }
  },
  "required": [
    "path",
    "question"
  ],
  "type": "object"
}
```

### `assess_project`

Run all project health checks in parallel and return a unified report. Checks: validate, dependencies, docs, entropy, security, performance, lint.

**Input schema:**

```json
{
  "properties": {
    "checks": {
      "description": "Which checks to run (default: all)",
      "items": {
        "enum": [
          "validate",
          "deps",
          "docs",
          "entropy",
          "security",
          "perf",
          "lint"
        ],
        "type": "string"
      },
      "type": "array"
    },
    "mode": {
      "description": "Response density. Default: summary",
      "enum": [
        "summary",
        "detailed"
      ],
      "type": "string"
    },
    "path": {
      "description": "Path to project root",
      "type": "string"
    }
  },
  "required": [
    "path"
  ],
  "type": "object"
}
```

### `audit_anatomy`

Audit components for anatomy completeness. Emits ANAT-D* findings for component definitions missing required slots/states (e.g., Button missing `content`). In v1 vertical slice runs the component conventions, plus 10 ANAT-P* composition patterns (missing empty/loading/error states, modal dismiss, submit feedback, list keys, route 404, destructive-action confirm, …) in full mode.

**Input schema:**

```json
{
  "properties": {
    "catalog": {
      "description": "Optional subset of catalog entries to run.",
      "items": {
        "type": "string"
      },
      "type": "array"
    },
    "designStrictness": {
      "description": "Overrides design.strictness from harness.config.json.",
      "enum": [
        "strict",
        "standard",
        "permissive"
      ],
      "type": "string"
    },
    "files": {
      "description": "Optional explicit file list (paths or globs) to scope the audit.",
      "items": {
        "type": "string"
      },
      "type": "array"
    },
    "mode": {
      "description": "fast = conventions only (cheap AST scan); full additionally runs the ANAT-P* composition patterns.",
      "enum": [
        "fast",
        "full"
      ],
      "type": "string"
    },
    "path": {
      "description": "Project root path",
      "type": "string"
    }
  },
  "required": [
    "path"
  ],
  "type": "object"
}
```

### `audit_brand`

Audit brand-semantics violations: tokens used in forbidden contexts per their $extensions.harness.brand metadata (BRAND-T*), and UI copy containing voice.forbidden_phrases from DESIGN.md ## Brand Rules (BRAND-V001). 4th verifier composed by harness check-design.

**Input schema:**

```json
{
  "properties": {
    "designStrictness": {
      "description": "Overrides design.strictness from harness.config.json.",
      "enum": [
        "strict",
        "standard",
        "permissive"
      ],
      "type": "string"
    },
    "files": {
      "description": "Optional explicit file list to scope the scan.",
      "items": {
        "type": "string"
      },
      "type": "array"
    },
    "mode": {
      "description": "Both modes equivalent in v1 (no slow patterns yet).",
      "enum": [
        "fast",
        "full"
      ],
      "type": "string"
    },
    "path": {
      "description": "Project root path",
      "type": "string"
    },
    "rules": {
      "description": "Per-rule enable flags.",
      "properties": {
        "tokenMisuse": {
          "description": "Default true",
          "type": "boolean"
        },
        "voice": {
          "description": "Default true",
          "type": "boolean"
        }
      },
      "type": "object"
    }
  },
  "required": [
    "path"
  ],
  "type": "object"
}
```

### `canary_discover_test_command`

Resolve the authoritative per-file test command from the canary framework registry. Input { files?: string[], ci?: boolean }. Probes canary first; when unavailable returns { status: "degraded", reason, frameworks: [] } so the caller falls back to its own command heuristics. When available, matches each file against a framework by longest file-extension suffix (preferring preferred-status / full-tier frameworks, then registry order on ties) and returns { status: "available", frameworks: [{ name, command, matchedFiles[] }] }. Frameworks without a resolvable per-file command (null or non-{file} commands) are omitted. Never runs the resolved command and never throws.

**Input schema:**

```json
{
  "properties": {
    "ci": {
      "description": "When true, append each framework's ci_flags to the resolved command.",
      "type": "boolean"
    },
    "files": {
      "description": "Candidate test-file paths to match against the registry (e.g. detected spec/test files).",
      "items": {
        "type": "string"
      },
      "type": "array"
    }
  },
  "type": "object"
}
```

### `canary_probe`

Probe availability of the optional canary test CLI (canary-test-cli). Returns { status: "available" | "degraded", version?, reason? } where reason is one of not-installed | binary-missing | exec-failed | bad-output. Never errors when canary is absent — call it before surfacing canary-backed steps so the audit can degrade gracefully.

**Input schema:**

```json
{
  "properties": {},
  "type": "object"
}
```

### `canary_recommend_framework`

Classify a test prompt with canary and recommend a framework (deterministic, no API key). Returns { status, test_type, framework, file_extension, reasoning[], alternatives[] }. Degrades to a { status: "degraded" } sentinel when canary is unavailable.

**Input schema:**

```json
{
  "properties": {
    "prompt": {
      "description": "Natural-language description of the test to scaffold, e.g. \"end-to-end login flow in the browser\".",
      "type": "string"
    }
  },
  "required": [
    "prompt"
  ],
  "type": "object"
}
```

### `canary_run_history`

Read canary's persisted structured run history (NDJSON at test-results/reports/history-v2.jsonl) as a validated array of RunRecords (run outcome + per-test status/failure_category/retry_count/flaky). Optional { path?, limit? }: path is the project root (default cwd); limit caps to the most-recent N runs. Returns [] (never errors) when canary has produced no results or the store is missing/unreadable/malformed.

**Input schema:**

```json
{
  "properties": {
    "limit": {
      "description": "Cap to the most-recent N run records",
      "type": "number"
    },
    "path": {
      "description": "Project root (default: cwd)",
      "type": "string"
    }
  },
  "type": "object"
}
```

### `check_dependencies`

Validate layer boundaries and detect circular dependencies

**Input schema:**

```json
{
  "properties": {
    "path": {
      "description": "Path to project root",
      "type": "string"
    }
  },
  "required": [
    "path"
  ],
  "type": "object"
}
```

### `check_docs`

Analyze documentation coverage and/or validate knowledge map integrity

**Input schema:**

```json
{
  "properties": {
    "domain": {
      "description": "Domain/module to check",
      "type": "string"
    },
    "path": {
      "description": "Path to project root",
      "type": "string"
    },
    "scope": {
      "description": "Scope of check: 'coverage' (doc coverage), 'integrity' (knowledge map validation), 'all' (both). Default: 'coverage'",
      "enum": [
        "coverage",
        "integrity",
        "all"
      ],
      "type": "string"
    }
  },
  "required": [
    "path"
  ],
  "type": "object"
}
```

### `check_performance`

Run performance checks: structural complexity, coupling metrics, and size budgets

**Input schema:**

```json
{
  "properties": {
    "path": {
      "description": "Path to project root",
      "type": "string"
    },
    "type": {
      "description": "Type of performance check (default: all)",
      "enum": [
        "structural",
        "coupling",
        "size",
        "all"
      ],
      "type": "string"
    }
  },
  "required": [
    "path"
  ],
  "type": "object"
}
```

### `check_phase_gate`

Verify implementation-to-spec mappings: checks that each implementation file has a corresponding spec document

**Input schema:**

```json
{
  "properties": {
    "path": {
      "description": "Path to project root directory",
      "type": "string"
    }
  },
  "required": [
    "path"
  ],
  "type": "object"
}
```

### `check_task_independence`

Check whether N tasks can safely run in parallel by detecting file overlaps and transitive dependency conflicts. Returns pairwise independence matrix and parallel groupings.

**Input schema:**

```json
{
  "properties": {
    "depth": {
      "description": "Expansion depth (0=file-only, 1=default, 2-3=thorough)",
      "type": "number"
    },
    "edgeTypes": {
      "description": "Edge types for graph expansion. Default: imports, calls, references",
      "items": {
        "type": "string"
      },
      "type": "array"
    },
    "mode": {
      "description": "summary omits overlap details. Default: detailed",
      "enum": [
        "summary",
        "detailed"
      ],
      "type": "string"
    },
    "path": {
      "description": "Path to project root",
      "type": "string"
    },
    "tasks": {
      "description": "Tasks to check. Each task has an id and a list of file paths.",
      "items": {
        "properties": {
          "files": {
            "items": {
              "type": "string"
            },
            "type": "array"
          },
          "id": {
            "type": "string"
          }
        },
        "required": [
          "id",
          "files"
        ],
        "type": "object"
      },
      "minItems": 2,
      "type": "array"
    }
  },
  "required": [
    "path",
    "tasks"
  ],
  "type": "object"
}
```

### `check_traceability`

Check requirement-to-code-to-test traceability for a spec or all specs

**Input schema:**

```json
{
  "properties": {
    "feature": {
      "description": "Feature name filter",
      "type": "string"
    },
    "mode": {
      "description": "Response density: summary returns coverage stats only, detailed returns full requirement list. Default: summary",
      "enum": [
        "summary",
        "detailed"
      ],
      "type": "string"
    },
    "path": {
      "description": "Path to project root",
      "type": "string"
    },
    "spec": {
      "description": "Specific spec file path to check",
      "type": "string"
    }
  },
  "required": [
    "path"
  ],
  "type": "object"
}
```

### `cli_ergonomics_craft`

LLM-judgment critique of CLI ergonomics quality — the ceiling counterpart to mechanical CLI checks, and the only craft skill with no rule-based floor twin (a linter can verify a flag is documented, but not whether the name is predictable or the error says what to do next). Asks the ceiling questions: are command and flag names predictable and consistent, is help text task-oriented, are errors actionable, are defaults sane and safe, is output scannable and terminal-aware, does the CLI compose (pipeable, machine-readable, honest exit codes), are destructive actions guarded. 7 seed rubrics; a small curated exemplar set (gh / cargo / ripgrep / docker / Stripe CLI) anchors the catalog. Critiques a project’s own command definitions per file. Emits 3-axis findings (tier x impact x confidence per ADR 0019). Structural twin of docs_craft. In-session mode (default in Claude Code) returns prompts for the calling agent to answer; call cli_ergonomics_craft_finalize with the responses to get findings.

**Input schema:**

```json
{
  "properties": {
    "commandsDir": {
      "description": "Directory of command definitions to critique",
      "type": "string"
    },
    "excludeDirs": {
      "description": "Extra subdir names to skip while walking",
      "items": {
        "type": "string"
      },
      "type": "array"
    },
    "files": {
      "description": "Optional file scope (overrides command discovery)",
      "items": {
        "type": "string"
      },
      "type": "array"
    },
    "maxFiles": {
      "description": "Cap command count (default: 60)",
      "type": "number"
    },
    "mode": {
      "description": "'in-session' (default): return prompts for the calling agent to answer, then call cli_ergonomics_craft_finalize. 'inline': run end-to-end via the configured provider (HARNESS_CRAFT_LLM).",
      "enum": [
        "inline",
        "in-session"
      ],
      "type": "string"
    },
    "path": {
      "description": "Project root path",
      "type": "string"
    },
    "promptBudget": {
      "description": "Cap prompt count in in-session mode (default: 100)",
      "type": "number"
    }
  },
  "required": [
    "path"
  ],
  "type": "object"
}
```

### `cli_ergonomics_craft_finalize`

Finalize a cli_ergonomics_craft in-session run by submitting the calling agent's responses to the prompts collected by cli_ergonomics_craft. Returns the standard CliErgonomicsCraftOutput with findings.

**Input schema:**

```json
{
  "properties": {
    "path": {
      "description": "Project root path used in the collect call (must match)",
      "type": "string"
    },
    "responses": {
      "description": "Per-prompt responses. `raw` is the fenced JSON block the calling agent produced.",
      "items": {
        "properties": {
          "promptId": {
            "type": "string"
          },
          "raw": {
            "type": "string"
          }
        },
        "required": [
          "promptId",
          "raw"
        ],
        "type": "object"
      },
      "type": "array"
    },
    "runId": {
      "description": "runId returned by the cli_ergonomics_craft collect call",
      "type": "string"
    }
  },
  "required": [
    "path",
    "runId",
    "responses"
  ],
  "type": "object"
}
```

### `code_craft`

LLM-judgment critique of code quality / readability — the ceiling counterpart to the rule-based code floor (entropy-cleaner for dead code / drift, enforce-architecture for boundaries + deps, complexity thresholds). Asks the ceiling questions: does the code reveal intent and read in the domain’s language, is the control flow honest, does the function tell one story at one altitude, does each abstraction earn its keep, is this as simple as it could be, does the signature keep its promise, would a senior nod or wince. Walks `packages/&lt;pkg>/src` (falling back to `src`/`app` for single-package repos), extracts substantive units (functions, methods, classes) via the TS Compiler API, and critiques each against 7 seed rubrics; files with no substantive unit are skipped. A small curated exemplar set (Anthropic SDK / TanStack Query / ky / SWR / date-fns) anchors the catalog. Identifier-level naming is delegated to `naming_craft`. Emits 3-axis findings (tier x impact x confidence per ADR 0019). Structural twin of `security_craft`. In-session mode (default in Claude Code) returns prompts for the calling agent to answer; call code_craft_finalize with the responses to get findings.

**Input schema:**

```json
{
  "properties": {
    "files": {
      "description": "Optional file scope (overrides packages/*/src discovery)",
      "items": {
        "type": "string"
      },
      "type": "array"
    },
    "maxFiles": {
      "description": "Cap source-file count (default: 100)",
      "type": "number"
    },
    "maxUnitsPerFile": {
      "description": "Cap per-file unit critique (default: 20)",
      "type": "number"
    },
    "mode": {
      "description": "'in-session' (default): return prompts for the calling agent to answer, then call code_craft_finalize. 'inline': run end-to-end via the configured provider (HARNESS_CRAFT_LLM).",
      "enum": [
        "inline",
        "in-session"
      ],
      "type": "string"
    },
    "packages": {
      "description": "Restrict to specific packages under packages/",
      "items": {
        "type": "string"
      },
      "type": "array"
    },
    "path": {
      "description": "Project root path",
      "type": "string"
    },
    "promptBudget": {
      "description": "Cap prompt count in in-session mode (default: 100)",
      "type": "number"
    }
  },
  "required": [
    "path"
  ],
  "type": "object"
}
```

### `code_craft_finalize`

Finalize a code_craft in-session run by submitting the calling agent's responses to the prompts collected by code_craft. Returns the standard CodeCraftOutput with findings.

**Input schema:**

```json
{
  "properties": {
    "path": {
      "description": "Project root path used in the collect call (must match)",
      "type": "string"
    },
    "responses": {
      "description": "Per-prompt responses. `raw` is the fenced JSON block the calling agent produced.",
      "items": {
        "properties": {
          "promptId": {
            "type": "string"
          },
          "raw": {
            "type": "string"
          }
        },
        "required": [
          "promptId",
          "raw"
        ],
        "type": "object"
      },
      "type": "array"
    },
    "runId": {
      "description": "runId returned by the code_craft collect call",
      "type": "string"
    }
  },
  "required": [
    "path",
    "runId",
    "responses"
  ],
  "type": "object"
}
```

### `code_outline`

Get a structural skeleton of a file or files matching a glob: exports, classes, functions, types with signatures and line numbers. No implementation bodies. 4-8x token savings vs full file read.

**Input schema:**

```json
{
  "properties": {
    "glob": {
      "description": "Optional glob pattern to filter files (e.g. \"*.ts\", \"src/**/*.py\"). Only used when path is a directory.",
      "type": "string"
    },
    "limit": {
      "description": "Max file entries to return (pagination, directory mode only). Default: 30.",
      "type": "number"
    },
    "offset": {
      "description": "Number of file entries to skip (pagination, directory mode only). Default: 0. Files are sorted by modification time desc.",
      "type": "number"
    },
    "path": {
      "description": "Absolute file path or directory path. When a directory, outlines all supported files within it.",
      "type": "string"
    }
  },
  "required": [
    "path"
  ],
  "type": "object"
}
```

### `code_search`

Search for symbols (functions, classes, types, variables) by name or pattern across a directory. Returns matching locations with file, line, kind, and one-line context. 6-12x token savings vs grep + read.

**Input schema:**

```json
{
  "properties": {
    "directory": {
      "description": "Absolute path to directory to search in.",
      "type": "string"
    },
    "glob": {
      "description": "Optional glob pattern to filter files (e.g. \"*.ts\").",
      "type": "string"
    },
    "query": {
      "description": "Symbol name or substring to search for (case-insensitive).",
      "type": "string"
    }
  },
  "required": [
    "query",
    "directory"
  ],
  "type": "object"
}
```

### `code_unfold`

Extract the complete implementation of a specific symbol (function, class, type) or a line range from a file. Uses AST boundaries for precise extraction. 2-4x token savings vs full file read.

**Input schema:**

```json
{
  "properties": {
    "endLine": {
      "description": "End line number (1-indexed, inclusive). Used with startLine for range extraction.",
      "type": "number"
    },
    "path": {
      "description": "Absolute path to the file.",
      "type": "string"
    },
    "startLine": {
      "description": "Start line number (1-indexed). Used with endLine for range extraction. Mutually exclusive with symbol.",
      "type": "number"
    },
    "symbol": {
      "description": "Name of the symbol to extract (function, class, type, etc.). Mutually exclusive with startLine/endLine.",
      "type": "string"
    }
  },
  "required": [
    "path"
  ],
  "type": "object"
}
```

### `compact`

Compact content, resolve intents into aggregated packed responses, or re-compress prior tool output. Returns a packed envelope with source attribution and reduction metadata.

**Input schema:**

```json
{
  "properties": {
    "content": {
      "description": "Content string to compact directly (Mode A)",
      "type": "string"
    },
    "intent": {
      "description": "Intent description — aggregates context via graph search then packs (Mode B)",
      "type": "string"
    },
    "path": {
      "description": "Path to project root",
      "type": "string"
    },
    "ref": {
      "description": "Re-compress prior tool output with source attribution (Mode C)",
      "properties": {
        "content": {
          "description": "Content to re-compress",
          "type": "string"
        },
        "source": {
          "description": "Source label for attribution",
          "type": "string"
        }
      },
      "required": [
        "source",
        "content"
      ],
      "type": "object"
    },
    "strategies": {
      "description": "Strategies to apply (default: structural + truncate)",
      "items": {
        "enum": [
          "structural",
          "truncate",
          "pack",
          "semantic"
        ],
        "type": "string"
      },
      "type": "array"
    },
    "tokenBudget": {
      "description": "Token budget for compacted output (default: 2000)",
      "type": "number"
    }
  },
  "required": [],
  "type": "object"
}
```

### `compute_blast_radius`

Simulate cascading failure propagation from a source node using probability-weighted BFS. Returns cumulative failure probability for each affected node.

**Input schema:**

```json
{
  "properties": {
    "file": {
      "description": "File path (relative to project root) to simulate failure for",
      "type": "string"
    },
    "maxDepth": {
      "description": "Maximum BFS depth (default 10)",
      "type": "number"
    },
    "mode": {
      "description": "Response density: compact returns summary + top 10 highest-risk nodes, detailed returns full layered cascade chain. Default: compact",
      "enum": [
        "compact",
        "detailed"
      ],
      "type": "string"
    },
    "nodeId": {
      "description": "Node ID to simulate failure for",
      "type": "string"
    },
    "path": {
      "description": "Path to project root",
      "type": "string"
    },
    "probabilityFloor": {
      "description": "Minimum cumulative probability to continue traversal (default 0.05)",
      "type": "number"
    }
  },
  "required": [
    "path"
  ],
  "type": "object"
}
```

### `copy_craft`

LLM-judgment critique of prose-in-code across six surfaces: error messages, log lines, CLI output strings, commit subjects, PR descriptions, code comments. Third craft-pipeline ceiling skill; 8 seed rubrics. Graceful degradation when git/gh prereqs absent. In-session mode (default in Claude Code) returns prompts for the calling agent to answer; call copy_craft_finalize with the responses to get findings.

**Input schema:**

```json
{
  "properties": {
    "commitsSince": {
      "description": "Commit window for git log (default: '1 month ago')",
      "type": "string"
    },
    "files": {
      "description": "Optional source file/glob scope",
      "items": {
        "type": "string"
      },
      "type": "array"
    },
    "maxFiles": {
      "description": "Cap source file count (default: 100)",
      "type": "number"
    },
    "maxItemsPerFile": {
      "description": "Cap per-file items (default: 20)",
      "type": "number"
    },
    "mode": {
      "description": "'in-session' (default): return prompts for the calling agent to answer, then call copy_craft_finalize. 'inline': run end-to-end via the configured provider (HARNESS_CRAFT_LLM).",
      "enum": [
        "inline",
        "in-session"
      ],
      "type": "string"
    },
    "path": {
      "description": "Project root path",
      "type": "string"
    },
    "prLimit": {
      "description": "PR count cap (default: 20)",
      "type": "number"
    },
    "promptBudget": {
      "description": "Cap prompt count in in-session mode (default: 100)",
      "type": "number"
    },
    "surfaces": {
      "description": "Restrict to specific surfaces (default: all 6)",
      "items": {
        "enum": [
          "error",
          "log",
          "cli-output",
          "commit",
          "pr-description",
          "comment"
        ],
        "type": "string"
      },
      "type": "array"
    }
  },
  "required": [
    "path"
  ],
  "type": "object"
}
```

### `copy_craft_finalize`

Finalize a copy_craft in-session run by submitting the calling agent's responses to the prompts collected by copy_craft. Returns the standard CopyCraftOutput with findings.

**Input schema:**

```json
{
  "properties": {
    "path": {
      "description": "Project root path used in the collect call (must match)",
      "type": "string"
    },
    "responses": {
      "description": "Per-prompt responses. `raw` is the fenced JSON block the calling agent produced.",
      "items": {
        "properties": {
          "promptId": {
            "type": "string"
          },
          "raw": {
            "type": "string"
          }
        },
        "required": [
          "promptId",
          "raw"
        ],
        "type": "object"
      },
      "type": "array"
    },
    "runId": {
      "description": "runId returned by the copy_craft collect call",
      "type": "string"
    }
  },
  "required": [
    "path",
    "runId",
    "responses"
  ],
  "type": "object"
}
```

### `create_self_review`

Generate a checklist-based code review from a git diff, checking harness constraints, custom rules, and diff patterns

**Input schema:**

```json
{
  "properties": {
    "customRules": {
      "description": "Optional custom rules to apply during review",
      "items": {
        "type": "object"
      },
      "type": "array"
    },
    "diff": {
      "description": "Git diff string to review",
      "type": "string"
    },
    "maxFileCount": {
      "description": "Maximum number of changed files before flagging",
      "type": "number"
    },
    "maxFileSize": {
      "description": "Maximum number of lines changed per file before flagging",
      "type": "number"
    },
    "path": {
      "description": "Path to project root",
      "type": "string"
    }
  },
  "required": [
    "path",
    "diff"
  ],
  "type": "object"
}
```

### `create_skill`

Scaffold a new harness skill with skill.yaml and SKILL.md

**Input schema:**

```json
{
  "properties": {
    "cognitiveMode": {
      "description": "Cognitive mode (default: constructive-architect)",
      "enum": [
        "adversarial-reviewer",
        "constructive-architect",
        "meticulous-implementer",
        "diagnostic-investigator",
        "advisory-guide",
        "meticulous-verifier"
      ],
      "type": "string"
    },
    "description": {
      "description": "Skill description",
      "type": "string"
    },
    "name": {
      "description": "Skill name in kebab-case (e.g., my-new-skill)",
      "type": "string"
    },
    "path": {
      "description": "Path to project root directory",
      "type": "string"
    }
  },
  "required": [
    "path",
    "name",
    "description"
  ],
  "type": "object"
}
```

### `design_craft`

Run the harness-design-craft skill: CRITIQUE / POLISH / BENCHMARK phases over a project's components. Fast-mode CRITIQUE iterates the v1 seed of 10 rubrics (hierarchy-clarity, typography-craft, motion-quality, color-confidence, density-rhythm, restraint, polish-details, copy-voice, interaction-craft, brand-coherence), POLISH iterates the 7 seed patterns (spring-physics, skeleton-content-matched, stagger-timing, page-transition-crossfade, fluid-type-scale, progressive-corner-rounding, focus-ring-craft), BENCHMARK iterates the 8 seed exemplars covering EmptyState (Linear resolved register + Notion instructional register), LoadingState (Stripe preview register + Vercel narrative register), CommandPalette, ErrorState, Modal, and Button.

**Input schema:**

```json
{
  "properties": {
    "autoCapture": {
      "description": "Deep-mode capture behavior when no `captures` are supplied. \"skip\" never runs the capture command; \"prompt\"/\"auto\" run `captureCommand` when one is configured.",
      "enum": [
        "prompt",
        "auto",
        "skip"
      ],
      "type": "string"
    },
    "benchmarkTargets": {
      "description": "BENCHMARK target descriptors. Each entry needs at minimum { file, component }; optional componentType narrows exemplar selection.",
      "items": {
        "properties": {
          "component": {
            "type": "string"
          },
          "componentType": {
            "type": "string"
          },
          "file": {
            "type": "string"
          }
        },
        "required": [
          "file",
          "component"
        ],
        "type": "object"
      },
      "type": "array"
    },
    "captureCommand": {
      "description": "Deep-mode render+screenshot command. Receives the candidate files via the HARNESS_DESIGN_CRAFT_FILES env var (JSON array) and must print a JSON array of { file, image, component? } to stdout. Used to obtain captures without a built-in browser.",
      "type": "string"
    },
    "captures": {
      "description": "Deep-mode (vision) captures: rendered component screenshots. Required when mode=\"deep\" and the critique phase runs. Each entry: { file, image, component? }, where `image` is a path to a PNG/JPEG/WebP screenshot (the CLI does not render components itself).",
      "items": {
        "properties": {
          "component": {
            "type": "string"
          },
          "file": {
            "type": "string"
          },
          "image": {
            "type": "string"
          }
        },
        "required": [
          "file",
          "image"
        ],
        "type": "object"
      },
      "type": "array"
    },
    "designStrictness": {
      "description": "Overall design strictness (passed through to harness-design when chained).",
      "enum": [
        "strict",
        "standard",
        "permissive"
      ],
      "type": "string"
    },
    "files": {
      "description": "Optional file scoping. Each entry is a path relative to project root.",
      "items": {
        "type": "string"
      },
      "type": "array"
    },
    "mode": {
      "description": "fast (code-only LLM judgment) or deep (vision judgment of rendered screenshots — requires `captures`). Deep mode applies to BOTH critique and benchmark; only deep-mode benchmark can clear the award bar, since innovation/coherence/surface cannot be honestly scored from source code.",
      "enum": [
        "fast",
        "deep"
      ],
      "type": "string"
    },
    "path": {
      "description": "Project root path",
      "type": "string"
    },
    "phases": {
      "description": "Subset of phases to run. Defaults to all three.",
      "items": {
        "enum": [
          "critique",
          "polish",
          "benchmark"
        ],
        "type": "string"
      },
      "type": "array"
    },
    "responsiveMetrics": {
      "description": "Rendered mobile layout metrics for the BENCHMARK award-bar's responsive gate, one entry per target (matched by `file`). A `defective` gate (horizontal overflow or an unreachable nav) vetoes an award-tier `cleared`. Supply directly (e.g. from a Playwright MCP run) or via `responsiveProbeCommand`. Omit to leave the gate not-evaluated.",
      "items": {
        "properties": {
          "documentScrollWidth": {
            "type": "number"
          },
          "file": {
            "type": "string"
          },
          "menuToggleVisible": {
            "type": "boolean"
          },
          "primaryNavVisible": {
            "type": "boolean"
          },
          "viewport": {
            "type": "number"
          },
          "viewportWidth": {
            "type": "number"
          }
        },
        "required": [
          "file",
          "viewport",
          "documentScrollWidth",
          "viewportWidth",
          "primaryNavVisible",
          "menuToggleVisible"
        ],
        "type": "object"
      },
      "type": "array"
    },
    "responsiveProbeCommand": {
      "description": "Responsive probe command (mirrors captureCommand): a render step that receives the target files via HARNESS_DESIGN_CRAFT_FILES and the mobile width via HARNESS_DESIGN_CRAFT_VIEWPORT, and prints a ResponsiveMetrics[] JSON array to stdout. How a browserless CLI obtains layout metrics. Ignored when responsiveMetrics is supplied.",
      "type": "string"
    }
  },
  "required": [
    "path"
  ],
  "type": "object"
}
```

### `detect_anomalies`

Detect structural anomalies — statistical outliers across code metrics and topological single points of failure in the import graph

**Input schema:**

```json
{
  "properties": {
    "limit": {
      "description": "Max anomaly entries to return (pagination). Default: 30.",
      "type": "number"
    },
    "metrics": {
      "description": "Metrics to analyze (default: cyclomaticComplexity, fanIn, fanOut, hotspotScore, transitiveDepth)",
      "items": {
        "type": "string"
      },
      "type": "array"
    },
    "offset": {
      "description": "Number of anomaly entries to skip (pagination). Default: 0. Anomalies are sorted by Z-score desc.",
      "type": "number"
    },
    "path": {
      "description": "Path to project root",
      "type": "string"
    },
    "threshold": {
      "description": "Z-score threshold (default 2.0)",
      "type": "number"
    }
  },
  "required": [
    "path"
  ],
  "type": "object"
}
```

### `detect_constraint_emergence`

Cluster recurring violations by pattern and suggest new constraint rules. When N similar violations appear in M weeks, suggests emergent architectural norms learned from team behavior.

**Input schema:**

```json
{
  "properties": {
    "category": {
      "description": "Optional filter by constraint category",
      "enum": [
        "circular-deps",
        "layer-violations",
        "complexity",
        "coupling",
        "forbidden-imports",
        "module-size",
        "dependency-depth"
      ],
      "type": "string"
    },
    "minOccurrences": {
      "description": "Minimum number of similar violations to trigger a suggestion (default: 3)",
      "type": "number"
    },
    "path": {
      "description": "Path to project root",
      "type": "string"
    },
    "windowWeeks": {
      "description": "Time window in weeks to analyze (default: 4)",
      "type": "number"
    }
  },
  "required": [
    "path"
  ],
  "type": "object"
}
```

### `detect_drift`

Detect design-system drift in source: hardcoded values where tokens exist (token bypass) and raw HTML primitives where a registered design-system component exists (primitive adoption). Composes with harness check-design as the 3rd verifier alongside audit-anatomy and design-craft.

**Input schema:**

```json
{
  "properties": {
    "designStrictness": {
      "description": "Overrides design.strictness from harness.config.json.",
      "enum": [
        "strict",
        "standard",
        "permissive"
      ],
      "type": "string"
    },
    "exclude": {
      "description": "Optional minimatch globs to exclude from the walk (design.exclude); unioned with the project-wide analysis.exclude. Ignored when `files` is set.",
      "items": {
        "type": "string"
      },
      "type": "array"
    },
    "files": {
      "description": "Optional explicit file list to scope the scan.",
      "items": {
        "type": "string"
      },
      "type": "array"
    },
    "mode": {
      "description": "Both modes equivalent in v1 (no slow patterns yet).",
      "enum": [
        "fast",
        "full"
      ],
      "type": "string"
    },
    "path": {
      "description": "Project root path",
      "type": "string"
    },
    "rules": {
      "description": "Per-rule enable flags.",
      "properties": {
        "primitiveAdoption": {
          "description": "Default true",
          "type": "boolean"
        },
        "tokenBypass": {
          "description": "Default true",
          "type": "boolean"
        }
      },
      "type": "object"
    }
  },
  "required": [
    "path"
  ],
  "type": "object"
}
```

### `detect_entropy`

Detect documentation drift, dead code, and pattern violations. Optionally auto-fix detected issues.

**Input schema:**

```json
{
  "properties": {
    "autoFix": {
      "description": "When true, apply fixes after analysis. Default: false (analysis only)",
      "type": "boolean"
    },
    "dryRun": {
      "description": "Preview fixes without applying (only used when autoFix is true)",
      "type": "boolean"
    },
    "fixTypes": {
      "description": "Specific fix types to apply (default: all safe types). Only used when autoFix is true.",
      "items": {
        "enum": [
          "unused-imports",
          "dead-files",
          "dead-exports",
          "commented-code",
          "orphaned-deps",
          "forbidden-import-replacement",
          "import-ordering"
        ],
        "type": "string"
      },
      "type": "array"
    },
    "mode": {
      "description": "Response density: summary returns issue counts and top issues per category, detailed returns full findings. Default: detailed",
      "enum": [
        "summary",
        "detailed"
      ],
      "type": "string"
    },
    "path": {
      "description": "Path to project root",
      "type": "string"
    },
    "type": {
      "description": "Type of entropy to detect (default: all)",
      "enum": [
        "drift",
        "dead-code",
        "patterns",
        "all"
      ],
      "type": "string"
    }
  },
  "required": [
    "path"
  ],
  "type": "object"
}
```

### `detect_stale_constraints`

Detect architectural constraint rules that have not been violated within a configurable time window. Surfaces stale constraints as candidates for removal or relaxation.

**Input schema:**

```json
{
  "properties": {
    "category": {
      "description": "Optional filter by constraint category",
      "enum": [
        "circular-deps",
        "layer-violations",
        "complexity",
        "coupling",
        "forbidden-imports",
        "module-size",
        "dependency-depth"
      ],
      "type": "string"
    },
    "path": {
      "description": "Path to project root",
      "type": "string"
    },
    "windowDays": {
      "description": "Number of days without violation to consider a constraint stale (default: 30)",
      "type": "number"
    }
  },
  "required": [
    "path"
  ],
  "type": "object"
}
```

### `dispatch_skills`

Recommend an optimal skill sequence based on what changed in the codebase. Combines health signals with change-type and domain detection from git diffs. Returns an annotated sequence with parallel-safe flags, estimated impact, and dependency info.

**Input schema:**

```json
{
  "properties": {
    "commitMessage": {
      "description": "Commit message for change-type detection (auto-detected from git log if omitted)",
      "type": "string"
    },
    "files": {
      "description": "Changed file paths (auto-detected from git diff if omitted)",
      "items": {
        "type": "string"
      },
      "type": "array"
    },
    "fresh": {
      "description": "Force a fresh health snapshot capture (default: false, uses cached)",
      "type": "boolean"
    },
    "limit": {
      "description": "Maximum number of skills to return (default: 5)",
      "type": "number"
    },
    "path": {
      "description": "Project root path (defaults to cwd)",
      "type": "string"
    },
    "trigger": {
      "description": "Filter to skills declaring this trigger (e.g. on_pr, on_commit, on_milestone, on_task_complete, on_refactor, on_review). Only skills whose triggers array includes this value are returned.",
      "type": "string"
    }
  },
  "required": [],
  "type": "object"
}
```

### `docs_craft`

LLM-judgment critique of documentation quality — the ceiling counterpart to the rule-based documentation floor (detect-doc-drift / check-docs / docs-pipeline, which enforce existence, link freshness, and coverage). Asks the ceiling questions: does this doc teach, does the order match the reader’s mental model, do examples earn their place, is the prose alive, does the API doc predict the response shape, would a stranger walk away with the same understanding, can a reader find the answer fast. 7 seed rubrics; a small curated exemplar set (Stripe / Vercel / MDN / Linear / Tailwind) anchors the catalog. Per-file critique. Emits 3-axis findings (tier x impact x confidence per ADR 0019). Structural twin of design_craft.

**Input schema:**

```json
{
  "properties": {
    "excludeDirs": {
      "description": "Extra subdir names to skip under docs/",
      "items": {
        "type": "string"
      },
      "type": "array"
    },
    "files": {
      "description": "Optional file scope (overrides docs/ discovery)",
      "items": {
        "type": "string"
      },
      "type": "array"
    },
    "maxFiles": {
      "description": "Cap doc count (default: 60)",
      "type": "number"
    },
    "mode": {
      "description": "'in-session' (default): return prompts for the calling agent to answer, then call docs_craft_finalize. 'inline': run end-to-end via the configured provider (HARNESS_CRAFT_LLM).",
      "enum": [
        "inline",
        "in-session"
      ],
      "type": "string"
    },
    "path": {
      "description": "Project root path",
      "type": "string"
    },
    "promptBudget": {
      "description": "Cap prompt count in in-session mode (default: 100)",
      "type": "number"
    }
  },
  "required": [
    "path"
  ],
  "type": "object"
}
```

### `docs_craft_finalize`

Finalize a docs_craft in-session run by submitting the calling agent's responses to the prompts collected by docs_craft. Returns the standard DocsCraftOutput with findings.

**Input schema:**

```json
{
  "properties": {
    "path": {
      "description": "Project root path used in the collect call (must match)",
      "type": "string"
    },
    "responses": {
      "description": "Per-prompt responses. `raw` is the fenced JSON block the calling agent produced.",
      "items": {
        "properties": {
          "promptId": {
            "type": "string"
          },
          "raw": {
            "type": "string"
          }
        },
        "required": [
          "promptId",
          "raw"
        ],
        "type": "object"
      },
      "type": "array"
    },
    "runId": {
      "description": "runId returned by the docs_craft collect call",
      "type": "string"
    }
  },
  "required": [
    "path",
    "runId",
    "responses"
  ],
  "type": "object"
}
```

### `docs_publish`

Draft-first docs publishing via the configured connector (draft/attach-media/verify-render/page-tree).

**Input schema:**

```json
{
  "properties": {
    "adf": {
      "description": "Page body as ADF (draft)",
      "type": "object"
    },
    "body": {
      "description": "Storage/body string (draft)",
      "type": "string"
    },
    "children": {
      "description": "Child nodes to create/order (page-tree)",
      "type": "array"
    },
    "mediaFilePath": {
      "description": "Local media file path (attach-media)",
      "type": "string"
    },
    "op": {
      "description": "Operation to run",
      "enum": [
        "draft",
        "attach-media",
        "verify-render",
        "page-tree"
      ],
      "type": "string"
    },
    "origin": {
      "description": "Provider origin (attach-media)",
      "type": "string"
    },
    "pageId": {
      "description": "Page id (draft/attach-media)",
      "type": "string"
    },
    "parentId": {
      "description": "Parent page id (draft/page-tree)",
      "type": "string"
    },
    "path": {
      "description": "Project root path for config resolution",
      "type": "string"
    },
    "spaceId": {
      "description": "Space id (draft/page-tree)",
      "type": "string"
    },
    "targetUrl": {
      "description": "Rendered URL to assert (verify-render)",
      "type": "string"
    },
    "title": {
      "description": "Page title (draft)",
      "type": "string"
    }
  },
  "required": [
    "op"
  ],
  "type": "object"
}
```

### `edit_file`

Make a surgical, exact-string edit to a single existing file: replace old_string with new_string. Prefer this over shell redirection (cat >, echo >>) or apply_patch, which corrupt files. old_string must appear EXACTLY ONCE (include enough surrounding context to be unique) unless replace_all is true. Fails without writing if old_string is missing or ambiguous, so you can retry with more context. Does not create files.

**Input schema:**

```json
{
  "properties": {
    "new_string": {
      "description": "The replacement text. Must differ from old_string.",
      "type": "string"
    },
    "old_string": {
      "description": "The exact text to replace, copied verbatim from the file including whitespace and indentation. Must be unique in the file unless replace_all is true.",
      "type": "string"
    },
    "path": {
      "description": "Absolute path (or path relative to the working directory) of the file to edit.",
      "type": "string"
    },
    "replace_all": {
      "description": "Replace every occurrence of old_string instead of requiring a unique match. Default false.",
      "type": "boolean"
    }
  },
  "required": [
    "path",
    "old_string",
    "new_string"
  ],
  "type": "object"
}
```

### `emit_interaction`

Emit a structured interaction (question, confirmation, phase transition, or batch decision) for round-trip communication with the user

**Input schema:**

```json
{
  "properties": {
    "batch": {
      "description": "Batch decision payload (required when type is batch)",
      "properties": {
        "decisions": {
          "description": "Low-risk decisions to approve in batch",
          "items": {
            "properties": {
              "label": {
                "type": "string"
              },
              "recommendation": {
                "type": "string"
              },
              "risk": {
                "enum": [
                  "low"
                ],
                "type": "string"
              }
            },
            "required": [
              "label",
              "recommendation",
              "risk"
            ],
            "type": "object"
          },
          "type": "array"
        },
        "text": {
          "description": "Batch description",
          "type": "string"
        }
      },
      "required": [
        "text",
        "decisions"
      ],
      "type": "object"
    },
    "confirmation": {
      "description": "Confirmation payload (required when type is confirmation)",
      "properties": {
        "context": {
          "description": "Why confirmation is needed",
          "type": "string"
        },
        "impact": {
          "description": "Impact description",
          "type": "string"
        },
        "risk": {
          "description": "Risk level",
          "enum": [
            "low",
            "medium",
            "high"
          ],
          "type": "string"
        },
        "text": {
          "description": "What to confirm",
          "type": "string"
        }
      },
      "required": [
        "text",
        "context"
      ],
      "type": "object"
    },
    "path": {
      "description": "Path to project root",
      "type": "string"
    },
    "question": {
      "description": "Question payload (required when type is question)",
      "properties": {
        "default": {
          "description": "Default option index",
          "type": "number"
        },
        "options": {
          "description": "Structured options with pros/cons (omit for free-form)",
          "items": {
            "properties": {
              "cons": {
                "items": {
                  "type": "string"
                },
                "type": "array"
              },
              "effort": {
                "enum": [
                  "low",
                  "medium",
                  "high"
                ],
                "type": "string"
              },
              "label": {
                "type": "string"
              },
              "pros": {
                "items": {
                  "type": "string"
                },
                "type": "array"
              },
              "risk": {
                "enum": [
                  "low",
                  "medium",
                  "high"
                ],
                "type": "string"
              }
            },
            "required": [
              "label",
              "pros",
              "cons"
            ],
            "type": "object"
          },
          "type": "array"
        },
        "recommendation": {
          "description": "Required when options are provided",
          "properties": {
            "confidence": {
              "enum": [
                "low",
                "medium",
                "high"
              ],
              "type": "string"
            },
            "optionIndex": {
              "description": "Index of recommended option",
              "type": "number"
            },
            "reason": {
              "description": "Why this option is recommended",
              "type": "string"
            }
          },
          "required": [
            "optionIndex",
            "reason",
            "confidence"
          ],
          "type": "object"
        },
        "text": {
          "description": "The question text",
          "type": "string"
        }
      },
      "required": [
        "text"
      ],
      "type": "object"
    },
    "session": {
      "description": "Session slug for session-scoped handoff (takes priority over stream when provided)",
      "type": "string"
    },
    "stream": {
      "description": "State stream for recording (auto-resolves from branch if omitted)",
      "type": "string"
    },
    "transition": {
      "description": "Transition payload (required when type is transition)",
      "properties": {
        "artifacts": {
          "description": "File paths produced during the completed phase",
          "items": {
            "type": "string"
          },
          "type": "array"
        },
        "completedPhase": {
          "description": "Phase that was completed",
          "type": "string"
        },
        "qualityGate": {
          "description": "Quality gate results for the completed phase",
          "properties": {
            "allPassed": {
              "type": "boolean"
            },
            "checks": {
              "items": {
                "properties": {
                  "detail": {
                    "type": "string"
                  },
                  "name": {
                    "type": "string"
                  },
                  "passed": {
                    "type": "boolean"
                  }
                },
                "required": [
                  "name",
                  "passed"
                ],
                "type": "object"
              },
              "type": "array"
            }
          },
          "required": [
            "checks",
            "allPassed"
          ],
          "type": "object"
        },
        "reason": {
          "description": "Why the transition is happening",
          "type": "string"
        },
        "requiresConfirmation": {
          "description": "true = wait for user confirmation, false = proceed immediately",
          "type": "boolean"
        },
        "suggestedNext": {
          "description": "Suggested next phase",
          "type": "string"
        },
        "summary": {
          "description": "1-2 sentence rich summary with key metrics",
          "type": "string"
        }
      },
      "required": [
        "completedPhase",
        "suggestedNext",
        "reason",
        "artifacts",
        "requiresConfirmation",
        "summary"
      ],
      "type": "object"
    },
    "type": {
      "description": "Type of interaction",
      "enum": [
        "question",
        "confirmation",
        "transition",
        "batch"
      ],
      "type": "string"
    }
  },
  "required": [
    "path",
    "type"
  ],
  "type": "object"
}
```

### `emit_skill_proposal`

Emit a skill proposal (new-skill or refinement) into the review queue. Writes `.harness/proposals/&lt;id>.json` and returns the queue URL. The proposal does not gate the agent — soundness-review runs at approval time.

**Input schema:**

```json
{
  "properties": {
    "content": {
      "description": "Proposal content. new-skill ⇒ skillYaml+skillMd; refinement ⇒ diff",
      "properties": {
        "description": {
          "description": "20–280 chars",
          "type": "string"
        },
        "diff": {
          "description": "Unified diff (refinement only)",
          "type": "string"
        },
        "name": {
          "description": "kebab-case skill name (matches /^[a-z][a-z0-9-]*$/, ≤64 chars)",
          "type": "string"
        },
        "skillMd": {
          "description": "Full SKILL.md (new-skill only)",
          "type": "string"
        },
        "skillYaml": {
          "description": "Full skill.yaml (new-skill only)",
          "type": "string"
        }
      },
      "required": [
        "name",
        "description"
      ],
      "type": "object"
    },
    "justification": {
      "description": "Why this skill / refinement is worth promoting (20–2000 chars)",
      "type": "string"
    },
    "kind": {
      "description": "new-skill = full content; refinement = unified-diff against targetSkill",
      "enum": [
        "new-skill",
        "refinement"
      ],
      "type": "string"
    },
    "path": {
      "description": "Path to project root",
      "type": "string"
    },
    "proposedBy": {
      "description": "Agent identifier, e.g. \"claude-code:harness-execution\"",
      "type": "string"
    },
    "sessionId": {
      "description": "Originating session id (optional)",
      "type": "string"
    },
    "targetSkill": {
      "description": "Existing skill name (required when kind is refinement)",
      "type": "string"
    },
    "taskId": {
      "description": "Originating maintenance task id (optional)",
      "type": "string"
    }
  },
  "required": [
    "path",
    "kind",
    "proposedBy",
    "justification",
    "content"
  ],
  "type": "object"
}
```

### `find_context_for`

Find relevant context for a given intent by searching the graph and expanding around top results. Returns assembled context within a token budget.

**Input schema:**

```json
{
  "properties": {
    "intent": {
      "description": "Description of what context is needed for",
      "type": "string"
    },
    "path": {
      "description": "Path to project root",
      "type": "string"
    },
    "tokenBudget": {
      "description": "Approximate token budget for results (default 4000)",
      "type": "number"
    }
  },
  "required": [
    "path",
    "intent"
  ],
  "type": "object"
}
```

### `gather_context`

Assemble all working context an agent needs in a single call: state, learnings, handoff, graph context, project validation, and session sections. Runs constituents in parallel.

**Input schema:**

```json
{
  "properties": {
    "depth": {
      "description": "Retrieval depth for learnings. \"index\" returns one-line summaries, \"summary\" (default) returns full entries, \"full\" returns entries with linked context.",
      "enum": [
        "index",
        "summary",
        "full"
      ],
      "type": "string"
    },
    "include": {
      "description": "Which constituents to include (default: all)",
      "items": {
        "enum": [
          "state",
          "learnings",
          "handoff",
          "graph",
          "validation",
          "sessions",
          "events",
          "businessKnowledge"
        ],
        "type": "string"
      },
      "type": "array"
    },
    "includeEvents": {
      "description": "Include recent events timeline. Default: true when session is provided, false otherwise. Can also be controlled via include array.",
      "type": "boolean"
    },
    "intent": {
      "description": "What the agent is about to do (used for graph context search)",
      "type": "string"
    },
    "learningsBudget": {
      "description": "Token budget for learnings slice (default 1000). Separate from graph tokenBudget.",
      "type": "number"
    },
    "limit": {
      "description": "Max items to return within the section (pagination). Default: 20. Requires section param.",
      "type": "number"
    },
    "mode": {
      "description": "Response density. Default: summary",
      "enum": [
        "summary",
        "detailed"
      ],
      "type": "string"
    },
    "offset": {
      "description": "Number of items to skip within the section (pagination). Default: 0. Requires section param.",
      "type": "number"
    },
    "path": {
      "description": "Path to project root",
      "type": "string"
    },
    "section": {
      "description": "Section to paginate. When provided, offset/limit apply within this section only and the response contains only { section, items, pagination, meta }. Note: section=graphContext requires mode=detailed (summary mode has no paginatable blocks). When omitted, returns the full response.",
      "enum": [
        "graphContext",
        "learnings",
        "sessionSections"
      ],
      "type": "string"
    },
    "session": {
      "description": "Session slug for session-scoped state. When provided, state/learnings/handoff/failures are read from .harness/sessions/<session>/ instead of .harness/. Omit for global fallback.",
      "type": "string"
    },
    "skill": {
      "description": "Current skill name (filters learnings by skill)",
      "type": "string"
    },
    "tokenBudget": {
      "description": "Approximate token budget for graph context (default 4000)",
      "type": "number"
    }
  },
  "required": [
    "path",
    "intent"
  ],
  "type": "object"
}
```

### `generate_agent_definitions`

Generate agent definition files from personas for Claude Code and Gemini CLI

**Input schema:**

```json
{
  "properties": {
    "dryRun": {
      "description": "Preview without writing",
      "type": "boolean"
    },
    "global": {
      "description": "Write to global agent directory",
      "type": "boolean"
    },
    "platform": {
      "description": "Target platform (default: all)",
      "enum": [
        "claude-code",
        "gemini-cli",
        "all"
      ],
      "type": "string"
    }
  },
  "type": "object"
}
```

### `generate_blueprint`

Scan a project and return its blueprint data (modules, hotspots, dependencies). Returns the scan results as JSON without writing files.

**Input schema:**

```json
{
  "properties": {
    "path": {
      "description": "Path to project root directory",
      "type": "string"
    }
  },
  "required": [
    "path"
  ],
  "type": "object"
}
```

### `generate_linter`

Generate an ESLint rule from YAML configuration

**Input schema:**

```json
{
  "properties": {
    "configPath": {
      "description": "Path to harness-linter.yml",
      "type": "string"
    },
    "outputDir": {
      "description": "Output directory for generated rule",
      "type": "string"
    }
  },
  "required": [
    "configPath"
  ],
  "type": "object"
}
```

### `generate_persona_artifacts`

Generate runtime config, AGENTS.md fragment, and CI workflow from a persona

**Input schema:**

```json
{
  "properties": {
    "name": {
      "description": "Persona name (e.g., architecture-enforcer)",
      "type": "string"
    },
    "only": {
      "description": "Generate only a specific artifact type",
      "enum": [
        "runtime",
        "agents-md",
        "ci"
      ],
      "type": "string"
    }
  },
  "required": [
    "name"
  ],
  "type": "object"
}
```

### `generate_slash_commands`

Generate native slash commands for Claude Code and Gemini CLI from harness skill metadata

**Input schema:**

```json
{
  "properties": {
    "dryRun": {
      "description": "Show what would change without writing files",
      "type": "boolean"
    },
    "global": {
      "description": "Write to global config directories (~/.claude/commands/, ~/.gemini/commands/)",
      "type": "boolean"
    },
    "includeGlobal": {
      "description": "Include built-in global skills alongside project skills",
      "type": "boolean"
    },
    "output": {
      "description": "Custom output directory",
      "type": "string"
    },
    "platforms": {
      "description": "Comma-separated platforms: claude-code,gemini-cli (default: both)",
      "type": "string"
    },
    "skillsDir": {
      "description": "Skills directory to scan",
      "type": "string"
    }
  },
  "type": "object"
}
```

### `get_critical_paths`

List performance-critical functions from @perf-critical annotations and graph inference

**Input schema:**

```json
{
  "properties": {
    "path": {
      "description": "Path to project root",
      "type": "string"
    }
  },
  "required": [
    "path"
  ],
  "type": "object"
}
```

### `get_decay_trends`

Get architecture decay trends over time. Returns stability score history and per-category trend analysis from timeline snapshots. Use to answer questions like "is the architecture decaying?" or "which metrics are getting worse?"

**Input schema:**

```json
{
  "properties": {
    "category": {
      "description": "Filter to a single metric category",
      "enum": [
        "circular-deps",
        "layer-violations",
        "complexity",
        "coupling",
        "forbidden-imports",
        "module-size",
        "dependency-depth"
      ],
      "type": "string"
    },
    "last": {
      "description": "Number of recent snapshots to analyze (default: 10)",
      "type": "number"
    },
    "limit": {
      "description": "Max trend entries to return (pagination). Default: 20. Ignored when category is set (category filter returns a single entry).",
      "type": "number"
    },
    "offset": {
      "description": "Number of trend entries to skip (pagination). Default: 0. Trends are sorted by decay magnitude (absolute delta) desc. Ignored when category is set (category filter returns a single entry).",
      "type": "number"
    },
    "path": {
      "description": "Path to project root",
      "type": "string"
    },
    "since": {
      "description": "Show trends since this ISO date (e.g., 2026-01-01)",
      "type": "string"
    }
  },
  "required": [
    "path"
  ],
  "type": "object"
}
```

### `get_graph_schema`

Introspect the SHAPE of the project knowledge graph so an agent can discover it before querying: node-type (label) counts with their observed property keys, edge-type (relationship) counts, and the relationship patterns present (which node types connect to which via which edge types). Read-only.

**Input schema:**

```json
{
  "properties": {
    "path": {
      "description": "Path to project root",
      "type": "string"
    }
  },
  "required": [
    "path"
  ],
  "type": "object"
}
```

### `get_impact`

Analyze the impact of changing a node or file. Returns affected tests, docs, code, and other nodes grouped by type.

**Input schema:**

```json
{
  "properties": {
    "filePath": {
      "description": "File path (relative to project root) to analyze impact for",
      "type": "string"
    },
    "mode": {
      "description": "Response density: summary returns impacted file count by category + highest-risk items, detailed returns full impact tree. Default: detailed",
      "enum": [
        "summary",
        "detailed"
      ],
      "type": "string"
    },
    "nodeId": {
      "description": "ID of the node to analyze impact for",
      "type": "string"
    },
    "path": {
      "description": "Path to project root",
      "type": "string"
    }
  },
  "required": [
    "path"
  ],
  "type": "object"
}
```

### `get_perf_baselines`

Read current performance baselines from .harness/perf/baselines.json

**Input schema:**

```json
{
  "properties": {
    "path": {
      "description": "Path to project root",
      "type": "string"
    }
  },
  "required": [
    "path"
  ],
  "type": "object"
}
```

### `get_relationships`

Get relationships for a specific node in the knowledge graph, with configurable direction and depth.

**Input schema:**

```json
{
  "properties": {
    "depth": {
      "description": "Traversal depth (default 1)",
      "type": "number"
    },
    "direction": {
      "description": "Direction of relationships to include (default both)",
      "enum": [
        "outbound",
        "inbound",
        "both"
      ],
      "type": "string"
    },
    "limit": {
      "description": "Max edges to return (pagination). Default: 50.",
      "type": "number"
    },
    "mode": {
      "description": "Response density: summary returns neighbor counts by type + direct neighbors only, detailed returns full traversal. Default: detailed",
      "enum": [
        "summary",
        "detailed"
      ],
      "type": "string"
    },
    "nodeId": {
      "description": "ID of the node to get relationships for",
      "type": "string"
    },
    "offset": {
      "description": "Number of edges to skip (pagination). Default: 0. Edges are sorted by weight (confidence desc).",
      "type": "number"
    },
    "path": {
      "description": "Path to project root",
      "type": "string"
    }
  },
  "required": [
    "path",
    "nodeId"
  ],
  "type": "object"
}
```

### `get_security_trends`

Get security posture trends showing how security score, findings, and supply chain metrics are changing over time.

**Input schema:**

```json
{
  "properties": {
    "last": {
      "description": "Return trends from the last N snapshots",
      "type": "number"
    },
    "path": {
      "description": "Path to project root",
      "type": "string"
    },
    "since": {
      "description": "Return trends since this ISO date (e.g. 2025-01-01)",
      "type": "string"
    }
  },
  "required": [
    "path"
  ],
  "type": "object"
}
```

### `ingest_source`

Ingest sources into the project knowledge graph. Supports code analysis, knowledge documents, git history, canary test results, or all at once.

**Input schema:**

```json
{
  "properties": {
    "path": {
      "description": "Path to project root",
      "type": "string"
    },
    "source": {
      "description": "Type of source to ingest. \"test-results\" reads canary run history and writes test_result nodes with tested_by/failed_in edges.",
      "enum": [
        "code",
        "knowledge",
        "git",
        "business-signals",
        "diagrams",
        "test-results",
        "all"
      ],
      "type": "string"
    }
  },
  "required": [
    "path",
    "source"
  ],
  "type": "object"
}
```

### `init_project`

Scaffold a new harness engineering project from a template

**Input schema:**

```json
{
  "properties": {
    "framework": {
      "description": "Framework overlay (e.g., nextjs, fastapi, gin)",
      "type": "string"
    },
    "language": {
      "description": "Target language",
      "enum": [
        "typescript",
        "python",
        "go",
        "rust",
        "java"
      ],
      "type": "string"
    },
    "level": {
      "description": "Adoption level (JS/TS only). Defaults to load-bearing-minimum, which sits between intermediate and advanced: ESLint + complexity cap 15 + module-size cap + multi-persona review + outcome-eval — the minimum that holds when the senior reviewer is away. Use basic for the lightest touch.",
      "enum": [
        "basic",
        "intermediate",
        "load-bearing-minimum",
        "advanced"
      ],
      "type": "string"
    },
    "name": {
      "description": "Project name",
      "type": "string"
    },
    "path": {
      "description": "Target directory",
      "type": "string"
    }
  },
  "required": [
    "path"
  ],
  "type": "object"
}
```

### `insights_summary`

Composite report combining health, entropy, decay, attention, and impact.

**Input schema:**

```json
{
  "properties": {
    "path": {
      "description": "Path to project root",
      "type": "string"
    },
    "skip": {
      "description": "Top-level keys to skip.",
      "items": {
        "enum": [
          "health",
          "entropy",
          "decay",
          "attention",
          "impact"
        ],
        "type": "string"
      },
      "type": "array"
    }
  },
  "required": [
    "path"
  ],
  "type": "object"
}
```

### `knowledge_craft`

LLM-judgment critique of knowledge-entry quality (docs/knowledge/, excluding decisions/ — that is spec-craft territory). Fifth non-design craft-pipeline ceiling skill; 7 seed rubrics (load-bearing-fact, earns-graph-place, carries-forward-decision, …). Per-file critique. References graph taxonomy (business_fact / business_rule / business_concept / business_decision) inside rubrics without reading the graph. Emits 3-axis findings (tier x impact x confidence per ADR 0019). In-session mode (default in Claude Code) returns prompts for the calling agent to answer; call knowledge_craft_finalize with the responses to get findings.

**Input schema:**

```json
{
  "properties": {
    "excludeDirs": {
      "description": "Extra subdir names to skip under docs/knowledge/ (decisions is always excluded)",
      "items": {
        "type": "string"
      },
      "type": "array"
    },
    "files": {
      "description": "Optional file scope (overrides docs/knowledge/ discovery)",
      "items": {
        "type": "string"
      },
      "type": "array"
    },
    "maxFiles": {
      "description": "Cap entry count (default: 50)",
      "type": "number"
    },
    "mode": {
      "description": "'in-session' (default): return prompts for the calling agent to answer, then call knowledge_craft_finalize. 'inline': run end-to-end via the configured provider (HARNESS_CRAFT_LLM).",
      "enum": [
        "inline",
        "in-session"
      ],
      "type": "string"
    },
    "path": {
      "description": "Project root path",
      "type": "string"
    },
    "promptBudget": {
      "description": "Cap prompt count in in-session mode (default: 100)",
      "type": "number"
    }
  },
  "required": [
    "path"
  ],
  "type": "object"
}
```

### `knowledge_craft_finalize`

Finalize a knowledge_craft in-session run by submitting the calling agent's responses to the prompts collected by knowledge_craft. Returns the standard KnowledgeCraftOutput with findings.

**Input schema:**

```json
{
  "properties": {
    "path": {
      "description": "Project root path used in the collect call (must match)",
      "type": "string"
    },
    "responses": {
      "description": "Per-prompt responses. `raw` is the fenced JSON block the calling agent produced.",
      "items": {
        "properties": {
          "promptId": {
            "type": "string"
          },
          "raw": {
            "type": "string"
          }
        },
        "required": [
          "promptId",
          "raw"
        ],
        "type": "object"
      },
      "type": "array"
    },
    "runId": {
      "description": "runId returned by the knowledge_craft collect call",
      "type": "string"
    }
  },
  "required": [
    "path",
    "runId",
    "responses"
  ],
  "type": "object"
}
```

### `list_gateway_tokens`

List Gateway API tokens via GET /api/v1/auth/tokens. Secrets are redacted. Requires admin scope.

**Input schema:**

```json
{
  "additionalProperties": false,
  "properties": {},
  "type": "object"
}
```

### `list_personas`

List available agent personas

**Input schema:**

```json
{
  "properties": {},
  "type": "object"
}
```

### `list_streams`

List known state streams with branch associations and last-active timestamps

**Input schema:**

```json
{
  "properties": {
    "path": {
      "description": "Path to project root",
      "type": "string"
    }
  },
  "required": [
    "path"
  ],
  "type": "object"
}
```

### `manage_adr`

Manage Architecture Decision Records (ADRs) in docs/knowledge/decisions/: create, read, update, or list decision records. "create" allocates the next collision-free ADR number (max(existing)+1, zero-padded) and writes a well-formed record with Context/Decision/Consequences sections at status "proposed" by default. "read" resolves an ADR by number ("92"/"0092"), slug, or filename. "update" patches frontmatter fields (status, title, tier, source, supersedes) and/or individual body sections without ever reusing a number. "list" returns every record as a number-sorted summary. Structured counterpart to the prose-only adr-fleet / architecture-advisor skill surface.

**Input schema:**

```json
{
  "properties": {
    "action": {
      "description": "Action to perform",
      "enum": [
        "create",
        "read",
        "update",
        "list"
      ],
      "type": "string"
    },
    "body": {
      "description": "For update only: replace the entire markdown body verbatim (mutually exclusive with section edits)",
      "type": "string"
    },
    "consequences": {
      "description": "Consequences section body (required for create; replaces the section on update)",
      "type": "string"
    },
    "context": {
      "description": "Context section body (required for create; replaces the section on update)",
      "type": "string"
    },
    "date": {
      "description": "Decision date YYYY-MM-DD (optional; defaults to today on create)",
      "type": "string"
    },
    "decision": {
      "description": "Decision section body (required for create; replaces the section on update)",
      "type": "string"
    },
    "path": {
      "description": "Path to project root",
      "type": "string"
    },
    "ref": {
      "description": "ADR reference for read/update: an ADR number (\"92\" or \"0092\"), a slug, or a filename",
      "type": "string"
    },
    "slug": {
      "description": "Explicit filename slug for create (optional; derived from the title if omitted)",
      "type": "string"
    },
    "source": {
      "description": "Source spec path or session slug that motivated the decision (optional)",
      "type": "string"
    },
    "status": {
      "description": "ADR status (optional; defaults to \"proposed\" on create)",
      "enum": [
        "proposed",
        "accepted",
        "superseded",
        "deprecated"
      ],
      "type": "string"
    },
    "supersedes": {
      "description": "Prior ADR number this decision supersedes (optional)",
      "type": "string"
    },
    "tier": {
      "description": "Decision tier: small | medium | large (optional)",
      "type": "string"
    },
    "title": {
      "description": "ADR title (required for create; optional for update)",
      "type": "string"
    }
  },
  "required": [
    "path",
    "action"
  ],
  "type": "object"
}
```

### `manage_roadmap`

Manage the project roadmap: show, add, update, remove, promote, sync, groom features, or query by filter. Reads and writes the project roadmap (sharded or single-file). The "promote" action transitions an existing row toward planned (backlog→planned) and links its spec atomically — creating a new planned row under the "Intake" lane if the feature does not exist — returning a structured RoadmapPromoteResult envelope. The "groom" action tidies the roadmap: it demotes unactionable planned rows (no spec & no plan) to backlog and archives completed features, returning the list of changes. In sharded mode each done shard is MOVED into the sharded archive `docs/roadmap.d/archive/&lt;slug>.md` (preserving its full content, excluded from the active aggregate); in monolith mode completed features are appended to docs/roadmap-archive.md.

**Input schema:**

```json
{
  "properties": {
    "action": {
      "description": "Action to perform",
      "enum": [
        "show",
        "add",
        "update",
        "remove",
        "promote",
        "query",
        "sync",
        "groom"
      ],
      "type": "string"
    },
    "apply": {
      "description": "For sync action: apply proposed changes (default: false, preview only)",
      "type": "boolean"
    },
    "assignee": {
      "description": "Assignee username/email (optional for update). Tracks assignment history.",
      "type": "string"
    },
    "blocked_by": {
      "description": "Blocking feature names (optional for add/update)",
      "items": {
        "type": "string"
      },
      "type": "array"
    },
    "feature": {
      "description": "Feature name (required for add, update, remove, promote)",
      "type": "string"
    },
    "filter": {
      "description": "Query filter: \"blocked\", \"in-progress\", \"done\", \"planned\", \"backlog\", or \"milestone:<name>\" (required for query)",
      "type": "string"
    },
    "force_sync": {
      "description": "For sync action: override human-always-wins rule",
      "type": "boolean"
    },
    "milestone": {
      "description": "Milestone name (required for add; optional filter for show)",
      "type": "string"
    },
    "path": {
      "description": "Path to project root",
      "type": "string"
    },
    "plans": {
      "description": "Plan file paths (optional for add/update)",
      "items": {
        "type": "string"
      },
      "type": "array"
    },
    "spec": {
      "description": "Spec file path (optional for add/update; required for promote)",
      "type": "string"
    },
    "status": {
      "description": "Feature status (required for add; optional for update; optional filter for show)",
      "enum": [
        "backlog",
        "planned",
        "in-progress",
        "done",
        "blocked"
      ],
      "type": "string"
    },
    "summary": {
      "description": "Feature summary (required for add; optional for update)",
      "type": "string"
    }
  },
  "required": [
    "path",
    "action"
  ],
  "type": "object"
}
```

### `manage_state`

Manage harness project state: show current state, record learnings/failures, archive failures, reset state, run mechanical gate checks, or save/load session handoff

**Input schema:**

```json
{
  "properties": {
    "action": {
      "description": "Action to perform",
      "enum": [
        "show",
        "learn",
        "failure",
        "archive",
        "reset",
        "gate",
        "save-handoff",
        "load-handoff",
        "append_entry",
        "update_entry_status",
        "read_section",
        "read_sections",
        "archive_session",
        "task-start",
        "task-complete",
        "phase-start",
        "phase-complete",
        "task-transition"
      ],
      "type": "string"
    },
    "actor": {
      "description": "Actor for a forced transition",
      "type": "string"
    },
    "authorSkill": {
      "description": "Name of the skill authoring the entry (required for append_entry)",
      "type": "string"
    },
    "content": {
      "description": "Entry content text (required for append_entry)",
      "type": "string"
    },
    "dependsOn": {
      "description": "Dependency task ids; when set, the task is registered before transitioning",
      "items": {
        "type": "string"
      },
      "type": "array"
    },
    "description": {
      "description": "Failure description (required for failure)",
      "type": "string"
    },
    "entryId": {
      "description": "ID of the entry to update (required for update_entry_status)",
      "type": "string"
    },
    "evidence": {
      "description": "PR/commit/test refs (required to enter done)",
      "items": {
        "type": "string"
      },
      "type": "array"
    },
    "failureType": {
      "description": "Type of failure (required for failure)",
      "type": "string"
    },
    "force": {
      "description": "Force an off-table transition (requires actor+reason)",
      "type": "boolean"
    },
    "handoff": {
      "description": "Handoff data to save (required for save-handoff)",
      "type": "object"
    },
    "learning": {
      "description": "Learning text to record (required for learn)",
      "type": "string"
    },
    "newStatus": {
      "description": "New status for the entry: active, resolved, or superseded (required for update_entry_status)",
      "enum": [
        "active",
        "resolved",
        "superseded"
      ],
      "type": "string"
    },
    "outcome": {
      "description": "Outcome associated with the learning",
      "type": "string"
    },
    "path": {
      "description": "Path to project root",
      "type": "string"
    },
    "reason": {
      "description": "Reason for a forced transition",
      "type": "string"
    },
    "section": {
      "description": "Session section name (terminology, decisions, constraints, risks, openQuestions, evidence)",
      "enum": [
        "terminology",
        "decisions",
        "constraints",
        "risks",
        "openQuestions",
        "evidence"
      ],
      "type": "string"
    },
    "session": {
      "description": "Session slug for session-scoped state (takes priority over stream when provided)",
      "type": "string"
    },
    "skillName": {
      "description": "Skill name associated with the entry",
      "type": "string"
    },
    "stream": {
      "description": "Stream name to target (auto-resolves from branch if omitted)",
      "type": "string"
    },
    "taskId": {
      "description": "Task id (required for task-transition)",
      "type": "string"
    },
    "toLane": {
      "description": "Target lane (required for task-transition)",
      "enum": [
        "planned",
        "claimed",
        "in_progress",
        "in_review",
        "done",
        "blocked",
        "canceled"
      ],
      "type": "string"
    }
  },
  "required": [
    "path",
    "action"
  ],
  "type": "object"
}
```

### `naming_craft`

LLM-judgment critique of identifier names (variables, functions, types, files). First craft-pipeline ceiling skill; uses a curated rubric catalog seeded from Martin / Beck / Karlton. Emits 3-axis findings (tier x impact x confidence per ADR 0019). In-session mode (default in Claude Code) returns prompts for the calling agent to answer; call naming_craft_finalize with the responses to get findings.

**Input schema:**

```json
{
  "properties": {
    "files": {
      "description": "Optional file/glob scope",
      "items": {
        "type": "string"
      },
      "type": "array"
    },
    "kinds": {
      "description": "Restrict to specific identifier kinds (default: all)",
      "items": {
        "enum": [
          "variable",
          "function",
          "type",
          "file"
        ],
        "type": "string"
      },
      "type": "array"
    },
    "maxFiles": {
      "description": "Cap file count (default: 100)",
      "type": "number"
    },
    "maxIdentifiersPerFile": {
      "description": "Cap per-file identifier sampling (default: 15)",
      "type": "number"
    },
    "mode": {
      "description": "'in-session' (default): return prompts for the calling agent to answer, then call naming_craft_finalize. 'inline': run end-to-end via the configured provider (HARNESS_CRAFT_LLM).",
      "enum": [
        "inline",
        "in-session"
      ],
      "type": "string"
    },
    "path": {
      "description": "Project root path",
      "type": "string"
    },
    "promptBudget": {
      "description": "Cap prompt count in in-session mode (default: 100)",
      "type": "number"
    }
  },
  "required": [
    "path"
  ],
  "type": "object"
}
```

### `naming_craft_finalize`

Finalize a naming_craft in-session run by submitting the calling agent's responses to the prompts collected by naming_craft. Returns the standard NamingCraftOutput with findings.

**Input schema:**

```json
{
  "properties": {
    "allowPartial": {
      "description": "Opt into finalizing when fewer prompts were answered than were collected. Default false: a short response set is rejected instead of emitting a full-looking critique. When true, the summary carries an explicit `coverage` and a narrowed `filesScanned` reflecting only what was judged.",
      "type": "boolean"
    },
    "path": {
      "description": "Project root path used in the collect call (must match)",
      "type": "string"
    },
    "responses": {
      "description": "Per-prompt responses. `raw` is the fenced JSON block the calling agent produced.",
      "items": {
        "properties": {
          "promptId": {
            "type": "string"
          },
          "raw": {
            "type": "string"
          }
        },
        "required": [
          "promptId",
          "raw"
        ],
        "type": "object"
      },
      "type": "array"
    },
    "runId": {
      "description": "runId returned by the naming_craft collect call",
      "type": "string"
    }
  },
  "required": [
    "path",
    "runId",
    "responses"
  ],
  "type": "object"
}
```

### `outcome_eval`

Post-execution LLM-judgment: did the implementation actually satisfy its spec? Reads the spec's acceptance section, the change diff, and test output, and emits a confidence-rated OutcomeVerdict (SATISFIED | NOT_SATISFIED | INCONCLUSIVE) with a rationale and unmetCriteria. Ship authority is DERIVED in TypeScript, never trusted from the LLM: a high-confidence NOT_SATISFIED is blocking; every other verdict is advisory. The harness's first blocking post-execution spec-satisfaction gate. IMPORTANT: diff and testOutput are required — omitting them degrades the verdict to INCONCLUSIVE/advisory (never blocking), so the calling agent MUST supply them from the session (git diff + test-runner output). Each verdict persists as an execution_outcome node.

**Input schema:**

```json
{
  "properties": {
    "commit": {
      "description": "Optional head commit sha of the change under judgment. Persisted onto the execution_outcome node so a sha-keyed consumer (e.g. the pre-merge brief) can look the verdict up. Omitting it is safe (additive).",
      "type": "string"
    },
    "diff": {
      "description": "Unified diff of the change under judgment (e.g. `git diff` / `git diff <base>...HEAD`). Required: an empty diff degrades the verdict to INCONCLUSIVE/advisory.",
      "type": "string"
    },
    "model": {
      "description": "Optional model override for the outcome-eval LLM call",
      "type": "string"
    },
    "path": {
      "description": "Project root used to resolve the knowledge graph (default: cwd)",
      "type": "string"
    },
    "specPath": {
      "description": "Absolute or repo-relative path to the spec markdown to judge against",
      "type": "string"
    },
    "testOutput": {
      "description": "Captured test-runner stdout+stderr. Required: empty/unparseable output is tolerated but degrades the verdict toward INCONCLUSIVE/advisory.",
      "type": "string"
    }
  },
  "required": [
    "specPath",
    "diff",
    "testOutput"
  ],
  "type": "object"
}
```

### `plan_parallelization`

Plan safe parallel execution for a set of plan tasks. Builds a task DAG from dependsOn plus glob-aware file/owns overlap, wave-groups it, annotates each wave with conflict severity and a firing decision, and returns a ParallelizationPlan (waves, serialized, cyclic, ownershipForecast, narration). ownershipForecast is a cheap deterministic list of task pairs whose declared owns:[paths] overlap.

**Input schema:**

```json
{
  "properties": {
    "depth": {
      "description": "Conflict expansion depth (0=file-only, 1=default)",
      "type": "number"
    },
    "minWaveSize": {
      "description": "Minimum independent tasks in a wave to justify parallel dispatch. Default 3.",
      "type": "number"
    },
    "path": {
      "description": "Path to project root",
      "type": "string"
    },
    "tasks": {
      "description": "Plan tasks. Each has id, files, and optional dependsOn/owns.",
      "items": {
        "properties": {
          "dependsOn": {
            "items": {
              "type": "string"
            },
            "type": "array"
          },
          "files": {
            "items": {
              "type": "string"
            },
            "type": "array"
          },
          "id": {
            "type": "string"
          },
          "owns": {
            "items": {
              "type": "string"
            },
            "type": "array"
          }
        },
        "required": [
          "id",
          "files"
        ],
        "type": "object"
      },
      "minItems": 1,
      "type": "array"
    }
  },
  "required": [
    "path",
    "tasks"
  ],
  "type": "object"
}
```

### `predict_conflicts`

Predict conflict severity for task pairs with automatic parallel group recomputation. Returns severity-classified conflicts, revised groups, and human-readable reasoning.

**Input schema:**

```json
{
  "properties": {
    "depth": {
      "description": "Expansion depth (0=file-only, 1=default, 2-3=thorough)",
      "type": "number"
    },
    "edgeTypes": {
      "description": "Edge types for graph expansion. Default: imports, calls, references",
      "items": {
        "type": "string"
      },
      "type": "array"
    },
    "mode": {
      "description": "summary omits overlap details from conflicts. Default: detailed",
      "enum": [
        "summary",
        "detailed"
      ],
      "type": "string"
    },
    "path": {
      "description": "Path to project root",
      "type": "string"
    },
    "tasks": {
      "description": "Tasks to check. Each task has an id and a list of file paths.",
      "items": {
        "properties": {
          "files": {
            "items": {
              "type": "string"
            },
            "type": "array"
          },
          "id": {
            "type": "string"
          }
        },
        "required": [
          "id",
          "files"
        ],
        "type": "object"
      },
      "minItems": 2,
      "type": "array"
    }
  },
  "required": [
    "path",
    "tasks"
  ],
  "type": "object"
}
```

### `predict_failures`

Predict which architectural constraints will break and when, based on decay trends and planned roadmap features. Requires at least 3 timeline snapshots.

**Input schema:**

```json
{
  "properties": {
    "category": {
      "description": "Filter to a single metric category",
      "enum": [
        "circular-deps",
        "layer-violations",
        "complexity",
        "coupling",
        "forbidden-imports",
        "module-size",
        "dependency-depth"
      ],
      "type": "string"
    },
    "horizon": {
      "description": "Forecast horizon in weeks (default: 12)",
      "type": "number"
    },
    "includeRoadmap": {
      "description": "Include roadmap spec impact in forecasts (default: true)",
      "type": "boolean"
    },
    "path": {
      "description": "Path to project root",
      "type": "string"
    }
  },
  "required": [
    "path"
  ],
  "type": "object"
}
```

### `query_graph`

Query the project knowledge graph using ContextQL. Traverses from root nodes outward, filtering by node/edge types.

**Input schema:**

```json
{
  "properties": {
    "bidirectional": {
      "description": "Traverse edges in both directions (default false)",
      "type": "boolean"
    },
    "excludeTypes": {
      "description": "Exclude nodes of these types",
      "items": {
        "type": "string"
      },
      "type": "array"
    },
    "includeEdges": {
      "description": "Only traverse edges of these types",
      "items": {
        "type": "string"
      },
      "type": "array"
    },
    "includeTypes": {
      "description": "Only include nodes of these types",
      "items": {
        "type": "string"
      },
      "type": "array"
    },
    "limit": {
      "description": "Max nodes to return (pagination). Default: 50.",
      "type": "number"
    },
    "maxDepth": {
      "description": "Maximum traversal depth (default 3)",
      "type": "number"
    },
    "mode": {
      "description": "Response density: summary returns node/edge counts by type + top 10 nodes by connectivity, detailed returns full arrays. Default: detailed",
      "enum": [
        "summary",
        "detailed"
      ],
      "type": "string"
    },
    "offset": {
      "description": "Number of nodes to skip (pagination). Default: 0. Nodes are sorted by connectivity (edge count desc).",
      "type": "number"
    },
    "path": {
      "description": "Path to project root",
      "type": "string"
    },
    "pruneObservability": {
      "description": "Prune observability nodes like spans/metrics/logs (default true)",
      "type": "boolean"
    },
    "rootNodeIds": {
      "description": "Node IDs to start traversal from",
      "items": {
        "type": "string"
      },
      "type": "array"
    }
  },
  "required": [
    "path",
    "rootNodeIds"
  ],
  "type": "object"
}
```

### `read_strategy`

Read and parse STRATEGY.md at the project root. Returns { present, valid, doc?, error? } where doc is the parsed StrategyDoc when present and valid. Combines validate_strategy + parseStrategyDoc + asStrategyDoc in one call.

**Input schema:**

```json
{
  "properties": {
    "path": {
      "description": "Project root directory",
      "type": "string"
    }
  },
  "required": [
    "path"
  ],
  "type": "object"
}
```

### `recommend_skills`

Recommend skills based on codebase health. Returns sequenced workflow with urgency markers.

**Input schema:**

```json
{
  "properties": {
    "noCache": {
      "description": "Force fresh health snapshot even if cache is fresh",
      "type": "boolean"
    },
    "path": {
      "description": "Project root path (defaults to cwd)",
      "type": "string"
    },
    "recentFiles": {
      "description": "Recently edited files for knowledge skill path-matching",
      "items": {
        "type": "string"
      },
      "type": "array"
    },
    "top": {
      "description": "Max recommendations to return (default 5)",
      "type": "number"
    }
  },
  "required": [],
  "type": "object"
}
```

### `release_compound_lock`

Release a previously-acquired compound lock by its token. Returns { released: true } when the token matches a live handle; { released: false, error } otherwise. Idempotent: calling twice with the same token is not an error after the first release.

**Input schema:**

```json
{
  "properties": {
    "token": {
      "description": "Token returned by acquire_compound_lock",
      "type": "string"
    }
  },
  "required": [
    "token"
  ],
  "type": "object"
}
```

### `request_peer_review`

Spawn an agent subprocess to perform code review. Returns structured feedback with approval status. Timeout: 120 seconds.

**Input schema:**

```json
{
  "properties": {
    "agentType": {
      "description": "Type of agent to use for the peer review",
      "enum": [
        "architecture-enforcer",
        "documentation-maintainer",
        "test-reviewer",
        "entropy-cleaner",
        "custom"
      ],
      "type": "string"
    },
    "context": {
      "description": "Optional additional context for the reviewer",
      "type": "string"
    },
    "diff": {
      "description": "Git diff string to review",
      "type": "string"
    },
    "path": {
      "description": "Path to project root",
      "type": "string"
    }
  },
  "required": [
    "path",
    "agentType",
    "diff"
  ],
  "type": "object"
}
```

### `review_changes`

Review code changes at configurable depth: quick (diff analysis), standard (+ self-review), deep (full 7-phase pipeline). Auto-downgrades deep to standard for diffs > 10k lines.

**Input schema:**

```json
{
  "properties": {
    "depth": {
      "description": "Review depth: quick, standard, or deep",
      "enum": [
        "quick",
        "standard",
        "deep"
      ],
      "type": "string"
    },
    "diff": {
      "description": "Raw git diff string. If omitted, auto-detects from git.",
      "type": "string"
    },
    "limit": {
      "description": "Max findings to return (pagination). Default: 20.",
      "type": "number"
    },
    "mode": {
      "description": "Response density. Default: summary",
      "enum": [
        "summary",
        "detailed"
      ],
      "type": "string"
    },
    "offset": {
      "description": "Number of findings to skip (pagination). Default: 0. Findings are sorted by severity desc (error > warning > info).",
      "type": "number"
    },
    "path": {
      "description": "Path to project root",
      "type": "string"
    }
  },
  "required": [
    "path",
    "depth"
  ],
  "type": "object"
}
```

### `run_agent_task`

Run an agent task using the harness CLI

**Input schema:**

```json
{
  "properties": {
    "path": {
      "description": "Path to project root directory",
      "type": "string"
    },
    "task": {
      "description": "Task to run",
      "type": "string"
    },
    "timeout": {
      "description": "Timeout in milliseconds",
      "type": "number"
    }
  },
  "required": [
    "task"
  ],
  "type": "object"
}
```

### `run_ci_checks`

Run CI/CD validation checks on a harness project. Returns pass/fail results per check with issues. Checks: validate, deps, docs, entropy, security, perf, phase-gate, arch, traceability.

**Input schema:**

```json
{
  "properties": {
    "checks": {
      "description": "Subset of checks to run (default: all)",
      "items": {
        "enum": [
          "validate",
          "deps",
          "docs",
          "entropy",
          "security",
          "perf",
          "phase-gate",
          "arch",
          "traceability"
        ],
        "type": "string"
      },
      "type": "array"
    },
    "path": {
      "description": "Path to project root directory",
      "type": "string"
    }
  },
  "required": [
    "path"
  ],
  "type": "object"
}
```

### `run_code_review`

Run the unified 7-phase code review pipeline: gate, mechanical checks, context scoping, parallel agents, validation, deduplication, and output.

**Input schema:**

```json
{
  "properties": {
    "ci": {
      "description": "Enable eligibility gate and non-interactive output",
      "type": "boolean"
    },
    "comment": {
      "description": "Post inline comments to GitHub PR (requires prNumber and repo)",
      "type": "boolean"
    },
    "commitMessage": {
      "description": "Most recent commit message (for change-type detection)",
      "type": "string"
    },
    "deep": {
      "description": "Add threat modeling pass to security agent",
      "type": "boolean"
    },
    "depth": {
      "description": "Override Phase 3.5 depth calibration. \"deep\" forces all conditional subagents (adversarial, typescript-strict, frontend-races).",
      "enum": [
        "quick",
        "standard",
        "deep"
      ],
      "type": "string"
    },
    "diff": {
      "description": "Git diff string to review",
      "type": "string"
    },
    "limit": {
      "description": "Max findings to return (pagination). Default: 20.",
      "type": "number"
    },
    "noMechanical": {
      "description": "Skip mechanical checks (useful if already run)",
      "type": "boolean"
    },
    "offset": {
      "description": "Number of findings to skip (pagination). Default: 0. Findings are sorted by severity desc (critical > important > suggestion).",
      "type": "number"
    },
    "path": {
      "description": "Path to project root",
      "type": "string"
    },
    "prNumber": {
      "description": "PR number (required for --comment and CI gate)",
      "type": "number"
    },
    "repo": {
      "description": "Repository in owner/repo format (required for --comment)",
      "type": "string"
    }
  },
  "required": [
    "path",
    "diff"
  ],
  "type": "object"
}
```

### `run_design_pipeline`

Run the design-pipeline orchestrator: FRESHEN -> DETECT -> FIX -> AUDIT -> FILL -> REPORT. Composes detect-design-drift, align-design-system, audit-component-anatomy, audit-brand-compliance, and design-craft-elevator into a phased pipeline with convergence-based remediation.

**Input schema:**

```json
{
  "properties": {
    "ci": {
      "description": "Non-interactive: safe fixes only, no prompts",
      "type": "boolean"
    },
    "designStrictness": {
      "description": "Override design.strictness",
      "enum": [
        "strict",
        "standard",
        "permissive"
      ],
      "type": "string"
    },
    "files": {
      "description": "Optional file/glob scope",
      "items": {
        "type": "string"
      },
      "type": "array"
    },
    "fix": {
      "description": "Enable convergence-based remediation",
      "type": "boolean"
    },
    "mode": {
      "description": "Verifier mode passed to each composed verifier",
      "enum": [
        "fast",
        "full"
      ],
      "type": "string"
    },
    "noFill": {
      "description": "Skip FILL phase",
      "type": "boolean"
    },
    "noFreshen": {
      "description": "Skip FRESHEN phase",
      "type": "boolean"
    },
    "path": {
      "description": "Project root path",
      "type": "string"
    }
  },
  "required": [
    "path"
  ],
  "type": "object"
}
```

### `run_persona`

Execute all steps defined in a persona and return aggregated results

**Input schema:**

```json
{
  "properties": {
    "dryRun": {
      "description": "Preview without side effects",
      "type": "boolean"
    },
    "path": {
      "description": "Path to project root",
      "type": "string"
    },
    "persona": {
      "description": "Persona name (e.g., architecture-enforcer)",
      "type": "string"
    },
    "trigger": {
      "description": "Trigger context for step filtering (default: auto)",
      "enum": [
        "always",
        "on_pr",
        "on_commit",
        "on_review",
        "scheduled",
        "manual",
        "on_plan_approved",
        "auto"
      ],
      "type": "string"
    }
  },
  "required": [
    "persona"
  ],
  "type": "object"
}
```

### `run_security_scan`

Run the built-in security scanner on a project or specific files. Detects secrets, injection, XSS, weak crypto, and other vulnerabilities.

**Input schema:**

```json
{
  "properties": {
    "files": {
      "description": "Optional list of specific files to scan. If omitted, scans all source files.",
      "items": {
        "type": "string"
      },
      "type": "array"
    },
    "path": {
      "description": "Path to project root",
      "type": "string"
    },
    "strict": {
      "description": "Override strict mode — promotes all warnings to errors",
      "type": "boolean"
    }
  },
  "required": [
    "path"
  ],
  "type": "object"
}
```

### `run_skill`

Load and return the content of a skill (SKILL.md), optionally with project state context

**Input schema:**

```json
{
  "properties": {
    "autoInject": {
      "description": "When true, returns only the Instructions section (before ## Details) for knowledge skills",
      "type": "boolean"
    },
    "complexity": {
      "description": "Rigor level: fast (minimal), standard (default), thorough (full)",
      "enum": [
        "fast",
        "standard",
        "thorough"
      ],
      "type": "string"
    },
    "party": {
      "description": "Enable multi-perspective evaluation",
      "type": "boolean"
    },
    "path": {
      "description": "Path to project root for state context injection",
      "type": "string"
    },
    "phase": {
      "description": "Start at a specific phase (re-entry)",
      "type": "string"
    },
    "skill": {
      "description": "Skill name (e.g., harness-tdd)",
      "type": "string"
    }
  },
  "required": [
    "skill"
  ],
  "type": "object"
}
```

### `search_sessions`

Full-text search over archived + live session content (FTS5/BM25).

**Input schema:**

```json
{
  "properties": {
    "archivedOnly": {
      "description": "Only search archived sessions (skip live).",
      "type": "boolean"
    },
    "fileKinds": {
      "description": "Subset of file kinds to search.",
      "items": {
        "enum": [
          "summary",
          "learnings",
          "failures",
          "sections",
          "llm_summary"
        ],
        "type": "string"
      },
      "type": "array"
    },
    "limit": {
      "description": "Max results (default 20)",
      "type": "number"
    },
    "path": {
      "description": "Path to project root",
      "type": "string"
    },
    "query": {
      "description": "FTS5 query (bare words AND-joined)",
      "type": "string"
    }
  },
  "required": [
    "path",
    "query"
  ],
  "type": "object"
}
```

### `search_similar`

Search the knowledge graph for nodes similar to a query string using keyword and semantic fusion.

**Input schema:**

```json
{
  "properties": {
    "mode": {
      "description": "Response density: summary returns top 5 results with scores only, detailed returns top 10+ with full metadata. Default: detailed",
      "enum": [
        "summary",
        "detailed"
      ],
      "type": "string"
    },
    "path": {
      "description": "Path to project root",
      "type": "string"
    },
    "query": {
      "description": "Search query string",
      "type": "string"
    },
    "topK": {
      "description": "Maximum number of results to return (default 10)",
      "type": "number"
    }
  },
  "required": [
    "path",
    "query"
  ],
  "type": "object"
}
```

### `search_skills`

Search the skill catalog for domain-specific skills. Returns ranked results based on keyword, name, description, and stack-signal matching. Use this to discover catalog skills that are not loaded as slash commands.

**Input schema:**

```json
{
  "properties": {
    "limit": {
      "description": "Maximum results to return (default 5)",
      "type": "number"
    },
    "offset": {
      "description": "Number of results to skip (default 0)",
      "type": "number"
    },
    "path": {
      "description": "Project root path (defaults to cwd)",
      "type": "string"
    },
    "platform": {
      "description": "Target platform (defaults to claude-code)",
      "enum": [
        "claude-code",
        "gemini-cli"
      ],
      "type": "string"
    },
    "query": {
      "description": "Natural language or keyword query to search for skills",
      "type": "string"
    }
  },
  "required": [
    "query"
  ],
  "type": "object"
}
```

### `security_craft`

LLM-judgment critique of security posture (TS/JS source). Sixth non-design craft-pipeline ceiling skill; the final sub-project (#10 of 10). 8 seed rubrics: trust-boundary-respected, least-authority-honored, defense-in-depth, assumed-adversary-realistic, data-flow-annotated, fail-closed-not-open, secret-handling-shape, authz-before-action. AST-driven signal detection (only files with security-relevant constructs are critiqued — http handlers, middleware, auth APIs, child_process/eval, fs writes, raw queries, network egress, secret handling). Conservative confidence defaults manage the FP risk inherent in judgment-based security. Emits 3-axis findings (tier x impact x confidence per ADR 0019).

**Input schema:**

```json
{
  "properties": {
    "files": {
      "description": "Optional file scope (overrides discovery)",
      "items": {
        "type": "string"
      },
      "type": "array"
    },
    "maxFiles": {
      "description": "Cap source-file count (default: 100)",
      "type": "number"
    },
    "maxSignalsPerFile": {
      "description": "Cap per-file signal critique (default: 10)",
      "type": "number"
    },
    "mode": {
      "description": "'in-session' (default): return prompts for the calling agent to answer, then call security_craft_finalize. 'inline': run end-to-end via the configured provider (HARNESS_CRAFT_LLM).",
      "enum": [
        "inline",
        "in-session"
      ],
      "type": "string"
    },
    "packages": {
      "description": "Restrict to specific packages under packages/",
      "items": {
        "type": "string"
      },
      "type": "array"
    },
    "path": {
      "description": "Project root path",
      "type": "string"
    },
    "promptBudget": {
      "description": "Cap prompt count in in-session mode (default: 100)",
      "type": "number"
    }
  },
  "required": [
    "path"
  ],
  "type": "object"
}
```

### `security_craft_finalize`

Finalize a security_craft in-session run by submitting the calling agent's responses to the prompts collected by security_craft. Returns the standard SecurityCraftOutput with findings.

**Input schema:**

```json
{
  "properties": {
    "path": {
      "description": "Project root path used in the collect call (must match)",
      "type": "string"
    },
    "responses": {
      "description": "Per-prompt responses. `raw` is the fenced JSON block the calling agent produced.",
      "items": {
        "properties": {
          "promptId": {
            "type": "string"
          },
          "raw": {
            "type": "string"
          }
        },
        "required": [
          "promptId",
          "raw"
        ],
        "type": "object"
      },
      "type": "array"
    },
    "runId": {
      "description": "runId returned by the security_craft collect call",
      "type": "string"
    }
  },
  "required": [
    "path",
    "runId",
    "responses"
  ],
  "type": "object"
}
```

### `seed_pulse_from_strategy`

Read STRATEGY.md at the project root and extract pulse-config seed values: product `name` and `## Key metrics` bullet items. Returns `{ name, keyMetrics, warnings }`. Defensive: every failure mode degrades to a non-empty warnings array rather than throwing.

**Input schema:**

```json
{
  "properties": {
    "path": {
      "description": "Project root directory",
      "type": "string"
    }
  },
  "required": [
    "path"
  ],
  "type": "object"
}
```

### `spec_craft`

LLM-judgment critique of spec quality (proposals + ADRs). Second craft-pipeline ceiling skill; 7 seed rubrics from the spec-quality canon. Per-section critique with rubric-to-section mapping. Emits 3-axis findings (tier x impact x confidence per ADR 0019). In-session mode (default in Claude Code) returns prompts for the calling agent to answer; call spec_craft_finalize with the responses to get findings.

**Input schema:**

```json
{
  "properties": {
    "files": {
      "description": "Optional spec file/glob scope",
      "items": {
        "type": "string"
      },
      "type": "array"
    },
    "kinds": {
      "description": "Restrict to specific spec kinds (default: both)",
      "items": {
        "enum": [
          "proposal",
          "adr"
        ],
        "type": "string"
      },
      "type": "array"
    },
    "maxFiles": {
      "description": "Cap doc count (default: 50)",
      "type": "number"
    },
    "maxSectionsPerFile": {
      "description": "Cap per-doc section critique (default: 10)",
      "type": "number"
    },
    "mode": {
      "description": "'in-session' (default): return prompts for the calling agent to answer, then call spec_craft_finalize. 'inline': run end-to-end via the configured provider (HARNESS_CRAFT_LLM).",
      "enum": [
        "inline",
        "in-session"
      ],
      "type": "string"
    },
    "path": {
      "description": "Project root path",
      "type": "string"
    },
    "promptBudget": {
      "description": "Cap prompt count in in-session mode (default: 100)",
      "type": "number"
    },
    "sections": {
      "description": "Restrict to canonical section names (e.g., decisions, scope)",
      "items": {
        "type": "string"
      },
      "type": "array"
    }
  },
  "required": [
    "path"
  ],
  "type": "object"
}
```

### `spec_craft_finalize`

Finalize a spec_craft in-session run by submitting the calling agent's responses to the prompts collected by spec_craft. Returns the standard SpecCraftOutput with findings.

**Input schema:**

```json
{
  "properties": {
    "path": {
      "description": "Project root path used in the collect call (must match)",
      "type": "string"
    },
    "responses": {
      "description": "Per-prompt responses. `raw` is the fenced JSON block the calling agent produced.",
      "items": {
        "properties": {
          "promptId": {
            "type": "string"
          },
          "raw": {
            "type": "string"
          }
        },
        "required": [
          "promptId",
          "raw"
        ],
        "type": "object"
      },
      "type": "array"
    },
    "runId": {
      "description": "runId returned by the spec_craft collect call",
      "type": "string"
    }
  },
  "required": [
    "path",
    "runId",
    "responses"
  ],
  "type": "object"
}
```

### `subscribe_webhook`

Subscribe to outbound webhook fan-out via POST /api/v1/webhooks. Returns the secret once. Requires subscribe-webhook scope.

**Input schema:**

```json
{
  "properties": {
    "events": {
      "description": "Event-type globs (e.g. [\"maintenance.completed\", \"interaction.*\"])",
      "items": {
        "type": "string"
      },
      "type": "array"
    },
    "url": {
      "description": "https URL to POST events to",
      "type": "string"
    }
  },
  "required": [
    "url",
    "events"
  ],
  "type": "object"
}
```

### `summarize_session`

Generate or regenerate the LLM `llm-summary.md` for an archived session.

**Input schema:**

```json
{
  "properties": {
    "force": {
      "description": "If true, overwrite an existing llm-summary.md. Default: false (no-op when present).",
      "type": "boolean"
    },
    "path": {
      "description": "Path to project root",
      "type": "string"
    },
    "sessionId": {
      "description": "Archived session id (basename of the directory inside .harness/archive/sessions/)",
      "type": "string"
    }
  },
  "required": [
    "path",
    "sessionId"
  ],
  "type": "object"
}
```

### `test_craft`

LLM-judgment critique of test quality across vitest/jest/mocha/playwright/pytest. Fourth craft-pipeline ceiling skill; 8 seed rubrics. Per-test critique with optional source pairing for contract-vs-implementation rubrics. In-session mode (default in Claude Code) returns prompts for the calling agent to answer; call test_craft_finalize with the responses to get findings.

**Input schema:**

```json
{
  "properties": {
    "emitTo": {
      "description": "Write a machine-readable per-test verdict report (JSON) to this path so downstream tooling can consume the findings; relative paths resolve against the project root (inline mode only)",
      "type": "string"
    },
    "files": {
      "description": "Optional test file/glob scope",
      "items": {
        "type": "string"
      },
      "type": "array"
    },
    "frameworks": {
      "description": "Restrict to specific frameworks (default: all five)",
      "items": {
        "enum": [
          "vitest",
          "jest",
          "mocha",
          "playwright",
          "pytest"
        ],
        "type": "string"
      },
      "type": "array"
    },
    "maxFiles": {
      "description": "Cap test file count (default: 100)",
      "type": "number"
    },
    "maxTestsPerFile": {
      "description": "Cap per-file test critique (default: 20)",
      "type": "number"
    },
    "mode": {
      "description": "'in-session' (default): return prompts for the calling agent to answer, then call test_craft_finalize. 'inline': run end-to-end via the configured provider (HARNESS_CRAFT_LLM).",
      "enum": [
        "inline",
        "in-session"
      ],
      "type": "string"
    },
    "path": {
      "description": "Project root path",
      "type": "string"
    },
    "promptBudget": {
      "description": "Cap prompt count in in-session mode (default: 100)",
      "type": "number"
    },
    "sourcePair": {
      "description": "Resolve source file under test for richer prompt context (default: true)",
      "type": "boolean"
    }
  },
  "required": [
    "path"
  ],
  "type": "object"
}
```

### `test_craft_finalize`

Finalize a test_craft in-session run by submitting the calling agent's responses to the prompts collected by test_craft. Returns the standard TestCraftOutput with findings.

**Input schema:**

```json
{
  "properties": {
    "path": {
      "description": "Project root path used in the collect call (must match)",
      "type": "string"
    },
    "responses": {
      "description": "Per-prompt responses. `raw` is the fenced JSON block the calling agent produced.",
      "items": {
        "properties": {
          "promptId": {
            "type": "string"
          },
          "raw": {
            "type": "string"
          }
        },
        "required": [
          "promptId",
          "raw"
        ],
        "type": "object"
      },
      "type": "array"
    },
    "runId": {
      "description": "runId returned by the test_craft collect call",
      "type": "string"
    }
  },
  "required": [
    "path",
    "runId",
    "responses"
  ],
  "type": "object"
}
```

### `trigger_maintenance_job`

Trigger a maintenance task ad-hoc via POST /api/v1/jobs/maintenance. Requires trigger-job scope.

**Input schema:**

```json
{
  "properties": {
    "params": {
      "additionalProperties": true,
      "description": "Optional task-specific parameters",
      "type": "object"
    },
    "taskId": {
      "description": "Registered maintenance task identifier (e.g. cleanup-sessions)",
      "type": "string"
    }
  },
  "required": [
    "taskId"
  ],
  "type": "object"
}
```

### `uat_signoff`

Record a HUMAN user-acceptance-testing (UAT) sign-off for a change as one execution_outcome node. The terminal, human-authority stage of the change lifecycle under the `docs/changes/&lt;slug>/` directory: it records the human's acceptance of the shipped reality against the change's Success Criteria. Unlike acceptance_eval / outcome_eval this runs NO LLM and derives NO authority — the HUMAN is the authority, and the record is advisory (never blocks). Persists metadata.source = "uat-signoff" onto the shared execution_outcome shape so the eval-fail-rate signal consumes it. result is success iff decision === ACCEPTED, else failure. Call this AFTER the guided interview has captured the overall decision, the signer, and per-item dispositions — do not fabricate a verdict.

**Input schema:**

```json
{
  "properties": {
    "criteriaRefs": {
      "description": "Success-Criterion ids the sign-off closes (the accepted acceptance items)",
      "items": {
        "type": "string"
      },
      "type": "array"
    },
    "decision": {
      "description": "The overall human verdict (ACCEPTED | REJECTED | CHANGES_REQUESTED)",
      "enum": [
        "ACCEPTED",
        "REJECTED",
        "CHANGES_REQUESTED"
      ],
      "type": "string"
    },
    "items": {
      "description": "Per-item dispositions ruled on during the interview",
      "items": {
        "properties": {
          "disposition": {
            "description": "The human disposition for this item",
            "enum": [
              "ACCEPT",
              "REJECT",
              "CHANGES_REQUESTED"
            ],
            "type": "string"
          },
          "id": {
            "description": "Stable id of the Success-Criterion item (e.g. SC3)",
            "type": "string"
          },
          "note": {
            "description": "Optional free-text note",
            "type": "string"
          }
        },
        "required": [
          "id",
          "disposition"
        ],
        "type": "object"
      },
      "type": "array"
    },
    "path": {
      "description": "Project root used to resolve the knowledge graph (default: cwd)",
      "type": "string"
    },
    "signedOffBy": {
      "description": "Name/identity of the human who signed off",
      "type": "string"
    },
    "slug": {
      "description": "Change slug — the docs/changes/<slug>/ owner (same slug as spec/plan/review)",
      "type": "string"
    },
    "timestamp": {
      "description": "ISO timestamp of the sign-off; defaults to now when omitted",
      "type": "string"
    }
  },
  "required": [
    "slug",
    "decision",
    "signedOffBy"
  ],
  "type": "object"
}
```

### `update_perf_baselines`

Update performance baselines from benchmark results. Run benchmarks first via CLI.

**Input schema:**

```json
{
  "properties": {
    "commitHash": {
      "description": "Current commit hash for baseline tracking",
      "type": "string"
    },
    "path": {
      "description": "Path to project root",
      "type": "string"
    },
    "results": {
      "description": "Array of benchmark results to save as baselines",
      "items": {
        "properties": {
          "file": {
            "type": "string"
          },
          "marginOfError": {
            "type": "number"
          },
          "meanMs": {
            "type": "number"
          },
          "name": {
            "type": "string"
          },
          "opsPerSec": {
            "type": "number"
          },
          "p99Ms": {
            "type": "number"
          }
        },
        "required": [
          "name",
          "file",
          "opsPerSec",
          "meanMs",
          "p99Ms",
          "marginOfError"
        ],
        "type": "object"
      },
      "type": "array"
    }
  },
  "required": [
    "path",
    "commitHash",
    "results"
  ],
  "type": "object"
}
```

### `validate_cross_check`

Validate plan-to-implementation coverage: checks that specs have plans and plans have implementations, detects staleness

**Input schema:**

```json
{
  "properties": {
    "path": {
      "description": "Path to project root directory",
      "type": "string"
    },
    "plansDir": {
      "description": "Plans directory relative to project root (default: docs/plans)",
      "type": "string"
    },
    "specsDir": {
      "description": "Specs directory relative to project root (default: docs/specs)",
      "type": "string"
    }
  },
  "required": [
    "path"
  ],
  "type": "object"
}
```

### `validate_linter_config`

Validate a harness-linter.yml configuration file

**Input schema:**

```json
{
  "properties": {
    "configPath": {
      "description": "Path to harness-linter.yml",
      "type": "string"
    }
  },
  "required": [
    "configPath"
  ],
  "type": "object"
}
```

### `validate_project`

Run all validation checks on a harness engineering project. Pass `changed: true` (or `scope: "affected"`, or a `since` ref) to run the full harness validate with its file-walking design audits scoped to the git-derived changed surface instead of the whole tree — the same affected-mode the CLI exposes, for skills/agents that validate via MCP. Default (omitted) is unchanged.

**Input schema:**

```json
{
  "properties": {
    "changed": {
      "description": "Alias for `scope: \"affected\"` — scope the design walkers to the changed surface.",
      "type": "boolean"
    },
    "defaultBranch": {
      "description": "Branch to compute the changed-surface merge-base against (default: main).",
      "type": "string"
    },
    "path": {
      "description": "Path to project root directory",
      "type": "string"
    },
    "scope": {
      "description": "'affected' scopes the design walkers to the changed surface derived from git; 'full' (default) walks the whole tree. Equivalent to `changed`.",
      "enum": [
        "affected",
        "full"
      ],
      "type": "string"
    },
    "since": {
      "description": "Scope the changed surface to files that differ from this ref (implies affected mode).",
      "type": "string"
    }
  },
  "required": [
    "path"
  ],
  "type": "object"
}
```

### `validate_strategy`

Validate STRATEGY.md at the project root. Returns { present, valid, error? }. Soft-fails (valid: true) when absent — STRATEGY.md is an optional anchor, not a hard requirement.

**Input schema:**

```json
{
  "properties": {
    "path": {
      "description": "Project root directory",
      "type": "string"
    }
  },
  "required": [
    "path"
  ],
  "type": "object"
}
```

### `write_pulse_config`

Write a `pulse:` block into harness.config.json at the project root, preserving every other top-level key. Validates against PulseConfigSchema first; does not touch disk on schema failure. Writes harness.config.json.bak on first call only. Atomic via temp-file + rename.

**Input schema:**

```json
{
  "properties": {
    "config": {
      "description": "PulseConfig to persist (must match PulseConfigSchema)",
      "type": "object"
    },
    "configPath": {
      "description": "Override path to harness.config.json. Defaults to <project-root>/harness.config.json. Pass an absolute path or a path relative to the project root.",
      "type": "string"
    },
    "path": {
      "description": "Project root directory",
      "type": "string"
    },
    "skipBackup": {
      "description": "When true, do not write harness.config.json.bak (default: false)",
      "type": "boolean"
    }
  },
  "required": [
    "path",
    "config"
  ],
  "type": "object"
}
```

### `write_strategy`

Write a StrategyDoc to STRATEGY.md at the project root. Validates against StrategyDocSchema first; does not touch disk on schema failure. Writes STRATEGY.md.bak on first overwrite (idempotent). Atomic via temp-file + rename.

**Input schema:**

```json
{
  "properties": {
    "doc": {
      "description": "StrategyDoc to persist (must match StrategyDocSchema)",
      "type": "object"
    },
    "path": {
      "description": "Project root directory",
      "type": "string"
    },
    "skipBackup": {
      "description": "When true, do not write STRATEGY.md.bak (default: false)",
      "type": "boolean"
    }
  },
  "required": [
    "path",
    "doc"
  ],
  "type": "object"
}
```

## Skills (789)

Every shipped skill contract, read live from its `skill.yaml`. A drift between a skill’s real declared contract and this catalog fails the build.

### a11y-aria-patterns

Apply ARIA roles, states, and properties correctly to enhance assistive technology support

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "a11y-aria-patterns",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### a11y-color-contrast

Ensure sufficient color contrast ratios and avoid color-only information conveyance

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "a11y-color-contrast",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### a11y-form-patterns

Build accessible forms with proper labeling, validation, and error handling

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "a11y-form-patterns",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### a11y-image-text-alt

Write effective alt text for images and provide text alternatives for non-text content

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "a11y-image-text-alt",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### a11y-keyboard-navigation

Ensure all interactive elements are reachable and operable via keyboard alone

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "a11y-keyboard-navigation",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### a11y-modal-patterns

Build accessible modal dialogs with focus trapping, escape dismissal, and screen reader announcements

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "a11y-modal-patterns",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### a11y-motion-animation

Implement animations that respect user motion preferences and avoid triggering vestibular disorders

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "a11y-motion-animation",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### a11y-screen-reader-testing

Test web applications with screen readers to verify accessible user experience

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "a11y-screen-reader-testing",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### a11y-semantic-html

Use semantic HTML elements to convey document structure and meaning to assistive technology

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "a11y-semantic-html",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### a11y-testing-automation

Automate accessibility testing with axe-core, jest-axe, Playwright, and CI integration

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "a11y-testing-automation",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### acceptance-eval

Pre-execution LLM-judgment skill: does a spec carry measurable, testable, complete acceptance criteria before work begins? Resolves the spec's acceptance section, critiques observability / testability / completeness (advisory), flags user-visible behaviors with no covering test (advisory), and emits a confidence-rated AcceptanceVerdict (MEASURABLE | NOT_MEASURABLE | INCONCLUSIVE). Authority is derived in TypeScript, never from the LLM: a high-confidence NOT_MEASURABLE blocks merge; every other verdict is advisory. The upstream twin of the outcome-eval ship gate.

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "constructive-architect",
  "dependsOn": [],
  "name": "acceptance-eval",
  "platforms": [
    "claude-code",
    "cursor",
    "codex",
    "gemini-cli"
  ],
  "tier": 2,
  "triggers": [
    "manual",
    "on_pr"
  ],
  "type": "rigid"
}
```

### add-harness-component

Add a component to an existing harness project

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "constructive-architect",
  "dependsOn": [
    "harness-initialize-project"
  ],
  "name": "add-harness-component",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 1,
  "triggers": [
    "manual"
  ],
  "type": "flexible"
}
```

### adr-fleet

Autonomous decide-stage orchestrator — sweep the backlog of pending architectural decisions, fan out worktree-isolated subagents that each run the real architecture-advisor pipeline to draft one ADR, independently verify every draft is a well-formed record, and hand the human one batch sign-off pass. Never auto-accepts.

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "systematic-orchestrator",
  "dependsOn": [
    "harness-roadmap-pilot",
    "harness-architecture-advisor"
  ],
  "name": "adr-fleet",
  "platforms": [
    "claude-code",
    "codex",
    "cursor",
    "gemini-cli"
  ],
  "tier": 2,
  "triggers": [
    "manual"
  ],
  "type": "rigid"
}
```

### align-design-system

Apply codemods for safe DRIFT-T001/T002/T003 token-bypass findings; emit precise suggestions for DRIFT-T004 (deprecated tokens) and all DRIFT-P* (primitive adoption). FIX half of the design-pipeline drift-remediation sub-project; pairs with detect-design-drift.

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "constructive-architect",
  "dependsOn": [
    "detect-design-drift"
  ],
  "name": "align-design-system",
  "platforms": [
    "claude-code"
  ],
  "tier": 2,
  "triggers": [
    "manual",
    "on_pr",
    "on_new_feature"
  ],
  "type": "rigid"
}
```

### align-documentation

Auto-fix documentation drift issues

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "meticulous-verifier",
  "dependsOn": [
    "detect-doc-drift"
  ],
  "name": "align-documentation",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "flexible"
}
```

### angular-component-pattern

Author Angular components with correct inputs/outputs, change detection, and lifecycle hooks

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "angular-component-pattern",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### angular-directive-pattern

Create attribute and structural directives with @Directive, hostBindings, and host listeners

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "angular-directive-pattern",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### angular-http-interceptors

Intercept HTTP requests with HttpInterceptorFn for auth headers, retry logic, and error handling

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "angular-http-interceptors",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### angular-lazy-loading

Reduce initial bundle size with loadComponent, loadChildren, preloading strategies, and deferrable views

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "angular-lazy-loading",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### angular-performance-patterns

Optimize Angular app performance with OnPush, trackBy, virtual scrolling, and deferrable views

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "angular-performance-patterns",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### angular-pipe-pattern

Create custom Angular pipes for pure data transformation and leverage built-in pipes correctly

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "angular-pipe-pattern",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### angular-reactive-forms

Build type-safe reactive forms with FormGroup, FormControl, Validators, and dynamic form arrays

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "angular-reactive-forms",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### angular-routing-guards

Protect and preload routes with functional CanActivateFn, CanDeactivateFn, and ResolveFn guards

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "angular-routing-guards",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### angular-rxjs-patterns

Apply RxJS patterns in Angular — switchMap, takeUntilDestroyed, async pipe, and error handling

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "angular-rxjs-patterns",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### angular-schematics

Use ng generate, custom schematics, and angular.json workspace config for scaffolding and configuration

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "angular-schematics",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### angular-service-di

Design Angular services with dependency injection, providers, and injection tokens

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "angular-service-di",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### angular-signals-pattern

Manage reactive state with Angular Signals — signal(), computed(), effect(), and toSignal()

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "angular-signals-pattern",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### angular-standalone-components

Build module-free Angular apps with standalone components, bootstrapApplication, and lazy routes

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "angular-standalone-components",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### angular-state-management

Manage application state with NgRx Store, createAction/createReducer/createSelector, or signal stores

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "angular-state-management",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### angular-testing-patterns

Test Angular components, services, and pipes with TestBed, ComponentFixture, and service mocks

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "angular-testing-patterns",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### api-api-keys

API key design — generation entropy requirements, rotation strategy, scoping permissions, transmission via Authorization header, storage hashing

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "api-api-keys",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### api-authentication-patterns

API auth landscape overview — when to use API keys vs OAuth2 vs JWT vs mTLS, trust levels, client types, token lifetimes

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "api-authentication-patterns",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### api-backward-compatibility

Additive change rules, Postel's law, breaking change taxonomy, automated breaking-change detection

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "api-backward-compatibility",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### api-bulk-operations

Batch endpoints including bulk create/update/delete, partial failure semantics, transactional vs best-effort batches, and Idempotency-Key on bulk

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "api-bulk-operations",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### api-conditional-requests

If-None-Match, If-Modified-Since, If-Match conditional headers, 304 Not Modified, and optimistic concurrency control

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "api-conditional-requests",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### api-content-negotiation

Accept/Content-Type header semantics, media-type versioning, charset and encoding negotiation, and Vary header requirements

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "api-content-negotiation",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### api-contract-testing

Consumer-driven contract testing — Pact fundamentals, provider verification, schema validation in CI (spectral, vacuum), breaking change detection (oasdiff), contract as living documentation

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "api-contract-testing",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### api-craft

LLM-judgment critique of API design quality — the ceiling counterpart to rule-based API checks (OpenAPI-format and webhook-format compliance). Asks whether resources model the domain rather than the implementation, whether resource naming and URL structure are predictable (path vs query param), whether HTTP methods are honest, whether status codes are correct, whether error responses tell the consumer what to do, whether response shapes are predictable and consistent, whether collections paginate and filter consistently, whether mutations are idempotency-honest, and whether the API evolves without breaking consumers. Structural twin of harness-cli-ergonomics-craft.

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "constructive-architect",
  "dependsOn": [
    "cli-ergonomics-craft"
  ],
  "name": "api-craft",
  "platforms": [
    "claude-code"
  ],
  "tier": 2,
  "triggers": [
    "manual",
    "on_pr",
    "on_new_feature"
  ],
  "type": "rigid"
}
```

### api-deprecation-strategy

Sunset header (RFC 8594), Deprecation header, migration guide design, compatibility windows, communication cadence

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "api-deprecation-strategy",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### api-error-contracts

Consistent error response structure — machine-readable codes, human-readable messages, actionable remediation, and error taxonomies

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "api-error-contracts",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### api-field-selection

Sparse fieldsets and partial responses via ?fields= syntax, nested field selection, and performance tradeoffs vs GraphQL

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "api-field-selection",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### api-filtering-sorting

Query parameter design for filter operators (eq, gt, lt, in, contains), sort syntax, filter injection prevention, and performance hints

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "api-filtering-sorting",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### api-hateoas

Hypermedia as the engine of application state -- practical HAL and JSON:API link design with adoption criteria

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "api-hateoas",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### api-http-caching

Cache-Control directives, ETag generation, Vary header strategy, CDN interaction, and cache invalidation patterns

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "api-http-caching",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### api-http-methods

GET/POST/PUT/PATCH/DELETE semantics, safety and idempotency properties, and when to use each HTTP method

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "api-http-methods",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### api-idempotency-keys

Idempotency key design — UUID v4 generation, key storage TTL, 24h window convention, at-least-once vs exactly-once semantics, safe retry scope

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "api-idempotency-keys",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### api-long-running-operations

Async request patterns — 202 Accepted + polling, operation resource pattern, callback/webhook notification, status endpoint design, Google AIP-151

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "api-long-running-operations",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### api-nested-vs-flat

Nested resource paths vs flat URLs with filters -- decision criteria and URL depth guidelines

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "api-nested-vs-flat",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### api-oauth2-flows

OAuth2 flows — authorization code + PKCE, client credentials, device code, implicit (deprecated), token introspection, refresh token rotation

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "api-oauth2-flows",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### api-openapi-design

Contract-first OpenAPI 3.1 design — schema reuse ($ref, components), discriminator for polymorphism, operationId naming conventions, AsyncAPI for event-driven APIs, code generation integration

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "api-openapi-design",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### api-pagination-cursor

Cursor-based pagination with opaque tokens, base64 encoding, forward/backward traversal, and cursor stability guarantees

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "api-pagination-cursor",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### api-pagination-keyset

Keyset (seek) pagination with composite key design, sort order stability, and consistent performance at 10M+ rows

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "api-pagination-keyset",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### api-pagination-offset

Offset/limit pagination including COUNT(*) costs, page drift on inserts/deletes, max offset limits, and UI implications

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "api-pagination-offset",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### api-problem-details-rfc

RFC 9457 Problem Details for HTTP APIs — type URI, title, status, detail, instance fields, custom extensions, and application/problem+json content type

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "api-problem-details-rfc",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### api-rate-limit-headers

Rate limit response headers — X-RateLimit-Limit/Remaining/Reset, IETF RateLimit draft standard, Retry-After semantics, per-resource quota pools

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "api-rate-limit-headers",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### api-rate-limiting

Rate limit design as consumer contract — quota tiers, burst vs sustained limits, per-user vs per-app limits, fair-use policy, quota negotiation

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "api-rate-limiting",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### api-resource-granularity

Fine-grained vs coarse-grained resource design -- aggregation patterns and over-fetching tradeoffs

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "api-resource-granularity",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### api-resource-modeling

Nouns vs verbs in URI design, resource identification, and URL structure for REST APIs

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "api-resource-modeling",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### api-rest-maturity-model

Richardson Maturity Model levels 0-3 -- evaluating and advancing REST API design maturity

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "api-rest-maturity-model",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### api-retry-guidance

Retry-After headers, exponential backoff signals, transient vs permanent error classification, 429 vs 503 semantics, and idempotency requirement for safe retries

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "api-retry-guidance",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### api-sdk-ergonomics

Client library design — method naming (verb-noun), pagination helpers (auto-cursor iteration), error surface (typed exceptions vs error objects), retry built-ins, idiomatic patterns per language, discoverability

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "api-sdk-ergonomics",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### api-status-codes

Status code selection by scenario, common misuses (200 for errors, 404 vs 403, 400 vs 422), and response contract design

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "api-status-codes",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### api-validation-errors

Field-level validation error design — multi-field error arrays, JSON Pointer (RFC 6901) paths, source/pointer vs source/parameter, and 422 vs 400 choice

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "api-validation-errors",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### api-versioning-header

Accept header versioning (content negotiation), custom version headers (API-Version:), vendor media types (application/vnd.company.v2+json)

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "api-versioning-header",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### api-versioning-url

URL path versioning (/v1/, /v2/) — when to use, URI pollution tradeoffs, major-only vs minor versioning, migration timeline patterns

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "api-versioning-url",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### api-webhook-design

Webhook registration, payload design, delivery guarantees (at-least-once), retry policy, ordering guarantees, fan-out patterns

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "api-webhook-design",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### api-webhook-security

Signature verification (HMAC-SHA256), timestamp validation (replay attack defense), tolerance windows, secret rotation, TLS requirement

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "api-webhook-security",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### astro-component-pattern

Structure .astro components with frontmatter, template, and scoped styles following Astro conventions

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "astro-component-pattern",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### astro-content-collections

Organize and validate content with Astro content collections, schema definitions, and getCollection

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "astro-content-collections",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### astro-deployment-config

Deploy Astro projects to Vercel, Node, Cloudflare, and Netlify with the correct adapter and environment variable setup

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "astro-deployment-config",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### astro-image-optimization

Optimize images with astro:assets, the Image component, and remote image configuration

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "astro-image-optimization",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### astro-integration-pattern

Add official and custom Astro integrations using hooks, the integration API, and addRenderer

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "astro-integration-pattern",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### astro-islands-architecture

Apply Islands Architecture with client directives and partial hydration to ship minimal JavaScript

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "astro-islands-architecture",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### astro-multi-framework

Mix React, Vue, Svelte, and Solid components in one Astro project with framework isolation and shared state via nanostores

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "astro-multi-framework",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### astro-routing-pattern

Implement file-based routing, dynamic routes, and getStaticPaths for static and server-rendered pages

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "astro-routing-pattern",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### astro-server-endpoints

Build API endpoints and middleware in Astro for GET/POST handlers and server-side request processing

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "astro-server-endpoints",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### astro-ssr-hybrid

Configure SSR and hybrid rendering with output modes, adapters, and per-page prerender control

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "astro-ssr-hybrid",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### astro-view-transitions

Implement smooth page transitions and persistent islands using Astro View Transitions API

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "astro-view-transitions",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### audit-brand-compliance

Rule-based brand-semantics audit. Detects token misuse (BRAND-T001 via $extensions.harness.brand.forbidden_contexts) and voice violations (BRAND-V001 via DESIGN.md voice.forbidden_phrases). 4th composed verifier in harness check-design. Triggers extraction of the formal verifier interface.

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "constructive-architect",
  "dependsOn": [
    "detect-design-drift",
    "harness-design"
  ],
  "name": "audit-brand-compliance",
  "platforms": [
    "claude-code"
  ],
  "tier": 2,
  "triggers": [
    "manual",
    "on_pr",
    "on_new_feature"
  ],
  "type": "rigid"
}
```

### audit-component-anatomy

Audit component definitions for missing required anatomy parts (slots, states, sizes) and detect missing-anatomy-component patterns (data without empty states, async without loading boundaries). First programmatic enforcer of component-anatomy rules.

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "constructive-architect",
  "dependsOn": [
    "design-component-anatomy",
    "harness-accessibility"
  ],
  "name": "audit-component-anatomy",
  "platforms": [
    "claude-code"
  ],
  "tier": 2,
  "triggers": [
    "manual",
    "on_new_feature"
  ],
  "type": "rigid"
}
```

### bug-fleet

Proactive undiscovered-bug hunt across the standing codebase — rank the codebase into disjoint risk-ordered areas by composing the existing detection analyses, confirm the batch once, fan out worktree-isolated subagents that each run the real per-area hunt (review machinery, adversarial refutation, a tdd-authored reproducing test, tracker cross-check, classification, debugging-driven fix), independently verify every item by pipeline-provenance artifact plus a re-run reproducing test at the pinned base SHA plus all-OS CI, and hand back a tiered batch of fix PRs and filed issues. No reproduction, no bug. Never auto-merges.

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "systematic-orchestrator",
  "dependsOn": [
    "harness-hotspot-detector",
    "harness-impact-analysis",
    "harness-test-advisor",
    "harness-code-review",
    "harness-security-review",
    "harness-tdd",
    "harness-debugging",
    "harness-roadmap-pilot"
  ],
  "name": "bug-fleet",
  "platforms": [
    "claude-code",
    "codex",
    "cursor",
    "gemini-cli"
  ],
  "tier": 2,
  "triggers": [
    "manual"
  ],
  "type": "rigid"
}
```

### burn-hud

Install, calibrate, verify and diagnose a local Claude Code usage-pace HUD that cannot fail green

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "constructive-architect",
  "dependsOn": [],
  "name": "burn-hud",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "codex",
    "cursor"
  ],
  "tier": 2,
  "triggers": [
    "manual"
  ],
  "type": "rigid"
}
```

### check-mechanical-constraints

Run all mechanical constraint checks (context validation + architecture)

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "meticulous-verifier",
  "dependsOn": [
    "validate-context-engineering",
    "enforce-architecture"
  ],
  "name": "check-mechanical-constraints",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual",
    "on_pr"
  ],
  "type": "rigid"
}
```

### cicd-fleet

Autonomous CI/CD-remediation orchestrator — triage the red CI/CD-run and flaky-test backlog by cause, fan out worktree-isolated subagents that run the real deflake/heal pipeline, independently verify each fix by artifact and deterministic all-OS CI, and hand back a batch of remediation PRs for one bulk human review. Never auto-merges and never hides a failure to clear the board.

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "systematic-orchestrator",
  "dependsOn": [
    "harness-roadmap-pilot",
    "harness-debugging",
    "harness-workflow-audit"
  ],
  "name": "cicd-fleet",
  "platforms": [
    "claude-code",
    "codex",
    "cursor",
    "gemini-cli"
  ],
  "tier": 2,
  "triggers": [
    "manual"
  ],
  "type": "rigid"
}
```

### cleanup-dead-code

Detect and auto-fix dead code including dead exports, commented-out code, and orphaned dependencies

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "diagnostic-investigator",
  "dependsOn": [],
  "name": "cleanup-dead-code",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 2,
  "triggers": [
    "manual"
  ],
  "type": "flexible"
}
```

### cleanup-fleet

Autonomous entropy/hotspot remediation sweep — enumerate the entropy/hotspot backlog by composing the existing detection skills, rank the targets, confirm the batch once, fan out worktree-isolated subagents that each run the real per-target cleanup pipeline, independently verify each result by convergence artifact and all-OS CI, and hand back a batch of scoped cleanup PRs for one bulk human review. Never auto-merges.

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "systematic-orchestrator",
  "dependsOn": [
    "harness-hotspot-detector",
    "cleanup-dead-code",
    "harness-dependency-health",
    "harness-codebase-cleanup",
    "harness-roadmap-pilot"
  ],
  "name": "cleanup-fleet",
  "platforms": [
    "claude-code",
    "codex",
    "cursor",
    "gemini-cli"
  ],
  "tier": 2,
  "triggers": [
    "manual"
  ],
  "type": "rigid"
}
```

### cli-ergonomics-craft

LLM-judgment critique of command-line ergonomics quality — the ceiling counterpart to mechanical CLI checks, and the one craft skill with no rule-based floor twin. Asks whether command and flag names are predictable and consistent, whether help text is task-oriented, whether errors are actionable, whether defaults are sane and safe, whether output is scannable and terminal-aware, whether the CLI composes (pipeable, machine-readable, honest exit codes), and whether destructive actions are guarded. Structural twin of harness-docs-craft.

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "constructive-architect",
  "dependsOn": [
    "docs-craft"
  ],
  "name": "cli-ergonomics-craft",
  "platforms": [
    "claude-code"
  ],
  "tier": 2,
  "triggers": [
    "manual",
    "on_pr",
    "on_new_feature"
  ],
  "type": "rigid"
}
```

### code-craft

LLM-judgment critique of code quality / readability (TS/JS source) — the ceiling counterpart to the rule-based code floor (entropy-cleaner for dead code / drift, enforce-architecture for boundaries + deps, complexity thresholds). Asks whether the code reveals intent and reads in the domain's language, whether the control flow is honest, whether a function tells one story at one altitude, whether each abstraction earns its keep, whether it is as simple as it could be, whether the signature keeps its promise, and whether a senior would nod or wince. Per-unit critique of functions, methods, and classes; identifier-level naming is delegated to naming-craft. Structural twin of harness-security-craft.

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "constructive-architect",
  "dependsOn": [
    "cleanup-dead-code",
    "enforce-architecture",
    "naming-craft"
  ],
  "name": "code-craft",
  "platforms": [
    "claude-code"
  ],
  "tier": 2,
  "triggers": [
    "manual",
    "on_pr",
    "on_new_feature"
  ],
  "type": "rigid"
}
```

### copy-craft

LLM-judgment critique of prose-in-code across six surfaces (error messages, log lines, CLI output, commit subjects, PR descriptions, code comments). Third craft-pipeline ceiling skill; primary domain is error messages (universally bad). Graceful degradation when git/gh prerequisites are absent.

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "constructive-architect",
  "dependsOn": [
    "harness-design-craft",
    "naming-craft"
  ],
  "name": "copy-craft",
  "platforms": [
    "claude-code"
  ],
  "tier": 2,
  "triggers": [
    "manual",
    "on_pr",
    "on_new_feature"
  ],
  "type": "rigid"
}
```

### craft-fleet

Ceiling-raising code-quality elevation sweep — compose the eleven craft skills into ranked (scope, domain) targets, drop the noise floor, route each finding elevate/file/route by a mechanical boundary, confirm one batch with a taste-calibration sample of verbatim findings, fan out worktree-isolated subagents that each run the real harness-refactoring pipeline over one target's cited findings, then independently verify every item by critique provenance plus the step-granular refactoring commit trail plus a two-run re-critique that proves net improvement, and hand back a tiered batch of elevation PRs and filed roadmap items. No cited finding, no rewrite. Never auto-merges.

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "systematic-orchestrator",
  "dependsOn": [
    "naming-craft",
    "code-craft",
    "copy-craft",
    "test-craft",
    "docs-craft",
    "knowledge-craft",
    "spec-craft",
    "api-craft",
    "cli-ergonomics-craft",
    "security-craft",
    "harness-design-craft",
    "harness-refactoring",
    "harness-roadmap-pilot"
  ],
  "name": "craft-fleet",
  "platforms": [
    "claude-code",
    "codex",
    "cursor",
    "gemini-cli"
  ],
  "tier": 2,
  "triggers": [
    "manual"
  ],
  "type": "rigid"
}
```

### css-animation-pattern

Create performant CSS animations with Tailwind transitions and keyframe utilities

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "css-animation-pattern",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### css-component-variants

Build type-safe component variants with cva (class-variance-authority)

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "css-component-variants",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### css-css-modules

Scope CSS to components with CSS Modules for collision-free class names

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "css-css-modules",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### css-custom-components

Build reusable styled components with Tailwind patterns and prop-driven APIs

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "css-custom-components",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### css-dark-mode

Implement dark mode with Tailwind's dark variant and CSS custom properties

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "css-dark-mode",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### css-design-tokens

Define and manage design tokens for colors, spacing, and typography in Tailwind

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "css-design-tokens",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### css-headless-ui

Style accessible headless components from Radix UI and Headless UI with Tailwind

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "css-headless-ui",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### css-layout-patterns

Build common layouts with Tailwind flexbox and grid utilities

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "css-layout-patterns",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### css-performance-patterns

Optimize CSS performance with content-visibility, containment, and render-efficient patterns

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "css-performance-patterns",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### css-responsive-design

Build responsive layouts with Tailwind breakpoints and container queries

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "css-responsive-design",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### css-tailwind-merge

Resolve Tailwind class conflicts with tailwind-merge for safe className composition

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "css-tailwind-merge",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### css-tailwind-pattern

Apply Tailwind CSS utility-first patterns for consistent, maintainable styling

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "css-tailwind-pattern",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### db-acid-in-practice

WAL, fsync, crash recovery, and durability guarantees across database engines

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "db-acid-in-practice",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### db-acid-properties

Atomicity, consistency, isolation, and durability -- practical implications and failure modes

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "db-acid-properties",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### db-adjacency-list

Parent-child hierarchies via self-referencing foreign key, recursive CTEs, and depth queries

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "db-adjacency-list",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### db-audit-trail

Change tracking via triggers or application-level logging with immutable append-only audit logs

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "db-audit-trail",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### db-btree-index

B-tree index structure, range queries, ordering, and default index type behavior

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "db-btree-index",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### db-cap-theorem

Consistency, availability, partition tolerance -- practical meaning and common misunderstandings

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "db-cap-theorem",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### db-closure-table

Ancestor-descendant pair table for fast path queries and flexible hierarchy operations

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "db-closure-table",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### db-composite-index

Multi-column indexes, column ordering strategy, and the leftmost prefix rule

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "db-composite-index",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### db-connection-pooling

PgBouncer configuration, pool modes (session/transaction/statement), and sizing formulas

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "db-connection-pooling",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### db-connection-sizing

max_connections tuning, per-connection memory overhead, and serverless pool constraints

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "db-connection-sizing",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### db-covering-index

Index-only scans using INCLUDE columns to avoid heap table lookups

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "db-covering-index",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### db-deadlock-prevention

Lock ordering, timeout strategies, deadlock detection, and resolution patterns

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "db-deadlock-prevention",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### db-denormalization

When and how to intentionally denormalize for performance, read-heavy patterns, and materialized views

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "db-denormalization",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### db-document-in-relational

JSONB columns for semi-structured data -- when to embed vs normalize, indexing JSON, and hybrid modeling

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "db-document-in-relational",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### db-entity-attribute-value

EAV pattern for dynamic attributes -- when justified, why usually avoided, and alternatives

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "db-entity-attribute-value",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### db-eventual-consistency

BASE properties, convergence strategies, and conflict resolution patterns for eventually consistent systems

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "db-eventual-consistency",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### db-expand-contract

Add new, migrate data, remove old -- safe column and table renames using expand-contract

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "db-expand-contract",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### db-explain-reading

Reading EXPLAIN and EXPLAIN ANALYZE output, understanding cost estimation, and comparing actual vs estimated rows

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "db-explain-reading",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### db-expression-index

Indexes on computed expressions, functional indexes, and specialized index types (GIN, GiST)

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "db-expression-index",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### db-first-normal-form

Atomic values, no repeating groups, and primary key requirement for First Normal Form (1NF)

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "db-first-normal-form",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### db-graph-in-relational

Modeling graph relationships in SQL with recursive queries and knowing when to use a graph DB instead

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "db-graph-in-relational",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### db-hash-index

Hash indexes for equality-only lookups and when to prefer them over B-tree

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "db-hash-index",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### db-hierarchical-data

Comparison of adjacency list, nested sets, closure table, and materialized path -- a selection guide

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "db-hierarchical-data",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### db-horizontal-sharding

Shard key selection, cross-shard queries, resharding strategies, and consistent hashing

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "db-horizontal-sharding",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### db-isolation-levels

Read uncommitted through serializable -- PostgreSQL's MVCC-based isolation implementation

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "db-isolation-levels",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### db-isolation-selection

Choosing isolation levels for specific workloads -- performance vs correctness trade-offs

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "db-isolation-selection",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### db-migration-rollback

Forward-only vs reversible migrations, data backfill safety, and blue-green schema strategies

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "db-migration-rollback",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### db-mvcc

Multi-version concurrency control, snapshot isolation, tuple visibility, and vacuum/bloat management

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "db-mvcc",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### db-nested-sets

Left/right numbering for hierarchies -- fast reads, expensive writes, and when to use

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "db-nested-sets",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### db-optimistic-locking

Version columns, conditional updates, conflict detection and retry patterns for optimistic concurrency control

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "db-optimistic-locking",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### db-partial-index

Filtered indexes with WHERE clauses to reduce index size and target specific query patterns

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "db-partial-index",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### db-pessimistic-locking

SELECT FOR UPDATE, lock granularity, lock duration, and row-level locking strategies

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "db-pessimistic-locking",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### db-polymorphic-associations

Single-table inheritance, class-table inheritance, and shared foreign key patterns for polymorphic data

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "db-polymorphic-associations",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### db-query-rewriting

Rewriting queries for planner efficiency -- CTEs vs subqueries, EXISTS vs IN, and sargable predicates

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "db-query-rewriting",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### db-query-statistics

pg_stats, histogram bounds, selectivity estimation, and the ANALYZE command

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "db-query-statistics",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### db-read-phenomena

Dirty reads, non-repeatable reads, phantom reads, and serialization anomalies explained with concrete examples

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "db-read-phenomena",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### db-scan-types

Sequential scan, index scan, bitmap scan, and index-only scan -- when the planner chooses each

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "db-scan-types",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### db-second-normal-form

Full functional dependency and eliminating partial dependencies for Second Normal Form (2NF)

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "db-second-normal-form",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### db-table-partitioning

Range, list, and hash partitioning -- declarative partitioning, partition pruning, and maintenance

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "db-table-partitioning",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### db-temporal-data

Valid-time, transaction-time, and bitemporal tables for tracking data as it changes over time

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "db-temporal-data",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### db-third-normal-form

Eliminating transitive dependencies and knowing when 3NF is sufficient for Third Normal Form (3NF)

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "db-third-normal-form",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### db-time-series

Append-only tables, time-based partitioning, retention policies, and TimescaleDB patterns

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "db-time-series",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### db-vertical-partitioning

Table splitting, hot/cold data separation, TOAST management, and large object strategies

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "db-vertical-partitioning",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### db-zero-downtime-migration

Online schema changes without downtime -- avoiding locks, pg_repack, and gh-ost patterns

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "db-zero-downtime-migration",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### design-affordances

Perceived actionability — signifiers, constraints, mappings (Don Norman), flat design's affordance problem, touch targets, hover states as affordance

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "design-affordances",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### design-alignment

Visual order — edge, center, optical vs. mathematical alignment, alignment as invisible structure

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "design-alignment",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### design-apple-hig

Apple Human Interface Guidelines covering clarity/deference/depth, vibrancy and materials, SF Symbols, semantic colors, safe areas, and platform-specific navigation

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "design-apple-hig",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### design-atomic-design

Composition methodology for building design systems using atoms, molecules, organisms, templates, and pages

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "design-atomic-design",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### design-brand-consistency

Visual coherence — brand attributes to design decisions, voice to visual mapping, consistency vs monotony, brand flex zones, multi-platform coherence

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "design-brand-consistency",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### design-color-accessibility

Color independence — conveying information without color alone, colorblind-safe palettes, perceptual uniformity

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "design-color-accessibility",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### design-color-harmony

Color wheel relationships — complementary, analogous, triadic, split-complementary, tetradic schemes

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "design-color-harmony",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### design-color-psychology

Emotional and cultural color associations — warmth/coolness, trust, urgency, industry conventions

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "design-color-psychology",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### design-component-anatomy

Anatomy of reusable components covering slots, variants, states, sizes, composition patterns, and compound components

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "design-component-anatomy",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### design-consistency

Internal vs. external consistency — consistent patterns within a product, platform convention adherence, and when to break consistency deliberately

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "design-consistency",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### design-content-density

Information density tradeoffs — compact vs. comfortable vs. spacious, data-dense vs. marketing

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "design-content-density",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### design-contrast-ratio

Luminance contrast for readability and visual weight — WCAG ratios, contrast as hierarchy tool

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "design-contrast-ratio",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### design-dark-mode-color

Color adaptation for dark themes — inverted hierarchy, reduced saturation, elevation through lightness

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "design-dark-mode-color",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### design-data-viz-design

Data visualization principles — chart selection, color encoding, annotation, Tufte's data-ink ratio, accessible charts, avoiding chartjunk, small multiples

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "design-data-viz-design",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### design-design-audit

Evaluating existing design — heuristic evaluation, consistency inventory, accessibility audit, competitive analysis, identifying design debt

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "design-design-audit",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### design-design-critique

Structured feedback — critique frameworks (like/wish/wonder, what/why/improve), separating subjective preference from objective assessment

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "design-design-critique",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### design-design-documentation

Documenting design decisions — design rationale, spec handoff, annotating designs, living documentation, decision logs, the DESIGN.md format

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "design-design-documentation",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### design-design-governance

Living system maintenance covering contribution models, deprecation, versioning, adoption metrics, and documentation standards

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "design-design-governance",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### design-elevation-shadow

Depth as information — shadow anatomy (offset, blur, spread, color), elevation scale, chromatic shadows, material metaphor, dark mode shadows

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "design-elevation-shadow",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### design-empty-error-states

Empty and error state design — empty states as onboarding, error states as recovery, 404 pages, zero-data states, degraded states, constructive error messages

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "design-empty-error-states",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### design-feedback-patterns

System response design — immediate vs delayed feedback, optimistic updates, progress indicators, confirmation patterns, undo vs confirm, toast/snackbar/banner

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "design-feedback-patterns",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### design-fluent-design

Microsoft Fluent 2 design system covering light/depth/motion/material/scale, acrylic material, reveal highlight, connected animations, responsive containers, and token theming

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "design-fluent-design",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### design-font-pairing

Combining typefaces — contrast principles, superfamilies, serif+sans rules, limiting to 2-3 families

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "design-font-pairing",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### design-form-ux

Form design beyond labels — progressive disclosure, inline validation timing, smart defaults, forgiving formats, single-column superiority, error recovery

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "design-form-ux",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### design-gestalt-closure-continuity

Pattern completion — the brain fills gaps in incomplete shapes (closure) and follows smooth paths over abrupt changes (continuity), implications for icons, progress indicators, and visual flow

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "design-gestalt-closure-continuity",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### design-gestalt-common-fate

Motion grouping — elements that move or change together are perceived as a unit, implications for animation, loading states, and batch operations

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "design-gestalt-common-fate",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### design-gestalt-figure-ground

Depth perception — distinguishing foreground from background, ambiguous figure-ground as design tool, z-axis ordering, overlay and modal perception

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "design-gestalt-figure-ground",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### design-gestalt-proximity

Spatial grouping — elements near each other perceived as related, controlling group membership through distance, common region as proximity amplifier

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "design-gestalt-proximity",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### design-gestalt-similarity

Visual kinship — elements sharing color, size, shape, or texture perceived as related, creating categories without explicit labels

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "design-gestalt-similarity",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### design-grid-systems

Grid theory — column, modular, baseline, compound grids, breaking the grid intentionally

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "design-grid-systems",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### design-i18n-design

Designing for internationalization — text expansion, RTL layout, icon cultural sensitivity, date/number/currency formatting, pseudolocalization

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "design-i18n-design",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### design-iconography

Icon design principles — optical sizing, stroke consistency, pixel grid alignment, metaphor clarity, icon families, filled vs outlined, icon as language

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "design-iconography",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### design-illustration-style

Illustration system — style consistency, spot vs hero illustrations, illustration as brand voice, abstract vs representational, illustration tokens

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "design-illustration-style",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### design-imagery-photography

Image in design — art direction, aspect ratios, focal point, image treatments (duotone, overlay, blur), placeholder strategy, image as hero vs supporting

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "design-imagery-photography",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### design-information-architecture

Structuring information — card sorting, tree testing, mental models, labeling systems, organization schemes, findability

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "design-information-architecture",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### design-loading-patterns

Perceived performance — skeleton screens, progressive loading, optimistic rendering, shimmer effects, content-first loading, perceived vs actual speed

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "design-loading-patterns",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### design-material-design-3

Google Material You design language covering dynamic color, tonal palettes, elevation with tonal surface color, shape theming, and motion choreography

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "design-material-design-3",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### design-micro-interactions

Small moments that delight — trigger, rules, feedback, loops/modes (Dan Saffer's framework), when micro-interactions aid usability vs decoration

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "design-micro-interactions",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### design-motion-principles

Purposeful animation — Disney's 12 principles adapted for UI, easing curves, duration guidelines, choreography, motion as feedback vs decoration, reducing motion

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "design-motion-principles",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### design-naming-conventions

Design system nomenclature for semantic and descriptive names, color naming, size naming, and cross-discipline vocabulary

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "design-naming-conventions",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### design-navigation-ux

Wayfinding — navigation models (hub-spoke, hierarchy, flat, content-driven), persistent vs contextual nav, breadcrumbs, information scent

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "design-navigation-ux",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### design-palette-construction

Building functional palettes — primary/secondary/accent, neutral scales, semantic colors, tint/shade generation

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "design-palette-construction",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### design-parallax-scroll

Scroll-driven depth — rate-differential parallax, scroll-triggered reveals, sticky sections, scroll narrative, performance constraints, motion sensitivity

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "design-parallax-scroll",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### design-readability

Optimizing for reading — line length, leading, paragraph spacing, alignment, F-pattern/Z-pattern

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "design-readability",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### design-responsive-strategy

Responsive as design decision — content priority, progressive disclosure, design-first breakpoints

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "design-responsive-strategy",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### design-responsive-type

Type across viewports — fluid typography (clamp), viewport scaling, minimum sizes, maintaining hierarchy

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "design-responsive-type",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### design-state-design

UI state inventory — empty, loading, partial, error, success, offline, disabled, read-only, and how each state communicates system status

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "design-state-design",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### design-token-architecture

Token taxonomy covering primitive, semantic, and component tokens with naming conventions, aliasing, and theme switching

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "design-token-architecture",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### design-transitions-timing

Temporal design — enter/exit asymmetry, stagger patterns, easing functions (ease-out for enter, ease-in for exit), duration by element size, interruptibility

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "design-transitions-timing",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### design-type-scale

Mathematical type scales — modular, major third, perfect fourth, golden ratio, custom scales

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "design-type-scale",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### design-typographic-hierarchy

Reading order through type — size, weight, color, spacing, case, and position as hierarchy signals

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "design-typographic-hierarchy",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### design-typography-fundamentals

Anatomy of type — x-height, ascenders, counters, serifs, stroke contrast, optical sizing

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "design-typography-fundamentals",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### design-visual-hierarchy

Directing attention — size, color, contrast, position, isolation, motion as hierarchy tools

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "design-visual-hierarchy",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### design-web-fonts

Font loading strategy — performance vs. FOUT/FOIT, variable fonts, subsetting, system font stacks

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "design-web-fonts",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### design-whitespace

Space as design element — macro vs. micro, breathing room, density control, whitespace as luxury signal

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "design-whitespace",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### detect-design-drift

Detect design-system drift — hardcoded values where tokens exist and raw HTML primitives where registered components exist. Reports only; never modifies source. Floor-layer rule-based verifier composed by harness check-design.

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "constructive-architect",
  "dependsOn": [
    "audit-component-anatomy",
    "harness-design-craft"
  ],
  "name": "detect-design-drift",
  "platforms": [
    "claude-code"
  ],
  "tier": 2,
  "triggers": [
    "manual",
    "on_pr",
    "on_new_feature"
  ],
  "type": "rigid"
}
```

### detect-doc-drift

Detect documentation that has drifted from code

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "diagnostic-investigator",
  "dependsOn": [],
  "name": "detect-doc-drift",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 2,
  "triggers": [
    "manual",
    "on_pr"
  ],
  "type": "flexible"
}
```

### docs-craft

LLM-judgment critique of documentation quality — the ceiling counterpart to the rule-based doc floor (detect-doc-drift / check-docs / docs-pipeline, which enforce existence, link freshness, coverage). Asks whether a doc teaches, whether the order matches the reader's mental model, whether examples earn their place, whether the prose is alive, whether an API doc predicts the response shape, and whether a stranger walks away with the same understanding. Structural twin of harness-design-craft.

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "constructive-architect",
  "dependsOn": [
    "harness-docs-pipeline",
    "harness-design-craft"
  ],
  "name": "docs-craft",
  "platforms": [
    "claude-code"
  ],
  "tier": 2,
  "triggers": [
    "manual",
    "on_pr",
    "on_new_feature",
    "on_doc_check"
  ],
  "type": "rigid"
}
```

### drizzle-filtering-pattern

Filter Drizzle queries with eq(), and(), or(), between(), sql template tag, and custom conditions

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "drizzle-filtering-pattern",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### drizzle-migrations

Manage Drizzle schema evolution with drizzle-kit generate/push/migrate and introspect

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "drizzle-migrations",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### drizzle-performance-patterns

Optimize Drizzle queries with prepared statements, db.batch(), explain analysis, and join-based N+1 avoidance

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "drizzle-performance-patterns",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### drizzle-query-builder

Compose type-safe SQL with Drizzle's fluent query builder for select, insert, update, and delete

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "drizzle-query-builder",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### drizzle-raw-sql

Execute raw SQL safely in Drizzle with the sql template tag, db.execute(), and placeholder()

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "drizzle-raw-sql",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### drizzle-relations-pattern

Define Drizzle relations with relations(), one(), many(), references(), and inferred types

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "drizzle-relations-pattern",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### drizzle-schema-definition

Define Drizzle ORM schemas with pgTable/mysqlTable/sqliteTable, column types, indexes, and constraints

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "drizzle-schema-definition",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### drizzle-transactions

Execute atomic Drizzle operations with db.transaction(), nested transactions, and rollback semantics

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "drizzle-transactions",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### drizzle-with-nextjs

Integrate Drizzle with Next.js using Neon/Vercel Postgres, edge runtime, and connection pooling

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "drizzle-with-nextjs",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### enforce-architecture

Validate architectural layer boundaries, detect violations, and auto-fix import ordering and forbidden import replacement

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "meticulous-verifier",
  "dependsOn": [],
  "name": "enforce-architecture",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 2,
  "triggers": [
    "manual",
    "on_pr",
    "on_commit"
  ],
  "type": "rigid"
}
```

### events-event-schema

Define and evolve event schemas using a schema registry with Avro, Protobuf, or JSON Schema

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "events-event-schema",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### events-event-storming

Run event storming workshops to discover domain events, commands, and bounded contexts

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "events-event-storming",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### events-idempotency

Handle duplicate message delivery safely using idempotency keys and deduplication stores

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "events-idempotency",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### events-kafka-patterns

Produce and consume Kafka messages with partitioning, consumer groups, and offset management

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "events-kafka-patterns",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### events-message-queue

Use message queues for reliable async delivery with competing consumers and dead letter queues

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "events-message-queue",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### events-outbox-pattern

Reliably publish domain events using the transactional outbox and CDC polling approach

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "events-outbox-pattern",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### events-pubsub-pattern

Implement publisher-subscriber communication with topic-based routing and fan-out delivery

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "events-pubsub-pattern",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### events-redis-pubsub

Use Redis pub/sub channels and keyspace notifications for lightweight real-time messaging

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "events-redis-pubsub",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### events-saga-choreography

Coordinate distributed workflows through event chains and compensation events without an orchestrator

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "events-saga-choreography",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### events-sse-pattern

Stream one-way server events to browsers using Server-Sent Events and EventSource

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "events-sse-pattern",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### events-webhooks-pattern

Implement reliable webhook delivery with retry backoff, signature verification, and queuing

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "events-webhooks-pattern",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### events-websocket-pattern

Implement bidirectional real-time communication using WebSocket protocol and Socket.io

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "events-websocket-pattern",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### fleet-command

Conductor for the fleet family — one tier above the members, coordinating the fleets themselves rather than fanning out over an item queue. Probes each installed fleet's queue through that member's gate-free path only, derives the run as a hybrid dependency DAG (a CI trust gate first, then ideation, then intake with the independent quality sweeps parallel alongside, then decide, build, and the land stage terminal), and enforces one global leaf-slot budget across every fleet in flight instead of additive per-fleet governors by dispatching every lane with its allocated --concurrency, never more than 2 of the pool. The CI wave is a trust gate rather than a repair — the CI member hands back unmerged remediation PRs, so an untrustworthy signal is surfaced at CONFIRM as a fork with a recommended default and any run taken under it has its downstream verdicts labelled degraded. Serializes the lanes whose emissions collide, plans a merge order for the ones that only conflict on generated artifacts, presents each ready fleet's own human CONFIRM verbatim in one batched round per wave without ever answering it, verifies every lane from its emitted artifacts rather than its self-report, and hands back one consolidated report. Never merges.

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "systematic-orchestrator",
  "dependsOn": [
    "ideate-fleet",
    "issue-fleet",
    "adr-fleet",
    "roadmap-fleet",
    "pr-fleet",
    "cicd-fleet",
    "test-fleet",
    "security-fleet",
    "cleanup-fleet",
    "bug-fleet",
    "craft-fleet"
  ],
  "name": "fleet-command",
  "platforms": [
    "claude-code",
    "codex",
    "cursor",
    "gemini-cli"
  ],
  "tier": 2,
  "triggers": [
    "manual"
  ],
  "type": "rigid"
}
```

### gof-abstract-factory

Create families of related objects through factory interfaces without coupling to concrete types

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "gof-abstract-factory",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### gof-adapter-pattern

Wrap incompatible interfaces to make them work together without modifying source code

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "gof-adapter-pattern",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### gof-bridge-pattern

Separate abstraction from implementation to allow them to vary independently

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "gof-bridge-pattern",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### gof-builder-pattern

Construct complex objects step-by-step using fluent builders and director classes

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "gof-builder-pattern",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### gof-chain-of-responsibility

Pass requests along a handler chain with short-circuit and async chain support

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "gof-chain-of-responsibility",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### gof-command-pattern

Encapsulate operations as command objects to support undo, redo, and command queuing

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "gof-command-pattern",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### gof-composite-pattern

Compose objects into tree structures and treat individual and composite objects uniformly

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "gof-composite-pattern",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### gof-decorator-pattern

Attach additional behavior to objects at runtime by wrapping them in decorator objects

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "gof-decorator-pattern",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### gof-facade-pattern

Provide a simplified interface to a complex subsystem to reduce coupling for clients

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "gof-facade-pattern",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### gof-factory-method

Define a factory interface that subclasses use to decide which object to instantiate

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "gof-factory-method",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### gof-flyweight-pattern

Share fine-grained objects to reduce memory usage by separating intrinsic and extrinsic state

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "gof-flyweight-pattern",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### gof-iterator-pattern

Traverse collections with Symbol.iterator and generators for lazy, composable sequences

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "gof-iterator-pattern",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### gof-mediator-pattern

Decouple components by routing communication through a central mediator or event bus

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "gof-mediator-pattern",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### gof-memento-pattern

Capture and restore object state using mementos for undo history and time-travel

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "gof-memento-pattern",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### gof-null-object

Eliminate null checks by providing default no-op implementations of interfaces

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "gof-null-object",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### gof-observer-pattern

Implement push-based notification between Subject and Observer with typed subscriptions

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "gof-observer-pattern",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### gof-prototype-pattern

Clone objects using prototype registry and structured clone for deep copy scenarios

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "gof-prototype-pattern",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### gof-proxy-pattern

Control access to an object using virtual, protection, logging, and caching proxy patterns

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "gof-proxy-pattern",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### gof-singleton

Ensure a class has exactly one instance using module-level singletons and WeakRef patterns

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "gof-singleton",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### gof-state-pattern

Replace conditional logic with state objects that delegate behavior to the current state

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "gof-state-pattern",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### gof-strategy-pattern

Encapsulate interchangeable algorithms behind a common interface for runtime selection

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "gof-strategy-pattern",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### gof-template-method

Define an algorithm skeleton in a base class with abstract steps filled by subclasses

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "gof-template-method",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### gof-visitor-pattern

Add operations to object structures without modifying them using double dispatch

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "gof-visitor-pattern",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### graphql-apollo-server

Configure and run Apollo Server with plugins, context, and data sources

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "graphql-apollo-server",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### graphql-auth-patterns

Implement authentication and authorization in GraphQL with directives, middleware, and field-level guards

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "graphql-auth-patterns",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### graphql-client-patterns

Structure GraphQL client code with fragments, cache policies, and optimistic updates

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "graphql-client-patterns",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### graphql-codegen-pattern

Generate type-safe code from GraphQL schemas and operations using GraphQL Code Generator

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "graphql-codegen-pattern",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### graphql-dataloader-pattern

Batch and cache data fetches to eliminate N+1 queries in GraphQL resolvers

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "graphql-dataloader-pattern",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### graphql-error-handling

Handle errors in GraphQL with structured error types, union results, and formatError

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "graphql-error-handling",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### graphql-federation-pattern

Compose a unified GraphQL API from independently deployed subgraph services

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "graphql-federation-pattern",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### graphql-pagination-patterns

Implement cursor-based and offset pagination in GraphQL using the connection spec

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "graphql-pagination-patterns",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### graphql-performance-patterns

Optimize GraphQL API performance with query complexity limits, caching, and persisted queries

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "graphql-performance-patterns",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### graphql-resolver-pattern

Implement resolvers with clean separation between data fetching and business logic

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "graphql-resolver-pattern",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### graphql-schema-design

Design expressive, evolvable GraphQL schemas with clear type hierarchies

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "graphql-schema-design",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### graphql-subscriptions

Implement real-time data streaming with GraphQL subscriptions over WebSocket

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "graphql-subscriptions",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### harness-accessibility

WCAG accessibility scanning, contrast checking, ARIA validation, and remediation

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "meticulous-verifier",
  "dependsOn": [
    "harness-design-system"
  ],
  "name": "harness-accessibility",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual",
    "on_new_feature",
    "on_project_init"
  ],
  "type": "rigid"
}
```

### harness-api-design

REST, GraphQL, gRPC API design with OpenAPI specs and versioning strategies

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "harness-api-design",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual",
    "on_new_feature"
  ],
  "type": "rigid"
}
```

### harness-architecture-advisor

Interactive architecture advisor that surfaces trade-offs and helps humans choose

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "harness-architecture-advisor",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 2,
  "triggers": [
    "manual",
    "on_new_feature"
  ],
  "type": "flexible"
}
```

### harness-audit

Cross-dimensional codebase audit orchestrator — classify repo shape, fan out parallel read-only audit agents, dedup and severity-rank findings against existing issues, publish grouped tracking issues

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "systematic-orchestrator",
  "dependsOn": [
    "harness-code-review",
    "harness-security-scan",
    "detect-doc-drift",
    "harness-dependency-health",
    "harness-hotspot-detector",
    "harness-test-advisor"
  ],
  "name": "harness-audit",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 2,
  "triggers": [
    "manual"
  ],
  "type": "rigid"
}
```

### harness-audit-harness-strength

Mechanically audit a project's own harness setup against the seven STRENGTH failure patterns; reports per-pattern findings, a 0-100 strength score, and a tier label (solid/at-risk/theatre). Orchestrates harness check-harness-strength; never reimplements detection.

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "constructive-architect",
  "dependsOn": [],
  "name": "harness-audit-harness-strength",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 2,
  "triggers": [
    "manual",
    "on_milestone"
  ],
  "type": "rigid"
}
```

### harness-auth

OAuth2, JWT, RBAC/ABAC, session management, and MFA patterns

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "harness-auth",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual",
    "on_new_feature",
    "on_pr"
  ],
  "type": "rigid"
}
```

### harness-autopilot

Autonomous phase execution loop — chains planning, execution, verification, and review, pausing only at human decision points

**Contract:**

```json
{
  "catalogTier": 0,
  "cognitiveMode": "constructive-architect",
  "dependsOn": [
    "harness-planning",
    "harness-execution",
    "harness-verification",
    "harness-code-review"
  ],
  "name": "harness-autopilot",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 1,
  "triggers": [
    "manual"
  ],
  "type": "rigid"
}
```

### harness-brainstorming

Structured ideation and exploration with harness methodology

**Contract:**

```json
{
  "catalogTier": 0,
  "cognitiveMode": "constructive-architect",
  "dependsOn": [
    "harness-planning",
    "harness-autopilot",
    "harness-soundness-review"
  ],
  "name": "harness-brainstorming",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 1,
  "triggers": [
    "manual",
    "on_new_feature"
  ],
  "type": "rigid"
}
```

### harness-caching

Cache strategies, invalidation patterns, and distributed caching

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "harness-caching",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual",
    "on_new_feature"
  ],
  "type": "rigid"
}
```

### harness-catalog-retrospective

Monthly retrospective over skill-adoption telemetry — ranks most-invoked, failing, and abandoned-mid-workflow skills, flags stale ones, and reports catalog telemetry coverage

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "analytical-reporter",
  "dependsOn": [],
  "name": "harness-catalog-retrospective",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 2,
  "triggers": [
    "manual",
    "on_milestone"
  ],
  "type": "rigid"
}
```

### harness-chaos

Chaos engineering, fault injection, and resilience validation

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "adversarial-reviewer",
  "dependsOn": [],
  "name": "harness-chaos",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual",
    "on_milestone"
  ],
  "type": "rigid"
}
```

### harness-code-review

Multi-phase code review pipeline with mechanical checks, graph-scoped context, and parallel review agents

**Contract:**

```json
{
  "catalogTier": 0,
  "cognitiveMode": "adversarial-reviewer",
  "dependsOn": [],
  "name": "harness-code-review",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 2,
  "triggers": [
    "manual",
    "on_pr",
    "on_review"
  ],
  "type": "rigid"
}
```

### harness-codebase-cleanup

Orchestrate dead code removal and architecture violation fixes with shared convergence loop

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "systematic-orchestrator",
  "dependsOn": [
    "cleanup-dead-code",
    "enforce-architecture",
    "harness-hotspot-detector"
  ],
  "name": "harness-codebase-cleanup",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 2,
  "triggers": [
    "manual"
  ],
  "type": "flexible"
}
```

### harness-compliance

SOC2, HIPAA, GDPR compliance checks, audit trails, and regulatory checklists

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "meticulous-verifier",
  "dependsOn": [],
  "name": "harness-compliance",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual",
    "on_milestone",
    "on_pr"
  ],
  "type": "rigid"
}
```

### harness-compound

5-phase post-mortem capture. Writes a structured solution doc at docs/solutions/{track}/{category}/{slug}.md with frontmatter, overlap-detection, and per-category lock for concurrency safety.

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "reflective-historian",
  "dependsOn": [],
  "name": "harness-compound",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 2,
  "triggers": [
    "manual"
  ],
  "type": "rigid"
}
```

### harness-containerization

Dockerfile review, Kubernetes manifests, container registry management

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "meticulous-verifier",
  "dependsOn": [],
  "name": "harness-containerization",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual",
    "on_pr",
    "on_commit"
  ],
  "type": "rigid"
}
```

### harness-data-pipeline

ETL/ELT patterns, data quality checks, pipeline testing, and data workflow management

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "meticulous-verifier",
  "dependsOn": [],
  "name": "harness-data-pipeline",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual",
    "on_pr",
    "on_commit"
  ],
  "type": "rigid"
}
```

### harness-data-validation

Schema validation, data contracts, and pipeline data quality

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "meticulous-verifier",
  "dependsOn": [],
  "name": "harness-data-validation",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual",
    "on_pr"
  ],
  "type": "rigid"
}
```

### harness-database

Schema design, migrations, ORM patterns, and migration safety checks

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "harness-database",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual",
    "on_new_feature"
  ],
  "type": "rigid"
}
```

### harness-debugging

Systematic debugging with harness validation and state tracking

**Contract:**

```json
{
  "catalogTier": 0,
  "cognitiveMode": "diagnostic-investigator",
  "dependsOn": [],
  "name": "harness-debugging",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 1,
  "triggers": [
    "manual",
    "on_bug_fix"
  ],
  "type": "rigid"
}
```

### harness-dependency-health

Analyze structural health of the codebase using graph metrics

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "analytical-reporter",
  "dependsOn": [],
  "name": "harness-dependency-health",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 2,
  "triggers": [
    "manual",
    "on_milestone"
  ],
  "type": "rigid"
}
```

### harness-deployment

CI/CD pipelines, blue-green, canary, and environment management

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "meticulous-verifier",
  "dependsOn": [],
  "name": "harness-deployment",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 2,
  "triggers": [
    "manual",
    "on_new_feature",
    "on_pr"
  ],
  "type": "rigid"
}
```

### harness-design

Aesthetic direction workflow, anti-pattern enforcement, DESIGN.md generation, and strictness configuration

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [
    "harness-design-system"
  ],
  "name": "harness-design",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual",
    "on_new_feature"
  ],
  "type": "flexible"
}
```

### harness-design-craft

LLM-judgment-based design ceiling-raiser. CRITIQUE finds what's mediocre, POLISH applies high-craft moves, BENCHMARK scores against curated exemplars. The ceiling counterpart to rule-based audit skills.

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "constructive-architect",
  "dependsOn": [
    "harness-design",
    "harness-design-system"
  ],
  "name": "harness-design-craft",
  "platforms": [
    "claude-code"
  ],
  "tier": 2,
  "triggers": [
    "manual",
    "on_new_feature"
  ],
  "type": "flexible"
}
```

### harness-design-mobile

Token-bound mobile component generation with React Native, SwiftUI, Flutter, and Compose patterns and platform-specific design rules

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "meticulous-implementer",
  "dependsOn": [
    "harness-design-system",
    "harness-design"
  ],
  "name": "harness-design-mobile",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual",
    "on_new_feature",
    "on_commit"
  ],
  "type": "rigid"
}
```

### harness-design-pipeline

Orchestrator composing detect-design-drift, align-design-system, audit-component-anatomy, audit-brand-compliance, and design-craft-elevator into a sequential pipeline with convergence-based remediation. Mirrors harness-docs-pipeline. Consumes the formal verifier interface generically.

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "constructive-architect",
  "dependsOn": [
    "detect-design-drift",
    "align-design-system",
    "audit-component-anatomy",
    "audit-brand-compliance",
    "harness-design-craft"
  ],
  "name": "harness-design-pipeline",
  "platforms": [
    "claude-code"
  ],
  "tier": 2,
  "triggers": [
    "manual",
    "on_pr",
    "on_new_feature"
  ],
  "type": "rigid"
}
```

### harness-design-system

Design token generation, palette selection, typography, spacing, and design intent management

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "constructive-architect",
  "dependsOn": [],
  "name": "harness-design-system",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual",
    "on_new_feature",
    "on_project_init"
  ],
  "type": "rigid"
}
```

### harness-design-web

Token-bound web component generation with Tailwind/CSS, React/Vue/Svelte patterns, and design constraint verification

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "meticulous-implementer",
  "dependsOn": [
    "harness-design-system",
    "harness-design"
  ],
  "name": "harness-design-web",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual",
    "on_new_feature",
    "on_commit"
  ],
  "type": "rigid"
}
```

### harness-diagnostics

Classify errors into taxonomy categories and route to resolution strategies

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "diagnostic-investigator",
  "dependsOn": [],
  "name": "harness-diagnostics",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual",
    "on_bug_fix"
  ],
  "type": "rigid"
}
```

### harness-docs-pipeline

Orchestrator composing 4 documentation skills into a sequential pipeline with convergence-based remediation and qualitative health reporting

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "constructive-architect",
  "dependsOn": [
    "detect-doc-drift",
    "align-documentation",
    "validate-context-engineering",
    "harness-knowledge-mapper"
  ],
  "name": "harness-docs-pipeline",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 2,
  "triggers": [
    "manual",
    "on_doc_check"
  ],
  "type": "rigid"
}
```

### harness-dx

Developer experience auditing — README quality, API documentation, getting-started guides, and example validation

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "harness-dx",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual",
    "on_milestone",
    "on_pr"
  ],
  "type": "rigid"
}
```

### harness-e2e

End-to-end testing with Playwright, Cypress, and Selenium including page objects and flakiness remediation

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "meticulous-implementer",
  "dependsOn": [],
  "name": "harness-e2e",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual",
    "on_new_feature"
  ],
  "type": "rigid"
}
```

### harness-event-driven

Message queues, event sourcing, CQRS, and saga patterns

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "constructive-architect",
  "dependsOn": [],
  "name": "harness-event-driven",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual",
    "on_new_feature"
  ],
  "type": "rigid"
}
```

### harness-execution

Execute a planned set of tasks with harness validation and state tracking

**Contract:**

```json
{
  "catalogTier": 0,
  "cognitiveMode": "meticulous-implementer",
  "dependsOn": [
    "harness-verification"
  ],
  "name": "harness-execution",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 1,
  "triggers": [
    "manual",
    "on_new_feature",
    "on_bug_fix"
  ],
  "type": "rigid"
}
```

### harness-feature-flags

Flag lifecycle management, A/B testing infrastructure, and gradual rollouts

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "harness-feature-flags",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual",
    "on_new_feature"
  ],
  "type": "rigid"
}
```

### harness-git-workflow

Git workflow best practices integrated with harness validation

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "meticulous-verifier",
  "dependsOn": [],
  "name": "harness-git-workflow",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual",
    "on_pr",
    "on_commit"
  ],
  "type": "flexible"
}
```

### harness-graph-integrity

Check a knowledge graph for content that cannot be trusted — connectors that stamped a fresh sync timestamp while hard-failing, and extractor-derived nodes minted out of prose rather than code. Orchestrates harness graph integrity; never reimplements detection. Reports denominators, so a run that inspected nothing abstains instead of passing.

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "meticulous-verifier",
  "dependsOn": [],
  "name": "harness-graph-integrity",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 2,
  "triggers": [
    "manual",
    "on_milestone"
  ],
  "type": "rigid"
}
```

### harness-hotspot-detector

Identify structural risk hotspots via co-change and churn analysis

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "analytical-reporter",
  "dependsOn": [],
  "name": "harness-hotspot-detector",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 2,
  "triggers": [
    "manual",
    "on_milestone"
  ],
  "type": "rigid"
}
```

### harness-i18n

Internationalization scanning — detect hardcoded strings, missing translations, locale-sensitive formatting, RTL issues, and generate actionable reports across web, mobile, and backend

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "meticulous-verifier",
  "dependsOn": [],
  "name": "harness-i18n",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual",
    "on_pr",
    "on_commit",
    "on_review"
  ],
  "type": "rigid"
}
```

### harness-i18n-process

Upstream i18n process injection — inject internationalization considerations into brainstorming, planning, and review workflows with adaptive prompt-mode or gate-mode enforcement

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "harness-i18n-process",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "on_new_feature",
    "on_review"
  ],
  "type": "flexible"
}
```

### harness-i18n-workflow

Translation lifecycle management — configuration, scaffolding, string extraction, coverage tracking, pseudo-localization, and retrofit for existing projects

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "constructive-architect",
  "dependsOn": [
    "harness-i18n"
  ],
  "name": "harness-i18n-workflow",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual",
    "on_project_init"
  ],
  "type": "flexible"
}
```

### harness-ideate

Pre-brainstorm ideation phase. Generates N candidate ideas grounded in STRATEGY.md (when present), critiques each against its strongest objection, ranks by (impact × confidence) ÷ effort with a bounded strategy-alignment tiebreaker, and writes a single ranked Markdown artifact to docs/ideation/[slug]-YYYY-MM-DD.md. Produces ranked ideation — never specs, plans, or code. harness-brainstorming consumes the output.

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "divergent-generator",
  "dependsOn": [],
  "name": "harness-ideate",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 2,
  "triggers": [
    "manual"
  ],
  "type": "rigid"
}
```

### harness-impact-analysis

Graph-based impact analysis — answers "if I change X, what breaks?"

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "analytical-reporter",
  "dependsOn": [],
  "name": "harness-impact-analysis",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 2,
  "triggers": [
    "manual",
    "on_pr"
  ],
  "type": "rigid"
}
```

### harness-incident-response

Runbook generation, postmortem analysis, and SLO/SLA tracking

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "diagnostic-investigator",
  "dependsOn": [],
  "name": "harness-incident-response",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual",
    "on_bug_fix"
  ],
  "type": "rigid"
}
```

### harness-infrastructure-as-code

Terraform, CloudFormation, Pulumi patterns and IaC best practices

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "harness-infrastructure-as-code",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual",
    "on_new_feature",
    "on_pr"
  ],
  "type": "rigid"
}
```

### harness-initialize-project

Scaffold a new harness-compliant project, including design system and roadmap configuration

**Contract:**

```json
{
  "catalogTier": 0,
  "cognitiveMode": "constructive-architect",
  "dependsOn": [
    "initialize-test-suite-project",
    "harness-design-system",
    "harness-roadmap"
  ],
  "name": "harness-initialize-project",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 1,
  "triggers": [
    "manual",
    "on_project_init"
  ],
  "type": "flexible"
}
```

### harness-integration

Verify system wiring, materialize knowledge artifacts, and update project metadata after execution

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "meticulous-verifier",
  "dependsOn": [
    "harness-verification"
  ],
  "name": "harness-integration",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 1,
  "triggers": [
    "manual"
  ],
  "type": "rigid"
}
```

### harness-integration-test

Service boundary testing, API integration testing, and consumer-driven contract validation

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "meticulous-verifier",
  "dependsOn": [],
  "name": "harness-integration-test",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual",
    "on_new_feature",
    "on_pr"
  ],
  "type": "rigid"
}
```

### harness-integrity

Unified integrity gate — chains verify (quick gate) with AI review into a single report

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "meticulous-verifier",
  "dependsOn": [
    "harness-verify",
    "harness-code-review"
  ],
  "name": "harness-integrity",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 2,
  "triggers": [
    "manual",
    "on_pr",
    "on_milestone"
  ],
  "type": "rigid"
}
```

### harness-knowledge-mapper

Auto-generate always-current knowledge maps from graph topology

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "constructive-architect",
  "dependsOn": [],
  "name": "harness-knowledge-mapper",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual",
    "on_commit",
    "on_milestone"
  ],
  "type": "rigid"
}
```

### harness-knowledge-pipeline

4-phase knowledge extraction, reconciliation, drift detection, and remediation with convergence loop

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "constructive-architect",
  "dependsOn": [],
  "name": "harness-knowledge-pipeline",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 2,
  "triggers": [
    "manual"
  ],
  "type": "rigid"
}
```

### harness-load-testing

Stress testing, capacity planning, and performance benchmarking with k6/Artillery/Gatling

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "meticulous-verifier",
  "dependsOn": [],
  "name": "harness-load-testing",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual",
    "on_milestone"
  ],
  "type": "rigid"
}
```

### harness-maintenance-pipeline

On-demand, report-first maintenance sweep — runs overdue checks via `harness maintenance run`, triages findings, and asks the human in plain text before dispatching any fix

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "analytical-reporter",
  "dependsOn": [],
  "name": "harness-maintenance-pipeline",
  "platforms": [
    "claude-code",
    "cursor",
    "codex",
    "gemini-cli"
  ],
  "tier": 2,
  "triggers": [
    "manual",
    "on_milestone"
  ],
  "type": "flexible"
}
```

### harness-ml-ops

Model serving patterns, experiment tracking, prompt evaluation, and ML pipeline management

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "harness-ml-ops",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual",
    "on_new_feature"
  ],
  "type": "rigid"
}
```

### harness-mobile-patterns

Mobile platform lifecycle, permissions, deep linking, push notifications, and app store submission

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "harness-mobile-patterns",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual",
    "on_new_feature",
    "on_pr"
  ],
  "type": "rigid"
}
```

### harness-mutation-test

Test quality validation through mutation testing with Stryker and mutation scoring

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "adversarial-reviewer",
  "dependsOn": [],
  "name": "harness-mutation-test",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual",
    "on_milestone"
  ],
  "type": "rigid"
}
```

### harness-observability

Structured logging, metrics, distributed tracing, and alerting strategies

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "harness-observability",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual",
    "on_new_feature"
  ],
  "type": "rigid"
}
```

### harness-offboarding

Offboard a departing developer from a harness-managed project

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "harness-offboarding",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 1,
  "triggers": [
    "manual"
  ],
  "type": "flexible"
}
```

### harness-onboarding

Onboard a new developer to a harness-managed project

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "harness-onboarding",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 1,
  "triggers": [
    "manual",
    "on_project_init"
  ],
  "type": "flexible"
}
```

### harness-parallel-agents

Coordinate multiple agents working in parallel on a harness project

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "constructive-architect",
  "dependsOn": [],
  "name": "harness-parallel-agents",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual",
    "on_new_feature"
  ],
  "type": "flexible"
}
```

### harness-perf

Performance enforcement and benchmark management

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "meticulous-verifier",
  "dependsOn": [
    "harness-verify"
  ],
  "name": "harness-perf",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 2,
  "triggers": [
    "manual",
    "on_pr"
  ],
  "type": "rigid"
}
```

### harness-perf-tdd

Performance-aware TDD with benchmark assertions in the red-green-refactor cycle

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "meticulous-implementer",
  "dependsOn": [
    "harness-tdd",
    "harness-perf"
  ],
  "name": "harness-perf-tdd",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "rigid"
}
```

### harness-planning

Structured project planning with harness constraints and validation

**Contract:**

```json
{
  "catalogTier": 0,
  "cognitiveMode": "constructive-architect",
  "dependsOn": [
    "harness-verification",
    "harness-soundness-review"
  ],
  "name": "harness-planning",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 1,
  "triggers": [
    "manual",
    "on_new_feature",
    "on_project_init"
  ],
  "type": "rigid"
}
```

### harness-pre-commit-review

Lightweight pre-commit quality gate combining mechanical checks and AI review

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "",
  "dependsOn": [
    "harness-code-review"
  ],
  "name": "harness-pre-commit-review",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual",
    "on_commit"
  ],
  "type": "rigid"
}
```

### harness-pre-merge-brief

Thin-wrapper skill that runs the `harness pre-merge-brief` command to compose and post the senior-facing pre-merge accountability brief — the diff summary, the multi-persona review verdict (from review-ci --json), the curated Signal status snapshot, the outcome-eval result, and a derived "Worth your eyes" section — as a single sticky PR comment (upsert by marker). All composition and degradation logic lives in the command; the skill orchestrates invocation, communicates which sections degraded to "unavailable", and hands off. Runs on on_pr and manual. The harness pointed at the human who clicks merge.

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "constructive-architect",
  "dependsOn": [
    "harness-code-review",
    "outcome-eval"
  ],
  "name": "harness-pre-merge-brief",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 2,
  "triggers": [
    "on_pr",
    "manual"
  ],
  "type": "rigid"
}
```

### harness-product-spec

User story generation, EARS acceptance criteria, and PRD creation from issues

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "constructive-architect",
  "dependsOn": [],
  "name": "harness-product-spec",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual",
    "on_new_feature"
  ],
  "type": "rigid"
}
```

### harness-property-test

Property-based and generative testing with fast-check, hypothesis, and automatic shrinking

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "constructive-architect",
  "dependsOn": [],
  "name": "harness-property-test",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual",
    "on_new_feature"
  ],
  "type": "rigid"
}
```

### harness-pulse

First-run pulse interview. Converts intent into a validated pulse config with SMART pushback, read-write-DB rejection, STRATEGY.md seeding. Phase 3 ships the interview; the run path is deferred to Phase 4.

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "configuration-interviewer",
  "dependsOn": [],
  "name": "harness-pulse",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 2,
  "triggers": [
    "manual"
  ],
  "type": "rigid"
}
```

### harness-refactoring

Safe refactoring with validation before and after changes

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "meticulous-implementer",
  "dependsOn": [],
  "name": "harness-refactoring",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 1,
  "triggers": [
    "manual",
    "on_refactor"
  ],
  "type": "flexible"
}
```

### harness-rehearse

Rehearse an agent against a deliberately-broken fixture and score how well it recovers. Picks a fixture from templates/rehearsal-fixtures/ (each plants one failure mode a real harness check catches — leaked secret, layer violation, dependency cycle, broken doc link), copies it into a scratch workspace, has the agent detect and repair the planted defect, assembles a structured recovery record, and runs `harness rehearse score` for a deterministic 0-100 score and pass/partial/fail tier across four dimensions (detected, correctCheck, fixed, noCollateral). Used to train personas before production trust and to regression-test the harness's own gates against known failure shapes.

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "constructive-architect",
  "dependsOn": [],
  "name": "harness-rehearse",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 2,
  "triggers": [
    "manual",
    "on_milestone"
  ],
  "type": "rigid"
}
```

### harness-release-readiness

Audit npm release readiness, run maintenance checks, offer auto-fixes, track progress across sessions

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "meticulous-verifier",
  "dependsOn": [
    "detect-doc-drift",
    "cleanup-dead-code",
    "align-documentation",
    "enforce-architecture",
    "harness-diagnostics",
    "harness-parallel-agents"
  ],
  "name": "harness-release-readiness",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 2,
  "triggers": [
    "manual",
    "on_milestone"
  ],
  "type": "rigid"
}
```

### harness-repo-hygiene

Fleet-wide branch and worktree pruning — sync, classify against PR state, audit for unpushed work, then prune

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "meticulous-verifier",
  "dependsOn": [],
  "name": "harness-repo-hygiene",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "rigid"
}
```

### harness-resilience

Circuit breakers, rate limiting, bulkheads, retry patterns, and fault tolerance

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "harness-resilience",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual",
    "on_new_feature",
    "on_pr"
  ],
  "type": "rigid"
}
```

### harness-roadmap

Create and manage a unified project roadmap from existing specs and plans

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "constructive-architect",
  "dependsOn": [],
  "name": "harness-roadmap",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 2,
  "triggers": [
    "manual"
  ],
  "type": "rigid"
}
```

### harness-roadmap-pilot

AI-assisted selection of the next highest-impact roadmap item with scoring, assignment, and skill transition

**Contract:**

```json
{
  "catalogTier": 0,
  "cognitiveMode": "constructive-architect",
  "dependsOn": [
    "harness-brainstorming",
    "harness-autopilot",
    "harness-roadmap"
  ],
  "name": "harness-roadmap-pilot",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 2,
  "triggers": [
    "manual"
  ],
  "type": "rigid"
}
```

### harness-rollback

Post-ship circuit breaker — proposes a full-context revert PR when a shipped PR fails post-merge evaluation or crosses a signal threshold. Propose-only in v1 (never auto-merges).

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "constructive-architect",
  "dependsOn": [
    "outcome-eval"
  ],
  "name": "harness-rollback",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 2,
  "triggers": [
    "manual"
  ],
  "type": "rigid"
}
```

### harness-router

Natural language router to harness skills — classifies intent, confirms, dispatches

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "analytical-classifier",
  "dependsOn": [],
  "name": "harness-router",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 1,
  "triggers": [
    "manual"
  ],
  "type": "rigid"
}
```

### harness-secrets

Vault integration, credential rotation, and environment variable hygiene

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "meticulous-verifier",
  "dependsOn": [],
  "name": "harness-secrets",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual",
    "on_pr",
    "on_commit"
  ],
  "type": "rigid"
}
```

### harness-security-review

Deep security audit with OWASP baseline and stack-adaptive analysis

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "meticulous-implementer",
  "dependsOn": [],
  "name": "harness-security-review",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual",
    "on_pr"
  ],
  "type": "rigid"
}
```

### harness-security-scan

Lightweight mechanical security scan for health checks

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "meticulous-implementer",
  "dependsOn": [],
  "name": "harness-security-scan",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 2,
  "triggers": [
    "manual",
    "on_milestone"
  ],
  "type": "rigid"
}
```

### harness-skill-authoring

Create and maintain harness skills following the rich skill format

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "constructive-architect",
  "dependsOn": [],
  "name": "harness-skill-authoring",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 1,
  "triggers": [
    "manual"
  ],
  "type": "flexible"
}
```

### harness-soundness-review

Deep soundness analysis of specs and plans with auto-fix and convergence loop

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "meticulous-verifier",
  "dependsOn": [],
  "name": "harness-soundness-review",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 2,
  "triggers": [
    "manual"
  ],
  "type": "rigid"
}
```

### harness-sql-review

SQL query optimization, index analysis, N+1 detection, and query plan review

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "adversarial-reviewer",
  "dependsOn": [],
  "name": "harness-sql-review",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual",
    "on_pr"
  ],
  "type": "rigid"
}
```

### harness-state-management

Manage persistent session state across harness agent sessions

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "meticulous-implementer",
  "dependsOn": [],
  "name": "harness-state-management",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "flexible"
}
```

### harness-strategy

First-run interview and update flow for STRATEGY.md — the durable upstream product anchor read by harness-brainstorming, harness-ideate, and harness-roadmap-pilot. Enforces three pushback rules (fluff, goal-as-strategy, feature-list-as-strategy) with a 2-round-per-section cap. Downstream skills (init, brainstorming, roadmap-pilot, ideate, knowledge graph) consume STRATEGY.md as grounding.

**Contract:**

```json
{
  "catalogTier": 0,
  "cognitiveMode": "configuration-interviewer",
  "dependsOn": [],
  "name": "harness-strategy",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 2,
  "triggers": [
    "manual"
  ],
  "type": "rigid"
}
```

### harness-supply-chain-audit

6-factor dependency risk evaluation for supply chain security

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "meticulous-implementer",
  "dependsOn": [
    "harness-security-scan"
  ],
  "name": "harness-supply-chain-audit",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 2,
  "triggers": [
    "manual",
    "on_milestone"
  ],
  "type": "rigid"
}
```

### harness-tdd

Test-driven development integrated with harness validation

**Contract:**

```json
{
  "catalogTier": 0,
  "cognitiveMode": "meticulous-implementer",
  "dependsOn": [
    "harness-verification"
  ],
  "name": "harness-tdd",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 1,
  "triggers": [
    "manual",
    "on_new_feature",
    "on_bug_fix"
  ],
  "type": "rigid"
}
```

### harness-test-advisor

Graph-based test selection and project-wide coverage audit — answers "what tests should I run?" or "what's untested?"

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "harness-test-advisor",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 2,
  "triggers": [
    "manual",
    "on_pr"
  ],
  "type": "flexible"
}
```

### harness-test-data

Test factories, fixtures, database seeding, and test data isolation

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "harness-test-data",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual",
    "on_new_feature"
  ],
  "type": "rigid"
}
```

### harness-ux-copy

Microcopy auditing, error message quality, voice/tone guides, and UI string consistency

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "harness-ux-copy",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual",
    "on_pr",
    "on_review"
  ],
  "type": "rigid"
}
```

### harness-verification

Comprehensive harness verification of project health and compliance

**Contract:**

```json
{
  "catalogTier": 0,
  "cognitiveMode": "meticulous-verifier",
  "dependsOn": [],
  "name": "harness-verification",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 2,
  "triggers": [
    "manual",
    "on_pr",
    "on_commit"
  ],
  "type": "rigid"
}
```

### harness-verify

Binary pass/fail quick gate — runs test, lint, typecheck commands and returns structured result

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "meticulous-verifier",
  "dependsOn": [],
  "name": "harness-verify",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 2,
  "triggers": [
    "manual",
    "on_task_complete"
  ],
  "type": "rigid"
}
```

### harness-visual-regression

Screenshot comparison, visual diff detection, and baseline management

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "meticulous-verifier",
  "dependsOn": [],
  "name": "harness-visual-regression",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual",
    "on_pr"
  ],
  "type": "rigid"
}
```

### harness-workflow-audit

CI/GitHub-Actions workflow-file quality and hygiene auditor

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "adversarial-reviewer",
  "dependsOn": [],
  "name": "harness-workflow-audit",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 2,
  "triggers": [
    "manual",
    "on_milestone"
  ],
  "type": "rigid"
}
```

### ideate-fleet

Strategy-grounded ideation fan-out at the head of the fleet spine — derive a queue of disjoint themes from STRATEGY.md tracks and supplied opportunity areas, confirm the batch once, fan out worktree-isolated subagents that each run the real harness-ideate pipeline for one theme to its ranked artifact, collect every artifact verbatim out of its worktree, verify by artifact provenance plus an independently re-derived ranking rather than a self-report, and hand back one curated ranked shortlist for a human to pick from. Files nothing — no issue, roadmap row, spec, plan, ADR, or PR — and commits, stages, and pushes nothing.

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "systematic-orchestrator",
  "dependsOn": [
    "harness-ideate",
    "harness-strategy"
  ],
  "name": "ideate-fleet",
  "platforms": [
    "claude-code",
    "codex",
    "cursor",
    "gemini-cli"
  ],
  "tier": 2,
  "triggers": [
    "manual"
  ],
  "type": "rigid"
}
```

### initialize-test-suite-project

Scaffold or migrate a test-suite project (API, E2E/UI, or shared library) with test-suite-specific layer models, tags, reporter stack, and custom report

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "constructive-architect",
  "dependsOn": [
    "harness-initialize-project"
  ],
  "name": "initialize-test-suite-project",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 1,
  "triggers": [
    "manual"
  ],
  "type": "flexible"
}
```

### issue-fleet

Autonomous open-issue-backlog intake orchestrator — enumerate the open-issue queue, triage each issue (label, dedup, route, prioritize), confirm the destructive closes with the human in one up-front round, fan out concurrency-governed triage subagents over queue slices, independently re-derive every mutation from the issue's own signals, and hand the downstream fleets a clean, ranked, deduped, routed queue. Never silently closes an issue.

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "systematic-orchestrator",
  "dependsOn": [
    "harness-roadmap-pilot"
  ],
  "name": "issue-fleet",
  "platforms": [
    "claude-code",
    "codex",
    "cursor",
    "gemini-cli"
  ],
  "tier": 2,
  "triggers": [
    "manual"
  ],
  "type": "rigid"
}
```

### js-abstract-factory-pattern

Create families of related objects without specifying their concrete classes

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "js-abstract-factory-pattern",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### js-adapter-pattern

Convert the interface of a class into another interface that clients expect

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "js-adapter-pattern",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### js-bridge-pattern

Decouple abstraction from implementation so both can vary independently

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "js-bridge-pattern",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### js-chain-of-responsibility-pattern

Pass a request along a chain of handlers until one handles it

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "js-chain-of-responsibility-pattern",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### js-command-pattern

Encapsulate operations as objects to support undo, queue, and logging

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "js-command-pattern",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### js-composite-pattern

Compose objects into tree structures and treat individual objects and composites uniformly

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "js-composite-pattern",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### js-constructor-pattern

Use constructor functions or classes to create and initialize objects

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "js-constructor-pattern",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### js-decorator-pattern

Extend object behavior dynamically without modifying its source

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "js-decorator-pattern",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### js-dynamic-import

Load ES modules on demand with import() to reduce initial bundle size and enable code splitting

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "js-dynamic-import",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### js-facade-pattern

Provide a simplified interface to a complex subsystem

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "js-facade-pattern",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### js-factory-pattern

Create objects via a factory function without specifying the exact class

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "js-factory-pattern",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### js-flyweight-pattern

Share common state across many fine-grained objects to reduce memory usage

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "js-flyweight-pattern",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### js-iterator-pattern

Traverse a collection sequentially without exposing its internal structure

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "js-iterator-pattern",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### js-mediator-middleware-pattern

Route component interactions through a central mediator to reduce coupling

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "js-mediator-middleware-pattern",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### js-mixin-pattern

Add reusable behaviors to classes without deep inheritance chains

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "js-mixin-pattern",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### js-module-pattern

Encapsulate private state and expose a public API using closures or ES modules

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "js-module-pattern",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### js-observer-pattern

Notify subscribers automatically when an observable object's state changes

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "js-observer-pattern",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### js-prototype-pattern

Share properties and methods across instances via the prototype chain

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "js-prototype-pattern",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### js-provider-pattern

Make shared data available to multiple child components without prop-drilling

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "js-provider-pattern",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### js-proxy-pattern

Intercept and control object property access with ES6 Proxy

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "js-proxy-pattern",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### js-revealing-module-pattern

Define all logic privately and selectively expose only the public API

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "js-revealing-module-pattern",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### js-singleton-pattern

Ensure a class has only one instance and provide a global access point

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "js-singleton-pattern",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### js-state-pattern

Allow an object to alter its behavior when its internal state changes

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "js-state-pattern",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### js-static-import

Use static import declarations to load ES modules at parse time for tree-shaking and static analysis

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "js-static-import",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### js-strategy-pattern

Define a family of algorithms and make them interchangeable without altering the client

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "js-strategy-pattern",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### js-template-method-pattern

Define the skeleton of an algorithm in a base class and let subclasses override specific steps

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "js-template-method-pattern",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### js-visitor-pattern

Add new operations to object structures without modifying the objects

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "js-visitor-pattern",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### knowledge-craft

LLM-judgment critique of knowledge-entry quality (docs/knowledge/, excluding decisions/ which is spec-craft territory). Per-file critique against 7 seed rubrics that ask whether the entry states a load-bearing fact, earns a place in the graph taxonomy, carries forward a decision that would otherwise erode. Fifth non-design craft-pipeline ceiling skill.

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "constructive-architect",
  "dependsOn": [
    "harness-soundness-review",
    "spec-craft"
  ],
  "name": "knowledge-craft",
  "platforms": [
    "claude-code"
  ],
  "tier": 2,
  "triggers": [
    "manual",
    "on_pr",
    "on_new_feature"
  ],
  "type": "rigid"
}
```

### microservices-api-gateway

Route, aggregate, and secure client requests through an API gateway or BFF pattern

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "microservices-api-gateway",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### microservices-bulkhead-pattern

Isolate failures with bulkheads using thread pools and semaphores to protect shared resources

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "microservices-bulkhead-pattern",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### microservices-circuit-breaker

Prevent cascading failures with circuit breaker, half-open state, and fallback logic

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "microservices-circuit-breaker",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### microservices-config-server

Centralize configuration, feature flags, and secrets management across services

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "microservices-config-server",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### microservices-cqrs-pattern

Separate read and write models to optimize query and command performance independently

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "microservices-cqrs-pattern",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### microservices-decomposition

Design service boundaries using bounded contexts, DDD, and functional cohesion principles

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "microservices-decomposition",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### microservices-distributed-tracing

Propagate trace context and emit spans across services using OpenTelemetry

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "microservices-distributed-tracing",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### microservices-event-sourcing

Store state as an immutable sequence of events with projections, snapshots, and replay

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "microservices-event-sourcing",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### microservices-health-check

Implement /health and /ready endpoints for liveness and readiness probes in containers

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "microservices-health-check",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### microservices-outbox-pattern

Guarantee at-least-once event delivery using a transactional outbox and polling publisher

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "microservices-outbox-pattern",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### microservices-saga-pattern

Coordinate distributed transactions using choreography and orchestration sagas with compensation

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "microservices-saga-pattern",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### microservices-service-discovery

Implement service registration and dynamic discovery with health checks in microservices

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "microservices-service-discovery",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### microservices-sidecar-pattern

Inject cross-cutting concerns like observability and security via a sidecar proxy

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "microservices-sidecar-pattern",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### microservices-strangler-fig

Migrate monoliths incrementally using the strangler fig pattern with facade routing

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "microservices-strangler-fig",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### mobile-animation-patterns

Create fluid 60fps animations with React Native Reanimated and shared values

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "mobile-animation-patterns",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### mobile-deployment-patterns

Deploy React Native apps with EAS Build, EAS Submit, OTA updates, and CI/CD pipelines

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "mobile-deployment-patterns",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### mobile-expo-setup

Set up and configure Expo projects with managed workflow, EAS Build, and development builds

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "mobile-expo-setup",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### mobile-flatlist-patterns

Build performant scrollable lists with FlatList, SectionList, and FlashList

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "mobile-flatlist-patterns",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### mobile-gesture-handling

Implement touch gestures with React Native Gesture Handler for swipe, pan, pinch, and long press

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "mobile-gesture-handling",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### mobile-native-modules

Bridge native platform APIs into React Native with Expo Modules and Turbo Modules

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "mobile-native-modules",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### mobile-navigation-pattern

Implement stack, tab, and drawer navigation in React Native with type-safe routing

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "mobile-navigation-pattern",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### mobile-network-patterns

Handle network requests, offline support, and connectivity monitoring in React Native

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "mobile-network-patterns",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### mobile-performance-patterns

Optimize React Native app performance with profiling, memoization, and native thread management

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "mobile-performance-patterns",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### mobile-push-notifications

Implement push notifications with Expo Notifications, FCM, and APNs

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "mobile-push-notifications",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### mobile-storage-patterns

Persist data on mobile with AsyncStorage, SecureStore, MMKV, and SQLite

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "mobile-storage-patterns",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### mobile-testing-patterns

Test React Native apps with Jest, Testing Library, and Detox for unit, integration, and E2E coverage

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "mobile-testing-patterns",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### naming-craft

LLM-judgment skill that critiques identifier names (variables, functions, types, files) against a curated rubric catalog seeded from Martin / Beck / Karlton. First craft-pipeline ceiling skill; cross-cutting (other craft skills call into it for domain-specific naming).

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "constructive-architect",
  "dependsOn": [
    "harness-design-craft"
  ],
  "name": "naming-craft",
  "platforms": [
    "claude-code"
  ],
  "tier": 2,
  "triggers": [
    "manual",
    "on_pr",
    "on_new_feature"
  ],
  "type": "rigid"
}
```

### nestjs-config-module

Manage environment config with ConfigModule.forRoot, ConfigService, and Joi schema validation

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "nestjs-config-module",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### nestjs-controller-pattern

Define HTTP route handlers with @Controller, method decorators, params, and versioning

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "nestjs-controller-pattern",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### nestjs-dependency-injection

Master NestJS DI container with tokens, useClass/useValue/useFactory providers

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "nestjs-dependency-injection",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### nestjs-dto-validation

Validate request payloads with class-validator, class-transformer, and DTO patterns

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "nestjs-dto-validation",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### nestjs-event-driven

Build event-driven systems with EventEmitter2, CQRS module, CommandBus, and QueryBus

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "nestjs-event-driven",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### nestjs-exception-filters

Handle errors globally with @Catch, ExceptionFilter, and custom exception hierarchies

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "nestjs-exception-filters",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### nestjs-graphql-integration

Build GraphQL APIs with GraphQLModule, @Resolver, @Query/@Mutation, @ObjectType, and DataLoader

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "nestjs-graphql-integration",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### nestjs-guards-pattern

Protect routes with @UseGuards, CanActivate, JWT guards, and role-based access control

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "nestjs-guards-pattern",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### nestjs-interceptors-pattern

Transform responses and add cross-cutting behavior with NestInterceptor and CallHandler

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "nestjs-interceptors-pattern",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### nestjs-microservices

Connect services with ClientsModule, @MessagePattern, @EventPattern, and TCP/Redis transport

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "nestjs-microservices",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### nestjs-middleware-pattern

Apply NestMiddleware and functional middleware with consumer.forRoutes binding

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "nestjs-middleware-pattern",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### nestjs-module-pattern

Organize NestJS applications with @Module, imports/exports, global and dynamic modules

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "nestjs-module-pattern",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### nestjs-pipes-pattern

Validate and transform request data with PipeTransform, ValidationPipe, and custom pipes

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "nestjs-pipes-pattern",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### nestjs-service-pattern

Encapsulate business logic in @Injectable services with repository pattern separation

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "nestjs-service-pattern",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### nestjs-swagger-integration

Document APIs with @ApiProperty, @ApiOperation, @ApiTags, and DocumentBuilder

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "nestjs-swagger-integration",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### nestjs-testing-patterns

Test NestJS apps with Test.createTestingModule, jest mocks, supertest e2e, and overrideProvider

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "nestjs-testing-patterns",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### next-app-router

App Router architecture, layouts, nested routes, and route segments in Next.js 13+

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "next-app-router",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### next-auth-patterns

Authentication patterns, session handling, and middleware auth guards in Next.js

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "next-auth-patterns",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### next-caching-strategies

fetch cache options, revalidate, cache tags, and unstable_cache patterns

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "next-caching-strategies",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### next-data-fetching

Server-side data patterns, avoiding waterfalls, sequential vs parallel fetching

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "next-data-fetching",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### next-deployment-optimization

Bundle analysis, code splitting, dynamic imports, and next/dynamic optimization

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "next-deployment-optimization",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### next-environment-config

Environment variables, next.config.ts, and server-only module boundaries

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "next-environment-config",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### next-error-boundaries

error.tsx, global-error.tsx, not-found.tsx, and error recovery patterns

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "next-error-boundaries",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### next-image-optimization

next/image component, responsive images, priority loading, and sizes configuration

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "next-image-optimization",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### next-metadata-api

generateMetadata, static and dynamic metadata, Open Graph images

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "next-metadata-api",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### next-middleware-pattern

Edge middleware, matchers, NextRequest/NextResponse for cross-cutting concerns

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "next-middleware-pattern",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### next-monorepo-setup

Next.js in monorepos, shared packages, and Turborepo integration

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "next-monorepo-setup",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### next-parallel-intercepting-routes

Parallel routes (@folder), intercepting routes ((.)), and modal patterns

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "next-parallel-intercepting-routes",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### next-route-handlers

API routes in App Router using route.ts, HTTP method exports, and request handling

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "next-route-handlers",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### next-server-actions

Server Actions, form mutations, progressive enhancement, and useFormState

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "next-server-actions",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### next-server-components

React Server Components in Next.js — client/server boundaries, composition, and data access

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "next-server-components",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### next-static-generation

SSG, generateStaticParams, ISR, and revalidate strategies

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "next-static-generation",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### next-streaming-suspense

Streaming SSR, Suspense boundaries, and loading.tsx conventions

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "next-streaming-suspense",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### next-testing-patterns

Component testing with App Router, mocking server components, and MSW integration

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "next-testing-patterns",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### node-buffer-encoding

Handle binary data, encodings, and conversions with Node.js Buffer and TextEncoder

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "node-buffer-encoding",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### node-child-process

Spawn and manage child processes with exec, spawn, fork, and IPC communication

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "node-child-process",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### node-crypto-patterns

Implement hashing, HMAC, signing, encryption, and key derivation with Node.js crypto

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "node-crypto-patterns",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### node-environment-config

Manage environment configuration with process.env, dotenv, and validation for 12-factor apps

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "node-environment-config",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### node-error-handling

Handle uncaught exceptions, promise rejections, and errors across async Node.js code

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "node-error-handling",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### node-esm-patterns

Write Node.js ES modules correctly using import.meta.url, package.json type, and CJS interop

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "node-esm-patterns",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### node-event-emitter

Use Node.js EventEmitter for typed pub-sub communication with memory leak prevention

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "node-event-emitter",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### node-express-patterns

Structure Express applications with middleware chains, routers, and proper error handling

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "node-express-patterns",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### node-fastify-patterns

Build performant APIs with Fastify using schema validation, plugins, decorators, and hooks

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "node-fastify-patterns",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### node-http-server

Build low-level HTTP servers with Node.js http module and middleware pattern

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "node-http-server",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### node-path-fs-patterns

Perform file system operations correctly using fs.promises, path utilities, and file watching

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "node-path-fs-patterns",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### node-performance-profiling

Profile Node.js applications using --prof, clinic.js, memory snapshots, and event loop lag

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "node-performance-profiling",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### node-streams-pattern

Process large data efficiently using Node.js Readable, Writable, and Transform streams

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "node-streams-pattern",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### node-testing-patterns

Test Node.js APIs and modules using supertest, nock, and test containers

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "node-testing-patterns",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### node-worker-threads

Offload CPU-intensive work to worker threads using MessageChannel and shared buffers

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "node-worker-threads",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### nuxt-auto-imports

Use Nuxt's automatic import system for composables, components, and utils without explicit import statements

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "nuxt-auto-imports",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### nuxt-composables-pattern

Fetch data and manage async state in Nuxt using useAsyncData, useFetch, useLazyFetch, and useNuxtApp

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "nuxt-composables-pattern",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### nuxt-deployment-config

Configure Nuxt deployment targets with Nitro presets, hybrid rendering, and output modes

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "nuxt-deployment-config",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### nuxt-layouts-pages

Structure Nuxt apps with file-based pages, named layouts, and definePageMeta

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "nuxt-layouts-pages",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### nuxt-middleware-pattern

Guard and transform routes using Nuxt route middleware and server middleware

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "nuxt-middleware-pattern",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### nuxt-modules-pattern

Build and configure Nuxt modules using defineNuxtModule, addComponent, and module hooks

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "nuxt-modules-pattern",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### nuxt-plugins-pattern

Extend the Nuxt app instance with plugins using defineNuxtPlugin and provide/inject

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "nuxt-plugins-pattern",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### nuxt-seo-metadata

Configure SEO metadata, Open Graph tags, and structured data using useSeoMeta and useHead

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "nuxt-seo-metadata",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### nuxt-server-routes

Build server-side API routes using Nitro's defineEventHandler and H3 utilities

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "nuxt-server-routes",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### nuxt-state-management

Manage SSR-safe shared state with useState and Pinia in Nuxt applications

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "nuxt-state-management",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### nuxt-testing-patterns

Test Nuxt components and pages using @nuxt/test-utils, mountSuspended, and mockNuxtImport

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "nuxt-testing-patterns",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### otel-context-propagation

Propagate trace context across service boundaries with W3C TraceContext and baggage

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "otel-context-propagation",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### otel-custom-instrumentation

Add custom spans and attributes to business-critical code paths

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "otel-custom-instrumentation",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### otel-error-tracking

Track and correlate errors across services with OpenTelemetry span exceptions and status

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "otel-error-tracking",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### otel-exporter-config

Configure OTLP exporters for traces, metrics, and logs to observability backends

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "otel-exporter-config",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### otel-logging-pattern

Correlate structured logs with traces using OpenTelemetry log signals

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "otel-logging-pattern",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### otel-metrics-pattern

Record application metrics with OpenTelemetry counters, histograms, and gauges

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "otel-metrics-pattern",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### otel-nestjs-integration

Integrate OpenTelemetry with NestJS using decorators and module-based configuration

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "otel-nestjs-integration",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### otel-nextjs-integration

Add OpenTelemetry tracing to Next.js with instrumentation hook and edge runtime support

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "otel-nextjs-integration",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### otel-performance-insights

Identify performance bottlenecks using trace analysis, histogram metrics, and span timing

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "otel-performance-insights",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### otel-sampling-strategies

Control trace volume with head and tail sampling strategies

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "otel-sampling-strategies",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### otel-sdk-setup

Initialize the OpenTelemetry Node.js SDK with providers, exporters, and auto-instrumentation

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "otel-sdk-setup",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### otel-tracing-pattern

Instrument distributed traces with OpenTelemetry spans for request flow visibility

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "otel-tracing-pattern",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### outcome-eval

LLM-judgment skill that produces a structured, confidence-rated verdict on whether an implementation satisfied its spec. Reads the spec's acceptance section, the change diff, and test output; emits an OutcomeVerdict (SATISFIED | NOT_SATISFIED | INCONCLUSIVE) with confidence, rationale, and unmet criteria. Authority is derived in TypeScript, never from the LLM: a high-confidence NOT_SATISFIED blocks ship; every other verdict is advisory. The verdict persists as an execution_outcome node and feeds skill-effectiveness baselines. The harness's first blocking post-execution spec-satisfaction gate.

**Contract:**

```json
{
  "catalogTier": 0,
  "cognitiveMode": "constructive-architect",
  "dependsOn": [],
  "name": "outcome-eval",
  "platforms": [
    "claude-code"
  ],
  "tier": 2,
  "triggers": [
    "manual",
    "on_pr"
  ],
  "type": "rigid"
}
```

### owasp-auth-patterns

Implement secure authentication with proper session management, JWT best practices, and token rotation

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "owasp-auth-patterns",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### owasp-cryptography

Apply cryptographic best practices for hashing, encryption, signing, and key management

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "owasp-cryptography",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### owasp-csrf-protection

Defend state-changing endpoints with CSRF tokens, SameSite cookies, and origin validation

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "owasp-csrf-protection",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### owasp-dependency-security

Manage third-party dependency risks with auditing, lockfiles, and vulnerability scanning

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "owasp-dependency-security",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### owasp-file-upload-security

Secure file upload endpoints against malicious files, path traversal, and resource exhaustion

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "owasp-file-upload-security",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### owasp-idor-prevention

Prevent insecure direct object references by enforcing ownership checks and indirect reference maps

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "owasp-idor-prevention",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### owasp-injection-prevention

Prevent SQL, NoSQL, and command injection via parameterized queries and input validation

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "owasp-injection-prevention",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### owasp-logging-monitoring

Implement security logging and monitoring to detect and respond to threats

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "owasp-logging-monitoring",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### owasp-rate-limiting

Protect APIs with rate limiting, throttling, and abuse prevention strategies

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "owasp-rate-limiting",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### owasp-secrets-management

Manage secrets safely via env vars and secrets managers, never logging or hardcoding credentials

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "owasp-secrets-management",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### owasp-security-headers

Configure HTTP security headers to protect against XSS, clickjacking, MIME sniffing, and data leaks

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "owasp-security-headers",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### owasp-xss-prevention

Prevent reflected, stored, and DOM-based XSS via CSP headers, output encoding, and input sanitization

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "owasp-xss-prevention",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### perf-browser-cache

Browser caching — Cache-Control directives, ETag validation, immutable assets, stale-while-revalidate, and cache partitioning

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "perf-browser-cache",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### perf-bundle-analysis

Bundle analysis — Bundle visualization, size budgets, dependency cost analysis, and CI-integrated size tracking

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "perf-bundle-analysis",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### perf-cache-invalidation

Cache invalidation — TTL strategies, event-driven invalidation, cache stampede prevention, and versioned cache keys

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "perf-cache-invalidation",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### perf-cdn-cache-control

CDN cache control — cache keys, Vary header strategies, surrogate control, cache purging, and edge TTL management

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "perf-cdn-cache-control",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### perf-cdn-strategies

CDN architecture — edge caching, origin shielding, cache tiers, edge compute, and multi-CDN strategies

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "perf-cdn-strategies",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### perf-client-side-rendering

Client-side rendering — SPA rendering optimization, skeleton screens, progressive rendering, and virtual DOM performance

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "perf-client-side-rendering",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### perf-code-splitting

Code splitting — Route-based, component-based, and vendor splitting with dynamic imports for reduced initial bundle size

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "perf-code-splitting",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### perf-compression

Content compression — Brotli vs gzip comparison, compression levels, content-encoding negotiation, and static vs dynamic compression

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "perf-compression",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### perf-connection-costs

Network connection overhead — DNS resolution, TCP handshake, TLS negotiation, connection reuse, and keep-alive strategies

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "perf-connection-costs",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### perf-connection-pooling

Connection pooling — Pool sizing, connection lifecycle overhead, PgBouncer, serverless pooling, and pool monitoring

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "perf-connection-pooling",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### perf-critical-rendering-path

Browser rendering pipeline — Parse, Style, Layout, Paint, Composite stages and optimization strategies

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "perf-critical-rendering-path",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### perf-cumulative-layout-shift

CLS measurement — layout shift sources, impact/distance fractions, prevention strategies

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "perf-cumulative-layout-shift",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### perf-dom-parsing

HTML parsing — tokenization, tree construction, speculative parsing, parser-blocking scripts

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "perf-dom-parsing",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### perf-edge-rendering

Edge rendering — Edge compute platforms, regional deployment, latency optimization, and edge-specific constraints

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "perf-edge-rendering",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### perf-event-loop

Event loop architecture — task queues, microtask queue, rendering steps, task prioritization

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "perf-event-loop",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### perf-font-loading

Font loading — font-display strategies, subsetting, variable fonts, FOIT/FOUT mitigation, and preloading critical fonts

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "perf-font-loading",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### perf-garbage-collection

Garbage collection — generational GC, V8 heap architecture, GC pauses, allocation pressure

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "perf-garbage-collection",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### perf-heap-profiling

Heap profiling — Chrome DevTools heap snapshots, allocation tracking, retained vs shallow size

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "perf-heap-profiling",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### perf-http2-multiplexing

HTTP/2 stream multiplexing — concurrent requests, server push, prioritization, and head-of-line blocking mitigation

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "perf-http2-multiplexing",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### perf-http3-quic

HTTP/3 and QUIC protocol — 0-RTT connections, connection migration, stream-level flow control, and UDP-based transport

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "perf-http3-quic",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### perf-image-formats

Image formats — WebP, AVIF, JPEG XL format selection, quality tuning, and automated conversion pipelines

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "perf-image-formats",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### perf-index-strategies

Index strategies — B-tree, hash, GIN, GiST, composite, partial, and covering indexes for query optimization

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "perf-index-strategies",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### perf-interaction-to-next-paint

INP measurement — input delay, processing time, presentation delay, long task attribution

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "perf-interaction-to-next-paint",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### perf-largest-contentful-paint

LCP measurement — root causes, sub-part timing, optimization strategies for the largest visible element

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "perf-largest-contentful-paint",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### perf-layout-reflow

Layout triggers — forced synchronous layouts, layout thrashing, containment strategies

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "perf-layout-reflow",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### perf-lazy-loading

Lazy loading — Intersection Observer patterns, route-based loading, component-level deferral, and progressive hydration

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "perf-lazy-loading",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### perf-lazy-loading-media

Media lazy loading — Native image lazy loading, video poster strategies, placeholder techniques, and progressive image rendering

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "perf-lazy-loading-media",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### perf-long-tasks

Long task detection — breaking up work, yielding to the main thread, scheduler API, web workers

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "perf-long-tasks",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### perf-memory-leaks

Memory leak patterns — detached DOM, closures, event listeners, timers, WeakRef strategies

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "perf-memory-leaks",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### perf-module-federation

Module federation — Micro-frontend runtime sharing, remote module loading, shared dependency management, and version negotiation

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "perf-module-federation",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### perf-n-plus-one

N+1 query detection — Identifying N+1 patterns, eager loading, DataLoader batching, and ORM-specific solutions

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "perf-n-plus-one",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### perf-paint-compositing

Paint layers and compositor — GPU compositing, will-change, layer promotion, paint complexity

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "perf-paint-compositing",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### perf-performance-api

Performance Observer and timing APIs — PerformanceEntry types, User Timing, Resource Timing, Navigation Timing

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "perf-performance-api",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### perf-profiling-methodology

Systematic profiling workflow — bottleneck identification, measurement discipline, before/after methodology

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "perf-profiling-methodology",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### perf-query-optimization

Query optimization — EXPLAIN analysis, query plans, index usage, optimizer hints, and slow query diagnosis

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "perf-query-optimization",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### perf-resource-hints

Resource hints — preload, prefetch, preconnect, dns-prefetch, modulepreload, and fetchpriority for optimal resource loading

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "perf-resource-hints",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### perf-responsive-images

Responsive images — srcset, sizes, picture element, art direction, and device-appropriate image delivery

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "perf-responsive-images",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### perf-server-side-caching

Server-side caching — Redis, Memcached, application-level caching patterns, cache-aside, write-through, and read-through strategies

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "perf-server-side-caching",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### perf-server-side-rendering

Server-side rendering — SSR performance trade-offs, hydration cost, streaming SSR, and selective hydration strategies

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "perf-server-side-rendering",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### perf-service-worker-caching

Service Worker caching — Lifecycle management, caching strategies, offline support, background sync, and Workbox patterns

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "perf-service-worker-caching",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### perf-static-generation

Static generation — Build-time rendering, incremental static regeneration, on-demand revalidation, and hybrid rendering strategies

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "perf-static-generation",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### perf-streaming-rendering

Streaming rendering — React Suspense streaming, chunked transfer encoding, out-of-order streaming, and progressive page delivery

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "perf-streaming-rendering",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### perf-style-calculation

CSS selector matching — specificity costs, style recalculation triggers, selector performance

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "perf-style-calculation",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### perf-svg-optimization

SVG optimization — Minification, inline vs external strategies, sprite sheets, accessibility, and rendering performance

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "perf-svg-optimization",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### perf-tree-shaking

Tree shaking — Dead code elimination, side-effect configuration, ESM requirements, and module-level optimization

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "perf-tree-shaking",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### perf-web-workers

Web Workers — Dedicated workers, SharedWorker, Comlink RPC, SharedArrayBuffer, and off-main-thread computation

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "perf-web-workers",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### pr-fleet

Autonomous PR-queue land orchestrator — triage the open-PR queue, fan out worktree-isolated review-assist subagents that run the real code-review pipeline, independently verify each PR by all-OS CI and review verdict, and land exactly the PRs a human authorized up front. Never silently auto-merges unreviewed work.

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "systematic-orchestrator",
  "dependsOn": [
    "harness-roadmap-pilot",
    "harness-code-review"
  ],
  "name": "pr-fleet",
  "platforms": [
    "claude-code",
    "codex",
    "cursor",
    "gemini-cli"
  ],
  "tier": 2,
  "triggers": [
    "manual"
  ],
  "type": "rigid"
}
```

### prisma-client-queries

Query data with Prisma Client findUnique/findMany, create/update/delete, upsert, select, include

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "prisma-client-queries",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### prisma-filtering-sorting

Filter and sort Prisma queries with where, AND/OR/NOT, orderBy, and cursor/offset pagination

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "prisma-filtering-sorting",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### prisma-migrations

Manage database schema evolution with prisma migrate dev/deploy/reset and migration history

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "prisma-migrations",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### prisma-performance-patterns

Optimize Prisma queries with select, findUnique index hits, batching, and avoiding N+1

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "prisma-performance-patterns",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### prisma-raw-queries

Execute type-safe raw SQL with $queryRaw, $executeRaw, and Prisma.sql template tag

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "prisma-raw-queries",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### prisma-relations-pattern

Model one-to-one, one-to-many, many-to-many, and self-relations with @relation in Prisma

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "prisma-relations-pattern",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### prisma-schema-design

Design Prisma schemas with datasource, generator, models, field types, and field attributes

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "prisma-schema-design",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### prisma-seeding-pattern

Seed databases idempotently with prisma/seed.ts, --seed flag, and environment branching

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "prisma-seeding-pattern",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### prisma-soft-delete

Implement soft deletes in Prisma with middleware or $extends query extensions and deletedAt pattern

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "prisma-soft-delete",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### prisma-transactions

Execute atomic operations with Prisma $transaction, interactive transactions, and nested writes

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "prisma-transactions",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### prisma-type-generation

Use generated Prisma types like XxxCreateInput, XxxWhereInput, $Enums, and validator utilities

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "prisma-type-generation",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### product-advisor

Upstream client-inception skill. Ingests a diagram + client conversation notes, drafts a Business Requirements Document (BRD), detects gaps against a fixed completeness rubric, resolves them through a one-question-at-a-time interview with the solution architect, then fans the BRD out into candidate roadmap items and offers a STRATEGY.md seed. Reads but never writes STRATEGY.md; never authors specs (harness-brainstorming owns that). The pre-inception front door to the harness pipeline.

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "configuration-interviewer",
  "dependsOn": [
    "harness-strategy",
    "harness-brainstorming"
  ],
  "name": "product-advisor",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 1,
  "triggers": [
    "manual"
  ],
  "type": "rigid"
}
```

### product-requirements

Guided-interview skill that turns one picked work item into a durable Product Requirements Document (PRD) — user stories, testable EARS acceptance criteria, and MoSCoW prioritization — written to a per-item file under docs/product-requirements/. The product-management middle between product-advisor (BRD) and harness-brainstorming (spec). Reads a BRD/roadmap/description as available and degrades gracefully to description-only; authors requirements but never the spec, never mutates the roadmap, and never assigns.

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "configuration-interviewer",
  "dependsOn": [
    "harness-brainstorming"
  ],
  "name": "product-requirements",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 2,
  "triggers": [
    "manual"
  ],
  "type": "rigid"
}
```

### proposal-pitch

The draft-first proposal pipeline — gather the source, agree the page structure before building, render concept stills, publish as drafts only, and close the loop on the source. Invokes the docs-publish surface (the `harness docs-publish` CLI command / `docs_publish` MCP tool, resolving a configured connector) for the publishing mechanics; enforces drafts-only, render-verify, epistemic-label, and no-customer-data gates. Ships zero company-specific content.

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "disciplined-facilitator",
  "dependsOn": [],
  "name": "proposal-pitch",
  "platforms": [
    "claude-code"
  ],
  "tier": 2,
  "triggers": [
    "manual"
  ],
  "type": "rigid"
}
```

### react-2026

Modern React patterns for 2025-2026 including React 19, Compiler, and AI-integrated UI

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "react-2026",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### react-client-rendering

Render React entirely in the browser for highly interactive single-page applications

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "react-client-rendering",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### react-compound-pattern

Build multi-part components that share state implicitly via context

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "react-compound-pattern",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### react-concurrent-ui

Build responsive UIs using React 18 concurrent features and transitions

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "react-concurrent-ui",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### react-container-presentational

Separate data-fetching containers from stateless presentational components

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "react-container-presentational",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### react-context-pattern

Share state across the component tree without prop drilling using React Context

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "react-context-pattern",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### react-dynamic-import

Load modules on demand to reduce initial bundle size and improve startup performance

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "react-dynamic-import",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### react-hoc-pattern

Extend component behavior by wrapping in a higher-order component

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "react-hoc-pattern",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### react-hooks-pattern

Reuse stateful logic across components via custom hooks

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "react-hooks-pattern",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### react-islands-pattern

Hydrate only interactive UI islands, leaving static content as HTML

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "react-islands-pattern",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### react-memoization-pattern

Prevent expensive re-renders and recomputations with React memoization APIs

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "react-memoization-pattern",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### react-progressive-hydration

Delay hydration of below-fold or non-critical components to improve TTI

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "react-progressive-hydration",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### react-provider-pattern

Make data available to any component in the tree without prop drilling

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "react-provider-pattern",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### react-render-props-pattern

Share stateful logic by passing a render function as a prop

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "react-render-props-pattern",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### react-server-components

Run components on the server to eliminate client JavaScript and enable direct data access

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "react-server-components",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### react-server-rendering

Pre-render React components on the server for improved SEO and initial load performance

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "react-server-rendering",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### react-state-management-pattern

Choose the right state management approach for your React application scale

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "react-state-management-pattern",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### react-static-import

Bundle all dependencies at build time for predictable loading performance

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "react-static-import",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### react-suspense-pattern

Declaratively handle async loading states with React Suspense boundaries

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "react-suspense-pattern",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### redux-entity-adapter

Normalize collections with createEntityAdapter for efficient CRUD on entity state

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "redux-entity-adapter",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### redux-listener-middleware

React to dispatched actions with createListenerMiddleware for side effects

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "redux-listener-middleware",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### redux-persistence-pattern

Persist and rehydrate Redux state across sessions with redux-persist or manual storage

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "redux-persistence-pattern",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### redux-rtk-optimistic

Implement optimistic updates and pessimistic updates with RTK Query cache

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "redux-rtk-optimistic",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### redux-rtk-query-endpoints

Define query and mutation endpoints with cache tags and transformations

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "redux-rtk-query-endpoints",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### redux-rtk-query-setup

Configure RTK Query API service with createApi and fetchBaseQuery

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "redux-rtk-query-setup",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### redux-selectors-pattern

Derive and memoize state with createSelector for efficient re-renders

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "redux-selectors-pattern",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### redux-slice-pattern

Structure Redux state with createSlice for reducers, actions, and initial state

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "redux-slice-pattern",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### redux-store-setup

Configure the Redux store with configureStore, middleware, and dev tools

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "redux-store-setup",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### redux-testing-patterns

Test Redux slices, thunks, selectors, and connected components effectively

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "redux-testing-patterns",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### redux-thunk-pattern

Handle async operations with createAsyncThunk for data fetching and side effects

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "redux-thunk-pattern",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### redux-typescript-patterns

Type Redux state, actions, thunks, and hooks with full TypeScript inference

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "redux-typescript-patterns",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### resilience-bulkhead-pattern

Isolate failures with bulkheads to limit blast radius of failing components

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "resilience-bulkhead-pattern",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### resilience-chaos-testing

Validate resilience by injecting controlled failures with chaos engineering techniques

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "resilience-chaos-testing",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### resilience-circuit-breaker

Protect services from cascading failures with the circuit breaker pattern

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "resilience-circuit-breaker",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### resilience-dead-letter

Handle permanently failing messages with dead letter queues for inspection and reprocessing

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "resilience-dead-letter",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### resilience-fallback-pattern

Provide degraded but functional responses when primary operations fail

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "resilience-fallback-pattern",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### resilience-health-checks

Implement health check endpoints for service readiness and liveness monitoring

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "resilience-health-checks",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### resilience-idempotency

Ensure safe retries with idempotency keys and at-least-once delivery guarantees

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "resilience-idempotency",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### resilience-rate-limiting

Control request throughput with rate limiting using token bucket and sliding window algorithms

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "resilience-rate-limiting",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### resilience-retry-pattern

Handle transient failures with configurable retry strategies and backoff

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "resilience-retry-pattern",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### resilience-timeout-pattern

Prevent resource exhaustion with request timeouts and AbortController

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "resilience-timeout-pattern",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### roadmap-fleet

Autonomous batch-build orchestrator — score and confirm a batch of backlog candidates, fan out worktree-isolated subagents that run the real per-item pipeline, independently verify each result by artifact and all-OS CI, and hand back a batch of merge-ready PRs for one bulk human review. Never auto-merges.

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "systematic-orchestrator",
  "dependsOn": [
    "harness-roadmap-pilot",
    "harness-brainstorming",
    "harness-autopilot",
    "harness-code-review"
  ],
  "name": "roadmap-fleet",
  "platforms": [
    "claude-code",
    "codex",
    "cursor",
    "gemini-cli"
  ],
  "tier": 2,
  "triggers": [
    "manual"
  ],
  "type": "rigid"
}
```

### security-abac-design

Attribute-based access control -- policy engines, XACML concepts, attribute evaluation, and when ABAC is the right model over RBAC

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "security-abac-design",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### security-asymmetric-encryption

RSA, elliptic curve cryptography (ECDSA, Ed25519, X25519), key exchange (ECDHE), and when to use asymmetric vs symmetric encryption

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "security-asymmetric-encryption",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### security-attack-trees

Attack tree construction and analysis -- modeling multi-step adversary strategies as goal-oriented tree decompositions for prioritizing defenses

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "security-attack-trees",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### security-audit-log-design

Security audit log design -- what to log, structured event format, tamper evidence, retention, and the balance between observability and privacy

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "security-audit-log-design",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### security-authentication-flows

Secure design of login, registration, password reset, magic link, and SSO authentication flows -- preventing account enumeration, credential theft, and session fixation

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "security-authentication-flows",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### security-capability-based-security

Object capabilities vs ambient authority -- unforgeable tokens that grant specific rights, eliminating confused deputy attacks by construction

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "security-capability-based-security",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### security-certificate-management

CA hierarchy, certificate pinning, Certificate Transparency, ACME/Let's Encrypt, and the lifecycle of X.509 certificates from issuance to revocation

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "security-certificate-management",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### security-ci-security-testing

SAST, DAST, SCA, and secrets scanning in CI/CD pipelines -- automated security testing that runs on every commit

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "security-ci-security-testing",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### security-code-signing

Artifact signing, verification pipelines, Sigstore keyless signing, and ensuring that deployed software was built by trusted parties

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "security-code-signing",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### security-compliance-logging

SOC2, GDPR, HIPAA, and PCI-DSS logging requirements -- what to log, how long to retain it, and how to prove compliance through audit trails

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "security-compliance-logging",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### security-craft

LLM-judgment critique of security posture (TS/JS source). Threat-modeling-as-skill — critiques whether trust boundaries are respected, where implicit privilege escalation lurks, whether the code defends in depth, whether least authority is honored. AST-driven signal detection fires only on files with security-relevant constructs; conservative confidence defaults manage the FP risk inherent in judgment-based security. Sixth non-design craft-pipeline ceiling skill (the final sub-project,

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "constructive-architect",
  "dependsOn": [
    "harness-security-scan",
    "harness-security-review"
  ],
  "name": "security-craft",
  "platforms": [
    "claude-code"
  ],
  "tier": 2,
  "triggers": [
    "manual",
    "on_pr",
    "on_new_feature"
  ],
  "type": "rigid"
}
```

### security-credential-storage

Password hashing with Argon2id, bcrypt, and scrypt -- salting, peppering, adaptive cost, and upgrade strategies for legacy hashes

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "security-credential-storage",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### security-cryptographic-randomness

Cryptographically secure random number generation -- CSPRNG, entropy sources, nonce generation, and why Math.random() will get you breached

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "security-cryptographic-randomness",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### security-dependency-auditing

Vulnerability scanning, lockfile integrity, update strategies, and managing the security risk of third-party dependencies

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "security-dependency-auditing",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### security-deserialization-attacks

Insecure deserialization vulnerabilities -- gadget chains, object injection, and why accepting serialized objects from untrusted sources is inherently dangerous

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "security-deserialization-attacks",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### security-environment-variable-risks

Why environment variables leak secrets and safer alternatives -- process listings, crash dumps, child processes, logging, and the 12-factor app's blind spot

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "security-environment-variable-risks",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### security-fleet

Autonomous security backlog sweep — enumerate risk-ranked code areas plus the resolved dependency tree, discard every candidate that cannot produce concrete evidence, confirm one ranked batch with the human, then route each survivor by a bounded-fix test — safe bounded fixes are built through the real pipeline into independently verified PRs, risky or structural findings are filed with their evidence packet instead of force-fixed. Never auto-merges, never closes a finding by suppression, and never reports a secret's value.

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "systematic-orchestrator",
  "dependsOn": [
    "harness-security-scan",
    "harness-supply-chain-audit",
    "security-craft",
    "harness-security-review",
    "harness-roadmap-pilot"
  ],
  "name": "security-fleet",
  "platforms": [
    "claude-code",
    "codex",
    "cursor",
    "gemini-cli"
  ],
  "tier": 2,
  "triggers": [
    "manual"
  ],
  "type": "rigid"
}
```

### security-forensics-fundamentals

Digital forensics for developers -- log analysis, artifact collection, timeline reconstruction, and maintaining chain of custody for evidence

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "security-forensics-fundamentals",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### security-hashing-fundamentals

Cryptographic hash functions (SHA-256, SHA-3, BLAKE3), collision resistance, preimage resistance, and correct use cases for hashing vs encryption vs MAC

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "security-hashing-fundamentals",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### security-hmac-signatures

HMAC for message authentication and digital signatures for non-repudiation -- when to use which, how they fail, and implementation pitfalls

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "security-hmac-signatures",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### security-hsts-preloading

HTTP Strict Transport Security and preload lists -- eliminating the first-request HTTP downgrade window and ensuring browsers never connect over plaintext

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "security-hsts-preloading",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### security-identity-verification

Continuous authentication and device trust -- verifying identity beyond the initial login using behavioral signals, device posture, and risk-adaptive challenges

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "security-identity-verification",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### security-incident-containment

Incident triage, isolation strategies, evidence preservation, and the first 60 minutes of a security incident -- what to do and what not to touch

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "security-incident-containment",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### security-injection-families

Unified mental model for injection vulnerabilities -- SQL, command, LDAP, XSS, template, header -- all share the same root cause of mixing code and data

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "security-injection-families",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### security-log-correlation

SIEM architecture, correlation rules, alert fatigue management, and turning raw logs into actionable security intelligence

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "security-log-correlation",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### security-memory-safety

Memory safety vulnerabilities -- buffer overflows, use-after-free, double-free -- and mitigation through safe languages, bounds checking, and memory-safe abstractions

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "security-memory-safety",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### security-mfa-design

Multi-factor authentication design -- TOTP, WebAuthn/passkeys, SMS risks, recovery flows, and step-up authentication for sensitive operations

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "security-mfa-design",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### security-microsegmentation

Network and application-level segmentation -- isolating workloads so that compromising one service does not grant lateral movement to others

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "security-microsegmentation",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### security-mtls-design

Mutual TLS for service-to-service authentication -- both sides present certificates, eliminating the need for shared secrets or API keys between services

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "security-mtls-design",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### security-penetration-testing

Penetration test scoping, methodology, rules of engagement, and remediation workflows -- maximizing the value of offensive security assessments

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "security-penetration-testing",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### security-post-incident-review

Blameless post-incident reviews for security incidents -- structured analysis, root cause identification, remediation tracking, and organizational learning

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "security-post-incident-review",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### security-race-conditions

TOCTOU vulnerabilities, double-spend attacks, file system races, and the security implications of non-atomic operations in concurrent systems

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "security-race-conditions",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### security-rbac-design

Role-based access control modeling -- role hierarchies, permission granularity, role explosion prevention, and the principle of least privilege

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "security-rbac-design",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### security-rebac-design

Relationship-based access control using the Zanzibar model -- modeling authorization as a graph of relationships between subjects and resources

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "security-rebac-design",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### security-sbom-provenance

Software bill of materials, SLSA framework, and build provenance -- proving what went into your software and how it was built

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "security-sbom-provenance",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### security-secrets-lifecycle

Secret rotation, distribution, revocation, and the principle that secrets must be ephemeral, auditable, and never embedded in code

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "security-secrets-lifecycle",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### security-security-champions

Embedding security expertise in development teams through security champion programs -- scaling security knowledge without scaling the security team

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "security-security-champions",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### security-session-management

Session lifecycle design -- token generation, fixation prevention, binding, idle and absolute timeouts, revocation, and secure cookie configuration

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "security-session-management",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### security-shift-left-design

Integrating threat modeling and security analysis into the design phase -- finding security flaws when they cost $1 to fix instead of $100 in production

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "security-shift-left-design",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### security-symmetric-encryption

AES and ChaCha20 symmetric ciphers, modes of operation (GCM vs CBC vs CTR), key sizes, IV/nonce management, and authenticated encryption

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "security-symmetric-encryption",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### security-threat-modeling-process

End-to-end threat modeling process -- from scoping and DFD construction through threat enumeration, risk rating, and mitigation tracking

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "security-threat-modeling-process",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### security-threat-modeling-stride

STRIDE methodology for systematic threat identification across spoofing, tampering, repudiation, information disclosure, denial of service, and elevation of privilege

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "security-threat-modeling-stride",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### security-tls-fundamentals

TLS 1.3 handshake, cipher suite selection, certificate chain validation, and why TLS 1.0/1.1 must be disabled

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "security-tls-fundamentals",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### security-trust-boundaries

Trust boundary identification, data flow diagrams, and the principle that all security controls concentrate at boundary crossings

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "security-trust-boundaries",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### security-vault-patterns

Centralized secrets management using vault systems -- HashiCorp Vault, cloud KMS, sealed secrets, dynamic credentials, and the principle of secrets as cattle not pets

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "security-vault-patterns",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### security-vulnerability-disclosure

Responsible disclosure, CVE process, coordinated vulnerability disclosure, and managing the lifecycle from discovery to public advisory

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "security-vulnerability-disclosure",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### security-zero-trust-principles

Zero trust architecture principles -- never trust, always verify, least privilege, assume breach, and continuous verification regardless of network position

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "security-zero-trust-principles",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### spec-craft

LLM-judgment critique of spec quality (proposals + ADRs) against a curated rubric catalog. Per-section critique with rubric-to-section mapping. Second craft-pipeline ceiling skill; highest-leverage because spec quality compounds across the lifecycle below it. Triggered the shared craft infrastructure extraction.

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "constructive-architect",
  "dependsOn": [
    "harness-soundness-review",
    "harness-design-craft"
  ],
  "name": "spec-craft",
  "platforms": [
    "claude-code"
  ],
  "tier": 2,
  "triggers": [
    "manual",
    "on_pr",
    "on_new_feature"
  ],
  "type": "rigid"
}
```

### state-context-pattern

Manage shared state with React Context and useReducer for prop-drilling avoidance

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "state-context-pattern",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### state-jotai-atoms

Build bottom-up atomic state with Jotai atoms for granular React state management

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "state-jotai-atoms",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### state-selection-patterns

Select and derive state efficiently across stores to minimize component re-renders

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "state-selection-patterns",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### state-server-client-sync

Synchronize server state with client state using React Query patterns and cache coordination

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "state-server-client-sync",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### state-zustand-devtools

Debug Zustand stores with Redux DevTools integration via the devtools middleware

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "state-zustand-devtools",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### state-zustand-immer

Write mutable-style updates in Zustand stores with the Immer middleware

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "state-zustand-immer",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### state-zustand-persist

Persist Zustand store to localStorage or custom storage with the persist middleware

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "state-zustand-persist",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### state-zustand-react

Optimize Zustand re-renders with selectors, shallow comparison, and subscription patterns

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "state-zustand-react",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### state-zustand-slices

Split large Zustand stores into composable slices for modular state

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "state-zustand-slices",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### state-zustand-store

Create lightweight global stores with Zustand's create function

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "state-zustand-store",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### svelte-adapter-config

Configure SvelteKit deployment adapters for Node, Vercel, Cloudflare, and static hosting

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "svelte-adapter-config",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### svelte-component-composition

Compose Svelte 5 components with snippets, {@render}, children, and named content slots

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "svelte-component-composition",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### svelte-error-pages

Handle expected and unexpected errors in SvelteKit using +error.svelte, error(), and handleError hooks

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "svelte-error-pages",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### svelte-form-actions

Handle form submissions with SvelteKit actions, use:enhance, fail(), redirect(), and progressive enhancement

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "svelte-form-actions",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### svelte-load-functions

Fetch and stream data for SvelteKit pages using load(), server load, universal load, and depends()

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "svelte-load-functions",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### svelte-performance-patterns

Optimize SvelteKit performance with code splitting, preloading, virtualization, and lazy loading

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "svelte-performance-patterns",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### svelte-routing-pattern

Structure SvelteKit applications with file-based routing, +page.svelte, +layout.svelte, and route params

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "svelte-routing-pattern",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### svelte-runes-pattern

Write reactive Svelte 5 components using $state, $derived, $effect, $props, and $bindable

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "svelte-runes-pattern",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### svelte-server-hooks

Intercept requests and handle errors in SvelteKit using hooks.server.ts with handle, handleFetch, handleError, and sequence

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "svelte-server-hooks",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### svelte-state-management

Manage local, shared, and cross-component state in SvelteKit using runes, context API, and module-level state

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "svelte-state-management",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### svelte-stores-pattern

Share reactive state across components with Svelte writable, readable, derived stores, and custom store contracts

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "svelte-stores-pattern",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### svelte-testing-patterns

Test Svelte components and SvelteKit routes using Vitest, @testing-library/svelte, render, and fireEvent

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "svelte-testing-patterns",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### svelte-transitions-animations

Animate Svelte elements with built-in transitions (fade/fly/slide), custom transitions, and motion directives

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "svelte-transitions-animations",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### tanstack-cache-management

queryClient.setQueryData, cancelQueries, removeQueries, and observer patterns

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "tanstack-cache-management",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### tanstack-dependent-queries

enabled flag, query dependencies, chaining, and parallel vs sequential queries

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "tanstack-dependent-queries",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### tanstack-devtools

@tanstack/react-query-devtools, cache panel, network inspector, and debugging

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "tanstack-devtools",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### tanstack-infinite-queries

useInfiniteQuery, getNextPageParam, cursor pagination, and flattening pages

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "tanstack-infinite-queries",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### tanstack-mutation-patterns

useMutation, variables, onSuccess/onError/onSettled, and retry configuration

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "tanstack-mutation-patterns",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### tanstack-optimistic-updates

Optimistic mutations, onMutate, rollback on error, and cache snapshot patterns

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "tanstack-optimistic-updates",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### tanstack-prefetching

prefetchQuery, dehydrate/hydrate, SSR with Next.js, and router-level prefetch

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "tanstack-prefetching",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### tanstack-query-invalidation

invalidateQueries, refetchType, staleTime, and gcTime tuning

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "tanstack-query-invalidation",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### tanstack-query-keys

Query key factories, key hierarchies, colocated keys, and invalidation scope

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "tanstack-query-keys",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### tanstack-suspense-mode

useSuspenseQuery, error boundaries, streaming, and React 18 integration

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "tanstack-suspense-mode",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### test-accessibility-testing

Automate WCAG accessibility checks using axe-core with Playwright and jest-axe

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "test-accessibility-testing",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### test-component-react

Test React components with Testing Library using user-centric queries and async utilities

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "test-component-react",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### test-component-svelte

Test Svelte components with Testing Library using render, fireEvent, and waitFor

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "test-component-svelte",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### test-contract-testing

Verify service compatibility using Pact consumer-provider contract tests

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "test-contract-testing",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### test-coverage-patterns

Configure and interpret test coverage thresholds for meaningful quality signals

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "test-coverage-patterns",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### test-craft

LLM-judgment critique of test quality across vitest / jest / mocha / playwright / pytest. Fourth craft-pipeline ceiling skill. Per-test critique with best-effort source pairing for contract-vs-implementation rubrics. Tests are often the worst-written code in a codebase precisely because the rule-based floor is so easy to clear.

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "constructive-architect",
  "dependsOn": [
    "harness-tdd",
    "harness-design-craft"
  ],
  "name": "test-craft",
  "platforms": [
    "claude-code"
  ],
  "tier": 2,
  "triggers": [
    "manual",
    "on_pr",
    "on_new_feature"
  ],
  "type": "rigid"
}
```

### test-e2e-strategy

Choose the right test layer (unit/integration/E2E) and prevent flaky tests in CI

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "test-e2e-strategy",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### test-factory-patterns

Build maintainable test data using factory functions, builders, and faker.js

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "test-factory-patterns",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### test-fleet

Autonomous test-coverage backlog sweep — enumerate under-covered areas and uncovered critical paths, confirm a ranked target batch with the human once, fan out worktree-isolated subagents that author tests via the real tdd then test-craft flow, independently verify each by added behavior-asserting tests plus a coverage delta plus all-OS CI, and hand back a batch of green test PRs for human review. Never auto-merges.

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "systematic-orchestrator",
  "dependsOn": [
    "harness-test-advisor",
    "harness-tdd",
    "test-craft",
    "harness-roadmap-pilot"
  ],
  "name": "test-fleet",
  "platforms": [
    "claude-code",
    "codex",
    "cursor",
    "gemini-cli"
  ],
  "tier": 2,
  "triggers": [
    "manual"
  ],
  "type": "rigid"
}
```

### test-integration-patterns

Write integration tests that exercise real dependencies using test databases and containers

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "test-integration-patterns",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### test-mock-patterns

Mock modules, functions, and timers in Vitest and Jest to isolate units under test

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "test-mock-patterns",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### test-msw-pattern

Intercept HTTP requests in tests using Mock Service Worker handlers at the network level

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "test-msw-pattern",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### test-performance-testing

Measure and assert on code performance using vitest bench and timing budgets

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "test-performance-testing",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### test-playwright-patterns

Write maintainable Playwright tests using page objects, fixtures, and parallel execution

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "test-playwright-patterns",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### test-playwright-setup

Configure Playwright test runner with fixtures, reporters, and browser contexts

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "test-playwright-setup",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### test-property-based

Generate exhaustive test cases automatically using fast-check property-based testing

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "test-property-based",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### test-snapshot-patterns

Use snapshot testing selectively for stable outputs, knowing when to avoid it

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "test-snapshot-patterns",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### test-tdd-workflow

Drive design through tests using red-green-refactor cycle and test-first discipline

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "test-tdd-workflow",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### test-unit-patterns

Write focused, isolated unit tests using AAA pattern with describe/it/expect

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "test-unit-patterns",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### test-vitest-config

Configure Vitest with workspaces, environments, coverage, and TypeScript integration

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "test-vitest-config",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### trpc-context-pattern

createTRPCContext, request context, database injection, and session access

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "trpc-context-pattern",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### trpc-error-handling

TRPCError, error codes (UNAUTHORIZED, NOT_FOUND), and custom error formatters

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "trpc-error-handling",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### trpc-input-validation

Zod integration, input/output schemas, .input()/.output(), and transformers

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "trpc-input-validation",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### trpc-middleware-pattern

tRPC middleware, t.middleware, context enrichment, and auth guards

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "trpc-middleware-pattern",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### trpc-nextjs-integration

App Router integration, createCaller, server-side caller, and RSC patterns

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "trpc-nextjs-integration",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### trpc-react-query-integration

api.xxx.useQuery, useMutation, type inference end-to-end with TanStack Query

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "trpc-react-query-integration",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### trpc-router-composition

Router merging, nested routers, procedure organization, and createTRPCRouter

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "trpc-router-composition",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### trpc-subscription-pattern

WebSocket subscriptions, observable, on, and asyncGenerator patterns in tRPC

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "trpc-subscription-pattern",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### ts-async-patterns

Type async/await, Promise chains, and concurrent patterns correctly in TypeScript

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "ts-async-patterns",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### ts-branded-types

Prevent mixing semantically distinct primitives using branded opaque types

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "ts-branded-types",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### ts-class-patterns

Use abstract classes, private fields, access modifiers, and implements vs extends correctly

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "ts-class-patterns",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### ts-conditional-types

Use conditional types, infer, and distributive logic to derive types programmatically

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "ts-conditional-types",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### ts-config-patterns

Configure tsconfig with extends, project references, composite builds, and incremental compilation

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "ts-config-patterns",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### ts-declaration-merging

Extend existing types, modules, and namespaces via declaration merging and augmentation

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "ts-declaration-merging",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### ts-decorator-patterns

Implement class, method, and property decorators with reflect-metadata in TypeScript

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "ts-decorator-patterns",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### ts-discriminated-unions

Model mutually exclusive states with discriminated unions and exhaustive narrowing

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "ts-discriminated-unions",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### ts-error-handling-types

Model and type errors explicitly using Result types, discriminated unions, and typed throws

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "ts-error-handling-types",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### ts-generics-pattern

Write reusable, type-safe functions and interfaces using TypeScript generics

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "ts-generics-pattern",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### ts-mapped-types

Transform object types by iterating over their keys with mapped type syntax

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "ts-mapped-types",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### ts-module-patterns

Organize TypeScript code with ES modules, barrel exports, path aliases, and declaration files

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "ts-module-patterns",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### ts-performance-patterns

Reduce TypeScript compilation time and type complexity with targeted optimizations

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "ts-performance-patterns",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### ts-satisfies-operator

Validate objects against a type without widening using the satisfies keyword

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "ts-satisfies-operator",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### ts-strict-mode

Enable and satisfy strict TypeScript checks including strictNullChecks and exactOptionalPropertyTypes

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "ts-strict-mode",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### ts-template-literal-types

Construct precise string types using template literal syntax and string manipulation types

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "ts-template-literal-types",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### ts-testing-types

Test TypeScript types at compile time using expect-type, tsd, and vitest type matchers

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "ts-testing-types",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### ts-type-guards

Narrow union types safely using type guards, assertion functions, and control flow

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "ts-type-guards",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### ts-utility-types

Apply built-in TypeScript utility types to transform and compose types without redundancy

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "ts-utility-types",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### ts-zod-integration

Use Zod schemas as the single source of truth for runtime validation and TypeScript types

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "ts-zod-integration",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### uat-signoff

Human-judged acceptance sign-off skill — the terminal, human-authority stage of the change lifecycle under the `docs/changes/&lt;slug>/` directory. Reads the change's proposal.md Success Criteria (plus plans and prior review/outcome-eval records) as the acceptance checklist, walks a human through user-acceptance testing one item at a time (ACCEPT / REJECT / CHANGES_REQUESTED), captures one overall decision plus the signer, writes `docs/changes/&lt;slug>/signoff.md`, and records a single execution_outcome node via uat_signoff. The human is the authority — it never runs an LLM verdict, never derives ship authority, and never blocks. Advisory / record-only.

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "configuration-interviewer",
  "dependsOn": [
    "outcome-eval"
  ],
  "name": "uat-signoff",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 1,
  "triggers": [
    "manual"
  ],
  "type": "rigid"
}
```

### ux-active-voice

Active voice in UI writing — active vs passive voice, when passive is acceptable, verb-first patterns for buttons and actions

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "ux-active-voice",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### ux-button-cta-copy

Button and CTA copy — verb-noun pattern, specificity over vagueness, context-sensitive labels, and writing buttons that tell users exactly what will happen

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "ux-button-cta-copy",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### ux-confirmation-dialogs

Confirmation dialogs — destructive action writing, consequence clarity, and specific button labels that make irreversibility unmistakable

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "ux-confirmation-dialogs",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### ux-content-hierarchy

Content hierarchy in UI — heading structure, progressive disclosure in text, inverted pyramid for interface writing

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "ux-content-hierarchy",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### ux-data-table-copy

Data table copy — column headers, empty cells, truncation patterns, filter and sort labels, bulk action copy

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "ux-data-table-copy",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### ux-destructive-action-copy

Destructive action copy — irreversibility warnings, undo availability, double-confirmation patterns, cooldown messaging

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "ux-destructive-action-copy",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### ux-empty-states

Empty states — first-use, user-cleared, and no-results patterns that motivate action, set expectations, and turn blank screens into onramps

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "ux-empty-states",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### ux-error-messages

Error messages — what went wrong, why it matters, how to fix it, the three-part error pattern for clear, actionable error communication

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "ux-error-messages",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### ux-error-severity

Error severity communication — calibrating error tone to severity, from field validation to system failure to data loss

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "ux-error-severity",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### ux-form-labels

Form labels and helper text — label clarity, placeholder anti-patterns, required-field indication, and writing forms that users complete without confusion

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "ux-form-labels",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### ux-inclusive-language

Inclusive language in UI — gender-neutral, ability-neutral, culture-aware writing, avoiding idioms that exclude

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "ux-inclusive-language",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### ux-internationalization-writing

Writing for internationalization — source strings that survive translation, concatenation traps, pluralization, date and number references

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "ux-internationalization-writing",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### ux-loading-states

Loading state copy — progress transparency, expectation setting, and writing text that reduces perceived wait time and prevents users from abandoning

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "ux-loading-states",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### ux-microcopy-principles

Microcopy principles — clarity, brevity, human voice, active voice, and the core rules all UI text follows

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "ux-microcopy-principles",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### ux-navigation-labels

Navigation label writing — menu item naming, breadcrumb clarity, tab labels, and sidebar organization that users scan without reading

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "ux-navigation-labels",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### ux-notification-copy

Notification and alert copy — urgency calibration, actionability, toast vs banner vs modal selection, and writing messages that inform without overwhelming

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "ux-notification-copy",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### ux-onboarding-copy

Onboarding copy — progressive disclosure, value-first framing, reducing anxiety, and welcome flows that convert sign-ups into active users

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "ux-onboarding-copy",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### ux-permission-access-copy

Permission and access copy — role-based messaging, upgrade prompts, gating copy, "you don't have access" patterns

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "ux-permission-access-copy",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### ux-plain-language

Plain language for UI — reading level targeting, jargon elimination, sentence structure for scanning

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "ux-plain-language",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### ux-search-copy

Search copy — placeholder text, zero-results messaging, autocomplete hints, search scope indicators, saved search patterns

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "ux-search-copy",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### ux-settings-preferences

Settings and preferences copy — toggle descriptions, preference explanations, consequence previews, settings organization

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "ux-settings-preferences",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### ux-success-feedback

Success feedback copy — confirmation messages, celebration calibration, and next-step prompts that close the action loop and guide users forward

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "ux-success-feedback",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### ux-tooltip-contextual-help

Tooltip and contextual help writing — when to use tooltips, what to put in them, and progressive disclosure patterns that educate without interrupting

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "ux-tooltip-contextual-help",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### ux-voice-tone

Voice and tone in UI writing — defining voice (constant) vs tone (contextual), formality calibration, and emotional register

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "ux-voice-tone",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### ux-writing-for-scanning

Writing for scanning — F-pattern, front-loading keywords, chunking, bullet vs prose decisions for UI text

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "ux-writing-for-scanning",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### validate-context-engineering

Validate repository context engineering practices (AGENTS.md, doc coverage, knowledge map)

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "meticulous-verifier",
  "dependsOn": [],
  "name": "validate-context-engineering",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual",
    "on_pr",
    "on_commit"
  ],
  "type": "flexible"
}
```

### vue-async-components

Load Vue components lazily to reduce initial bundle size using defineAsyncComponent

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "vue-async-components",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### vue-component-events

Communicate from child to parent components using emits and defineEmits

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "vue-component-events",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### vue-composables-pattern

Extract and reuse stateful logic across components using Vue composables

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "vue-composables-pattern",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### vue-directive-pattern

Create custom Vue directives for low-level DOM manipulation and reusable DOM behavior

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "vue-directive-pattern",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### vue-pinia-pattern

Manage shared application state with Pinia stores in the Options or Setup style

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "vue-pinia-pattern",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### vue-provide-inject

Share data across a component tree without prop-drilling using provide/inject

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "vue-provide-inject",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### vue-reactive-refs

Create and manage reactive primitive values and objects using ref and reactive

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "vue-reactive-refs",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### vue-renderless-components

Extract behavior into components that render nothing, delegating all rendering to the consumer via slots

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "vue-renderless-components",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### vue-slots-pattern

Use named, scoped, and dynamic slots to build flexible, composable component APIs

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "vue-slots-pattern",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### vue-teleport-pattern

Render a component's HTML at a different location in the DOM using Vue's Teleport

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "vue-teleport-pattern",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### vue-watchers-pattern

React to data changes with watch and watchEffect for side effects and async operations

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "vue-watchers-pattern",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### xstate-actor-pattern

Spawn and manage child actors for independent concurrent state machines

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "xstate-actor-pattern",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### xstate-guards-actions

Control transitions with guards and execute side effects with actions

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "xstate-guards-actions",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### xstate-history-states

Remember and restore previous state configurations with history states

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "xstate-history-states",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### xstate-invoke-pattern

Invoke promises, callbacks, and child machines as services in state nodes

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "xstate-invoke-pattern",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### xstate-machine-definition

Define statecharts with createMachine for explicit state transitions and context

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "xstate-machine-definition",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### xstate-parallel-states

Model concurrent state regions with parallel state nodes

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "xstate-parallel-states",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### xstate-react-integration

Connect XState machines to React components with useMachine and useActor hooks

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "xstate-react-integration",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### xstate-testing-patterns

Test XState machines with model-based testing and direct state assertions

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "xstate-testing-patterns",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### xstate-typegen

Generate full type safety for XState machines with typegen and setup patterns

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "xstate-typegen",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### xstate-visualization

Visualize and inspect XState machines with Stately Inspector and VS Code extension

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "xstate-visualization",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### zod-array-validation

Validate arrays, tuples, records, maps, and sets with Zod's collection primitives

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "zod-array-validation",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### zod-async-validation

Run async Zod validation with parseAsync, safeParseAsync, async refinements, and external checks

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "zod-async-validation",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### zod-error-handling

Handle Zod validation failures with safeParse, ZodError, error.format, error.flatten, and custom error maps

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "zod-error-handling",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### zod-infer-types

Derive TypeScript types from Zod schemas with z.infer, input vs output types, and ZodTypeAny

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "zod-infer-types",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### zod-nextjs-integration

Validate Next.js server actions, API routes, and form data with Zod schemas

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "zod-nextjs-integration",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### zod-object-patterns

Shape and compose Zod objects with pick, omit, partial, required, extend, merge, strict, and passthrough

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "zod-object-patterns",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### zod-schema-definition

Define runtime-validated TypeScript schemas with z.object, primitives, enums, and composition

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "zod-schema-definition",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### zod-string-validation

Validate and transform strings with Zod's min, max, email, url, regex, trim, and custom messages

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "zod-string-validation",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### zod-transform-refine

Transform and validate data with Zod's transform, refine, superRefine, and preprocess APIs

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "zod-transform-refine",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

### zod-union-discriminated

Model variant types with z.union, z.discriminatedUnion, z.intersection, and type narrowing

**Contract:**

```json
{
  "catalogTier": 1,
  "cognitiveMode": "advisory-guide",
  "dependsOn": [],
  "name": "zod-union-discriminated",
  "platforms": [
    "claude-code",
    "gemini-cli",
    "cursor",
    "codex"
  ],
  "tier": 3,
  "triggers": [
    "manual"
  ],
  "type": "knowledge"
}
```

