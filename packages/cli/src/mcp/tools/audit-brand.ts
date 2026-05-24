/**
 * MCP tool: `mcp__harness__audit_brand`.
 *
 * Wraps the audit-brand-compliance skill (design-pipeline sub-project #3).
 * Composed by harness check-design as the 4th verifier.
 *
 * Source: docs/changes/design-pipeline/audit-brand-compliance/proposal.md
 *   (Surface area → MCP tool).
 */

import { runAuditBrand, type AuditBrandInput, type AuditBrandOutput } from '../../brand/index.js';

interface ToolResponse {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

export const auditBrandDefinition = {
  name: 'audit_brand',
  description:
    'Audit brand-semantics violations: tokens used in forbidden contexts per their ' +
    '$extensions.harness.brand metadata (BRAND-T*), and UI copy containing voice.forbidden_phrases ' +
    'from DESIGN.md ## Brand Rules (BRAND-V001). 4th verifier composed by harness check-design.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'Project root path' },
      mode: {
        type: 'string',
        enum: ['fast', 'full'],
        description: 'Both modes equivalent in v1 (no slow patterns yet).',
      },
      files: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional explicit file list to scope the scan.',
      },
      designStrictness: {
        type: 'string',
        enum: ['strict', 'standard', 'permissive'],
        description: 'Overrides design.strictness from harness.config.json.',
      },
      rules: {
        type: 'object',
        description: 'Per-rule enable flags.',
        properties: {
          tokenMisuse: { type: 'boolean', description: 'Default true' },
          voice: { type: 'boolean', description: 'Default true' },
        },
      },
    },
    required: ['path'],
  },
};

export async function handleAuditBrand(input: AuditBrandInput): Promise<ToolResponse> {
  if (typeof input?.path !== 'string' || input.path.length === 0) {
    return {
      content: [
        { type: 'text', text: JSON.stringify({ error: 'audit_brand: `path` is required' }) },
      ],
      isError: true,
    };
  }
  try {
    const result: AuditBrandOutput = await runAuditBrand(input);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [
        { type: 'text', text: JSON.stringify({ error: `audit_brand failed: ${message}` }) },
      ],
      isError: true,
    };
  }
}

export { runAuditBrand } from '../../brand/index.js';
export type { AuditBrandInput, AuditBrandOutput, AuditBrandMode } from '../../brand/index.js';
