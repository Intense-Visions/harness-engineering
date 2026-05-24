/**
 * Vertical-slice integration test for the audit-component-anatomy
 * MCP tool. Exercises the full pipeline:
 *
 *   resolveComponentType  →  resolveAnatomyRules  →  parseComponentDefinition
 *                          →  runConventionRule    →  runAudit (MCP)
 *
 * Covers the two Phase 1 exit cases for Button + ANAT-D001:
 *   - Positive: Button.tsx missing required `content` slot → exactly
 *     one ANAT-D001 finding (severity: error, componentType: Button).
 *   - Negative: Button.tsx exposing `children: React.ReactNode` →
 *     zero findings.
 *
 * Graph integration (DesignConstraintAdapter) is out of scope for
 * this MVP test — covered by a separate coordination commit.
 *
 * Refs: docs/changes/design-pipeline/audit-component-anatomy/proposal.md
 * (Success Criteria #1 — convention findings produced for known types;
 *  #2 — convention findings NOT produced when type unmatched.)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { runAudit } from '../../../../src/mcp/tools/audit-anatomy';

const positiveButtonSource = `
interface ButtonProps {
  onClick?: () => void;
  variant?: 'primary' | 'secondary';
  // No children prop, no label prop, no aria-label — content slot missing.
}

export const Button = ({ onClick, variant }: ButtonProps) => (
  <button onClick={onClick} className={variant} />
);
`;

const negativeButtonSource = `
import type { ReactNode } from 'react';

interface ButtonProps {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary';
}

export const Button = ({ children, onClick, variant }: ButtonProps) => (
  <button onClick={onClick} className={variant}>{children}</button>
);
`;

const unknownComponentSource = `
interface MyRandomThingProps {
  data?: string;
}

export const MyRandomThing = ({ data }: MyRandomThingProps) => (
  <div>{data}</div>
);
`;

describe('audit-anatomy vertical slice — Button + ANAT-D001', () => {
  let projectRoot: string;
  let positivePath: string;
  let negativePath: string;
  let unknownPath: string;

  beforeAll(() => {
    projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-anatomy-vertical-slice-'));
    positivePath = path.join(projectRoot, 'PositiveButton.tsx');
    negativePath = path.join(projectRoot, 'NegativeButton.tsx');
    unknownPath = path.join(projectRoot, 'MyRandomThing.tsx');
    fs.writeFileSync(positivePath, positiveButtonSource, 'utf8');
    fs.writeFileSync(negativePath, negativeButtonSource, 'utf8');
    fs.writeFileSync(unknownPath, unknownComponentSource, 'utf8');
  });

  afterAll(() => {
    if (projectRoot && fs.existsSync(projectRoot)) {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it('emits exactly one ANAT-D001 finding for a Button missing the content slot', async () => {
    const result = await runAudit({
      path: projectRoot,
      mode: 'fast',
      files: ['PositiveButton.tsx'],
    });

    expect(result.findings).toHaveLength(1);
    const finding = result.findings[0]!;
    expect(finding.code).toBe('ANAT-D001');
    expect(finding.severity).toBe('error');
    expect(finding.componentType).toBe('Button');
    expect(finding.file).toBe('PositiveButton.tsx');
    expect(finding.rule.source).toBe('APG/button');
    expect(finding.fix.kind).toBe('manual');
    expect(finding.fix.description).toContain('label');

    expect(result.summary.bySeverity.error).toBe(1);
    expect(result.summary.byCode['ANAT-D001']).toBe(1);
    expect(result.catalog.conventionsApplied).toEqual(['Button']);
    expect(result.catalog.patternsApplied).toEqual([]);
    expect(result.meta.mode).toBe('fast');
    expect(result.meta.deferredToA11y).toBe(0);
  });

  it('emits zero findings for a Button that exposes children', async () => {
    const result = await runAudit({
      path: projectRoot,
      mode: 'fast',
      files: ['NegativeButton.tsx'],
    });

    expect(result.findings).toHaveLength(0);
    expect(result.summary.bySeverity.error).toBe(0);
    expect(result.summary.bySeverity.warn).toBe(0);
    expect(result.summary.bySeverity.info).toBe(0);
    expect(result.summary.totalFiles).toBe(1);
    expect(result.catalog.conventionsApplied).toEqual(['Button']);
  });

  it('emits zero findings for an unrecognized component type (silent skip per Decision #3)', async () => {
    const result = await runAudit({
      path: projectRoot,
      mode: 'fast',
      files: ['MyRandomThing.tsx'],
    });

    expect(result.findings).toHaveLength(0);
    expect(result.summary.totalFiles).toBe(1);
    expect(result.catalog.conventionsApplied).toEqual([]);
  });

  it('runs all three fixtures together and partitions findings correctly', async () => {
    const result = await runAudit({
      path: projectRoot,
      mode: 'fast',
      files: ['PositiveButton.tsx', 'NegativeButton.tsx', 'MyRandomThing.tsx'],
    });

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.code).toBe('ANAT-D001');
    expect(result.summary.totalFiles).toBe(3);
    expect(result.catalog.conventionsApplied).toEqual(['Button']);
    expect(result.catalog.patternsApplied).toEqual([]);
  });
});
