#!/usr/bin/env node

/**
 * Auto-generate the barrel export file for @harness-engineering/core.
 *
 * Scans packages/core/src/ for directories with index.ts and generates
 * `export * from './{dir}'` for each. Selective (non-star) exports are
 * declared inline below — they are few enough to maintain here and are
 * verified by TypeScript compilation.
 *
 * Usage:
 *   node scripts/generate-core-barrel.mjs           # generate
 *   node scripts/generate-core-barrel.mjs --check   # verify freshness (CI)
 */

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const CORE_SRC = join(ROOT, 'packages', 'core', 'src');
const OUTPUT = join(CORE_SRC, 'index.ts');
const HEADER = '// AUTO-GENERATED — do not edit. Run `pnpm run generate:barrels` to regenerate.\n';

// ---------------------------------------------------------------------------
// Selective exports — modules that intentionally avoid `export *`
// ---------------------------------------------------------------------------

/**
 * Modules listed here get custom export blocks instead of `export *`.
 * Each key is a directory name under core/src/. Any directory listed here
 * is excluded from auto-discovery.
 */
const SELECTIVE_EXPORTS = {
  shared: [
    {
      comment: 'Error types and helper functions for standardized error handling across the toolkit.',
      lines: [
        "export type {\n  BaseError,\n  ValidationError,\n  ContextError,\n  ConstraintError,\n  EntropyError,\n  FeedbackError,\n} from './shared/errors';",
        "export { createError } from './shared/errors';",
        '',
        '/**\n * Language parsers and AST utilities.\n */',
        "export { TypeScriptParser } from './shared/parsers';",
        "export type {\n  LanguageParser,\n  AST,\n  Import,\n  Export,\n  ParseError,\n  HealthCheckResult,\n} from './shared/parsers';",
        "export { createParseError } from './shared/parsers';",
        '',
        '/**\n * WHATWG bad-ports list and helpers for refusing to bind unreachable ports.\n */',
        "export { WHATWG_BAD_PORTS, isBadPort, assertPortUsable } from './shared/port';",
      ],
    },
  ],

  blueprint: [
    {
      comment: 'Blueprint module for scanning projects and generating codebase blueprints.',
      lines: [
        "export * from './blueprint/types';",
        "export { ProjectScanner } from './blueprint/scanner';",
        "export { BlueprintGenerator } from './blueprint/generator';",
      ],
    },
  ],

  'update-checker': [
    {
      comment: 'Update checker utilities for checking for new versions of the toolkit.',
      lines: [
        "export {\n  isUpdateCheckEnabled,\n  shouldRunCheck,\n  readCheckState,\n  spawnBackgroundCheck,\n  getUpdateNotification,\n} from './update-checker';",
        "export type { UpdateCheckState } from './update-checker';",
      ],
    },
  ],

  adoption: [
    {
      comment: 'Adoption telemetry module for tracking and aggregating skill invocations.',
      lines: [
        "export {\n  readAdoptionRecords,\n  aggregateBySkill,\n  topSkills,\n  aggregateByDay as aggregateAdoptionByDay,\n  type DailyAdoption,\n} from './adoption';",
      ],
    },
  ],

  telemetry: [
    {
      comment: 'Telemetry module for consent resolution and install identity.',
      lines: [
        "export {\n  resolveConsent,\n  readIdentity,\n  getOrCreateInstallId,\n  collectEvents,\n  send,\n} from './telemetry';",
      ],
    },
  ],
};

/** Directories that don't have their own index.ts and are handled via SELECTIVE_EXPORTS. */
const SKIP_DIRS = new Set(Object.keys(SELECTIVE_EXPORTS));

// ---------------------------------------------------------------------------
// Comment extraction
// ---------------------------------------------------------------------------

/** Maps directory names to human-readable JSDoc descriptions. */
/** Canonical ordering and JSDoc descriptions for all modules. */
const DIR_COMMENTS = {
  validation: 'Validation module for verifying project structure, configuration, and conventions.',
  context: 'Context module for managing AI agent context and knowledge maps.',
  constraints: 'Constraints module for enforcing architectural boundaries and dependency rules.',
  annotations: 'Annotations module for protected code regions and harness-ignore directives.',
  entropy: 'Entropy module for detecting and remediating codebase drift, dead code, and complexity.',
  performance: 'Performance module for benchmarking and regression detection.',
  feedback: 'Feedback module for agent-driven code review and telemetry.',
  architecture: 'Architecture module for analyzing and visualizing codebase structure.',
  state: 'State management module for tracking project health, learnings, and transitions.',
  workflow: 'Workflow module for executing multi-step tasks and agent chains.',
  pipeline: 'Pipeline module for orchestrating skill execution and turn-based interactions.',
  security: 'Security module for secret detection and vulnerability scanning.',
  ci: 'CI module for integrating with continuous integration systems.',
  review: 'Review pipeline module for automated code review workflows.',
  roadmap: 'Roadmap module for parsing, serializing, and syncing project roadmaps.',
  interaction: 'Interaction module for managing agent-to-human interactions.',
  blueprint: 'Blueprint module for scanning projects and generating codebase blueprints.',
  'update-checker': 'Update checker utilities for checking for new versions of the toolkit.',
  'code-nav': 'Code navigation module for AST-based exploration (outline, search, unfold).',
  pricing: 'Pricing module for model cost lookup and calculation.',
  usage: 'Usage module for aggregating token usage and cost data.',
  adoption: 'Adoption telemetry module for tracking and aggregating skill invocations.',
  compaction: 'Compaction module for reducing MCP tool response token consumption.',
  caching: 'Caching module — stability classification and cache-aware utilities.',
  telemetry: 'Telemetry module for consent resolution and install identity.',
};

// ---------------------------------------------------------------------------
// Discovery
// ---------------------------------------------------------------------------

function discoverStarModules() {
  return readdirSync(CORE_SRC)
    .filter((entry) => {
      if (SKIP_DIRS.has(entry)) return false;
      const full = join(CORE_SRC, entry);
      if (!statSync(full).isDirectory()) return false;
      if (!existsSync(join(full, 'index.ts'))) return false;
      return true;
    })
    .sort();
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

function generate() {
  const lines = [];

  lines.push(HEADER);
  lines.push('/**');
  lines.push(' * @harness-engineering/core');
  lines.push(' *');
  lines.push(' * Core library for Harness Engineering toolkit.');
  lines.push(' * This library provides the fundamental building blocks for codebase analysis,');
  lines.push(' * validation, entropy management, and agent-driven workflows.');
  lines.push(' */');
  lines.push('');

  // 1. Preamble: re-export @harness-engineering/types
  lines.push('/**');
  lines.push(' * Re-export all fundamental types from the types package.');
  lines.push(' */');
  lines.push("export * from '@harness-engineering/types';");
  lines.push('');

  // 2. Selective: shared/errors + shared/parsers
  if (SELECTIVE_EXPORTS.shared) {
    for (const block of SELECTIVE_EXPORTS.shared) {
      lines.push('/**');
      lines.push(` * ${block.comment}`);
      lines.push(' */');
      lines.push(...block.lines);
      lines.push('');
    }
  }

  // 3. Auto-discovered star exports (alphabetical, interleaved with selective)
  const starModules = discoverStarModules();

  // Merge star modules and selective modules in a readable order.
  // We use the order from DIR_COMMENTS as the canonical order,
  // falling through to alphabetical for unknown modules.
  const allModules = new Set([...starModules, ...Object.keys(SELECTIVE_EXPORTS)]);
  const orderedKeys = Object.keys(DIR_COMMENTS);
  const ordered = [
    ...orderedKeys.filter((k) => allModules.has(k)),
    ...[...allModules].filter((k) => !orderedKeys.includes(k) && k !== 'shared').sort(),
  ];

  for (const mod of ordered) {
    if (mod === 'shared') continue; // already handled above

    if (SELECTIVE_EXPORTS[mod]) {
      for (const block of SELECTIVE_EXPORTS[mod]) {
        lines.push('/**');
        lines.push(` * ${block.comment}`);
        lines.push(' */');
        lines.push(...block.lines);
        lines.push('');
      }
    } else if (starModules.includes(mod)) {
      const comment = DIR_COMMENTS[mod] || `${mod.charAt(0).toUpperCase() + mod.slice(1)} module.`;
      lines.push('/**');
      lines.push(` * ${comment}`);
      lines.push(' */');
      lines.push(`export * from './${mod}';`);
      lines.push('');
    }
  }

  // 4. Epilogue: deprecated VERSION
  lines.push('/**');
  lines.push(' * The current version of the Harness Engineering core library.');
  lines.push(' *');
  lines.push(" * @deprecated Read the CLI version from `@harness-engineering/cli/package.json`");
  lines.push(' * instead. This hardcoded constant drifts from the actual CLI version on each');
  lines.push(' * release. Kept only as a fallback for consumers that cannot resolve the CLI');
  lines.push(' * package at runtime.');
  lines.push(' */');
  lines.push("export { VERSION } from './version';");
  lines.push('');

  return lines.join('\n');
}

// --- Main ---

const content = generate();

if (process.argv.includes('--check')) {
  if (!existsSync(OUTPUT)) {
    console.error('Core barrel not found. Run: pnpm run generate:barrels');
    process.exit(1);
  }
  const existing = readFileSync(OUTPUT, 'utf-8');
  if (existing !== content) {
    console.error('Core barrel is stale. Run: pnpm run generate:barrels');
    process.exit(1);
  }
  console.log('Core barrel is up to date.');
} else {
  writeFileSync(OUTPUT, content);
  console.log(`Generated ${OUTPUT}`);
}
