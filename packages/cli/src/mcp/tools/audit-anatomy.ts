/**
 * MCP tool: `mcp__harness__audit_anatomy`.
 *
 * Entry point for the audit-component-anatomy skill (design-pipeline
 * sub-project #2). Phase 1 vertical-slice scope:
 *   - Convention catalog: Button only (one rule)
 *   - Pattern catalog: ANAT-P* composition patterns run in `full` mode
 *   - Mode handling: fast/full both run conventions only in MVP
 *
 * Tool registration into `mcp/server.ts` is a separate coordination
 * commit per the Phase 1 split; this module exports the definition and
 * handler so registration is a one-line import wire-up when the
 * coordination commit lands.
 *
 * Source: docs/changes/design-pipeline/audit-component-anatomy/proposal.md
 * (Technical Design → MCP tool API).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { sanitizePath } from '../utils/sanitize-path.js';
import {
  parseComponentDefinition,
  parseComponentDefinitionFromSource,
} from '../../audit/component-anatomy/parsers/ast.js';
import { resolveComponentType } from '../../audit/component-anatomy/resolvers/component-type.js';
import { resolveAnatomyRules } from '../../audit/component-anatomy/resolvers/source-of-truth.js';
import { runConventionRule } from '../../audit/component-anatomy/rules/convention-runner.js';
import { PATTERN_CHECKS } from '../../audit/component-anatomy/catalog/patterns/index.js';
import type { AnatomyFinding, Severity } from '../../audit/component-anatomy/findings/finding.js';

type AuditMode = 'fast' | 'full';
type Strictness = 'strict' | 'standard' | 'permissive';

export interface AuditAnatomyInput {
  path: string;
  mode?: AuditMode;
  files?: string[];
  designStrictness?: Strictness;
  catalog?: string[];
}

import type { Verifier } from '../../shared/verifier.js';

// Conforms to the shared Verifier<F, Cat, Meta> shape extracted at the
// 4th-verifier threshold (audit-brand-compliance). Structural typing
// means the existing fields satisfy the interface without refactor.
export type AuditAnatomyOutput = Verifier<
  AnatomyFinding,
  { conventionsApplied: string[]; patternsApplied: string[] },
  { mode: AuditMode; deferredToA11y: number }
>;

export const auditAnatomyDefinition = {
  name: 'audit_anatomy',
  description:
    'Audit components for anatomy completeness. Emits ANAT-D* findings for component definitions ' +
    'missing required slots/states (e.g., Button missing `content`). In v1 vertical slice runs the ' +
    'component conventions, plus ANAT-P* composition patterns (map-without-empty, fetch-without-loading) in full mode.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'Project root path' },
      mode: {
        type: 'string',
        enum: ['fast', 'full'],
        description:
          'fast = conventions only (cheap AST scan); full additionally runs the ANAT-P* composition patterns.',
      },
      files: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional explicit file list (paths or globs) to scope the audit.',
      },
      designStrictness: {
        type: 'string',
        enum: ['strict', 'standard', 'permissive'],
        description: 'Overrides design.strictness from harness.config.json.',
      },
      catalog: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional subset of catalog entries to run.',
      },
    },
    required: ['path'],
  },
};

export interface ToolResponse {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

/**
 * Internal audit driver — exported so the integration test can exercise
 * the full pipeline without the MCP envelope wrapping/unwrapping.
 */
export async function runAudit(input: AuditAnatomyInput): Promise<AuditAnatomyOutput> {
  const start = Date.now();
  const mode: AuditMode = input.mode ?? 'fast';
  const findings: AnatomyFinding[] = [];

  const projectRoot = sanitizePath(input.path);
  const candidateFiles = input.files ?? [];

  const conventionsApplied = new Set<string>();
  const patternsApplied = new Set<string>();
  let totalFiles = 0;

  for (const candidatePath of candidateFiles) {
    const absolute = path.isAbsolute(candidatePath)
      ? candidatePath
      : path.join(projectRoot, candidatePath);
    let contents: string;
    try {
      contents = fs.readFileSync(absolute, 'utf8');
    } catch {
      continue;
    }
    totalFiles += 1;

    const fileRelative = path.relative(projectRoot, absolute).replaceAll('\\', '/') || absolute;
    const componentType = resolveComponentType(absolute, contents);

    // ANAT-P* pattern checks (full mode only — they are the more expensive,
    // composition-level scans). They run on EVERY file regardless of whether a
    // component type resolved, since composition patterns are not bound to a
    // component definition.
    if (mode === 'full') {
      for (const pattern of PATTERN_CHECKS) {
        const patternFindings = pattern.detect(fileRelative, contents, componentType);
        if (patternFindings.length > 0) patternsApplied.add(pattern.id);
        findings.push(...patternFindings);
      }
    }

    // ANAT-D* convention checks require a resolved type, a rule, and a parse.
    if (componentType === null) continue;

    const rule = resolveAnatomyRules(absolute, contents, componentType);
    if (rule === null) continue;

    const parsed = parseComponentDefinitionFromSource(absolute, contents);
    if (parsed === null) continue;

    conventionsApplied.add(rule.componentType);

    const runnerOptions: Parameters<typeof runConventionRule>[2] = { filePath: fileRelative };
    if (input.designStrictness !== undefined) {
      runnerOptions.strictness = input.designStrictness;
    }
    const fileFindings = runConventionRule(rule, parsed, runnerOptions);
    findings.push(...fileFindings);
  }

  const summary = buildSummary(findings, totalFiles, Date.now() - start);

  return {
    findings,
    summary,
    catalog: {
      conventionsApplied: [...conventionsApplied].sort(),
      patternsApplied: [...patternsApplied].sort(),
    },
    meta: { mode, deferredToA11y: 0 },
  };
}

function buildSummary(
  findings: AnatomyFinding[],
  totalFiles: number,
  durationMs: number
): AuditAnatomyOutput['summary'] {
  const bySeverity: Record<Severity, number> = { error: 0, warn: 0, info: 0 };
  const byCode: Record<string, number> = {};
  for (const finding of findings) {
    bySeverity[finding.severity] += 1;
    byCode[finding.code] = (byCode[finding.code] ?? 0) + 1;
  }
  return { totalFiles, durationMs, bySeverity, byCode };
}

/**
 * MCP envelope wrapper. Mirrors the convention used by other tools
 * (assess-project.ts) — handler returns content blocks with the
 * serialised output, and surfaces errors via the standard envelope.
 */
export async function handleAuditAnatomy(input: AuditAnatomyInput): Promise<ToolResponse> {
  try {
    const result = await runAudit(input);
    return {
      content: [{ type: 'text', text: JSON.stringify(result) }],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: 'text', text: `Error: ${message}` }],
      isError: true,
    };
  }
}

/**
 * Convenience re-export so the file-walker integration (Phase 2) and
 * harness validate hook (separate task) can read a file from disk
 * without re-implementing the parser entry. Provides a single source
 * of truth for the parse+resolve pipeline.
 */
export const __internal__ = {
  parseComponentDefinition,
};
