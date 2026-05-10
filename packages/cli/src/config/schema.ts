import { z } from 'zod';
import { ArchConfigSchema } from '@harness-engineering/core';
import { IngestConfigSchema } from './ingest-schema.js';

export { IngestConfigSchema } from './ingest-schema.js';
export type { IngestConfig } from './ingest-schema.js';

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
});

/**
 * Schema for entropy (drift/stale code) management configuration.
 */
export const EntropyConfigSchema = z.object({
  /** Explicit entry points for reachability analysis (overrides auto-detection) */
  entryPoints: z.array(z.string()).optional(),
  /** Patterns to exclude from entropy analysis */
  excludePatterns: z.array(z.string()).default(['**/node_modules/**', '**/*.test.ts']),
  /** Whether to automatically attempt to fix simple entropy issues */
  autoFix: z.boolean().default(false),
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
 * The main Harness configuration schema.
 */
/**
 * Schema for external tracker sync configuration.
 */
export const TrackerConfigSchema = z.object({
  /** Tracker kind — currently only 'github' is supported */
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
 *   - `"file-backed"` (default) — `docs/roadmap.md` is canonical.
 *   - `"file-less"` — the configured external tracker is canonical; the
 *     markdown file must not exist. Validated by `validateRoadmapMode`
 *     (cross-cutting filesystem check) in addition to this Zod shape check.
 *
 * @see docs/changes/roadmap-tracker-only/proposal.md (Decision D5)
 */
export const RoadmapConfigSchema = z.object({
  /** Roadmap storage mode. Default is `"file-backed"` (today's behavior). */
  mode: z.enum(['file-backed', 'file-less']).optional(),
  /** External tracker sync settings */
  tracker: TrackerConfigSchema.optional(),
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
});

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
      level: z.enum(['basic', 'intermediate', 'advanced']).optional(),
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
  /** Internationalization (i18n) settings */
  i18n: I18nConfigSchema.optional(),
  /** Code review settings */
  review: ReviewConfigSchema.optional(),
  /** MCP peer integration enablement and dismissal */
  integrations: IntegrationsConfigSchema.optional(),
  /** General architectural enforcement settings */
  architecture: ArchConfigSchema.optional(),
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
  /** Knowledge-pipeline domain-inference settings */
  knowledge: KnowledgeConfigSchema.optional(),
  /** Adoption telemetry settings */
  adoption: z
    .object({
      /** Whether adoption tracking is enabled (default: true) */
      enabled: z.boolean().default(true),
    })
    .optional(),
  /** Central telemetry collection settings */
  telemetry: z
    .object({
      /** Whether anonymous telemetry is enabled (default: true) */
      enabled: z.boolean().default(true),
    })
    .optional(),
  /** How often (in ms) to check for CLI updates */
  updateCheckInterval: z.number().int().min(0).optional(),
  /** Graph ingest and connector settings */
  graph: z
    .object({
      /** Per-connector configuration (keyed by connector name: jira, slack, ci, confluence, figma, miro) */
      connectors: z.record(z.string(), z.record(z.string(), z.unknown())).default({}),
    })
    .optional(),
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
