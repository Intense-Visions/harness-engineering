/**
 * Integration test for the EmptyState convention (Phase 2 catalog
 * expansion #3).
 *
 * Exercises the full pipeline end-to-end for the third catalogued
 * component:
 *
 *   resolveComponentType  →  resolveAnatomyRules  →  parseComponentDefinition
 *                          →  runConventionRule    →  runAudit (MCP)
 *
 * Covers ANAT-D020 (EmptyState: missing required `headline` slot) at
 * all three supported headline satisfiers (`title`, `headline`, and
 * typed `children`) and the silent-skip case for an EmptyState
 * definition whose prop type is missing every headline affordance.
 *
 * Refs: docs/changes/design-pipeline/audit-component-anatomy/proposal.md
 * (Phase 2 catalog expansion; Success Criteria #1 for EmptyState);
 * finding-codes.md § ANAT-D020 satisfiability table;
 * phase-0-schema-spike/conventions/empty-state.md.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { runAudit } from '../../../../src/mcp/tools/audit-anatomy';

const positiveEmptyStateSource = `
interface EmptyStateProps {
  icon?: React.ReactNode;
  description?: string;
  action?: React.ReactNode;
  // No \`title\`, \`headline\`, or \`children\` prop — ANAT-D020 fires.
}

export const EmptyState = ({ icon, description, action }: EmptyStateProps) => (
  <div className="empty-state">
    {icon}
    {description && <p>{description}</p>}
    {action}
  </div>
);
`;

const negativeEmptyStateWithTitle = `
interface EmptyStateProps {
  title: string;
  icon?: React.ReactNode;
  description?: string;
  action?: React.ReactNode;
}

export const EmptyState = ({ title, icon, description, action }: EmptyStateProps) => (
  <div className="empty-state">
    {icon}
    <h2>{title}</h2>
    {description && <p>{description}</p>}
    {action}
  </div>
);
`;

const negativeEmptyStateWithHeadline = `
interface EmptyStateProps {
  headline: string;
  description?: string;
}

export const EmptyState = ({ headline, description }: EmptyStateProps) => (
  <div>
    <h2>{headline}</h2>
    {description && <p>{description}</p>}
  </div>
);
`;

const negativeEmptyStateWithChildren = `
interface EmptyStateProps {
  children: React.ReactNode;
}

export const EmptyState = ({ children }: EmptyStateProps) => (
  <div className="empty-state">{children}</div>
);
`;

describe('audit-anatomy EmptyState convention — ANAT-D020', () => {
  let projectRoot: string;
  let positivePath: string;
  let withTitlePath: string;
  let withHeadlinePath: string;
  let withChildrenPath: string;

  beforeAll(() => {
    projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-anatomy-empty-state-'));
    positivePath = path.join(projectRoot, 'PositiveEmptyState.tsx');
    withTitlePath = path.join(projectRoot, 'WithTitleEmptyState.tsx');
    withHeadlinePath = path.join(projectRoot, 'WithHeadlineEmptyState.tsx');
    withChildrenPath = path.join(projectRoot, 'WithChildrenEmptyState.tsx');
    fs.writeFileSync(positivePath, positiveEmptyStateSource, 'utf8');
    fs.writeFileSync(withTitlePath, negativeEmptyStateWithTitle, 'utf8');
    fs.writeFileSync(withHeadlinePath, negativeEmptyStateWithHeadline, 'utf8');
    fs.writeFileSync(withChildrenPath, negativeEmptyStateWithChildren, 'utf8');
  });

  afterAll(() => {
    if (projectRoot && fs.existsSync(projectRoot)) {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it('emits exactly one ANAT-D020 finding for an EmptyState missing every headline affordance', async () => {
    const result = await runAudit({
      path: projectRoot,
      mode: 'fast',
      files: ['PositiveEmptyState.tsx'],
    });

    expect(result.findings).toHaveLength(1);
    const finding = result.findings[0]!;
    expect(finding.code).toBe('ANAT-D020');
    expect(finding.severity).toBe('error');
    expect(finding.componentType).toBe('EmptyState');
    expect(finding.file).toBe('PositiveEmptyState.tsx');
    expect(finding.rule.source).toBe('OpenUI/empty-state');
    expect(finding.fix.kind).toBe('manual');
    // Fix hint references the satisfying affordances callers can choose from.
    expect(finding.fix.description).toMatch(/title|headline|children/);

    expect(result.summary.bySeverity.error).toBe(1);
    expect(result.summary.byCode['ANAT-D020']).toBe(1);
    expect(result.catalog.conventionsApplied).toEqual(['EmptyState']);
  });

  it('emits zero findings for an EmptyState that accepts a `title` prop', async () => {
    const result = await runAudit({
      path: projectRoot,
      mode: 'fast',
      files: ['WithTitleEmptyState.tsx'],
    });

    expect(result.findings).toHaveLength(0);
    expect(result.summary.bySeverity.error).toBe(0);
    expect(result.catalog.conventionsApplied).toEqual(['EmptyState']);
  });

  it('emits zero findings for an EmptyState that accepts a `headline` prop', async () => {
    const result = await runAudit({
      path: projectRoot,
      mode: 'fast',
      files: ['WithHeadlineEmptyState.tsx'],
    });

    expect(result.findings).toHaveLength(0);
    expect(result.catalog.conventionsApplied).toEqual(['EmptyState']);
  });

  it('emits zero findings for an EmptyState that accepts typed `children`', async () => {
    const result = await runAudit({
      path: projectRoot,
      mode: 'fast',
      files: ['WithChildrenEmptyState.tsx'],
    });

    expect(result.findings).toHaveLength(0);
    expect(result.catalog.conventionsApplied).toEqual(['EmptyState']);
  });

  it('respects strictness=permissive — softens ANAT-D020 from error to warn', async () => {
    const result = await runAudit({
      path: projectRoot,
      mode: 'fast',
      files: ['PositiveEmptyState.tsx'],
      designStrictness: 'permissive',
    });

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.code).toBe('ANAT-D020');
    expect(result.findings[0]!.severity).toBe('warn');
    expect(result.summary.bySeverity.warn).toBe(1);
    expect(result.summary.bySeverity.error).toBe(0);
  });

  it('respects strictness=strict — ANAT-D020 stays at error (already top severity)', async () => {
    const result = await runAudit({
      path: projectRoot,
      mode: 'fast',
      files: ['PositiveEmptyState.tsx'],
      designStrictness: 'strict',
    });

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.severity).toBe('error');
  });

  it('partitions findings across Button, Input, and EmptyState fixtures in one run', async () => {
    // Add a Button-missing-content fixture and an Input-missing-label
    // fixture alongside the EmptyState one so the multi-component path is
    // exercised — catalogue applies all three conventions in the same call
    // without cross-contamination.
    const buttonPath = path.join(projectRoot, 'NoContentButton.tsx');
    fs.writeFileSync(
      buttonPath,
      `interface ButtonProps { onClick?: () => void; }\nexport const Button = ({ onClick }: ButtonProps) => <button onClick={onClick} />;\n`,
      'utf8'
    );
    const inputPath = path.join(projectRoot, 'NoLabelInput.tsx');
    fs.writeFileSync(
      inputPath,
      `interface InputProps { value?: string; }\nexport const Input = ({ value }: InputProps) => <input value={value} />;\n`,
      'utf8'
    );

    const result = await runAudit({
      path: projectRoot,
      mode: 'fast',
      files: ['PositiveEmptyState.tsx', 'NoContentButton.tsx', 'NoLabelInput.tsx'],
    });

    expect(result.findings).toHaveLength(3);
    const codes = result.findings.map((f) => f.code).sort();
    expect(codes).toEqual(['ANAT-D001', 'ANAT-D004', 'ANAT-D020']);
    expect(result.catalog.conventionsApplied).toEqual(['Button', 'EmptyState', 'Input']);
  });
});
