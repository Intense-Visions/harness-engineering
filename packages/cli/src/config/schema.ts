import { z } from 'zod';
import { ArchConfigSchema, GoldenConfigSchema } from '@harness-engineering/core';
import { skipDirGlobs } from '@harness-engineering/graph';
import { BackendDefSchema, RoutingConfigSchema } from '@harness-engineering/orchestrator';
import { IngestConfigSchema } from './ingest-schema.js';
import { AnalysisConfigSchema, DepsConfigSchema } from './analysis-schema.js';

export { IngestConfigSchema } from './ingest-schema.js';
export type { IngestConfig } from './ingest-schema.js';
export { AnalysisConfigSchema, loadAnalysisExclude } from './analysis-schema.js';
export { DepsConfigSchema, loadDepsExclude } from './analysis-schema.js';
export type { AnalysisConfig, DepsConfig } from './analysis-schema.js';

/**
 * Schema for architectural layer definitions.
 */
export const LayerSchema = z.object({
  /** Human-readable name of the layer */
  name: z.string(),
  /** Glob pattern matching files in this layer */
  pattern: z.string(),
  /** Names of other layers this layer is allowed to import from */
  allowedDependencies: z.array(z.string()),
});

/**
 * Schema for forbidden import rules.
 */
export const ForbiddenImportSchema = z.object({
  /** Glob pattern matching source files this rule applies to */
  from: z.string(),
  /** List of modules or patterns that are not allowed to be imported */
  disallow: z.array(z.string()),
  /** Optional custom message to display on violation */
  message: z.string().optional(),
});

/**
 * Schema for boundary configuration.
 */
export const BoundaryConfigSchema = z.object({
  /** List of globs where files MUST have a corresponding schema/definition */
  requireSchema: z.array(z.string()),
});

/**
 * Schema for agent-specific configuration.
 */
export const AgentConfigSchema = z.object({
  /** The execution environment for agents */
  executor: z.enum(['subprocess', 'cloud', 'noop']).default('subprocess'),
  /** Maximum execution time in milliseconds */
  timeout: z.number().default(300000),
  /** Optional list of skill IDs pre-authorized for the agent */
  skills: z.array(z.string()).optional(),
  /**
   * Named backend definitions (Spec 2 — multi-backend routing).
   *
   * Each entry maps a backend name (chosen by the project) to a backend
   * type plus its connection details (model, endpoint, apiKey, etc.).
   * Referenced from `craft.llm.backend`, from orchestrator routing rules,
   * and from any future subsystem that needs a configured LLM backend.
   *
   * Schema is re-exported from @harness-engineering/orchestrator so this
   * file and the orchestrator runtime validate against the same source.
   */
  backends: z.record(z.string(), BackendDefSchema).optional(),
  /** Routing rules for orchestrator agent dispatch. */
  routing: RoutingConfigSchema.optional(),
});

/**
 * Schema for documentation-drift detection tuning. Mirrors the core
 * `DriftConfig` and is threaded into `EntropyConfig.analyze.drift` by the
 * entropy, CI, and cleanup paths so projects can scope or disable individual
 * drift checks (issue #723). Omit the block to use built-in defaults.
 */
export const DriftConfigSchema = z.object({
  /** Glob patterns for docs to scan for drift (default: docs/**, README) */
  docPaths: z.array(z.string()).optional(),
  /** Flag doc references to code symbols that no longer exist (default: true) */
  checkApiSignatures: z.boolean().optional(),
  /** Check fenced code examples against the codebase (default: true) */
  checkExamples: z.boolean().optional(),
  /** Check documented structure against the filesystem (default: true) */
  checkStructure: z.boolean().optional(),
  /** Regexes matched against a reference to exclude it from drift reporting */
  ignorePatterns: z.array(z.string()).optional(),
  /** Doc-path prefixes whose symbols describe intended future code (ADRs, proposals) */
  forwardLookingPaths: z.array(z.string()).optional(),
});

/**
 * Schema for entropy (drift/stale code) management configuration.
 */
export const EntropyConfigSchema = z.object({
  /** Explicit entry points for reachability analysis (overrides auto-detection) */
  entryPoints: z.array(z.string()).optional(),
  /** Patterns to exclude from entropy analysis */
  excludePatterns: z.array(z.string()).default([...skipDirGlobs(), '**/*.test.ts']),
  /** Whether to automatically attempt to fix simple entropy issues */
  autoFix: z.boolean().default(false),
  /** Documentation-drift detection tuning (scope/disable individual checks) */
  drift: DriftConfigSchema.optional(),
});

/**
 * Schema for mapping implementation files to their specification files.
 */
export const PhaseGateMappingSchema = z.object({
  /** Pattern for implementation files */
  implPattern: z.string(),
  /** Pattern for corresponding specification files */
  specPattern: z.string(),
  /** When true, validate that the spec file contains a numbered requirements section */
  contentValidation: z.boolean().default(false),
});

/**
 * Schema for phase gate (compliance/readiness check) configuration.
 */
export const PhaseGatesConfigSchema = z.object({
  /** Whether phase gate checks are enabled */
  enabled: z.boolean().default(false),
  /** Severity level when a phase gate check fails */
  severity: z.enum(['error', 'warning']).default('error'),
  /** List of implementation-to-spec mappings */
  mappings: z
    .array(PhaseGateMappingSchema)
    .default([{ implPattern: 'src/**/*.ts', specPattern: 'docs/changes/{feature}/proposal.md' }]),
});

/**
 * Schema for security-related configuration.
 */
export const SecurityConfigSchema = z
  .object({
    /** Whether security scanning is enabled */
    enabled: z.boolean().default(true),
    /** Whether to fail on any security warning */
    strict: z.boolean().default(false),
    /** Rule-specific severity overrides */
    rules: z.record(z.string(), z.enum(['off', 'error', 'warning', 'info'])).optional(),
    /** Patterns to exclude from security scans */
    exclude: z.array(z.string()).optional(),
  })
  .passthrough();

/**
 * Schema for performance and complexity budget configuration.
 */
export const PerformanceConfigSchema = z
  .object({
    /** Complexity thresholds per module or pattern */
    complexity: z.record(z.unknown()).optional(),
    /** Coupling limits between modules */
    coupling: z.record(z.unknown()).optional(),
    /** Size budget for bundles or directories */
    sizeBudget: z.record(z.unknown()).optional(),
  })
  .passthrough();

/**
 * Schema for component-anatomy audit config (design-pipeline #2).
 * All fields optional; omit the block entirely to use the audit's
 * built-in defaults.
 */
export const ComponentAnatomyAuditConfigSchema = z.object({
  /** Gate for the entire audit AND the harness-accessibility deferral */
  enabled: z.boolean().default(true),
  /** "default" or a path to a project-supplied override catalog */
  catalog: z.string().default('default'),
  /** "all", "none", or an explicit list of pattern codes (e.g. ["ANAT-P001"]) */
  patterns: z.union([z.literal('all'), z.literal('none'), z.array(z.string())]).default('all'),
  /** Fast-mode controls (validate-time scope cap + pattern opt-in) */
  fastMode: z
    .object({
      /** Whether validate-time runs pattern queries (default false — patterns are full-mode only) */
      patterns: z.boolean().default(false),
      /** Cap to keep validate fast on large repos */
      maxFiles: z.number().int().positive().default(500),
    })
    .default({}),
});

/**
 * Schema for drift-detection config (design-pipeline #1 — detect half).
 * All fields optional; omit the block entirely to use built-in defaults.
 */
export const DriftDetectionConfigSchema = z.object({
  /** Gate for the entire drift verifier */
  enabled: z.boolean().default(true),
  /** Rule toggles — defaults align with v1 scope (T* + P*) */
  rules: z
    .object({
      /** Token bypass rules (DRIFT-T001-T004). Default: true. */
      tokenBypass: z.boolean().default(true),
      /** Primitive adoption rules (DRIFT-P001-P004). Default: true. */
      primitiveAdoption: z.boolean().default(true),
    })
    .default({}),
  /** Fast-mode controls (validate-time scope cap) */
  fastMode: z
    .object({
      /** Cap to keep validate fast on large repos */
      maxFiles: z.number().int().positive().default(500),
    })
    .default({}),
});

/**
 * Schema for brand-compliance audit (design-pipeline #3).
 * All fields optional; omit the block entirely to use built-in defaults.
 */
export const BrandComplianceConfigSchema = z.object({
  /** Gate for the entire brand verifier */
  enabled: z.boolean().default(true),
  /** Rule toggles — defaults align with v1 scope (BRAND-T* + BRAND-V001) */
  rules: z
    .object({
      /** Token-misuse rules (BRAND-T001 via $extensions.harness.brand.forbidden_contexts). Default: true. */
      tokenMisuse: z.boolean().default(true),
      /** Voice rule (BRAND-V001 forbidden phrases in JSX text + string attributes). Default: true. */
      voice: z.boolean().default(true),
    })
    .default({}),
  /** Fast-mode controls (validate-time scope cap) */
  fastMode: z
    .object({
      maxFiles: z.number().int().positive().default(500),
    })
    .default({}),
});

/**
 * Schema for design audit configuration (design-pipeline floor-layer audits).
 */
export const DesignAuditConfigSchema = z.object({
  /** Component-anatomy audit (design-pipeline #2) */
  componentAnatomy: ComponentAnatomyAuditConfigSchema.optional(),
  /** Design-system drift detection (design-pipeline #1, detect half) */
  driftDetection: DriftDetectionConfigSchema.optional(),
  /** Brand-compliance audit (design-pipeline #3) */
  brandCompliance: BrandComplianceConfigSchema.optional(),
});

/**
 * Schema for design-craft (LLM-judgment ceiling skill) configuration
 * (design-pipeline #6). All fields optional; omit the block entirely to
 * use the skill's built-in defaults.
 */
export const DesignCraftConfigSchema = z.object({
  /** Gate for the entire skill AND the harness-design overlap deferral */
  enabled: z.boolean().default(true),
  /** Default invocation mode — "fast" (code-only LLM) or "deep" (rendered + vision-LLM) */
  mode: z.enum(['fast', 'deep']).default('fast'),
  /** B' detect-and-offer behavior when preconditions missing */
  autoCapture: z.enum(['prompt', 'auto', 'skip']).default('prompt'),
  /** LLM provider configuration */
  llm: z
    .object({
      provider: z.string().default('anthropic'),
      model: z.string().default('claude-sonnet-4-6'),
      visionModel: z.string().optional(),
    })
    .optional(),
  /** Catalog scoping */
  catalog: z
    .object({
      path: z.string().default('default'),
      rubrics: z.union([z.literal('all'), z.literal('none'), z.array(z.string())]).default('all'),
      patterns: z.union([z.literal('all'), z.literal('none'), z.array(z.string())]).default('all'),
      exemplars: z.union([z.literal('all'), z.literal('none'), z.array(z.string())]).default('all'),
    })
    .optional(),
  /** Signal feedback loop (CRITIQUE recurrence → pattern proposal) */
  signal: z
    .object({
      /** N=5 by default — emit candidate pattern proposal after this many recurrences */
      proposalThreshold: z.number().int().positive().default(5),
    })
    .optional(),
  /** BENCHMARK-phase configuration */
  benchmark: z
    .object({
      /**
       * Award-bar verdict thresholds. Per dimension, the floor is
       * max(dimensionFloor, round(fraction × median(cited-exemplar
       * references))); any dimension below `confidenceFloor` forces an
       * `indeterminate` verdict. Omit for defaults (80 / 0.95 / medium).
       */
      awardBar: z
        .object({
          dimensionFloor: z.number().min(0).max(100).default(80),
          fraction: z.number().min(0).max(1).default(0.95),
          confidenceFloor: z.enum(['high', 'medium', 'low']).default('medium'),
          /**
           * Mechanical responsive gate (ADR 0085). A `defective` gate vetoes
           * `cleared`. `require: true` makes a `not-evaluated` gate downgrade a
           * would-be `cleared` to `indeterminate` (mobile mandatory). Omit for
           * defaults (require false / 390px / 1px tolerance).
           */
          responsive: z
            .object({
              require: z.boolean().default(false),
              viewport: z.number().int().positive().default(390),
              overflowTolerancePx: z.number().min(0).default(1),
            })
            .optional(),
        })
        .optional(),
    })
    .optional(),
});

/**
 * Schema for design system and aesthetic consistency configuration.
 *
 * `enabled` is tri-state at runtime: `true`, `false`, or absent.
 * - `true`  -> fire `harness-design-system` skill (full discover/define/generate/validate)
 * - `false` -> permanent decline (skill skips silently)
 * - absent  -> fire gentle prompt asking the user to decide (existing default behavior)
 *
 * When `enabled === true`, `platforms` must be a non-empty array.
 */
export const DesignConfigSchema = z
  .object({
    /**
     * Whether design-system tooling is enabled for this project. Set during init.
     * Tri-state semantics: omit the field to indicate "not configured."
     * Do NOT add a `.default(...)` — preserving "absent" is required by the spec.
     */
    enabled: z.boolean().optional(),
    /** Strictness of design system enforcement */
    strictness: z.enum(['strict', 'standard', 'permissive']).default('standard'),
    /** Supported target platforms */
    platforms: z.array(z.enum(['web', 'mobile'])).default([]),
    /** Path to design tokens (e.g. JSON or CSS) */
    tokenPath: z.string().optional(),
    /** Brief description of the intended aesthetic direction */
    aestheticIntent: z.string().optional(),
    /**
     * Glob patterns excluded from the design-token drift linter, stacked on top
     * of the project-wide `analysis.exclude`. Scopes DRIFT-* findings out of
     * token-palette sources, tests, and non-UI code where hex literals aren't
     * design tokens. Mirrors the `security.exclude` shape.
     *
     * Matched with `minimatch({ matchBase: true })` against each file's
     * project-relative POSIX path: a bare basename (`*.tokens.ts`) matches at
     * any depth, while a slash-bearing pattern anchors at the project root
     * (`packages/backend/**`, not `backend/**`).
     */
    exclude: z.array(z.string().min(1)).default([]),
    /**
     * Design-pipeline audit configuration (rule-based floor layer).
     * Omit to use built-in defaults.
     */
    audit: DesignAuditConfigSchema.optional(),
    /**
     * Design-craft configuration (LLM-judgment ceiling layer, design-pipeline #6).
     * Omit to use built-in defaults.
     */
    craft: DesignCraftConfigSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.enabled === true && (!value.platforms || value.platforms.length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['platforms'],
        message:
          'design.platforms must be a non-empty array of "web" | "mobile" when design.enabled is true',
      });
    }
  });

/**
 * Schema for i18n coverage requirements.
 */
export const I18nCoverageConfigSchema = z.object({
  /** Minimum required translation percentage */
  minimumPercent: z.number().min(0).max(100).default(100),
  /** Whether plural forms are required for all keys */
  requirePlurals: z.boolean().default(true),
  /** Whether to detect untranslated strings in source code */
  detectUntranslated: z.boolean().default(true),
});

/**
 * Schema for i18n MCP (Model Context Protocol) server connection.
 */
export const I18nMcpConfigSchema = z.object({
  /** Name or URL of the MCP server */
  server: z.string(),
  /** Project ID on the remote i18n platform */
  projectId: z.string().optional(),
});

/**
 * Schema for internationalization (i18n) configuration.
 */
export const I18nConfigSchema = z.object({
  /** Whether i18n management is enabled */
  enabled: z.boolean().default(false),
  /** Strictness of i18n rule enforcement */
  strictness: z.enum(['strict', 'standard', 'permissive']).default('standard'),
  /** The primary language used for development */
  sourceLocale: z.string().default('en'),
  /** List of locales that translations are required for */
  targetLocales: z.array(z.string()).default([]),
  /** The i18n framework in use */
  framework: z
    .enum([
      'auto',
      'i18next',
      'react-intl',
      'vue-i18n',
      'flutter-intl',
      'apple',
      'android',
      'custom',
    ])
    .default('auto'),
  /** Storage format for translation files */
  format: z.string().default('json'),
  /** Syntax used for message formatting */
  messageFormat: z.enum(['icu', 'i18next', 'custom']).default('icu'),
  /** Convention for translation keys */
  keyConvention: z
    .enum(['dot-notation', 'snake_case', 'camelCase', 'custom'])
    .default('dot-notation'),
  /** Mapping of locales to their file paths */
  translationPaths: z.record(z.string(), z.string()).optional(),
  /** Platforms targeted by this configuration */
  platforms: z.array(z.enum(['web', 'mobile', 'backend'])).default([]),
  /** Industry vertical (for contextual translations) */
  industry: z.string().optional(),
  /** Translation coverage requirements */
  coverage: I18nCoverageConfigSchema.optional(),
  /** Locale used for pseudo-localization testing */
  pseudoLocale: z.string().optional(),
  /** MCP server for AI-assisted translation */
  mcp: I18nMcpConfigSchema.optional(),
});

/**
 * Schema for AI model tier overrides.
 */
export const ModelTierConfigSchema = z.object({
  /** Model ID to use for fast/cheap operations */
  fast: z.string().optional(),
  /** Model ID to use for standard reasoning tasks */
  standard: z.string().optional(),
  /** Model ID to use for complex/critical analysis */
  strong: z.string().optional(),
});

/**
 * Schema for code review orchestration configuration.
 */
export const ReviewConfigSchema = z.object({
  /** Custom model tier mappings for reviewers */
  model_tiers: ModelTierConfigSchema.optional(),
});

/**
 * Schema for MCP integration enablement and dismissal tracking.
 */
export const IntegrationsConfigSchema = z.object({
  /** Tier 1 integrations explicitly enabled by the user */
  enabled: z.array(z.string()).default([]),
  /** Integrations the user does not want doctor to suggest */
  dismissed: z.array(z.string()).default([]),
});

/**
 * Schema for a single semantic-vocabulary rule (`vocabulary.rules[]`).
 *
 * Each rule maps a deprecated / renamed term to its canonical replacement. The
 * `harness check-vocabulary` gate fails when the deprecated form reappears in
 * scanned Markdown prose (fenced code blocks and inline code are ignored), and
 * points the author at the canonical term with the exact file and line.
 */
export const VocabularyRuleSchema = z.object({
  /** The deprecated / renamed term that must no longer appear in prose. */
  deprecated: z.string().min(1),
  /** The canonical term to suggest in its place. */
  canonical: z.string().min(1),
  /** Why the term was deprecated — shown in the failure message. */
  reason: z.string().min(1).optional(),
  /**
   * Optional regex sources (compiled case-insensitively) that exempt a
   * legitimate occurrence on a matching line. Use sparingly.
   */
  allow: z.array(z.string().min(1)).optional(),
});

/**
 * Schema for the semantic-vocabulary CI gate (`vocabulary`).
 *
 * A config-driven, adopter-facing gate: `harness check-vocabulary` scans the
 * configured Markdown surfaces and fails when a deprecated / renamed canonical
 * term reappears in prose, protecting a glossary or naming investment from
 * vocabulary drift. When `enabled` is false or `rules` is empty the gate passes
 * trivially. Omit the block entirely to leave the gate inert.
 *
 * `paths` / `exclude` default to authored-prose surfaces (skills + docs) while
 * skipping archival/historical ones (ADRs, change proposals, research) that
 * legitimately quote old or external vocabulary.
 */
export const VocabularyConfigSchema = z.object({
  /** Whether the vocabulary gate is enabled (default: true). */
  enabled: z.boolean().default(true),
  /** Deprecated → canonical term mappings. Empty ⇒ the gate passes trivially. */
  rules: z.array(VocabularyRuleSchema).default([]),
  /** Glob patterns of Markdown surfaces to scan (default: skills + docs prose). */
  paths: z.array(z.string().min(1)).default(['agents/skills/**/*.md', 'docs/**/*.md']),
  /** Glob patterns to skip (default: archival/historical surfaces + node_modules). */
  exclude: z
    .array(z.string().min(1))
    .default([
      '**/node_modules/**',
      'docs/knowledge/decisions/**',
      'docs/changes/**',
      'docs/research/**',
      'docs/roadmap-archive.md',
    ]),
});

/**
 * Schema for the enforcing pre/post-deploy gate (`harness check-deployment`).
 *
 * Structurally compatible with the core engine's `DeploymentGateConfig` interface.
 * `rules` overrides a rule's severity: `'off'` downgrades a HARD rule to advisory
 * — except DEPLOY-SEC001, which the engine treats as non-waivable (D4).
 */
export const DeploymentGateConfigSchema = z.object({
  /** Master switch. Default true; `false` short-circuits the gate to SUCCESS with an opt-out note. */
  enabled: z.boolean().default(true),
  /** Per-code severity override. 'off' downgrades a HARD rule to advisory.
   *  DEPLOY-SEC001 ignores 'off' (non-waivable, D4). */
  rules: z.record(z.string(), z.enum(['error', 'warn', 'off'])).optional(),
});

/**
 * The main Harness configuration schema.
 */
/**
 * Schema for external tracker sync configuration (`roadmap.tracker`).
 *
 * IMPORTANT: do **not** confuse this `kind` ('github' — the file-backed sync
 * engine that reconciles the roadmap aggregate ↔ an external tracker) with the
 * orchestrator's `WorkflowConfig.tracker.kind` ('roadmap' | 'github-issues' —
 * the IssueTrackerClient dispatch). Two near-identical strings live in
 * different config namespaces. See Phase 4 plan R3 for the long-form note.
 */
export const TrackerConfigSchema = z.object({
  /** Tracker kind — currently only 'github' is supported for `roadmap.tracker`. */
  kind: z.literal('github'),
  /** Repository in "owner/repo" format */
  repo: z.string().optional(),
  /** Labels auto-applied to synced issues for filtering */
  labels: z.array(z.string()).optional(),
  /** Maps roadmap status -> external status */
  statusMap: z.record(
    z.enum(['backlog', 'planned', 'in-progress', 'done', 'blocked', 'needs-human']),
    z.string()
  ),
  /** Maps external status (optionally with label) -> roadmap status */
  reverseStatusMap: z.record(z.string(), z.string()).optional(),
});

/**
 * Schema for roadmap configuration.
 *
 * `mode` selects the storage backend:
 *   - `"file-backed"` (default) — the roadmap aggregate is canonical.
 *   - `"file-less"` — the configured external tracker is canonical; the
 *     markdown file must not exist. Validated by `validateRoadmapMode`
 *     (cross-cutting filesystem check) in addition to this Zod shape check.
 *
 * The Zod schema is the canonical source of the `"file-backed"` default
 * (`.default('file-backed')` populates the field at parse time). The
 * tolerant `getRoadmapMode(config)` helper in
 * `@harness-engineering/core/roadmap/mode.ts` returns the same default when
 * called against pre-parse or unvalidated config shapes; the two MUST stay
 * in lock-step. The default is also documented in
 * `docs/reference/configuration.md` §"RoadmapConfig Object".
 *
 * @see docs/changes/roadmap-tracker-only/proposal.md (Decision D5)
 */
/**
 * Roadmap Auto-Triage gate (Phase 0 Contract 2 — the CLI-visible read side).
 *
 * The full auto-triage surface (thresholds, ratchet, depthBudget) is declared in the
 * orchestrator workflow schema + `@harness-engineering/types` RoadmapAutoTriageConfig; the
 * CLI read-only `roadmap triage` report only needs the master switch to gate itself. Kept
 * default-OFF: absent or `enabled: false` ⇒ the report is inert (SC8 / SC-S1).
 */
export const RoadmapAutoTriageConfigSchema = z
  .object({
    /** Master switch. Default false — the read-only triage report is gated off (D5/SC8). */
    enabled: z.boolean().default(false),
    /**
     * Autonomy-ratchet stage in effect (D14). v1 caps at stage 2 (auto-execute + human
     * verifies every PR); stages 3/4 (sampled-verify, fully-autonomous merge) are deferred
     * post-v1 and REJECTED here — matching the orchestrator's canonical RATCHET_STAGE schema
     * (packages/orchestrator/src/workflow/schema.ts, the source of truth). Default 1 (most
     * conservative). FOLLOW-UP 3: the two schemas must agree so a config can't validate under
     * the CLI yet fail the orchestrator (or vice-versa).
     */
    ratchetStage: z.union([z.literal(1), z.literal(2)]).default(1),
  })
  // Tolerate the fuller Phase-0 surface (thresholds/depthBudget) if present in a
  // shared config file — the CLI reads only `enabled` + `ratchetStage`, so extra
  // keys must not fail validation.
  .passthrough();

export const RoadmapConfigSchema = z.object({
  /** Roadmap storage mode. Defaults to `"file-backed"` (today's behavior). */
  mode: z.enum(['file-backed', 'file-less']).default('file-backed'),
  /** External tracker sync settings */
  tracker: TrackerConfigSchema.optional(),
  /** Roadmap Auto-Triage gate (default-off). The read-only report consumes only `enabled`. */
  autoTriage: RoadmapAutoTriageConfigSchema.optional(),
});

/**
 * Schema for the post-ship rollback circuit breaker (`rollback`).
 *
 * Phase 1 declares only the config surface the classification engine and its
 * trigger arms read:
 *   - `signals` maps a signal name -> threshold/direction/window; a crossing
 *     resolves to the PR(s) merged in the window (signal arm, live in v1).
 *   - `evalTrigger.enabled` gates the eval arm (dark in v1; default false).
 *
 * @see docs/changes/harness-rollback/proposal.md (Trigger arms)
 */
export const RollbackSignalRuleSchema = z.object({
  /** Threshold value the signal must cross to fire. */
  threshold: z.number(),
  /** Which crossing direction fires: value going above or below the threshold. */
  direction: z.enum(['above', 'below']),
  /** Lookback window (e.g. "24h", "7d") mapping the crossing to merged PRs. */
  window: z.string().regex(/^\d+[hdw]$/, 'window must be <number><h|d|w>, e.g. "24h", "7d", "2w"'),
});

export const RollbackConfigSchema = z.object({
  /** Signal-name -> crossing rule. A crossing calls `evaluate --trigger signal`. */
  signals: z.record(z.string(), RollbackSignalRuleSchema).default({}),
  /** Eval-triggered arm. Dark in v1; default disabled until #31 lands. */
  evalTrigger: z
    .object({
      enabled: z.boolean().default(false),
    })
    .default({}),
});

/**
 * Schema for knowledge-pipeline domain inference configuration.
 *
 * Both fields *extend* the built-in defaults shipped by
 * `packages/graph/src/ingest/domain-inference.ts`:
 *   - `domainPatterns` adds caller-supplied `<prefix>/<dir>` patterns
 *     beyond `DEFAULT_PATTERNS` (packages, apps, services, src, lib).
 *   - `domainBlocklist` adds caller-supplied segment names beyond
 *     `DEFAULT_BLOCKLIST` (node_modules, .harness, dist, build, etc.).
 *
 * Pattern syntax: `prefix/<dir>` where `prefix` is a single path segment
 * (word chars, dots, hyphens). `<dir>` is the literal placeholder string;
 * the inferrer captures the path segment that lands at that position
 * as the resolved domain. See proposal Decision D8.
 */
export const KnowledgeConfigSchema = z.object({
  /** Caller-supplied domain patterns (e.g. `["agents/<dir>"]`). Extends defaults. */
  domainPatterns: z
    .array(z.string().regex(/^[\w.-]+\/<dir>$/))
    .optional()
    .default([]),
  /** Caller-supplied blocklisted path segments (e.g. `["scratch", "fixtures"]`). Extends defaults. */
  domainBlocklist: z.array(z.string().min(1)).optional().default([]),
  /**
   * Caller-supplied glob patterns (minimatch) excluded from code-signal
   * extraction, e.g. `["**\/golden/**"]`. Extends the built-in defaults
   * (test files and fixture/golden trees), which are always excluded so the
   * gap report is not inflated with test titles and fixture data (#1111).
   */
  extractionExclude: z.array(z.string().min(1)).optional().default([]),
});

/**
 * Schema for the in-tree OTLP/HTTP trace exporter (Phase 5).
 *
 * When present and `enabled !== false`, the orchestrator instantiates an
 * `OTLPExporter` that POSTs span batches to `endpoint` (typically a local
 * collector at `http://localhost:4318/v1/traces`). `headers` are forwarded
 * verbatim on each request (used for collector auth tokens). `flushIntervalMs`
 * and `batchSize` control buffer flushing — defaults match
 * `OTLPExporterOptions` in @harness-engineering/core.
 *
 * Disabling the section (`enabled: false`) keeps the exporter constructed
 * but converts `push()` into a no-op (zero hot-path cost). Omitting the
 * section entirely removes the exporter from the dispatch path.
 */
export const TelemetryExportOTLPSchema = z.object({
  /** Full URL to the OTLP/HTTP traces ingestion endpoint. */
  endpoint: z.string().url(),
  /** Whether the exporter is active. Default: true. */
  enabled: z.boolean().default(true),
  /** Optional headers forwarded on every flush (e.g. collector auth tokens). */
  headers: z.record(z.string(), z.string()).optional(),
  /** Flush cadence in milliseconds. Default: 2000. */
  flushIntervalMs: z.number().int().positive().default(2000),
  /** Maximum buffered spans before forcing an early flush. Default: 64. */
  batchSize: z.number().int().positive().default(64),
});

/**
 * Telemetry configuration block. Combines:
 *   - `enabled` — top-level central-telemetry kill switch (PostHog batch upload)
 *   - `export.otlp` — Phase 5 in-tree OTLP/HTTP trace exporter (optional, adjacent sibling)
 *
 * The two systems are intentionally adjacent rather than duplicated keys: the
 * `enabled` flag controls the PostHog uploader in core/telemetry; the
 * `export.otlp` block is consumed by the orchestrator-level
 * `OTLPExporter` wiring and is independent of PostHog consent.
 */
export const TelemetryConfigSchema = z.object({
  /** Whether anonymous central telemetry (PostHog) is enabled (default: true). */
  enabled: z.boolean().default(true),
  /** Trace exporter configuration. Currently the only export channel is OTLP/HTTP. */
  export: z
    .object({
      otlp: TelemetryExportOTLPSchema.optional(),
    })
    .optional(),
});

/**
 * Schema for branch naming convention configuration.
 *
 * Defaults declared here are the single source of truth -- consumers should call
 * `BranchingConfigSchema.parse({})` rather than re-declaring fallback values.
 */
export const BranchingConfigSchema = z.object({
  /** Allowed branch name prefixes */
  prefixes: z
    .array(z.string())
    .default(['feat', 'fix', 'chore', 'docs', 'refactor', 'test', 'perf']),
  /** Whether to enforce kebab-case for the branch slug */
  enforceKebabCase: z.boolean().default(true),
  /**
   * Optional regex that fully replaces the default prefix and kebab-case checks.
   * When set, only the ignore list and this regex are evaluated; `prefixes`,
   * `enforceKebabCase`, and `maxLength` are bypassed.
   */
  customRegex: z.string().optional(),
  /** List of ignored branch names (exact match or glob) */
  ignore: z.array(z.string()).default(['main', 'release/**', 'dependabot/**', 'harness/**']),
  /** Maximum slug length (characters after the first `/`). Set to 0 to disable. */
  maxLength: z.number().int().nonnegative().default(60),
});

/**
 * Schema for compliance-specific configuration.
 */
export const ComplianceConfigSchema = z.object({
  /** Branch naming convention settings */
  branching: BranchingConfigSchema.default({}),
});

/**
 * Schema for the shared `craft.*` config block consumed by all
 * craft-pipeline ceiling skills (naming-craft, design-craft, copy-craft,
 * spec-craft, test-craft, knowledge-craft, security-craft).
 *
 * Backend selection unifies on `agent.backends`: craft.llm.backend names
 * an entry there. The non-backend modes (`in-session`, `mock`) live in
 * `craft.llm.mode` because they don't map to a backend definition.
 *
 * Resolution precedence at runtime:
 *   1. Explicit override passed to getProvider({ mode })
 *   2. HARNESS_CRAFT_LLM env (CI / test isolation escape hatch)
 *   3. craft.llm.backend  → adapt agent.backends[name]
 *   4. craft.llm.mode     → in-session | mock
 *   5. Built-in default   → in-session
 */
export const CraftConfigSchema = z.object({
  llm: z
    .object({
      /**
       * Name of an entry in `agent.backends` to route craft LLM calls
       * through. Supported backend types: claude, anthropic, openai,
       * local, pi, mock. (gemini is declared in agent.backends but is
       * not yet wired through the craft adapter.)
       */
      backend: z.string().optional(),
      /**
       * Special-case mode that doesn't correspond to a backend def.
       *   - `in-session` — defer prompts to the calling chat session
       *     via the two-step MCP flow (collect → finalize).
       *   - `mock` — deterministic mock provider, for tests / smoke runs.
       */
      mode: z.enum(['in-session', 'mock']).optional(),
    })
    .optional(),
});

/**
 * Schema for the Local Model Lifecycle Manager (LMLM) config block.
 *
 * Phase 0 stub — declares the shape so configs may reference it. Runtime
 * behavior (hardware detect, ranker, pool, installer, proposal loop) lands
 * in Phases 1–9. Setting `enabled: false` (default) makes LMLM byte-identical
 * to the prior orchestrator (success-criterion F9 / N4).
 *
 * @see docs/changes/local-model-lifecycle-manager/proposal.md
 */
export const LocalModelsHardwareOverrideSchema = z.object({
  platform: z.enum(['macos', 'nvidia', 'cpu']),
  vramGb: z.number().positive(),
  bandwidthGbps: z.number().positive(),
  ramGb: z.number().positive().optional(),
  gpuName: z.string().optional(),
  cpuName: z.string().optional(),
});

export const LocalModelsPoolConfigSchema = z.object({
  /** Hard ceiling on total on-disk size of installed pool members. */
  diskBudgetGb: z.number().positive().default(100),
  /** Hugging Face org allowlist. Models outside these orgs cannot be installed (D1). */
  allowedOrgs: z.array(z.string()).default([]),
  /** Optional family allowlist; empty means "all families under the allowed orgs". */
  allowedFamilies: z.array(z.string()).default([]),
});

export const LocalModelsRefreshConfigSchema = z.object({
  /** Re-rank cadence in ms. Floor 1h to keep HF API usage civil (D9). */
  intervalMs: z.number().int().min(3_600_000, 'minimum 1h').default(86_400_000),
  /** Minimum score delta to emit a swap proposal (D2). */
  proposalThreshold: z.number().nonnegative().default(5),
  /** Random jitter added to the interval to avoid thundering herd (D9). */
  jitterMs: z.number().int().nonnegative().default(600_000),
});

export const LocalModelsInstallerConfigSchema = z.object({
  /** `'ollama'` performs auto-install via REST; `'advisory'` emits copy-paste only (D4). */
  backend: z.enum(['ollama', 'advisory']).default('ollama'),
  /** Ollama REST endpoint. Only consulted when `backend === 'ollama'`. */
  ollamaEndpoint: z.string().url().default('http://localhost:11434'),
});

/**
 * Harness-fit probe (D5, harness-fit-probe proposal). Opt-in + cost-gated: probe
 * only the benchmark top-N, on a cadence, cached by model+version. Every field
 * must live here AND on {@link LocalModelsHarnessFitConfig} — a field that exists
 * only on the TS type is silently STRIPPED by this schema at parse time (the
 * strict-Zod trap), so the runtime never sees it.
 *
 * @see docs/changes/harness-fit-probe/proposal.md (D5)
 */
export const LocalModelsHarnessFitConfigSchema = z.object({
  /** Opt-in switch. Default false (D5) — no probe runs; ranking is unchanged. */
  enabled: z.boolean().default(false),
  /** Probe only the benchmark top-N of the shortlist, never the full set. Default 3. */
  topN: z.number().int().positive().default(3),
  /** Minimum ms between probe passes (cadence, not every refresh). Default 7d. */
  cadenceMs: z.number().int().positive().default(604_800_000),
  /** Cache freshness window in ms; older `buildQuality` is re-probed. Default 30d. */
  cacheTtlMs: z.number().int().positive().default(2_592_000_000),
  /** Optional probe-task-suite override by id; empty ⇒ the shipped default suite. */
  taskIds: z.array(z.string()).optional(),
});

export const LocalModelsConfigSchema = z.object({
  /** Opt-in switch. Default false preserves today's behavior. */
  enabled: z.boolean().default(false),
  pool: LocalModelsPoolConfigSchema.default({}),
  refresh: LocalModelsRefreshConfigSchema.default({}),
  installer: LocalModelsInstallerConfigSchema.default({}),
  /** Harness-fit probe (D5). Optional + disabled by default; absent ⇒ no probe. */
  harnessFit: LocalModelsHarnessFitConfigSchema.optional(),
  hardware: z
    .object({
      /** Manual override that skips autodetection (D7 fallback path). */
      override: LocalModelsHardwareOverrideSchema.optional(),
    })
    .optional(),
});

/**
 * Operational-policy drift settings, consumed by `harness check-operational-drift`
 * (roadmap #565). Flags a diff that touches operational-policy surfaces (hook
 * profiles, the pre-commit `--skip` list, config threshold values, baseline
 * policy) without a corresponding ADR under `adrDir`. Every field is optional and
 * layered over built-in defaults; `.passthrough()` keeps it forward-compatible.
 */
export const OperationalPolicyConfigSchema = z
  .object({
    /** When false, `check-operational-drift` is a no-op. Default: true. */
    enabled: z.boolean().optional(),
    /**
     * `advisory` (default): report but exit 0. `blocking`: a missing ADR exits
     * non-zero. Also forced to blocking by the `--strict` flag.
     */
    severity: z.enum(['advisory', 'blocking']).optional(),
    /** Directory (repo-relative) where ADRs live. Default: `docs/knowledge/decisions`. */
    adrDir: z.string().optional(),
    /**
     * Glob patterns (repo-relative) whose changed files count as operational
     * changes. Default: `.husky/**`, `packages/cli/src/hooks/profiles.ts`.
     */
    watchedPaths: z.array(z.string()).optional(),
    /** The config file whose threshold fields are watched. Default: `harness.config.json`. */
    configFile: z.string().optional(),
    /**
     * Dotted JSON paths inside `configFile` whose sub-tree is threshold/skip-list
     * policy. A change to any sub-tree flags. Defaults cover the architecture and
     * performance budgets plus the security gate strictness.
     */
    configThresholdPaths: z.array(z.string()).optional(),
  })
  .passthrough();

export const HarnessConfigSchema = z.object({
  /** Configuration schema version */
  version: z.literal(1),
  /** Human-readable name of the project */
  name: z.string().optional(),
  /** Root directory of the project, relative to the config file */
  rootDir: z.string().default('.'),
  /** Layered architecture definitions */
  layers: z.array(LayerSchema).optional(),
  /** Rules for forbidden cross-module imports */
  forbiddenImports: z.array(ForbiddenImportSchema).optional(),
  /** Boundary enforcement settings */
  boundaries: BoundaryConfigSchema.optional(),
  /** Path to the project's knowledge map (AGENTS.md) */
  agentsMapPath: z.string().default('./AGENTS.md'),
  /** Directory containing project documentation */
  docsDir: z.string().default('./docs'),
  /** Agent orchestration settings */
  agent: AgentConfigSchema.optional(),
  /** Source-file ingestion controls (skip-dirs, exclude patterns, gitignore handling) */
  ingest: IngestConfigSchema.optional(),
  /** Cross-cutting analysis controls (project-wide exclude globs applied to every scanner) */
  analysis: AnalysisConfigSchema.optional(),
  /** Dependency-check controls (extra exclude globs for check-deps discovery) */
  deps: DepsConfigSchema.optional(),
  /** Drift and stale code management settings */
  entropy: EntropyConfigSchema.optional(),
  /** Security scanning configuration */
  security: SecurityConfigSchema.optional(),
  /** Performance and complexity budget settings */
  performance: PerformanceConfigSchema.optional(),
  /** Project template settings (used by 'harness init') */
  template: z
    .object({
      /** Complexity level of the template (JS/TS only) */
      level: z.enum(['basic', 'intermediate', 'load-bearing-minimum', 'advanced']).optional(),
      /** Target language */
      language: z.enum(['typescript', 'python', 'go', 'rust', 'java']).optional(),
      /** Primary technology framework */
      framework: z.string().optional(),
      /** Template version */
      version: z.number(),
      /** Language-specific tooling configuration */
      tooling: z
        .object({
          packageManager: z.string().optional(),
          linter: z.string().optional(),
          formatter: z.string().optional(),
          buildTool: z.string().optional(),
          testRunner: z.string().optional(),
          lockFile: z.string().optional(),
        })
        .optional(),
    })
    .optional(),
  /** Phase gate and readiness check configuration */
  phaseGates: PhaseGatesConfigSchema.optional(),
  /** Design system consistency settings */
  design: DesignConfigSchema.optional(),
  /**
   * Docs-publish connector selection (`harness docs-publish`). Names the
   * connector to resolve (e.g. `confluence`) and its provider-specific config
   * block. Absent means no connector is configured — the resolver degrades
   * gracefully with an actionable message rather than crashing.
   */
  docsPublish: z
    .object({ connector: z.string(), config: z.record(z.unknown()).default({}) })
    .optional(),
  /** Semantic-vocabulary CI gate settings (`harness check-vocabulary`) */
  vocabulary: VocabularyConfigSchema.optional(),
  /** Shared configuration for craft-pipeline ceiling skills (LLM-judgment) */
  craft: CraftConfigSchema.optional(),
  /** Internationalization (i18n) settings */
  i18n: I18nConfigSchema.optional(),
  /** Code review settings */
  review: ReviewConfigSchema.optional(),
  /** MCP peer integration enablement and dismissal */
  integrations: IntegrationsConfigSchema.optional(),
  /** General architectural enforcement settings */
  architecture: ArchConfigSchema.optional(),
  /**
   * Opt-in constraint packs: named bundles of blocking rules the project
   * chooses to enforce, each applied at its declared lifecycle stage(s)
   * (pre-commit / pre-merge / pre-release). Built-in packs map onto the
   * security rule sets; unknown names are reported but ignored. Empty or
   * absent means no packs are enforced (default behavior unchanged).
   */
  constraintPacks: z.array(z.string()).optional(),
  /** Golden-build (known-good reference-state) settings (`harness golden-build`) */
  golden: GoldenConfigSchema.optional(),
  /** Operational-policy drift settings (ADR requirement for hooks/thresholds/skip-list) */
  operationalPolicy: OperationalPolicyConfigSchema.optional(),
  /** Skill loading, suggestion, and tier override settings */
  skills: z
    .object({
      /** Skills to always suggest in the dispatcher, regardless of scoring */
      alwaysSuggest: z.array(z.string()).default([]),
      /** Skills to never suggest in the dispatcher, even if they score highly */
      neverSuggest: z.array(z.string()).default([]),
      /** Override the tier of specific skills (e.g., promote a Tier 3 skill to Tier 2) */
      tierOverrides: z.record(z.string(), z.number().int().min(1).max(3)).default({}),
    })
    .optional(),
  /** Spec-to-implementation traceability check settings */
  traceability: z
    .object({
      /** Whether traceability checks are enabled */
      enabled: z.boolean().default(true),
      /** Severity level when traceability coverage is below threshold */
      severity: z.enum(['error', 'warning']).default('warning'),
      /** Minimum required coverage percentage (0-100) */
      minCoverage: z.number().min(0).max(100).default(0),
      /** Glob patterns for specs to include in traceability checks */
      includeSpecs: z.array(z.string()).default(['docs/changes/*/proposal.md']),
      /** Glob patterns for specs to exclude from traceability checks */
      excludeSpecs: z.array(z.string()).default([]),
    })
    .optional(),
  /** Roadmap sync and tracker integration settings */
  roadmap: RoadmapConfigSchema.optional(),
  /** Post-ship rollback circuit-breaker settings (signal arm live, eval arm dark). */
  rollback: RollbackConfigSchema.optional(),
  /** Enforcing pre/post-deploy gate settings (`harness check-deployment`). */
  deployment: DeploymentGateConfigSchema.optional(),
  /** Knowledge-pipeline domain-inference settings */
  knowledge: KnowledgeConfigSchema.optional(),
  /** Adoption telemetry settings */
  adoption: z
    .object({
      /** Whether adoption tracking is enabled (default: true) */
      enabled: z.boolean().default(true),
    })
    .optional(),
  /** Compliance and convention enforcement settings */
  compliance: ComplianceConfigSchema.optional(),
  /** Central telemetry + trace export settings */
  telemetry: TelemetryConfigSchema.optional(),
  /** How often (in ms) to check for CLI updates */
  updateCheckInterval: z.number().int().min(0).optional(),
  /**
   * Toolchain expectations this workspace declares.
   *
   * Distinct from the top-level `version` (the config schema version) and from
   * `template.version` — hence the nesting rather than a bare `cliVersion` key.
   */
  toolchain: z
    .object({
      /**
       * Semver range naming the `@harness-engineering/cli` line this workspace
       * expects, e.g. `">=11"`. A CLI two or more majors below the range
       * minimum refuses to run findings-producing commands, because a scanner
       * that predates the rules it evaluates re-reports findings the workspace
       * has already justified.
       */
      cliVersion: z.string().optional(),
    })
    .optional(),
  /** Graph ingest and connector settings */
  graph: z
    .object({
      /** Per-connector configuration (keyed by connector name: jira, slack, ci, confluence, figma, miro) */
      connectors: z.record(z.string(), z.record(z.string(), z.unknown())).default({}),
    })
    .optional(),
  /**
   * Disk-hygiene rules consumed by `harness cleanup-sessions --all`.
   * Keys correspond to registered target names (sessions, cache, maintenance,
   * dashboard-state, snapshots, analyzer-output); values override the default
   * TTL in hours. Unknown keys are ignored (forward-compatible).
   */
  cleanup: z
    .object({
      ttlHours: z.record(z.string(), z.number().positive()).optional(),
    })
    .optional(),
  /**
   * Pre-launch OSV malware guard configuration.
   * `enabled: false` disables the guard; `strict: true` reverses the default
   * fail-open posture on OSV.dev network errors.
   */
  osvGuard: z
    .object({
      enabled: z.boolean().default(true),
      strict: z.boolean().default(false),
      cacheTtlHours: z.number().positive().default(24),
    })
    .optional(),
  /**
   * Local Model Lifecycle Manager (LMLM) configuration. Optional and
   * disabled by default (`enabled: false`); see
   * `docs/changes/local-model-lifecycle-manager/proposal.md`.
   */
  localModels: LocalModelsConfigSchema.optional(),
  /**
   * Pulse metrics configuration block, written to harness.config.json by
   * `harness pulse` and validated by the dedicated `PulseConfigSchema` in
   * `@harness-engineering/core`. The CLI does not consume it directly; it is
   * declared here as a tolerant passthrough so the shared loader recognizes it
   * as a legitimate top-level key rather than silently dropping it (which would
   * also trip the stripped-key warning added for issue #862).
   */
  pulse: z.object({}).passthrough().optional(),
});

/**
 * Type representing the full Harness configuration.
 */
export type HarnessConfig = z.infer<typeof HarnessConfigSchema>;

/**
 * Type for design-specific configuration.
 */
export type DesignConfig = z.infer<typeof DesignConfigSchema>;

/**
 * Type for semantic-vocabulary gate configuration.
 */
export type VocabularyConfig = z.infer<typeof VocabularyConfigSchema>;

/**
 * Type for i18n-specific configuration.
 */
export type I18nConfig = z.infer<typeof I18nConfigSchema>;

/**
 * Type for an architectural layer definition.
 */
export type Layer = z.infer<typeof LayerSchema>;

/**
 * Type for review-specific configuration.
 */
export type ReviewConfig = z.infer<typeof ReviewConfigSchema>;

/**
 * Type for AI model tier configuration.
 */
export type ModelTierConfigZod = z.infer<typeof ModelTierConfigSchema>;

/**
 * Type for base architecture enforcement configuration.
 */
export type ArchConfigZod = z.infer<typeof ArchConfigSchema>;

/**
 * Type for integrations-specific configuration.
 */
export type IntegrationsConfig = z.infer<typeof IntegrationsConfigSchema>;

/**
 * Type for knowledge-pipeline-specific configuration.
 */
export type KnowledgeConfig = z.infer<typeof KnowledgeConfigSchema>;

/**
 * Type for rollback circuit-breaker configuration.
 */
export type RollbackConfig = z.infer<typeof RollbackConfigSchema>;

/**
 * Type for the enforcing deployment-gate configuration.
 */
export type DeploymentGateConfig = z.infer<typeof DeploymentGateConfigSchema>;

/**
 * Type for telemetry block configuration (PostHog opt-in + OTLP export).
 */
export type TelemetryConfigZod = z.infer<typeof TelemetryConfigSchema>;

/**
 * Type for the OTLP/HTTP trace exporter block.
 */
export type TelemetryExportOTLPConfig = z.infer<typeof TelemetryExportOTLPSchema>;
