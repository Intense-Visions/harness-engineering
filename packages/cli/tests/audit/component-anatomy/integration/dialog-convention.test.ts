/**
 * Integration test for the Dialog convention (Phase 2 catalog
 * expansion #4).
 *
 * Exercises the full pipeline end-to-end for the fourth catalogued
 * component:
 *
 *   resolveComponentType  →  resolveAnatomyRules  →  parseComponentDefinition
 *                          →  runConventionRule    →  runAudit (MCP)
 *
 * Covers ANAT-D005 (Dialog: missing required `title` slot) at all three
 * supported accessible-name satisfiers (`title`, `aria-label`, and
 * `aria-labelledby`) and the silent-skip case for a Dialog definition
 * whose prop type is missing every accessible-name affordance.
 *
 * Refs: docs/changes/design-pipeline/audit-component-anatomy/proposal.md
 * (Phase 2 catalog expansion; Success Criteria #1 for Dialog);
 * finding-codes.md § ANAT-D005 satisfiability table;
 * phase-0-schema-spike/conventions/dialog.md.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { runAudit } from '../../../../src/mcp/tools/audit-anatomy';

const positiveDialogSource = `
interface DialogProps {
  open: boolean;
  onOpenChange?: (next: boolean) => void;
  children?: React.ReactNode;
  // No \`title\`, \`aria-label\`, or \`aria-labelledby\` prop — ANAT-D005 fires.
}

export const Dialog = ({ open, onOpenChange, children }: DialogProps) => (
  open ? (
    <div role="dialog">
      <button onClick={() => onOpenChange?.(false)}>×</button>
      {children}
    </div>
  ) : null
);
`;

const negativeDialogWithTitleProp = `
interface DialogProps {
  open: boolean;
  title: string;
  onOpenChange?: (next: boolean) => void;
  children?: React.ReactNode;
}

export const Dialog = ({ open, title, onOpenChange, children }: DialogProps) => (
  open ? (
    <div role="dialog" aria-labelledby="dialog-title">
      <h2 id="dialog-title">{title}</h2>
      <button onClick={() => onOpenChange?.(false)}>×</button>
      {children}
    </div>
  ) : null
);
`;

const negativeDialogWithAriaLabel = `
interface DialogProps {
  open: boolean;
  'aria-label': string;
  children?: React.ReactNode;
}

export const Dialog = (props: DialogProps) => (
  props.open ? (
    <div role="dialog" aria-label={props['aria-label']}>
      {props.children}
    </div>
  ) : null
);
`;

const negativeDialogWithAriaLabelledby = `
interface DialogProps {
  open: boolean;
  'aria-labelledby': string;
  children?: React.ReactNode;
}

export const Dialog = (props: DialogProps) => (
  props.open ? (
    <div role="dialog" aria-labelledby={props['aria-labelledby']}>
      {props.children}
    </div>
  ) : null
);
`;

describe('audit-anatomy Dialog convention — ANAT-D005', () => {
  let projectRoot: string;
  let positivePath: string;
  let withTitlePath: string;
  let withAriaLabelPath: string;
  let withAriaLabelledbyPath: string;

  beforeAll(() => {
    projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-anatomy-dialog-'));
    positivePath = path.join(projectRoot, 'PositiveDialog.tsx');
    withTitlePath = path.join(projectRoot, 'WithTitleDialog.tsx');
    withAriaLabelPath = path.join(projectRoot, 'WithAriaLabelDialog.tsx');
    withAriaLabelledbyPath = path.join(projectRoot, 'WithAriaLabelledbyDialog.tsx');
    fs.writeFileSync(positivePath, positiveDialogSource, 'utf8');
    fs.writeFileSync(withTitlePath, negativeDialogWithTitleProp, 'utf8');
    fs.writeFileSync(withAriaLabelPath, negativeDialogWithAriaLabel, 'utf8');
    fs.writeFileSync(withAriaLabelledbyPath, negativeDialogWithAriaLabelledby, 'utf8');
  });

  afterAll(() => {
    if (projectRoot && fs.existsSync(projectRoot)) {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it('emits exactly one ANAT-D005 finding for a Dialog missing every accessible-name affordance', async () => {
    const result = await runAudit({
      path: projectRoot,
      mode: 'fast',
      files: ['PositiveDialog.tsx'],
    });

    expect(result.findings).toHaveLength(1);
    const finding = result.findings[0]!;
    expect(finding.code).toBe('ANAT-D005');
    expect(finding.severity).toBe('error');
    expect(finding.componentType).toBe('Dialog');
    expect(finding.file).toBe('PositiveDialog.tsx');
    expect(finding.rule.source).toBe('APG/dialog-modal');
    expect(finding.fix.kind).toBe('manual');
    // Fix hint references the three accessible-name affordances callers can choose from.
    expect(finding.fix.description).toMatch(/title|aria-label|aria-labelledby/);

    expect(result.summary.bySeverity.error).toBe(1);
    expect(result.summary.byCode['ANAT-D005']).toBe(1);
    expect(result.catalog.conventionsApplied).toEqual(['Dialog']);
  });

  it('emits zero findings for a Dialog that accepts a `title` prop', async () => {
    const result = await runAudit({
      path: projectRoot,
      mode: 'fast',
      files: ['WithTitleDialog.tsx'],
    });

    expect(result.findings).toHaveLength(0);
    expect(result.summary.bySeverity.error).toBe(0);
    expect(result.catalog.conventionsApplied).toEqual(['Dialog']);
  });

  it('emits zero findings for a Dialog that accepts an `aria-label` prop', async () => {
    const result = await runAudit({
      path: projectRoot,
      mode: 'fast',
      files: ['WithAriaLabelDialog.tsx'],
    });

    expect(result.findings).toHaveLength(0);
    expect(result.catalog.conventionsApplied).toEqual(['Dialog']);
  });

  it('emits zero findings for a Dialog that accepts an `aria-labelledby` prop', async () => {
    const result = await runAudit({
      path: projectRoot,
      mode: 'fast',
      files: ['WithAriaLabelledbyDialog.tsx'],
    });

    expect(result.findings).toHaveLength(0);
    expect(result.catalog.conventionsApplied).toEqual(['Dialog']);
  });

  it('respects strictness=permissive — softens ANAT-D005 from error to warn', async () => {
    const result = await runAudit({
      path: projectRoot,
      mode: 'fast',
      files: ['PositiveDialog.tsx'],
      designStrictness: 'permissive',
    });

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.code).toBe('ANAT-D005');
    expect(result.findings[0]!.severity).toBe('warn');
    expect(result.summary.bySeverity.warn).toBe(1);
    expect(result.summary.bySeverity.error).toBe(0);
  });

  it('respects strictness=strict — ANAT-D005 stays at error (already top severity)', async () => {
    const result = await runAudit({
      path: projectRoot,
      mode: 'fast',
      files: ['PositiveDialog.tsx'],
      designStrictness: 'strict',
    });

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.severity).toBe('error');
  });

  it('partitions findings across Button, Input, Dialog, and EmptyState fixtures in one run', async () => {
    // Add a Button-missing-content fixture, an Input-missing-label fixture,
    // and an EmptyState-missing-headline fixture alongside the Dialog one
    // so the multi-component path is exercised — catalogue applies all
    // four conventions in the same call without cross-contamination.
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
    const emptyStatePath = path.join(projectRoot, 'NoHeadlineEmptyState.tsx');
    fs.writeFileSync(
      emptyStatePath,
      `interface EmptyStateProps { icon?: React.ReactNode; }\nexport const EmptyState = ({ icon }: EmptyStateProps) => <div>{icon}</div>;\n`,
      'utf8'
    );

    const result = await runAudit({
      path: projectRoot,
      mode: 'fast',
      files: [
        'PositiveDialog.tsx',
        'NoContentButton.tsx',
        'NoLabelInput.tsx',
        'NoHeadlineEmptyState.tsx',
      ],
    });

    expect(result.findings).toHaveLength(4);
    const codes = result.findings.map((f) => f.code).sort();
    expect(codes).toEqual(['ANAT-D001', 'ANAT-D004', 'ANAT-D005', 'ANAT-D020']);
    expect(result.catalog.conventionsApplied).toEqual(['Button', 'Dialog', 'EmptyState', 'Input']);
  });
});
