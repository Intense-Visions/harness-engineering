/**
 * Integration test for the Input convention (Phase 2 catalog expansion).
 *
 * Exercises the full pipeline end-to-end for the second catalogued
 * component:
 *
 *   resolveComponentType  →  resolveAnatomyRules  →  parseComponentDefinition
 *                          →  runConventionRule    →  runAudit (MCP)
 *
 * Covers ANAT-D004 (Input: missing required `label` slot) at all three
 * supported labelling satisfiers (`label`, `aria-label`, `aria-labelledby`)
 * and the silent-skip case for an Input definition whose prop type is
 * missing every labelling affordance.
 *
 * Refs: docs/changes/design-pipeline/audit-component-anatomy/proposal.md
 * (Phase 2 catalog expansion; Success Criteria #1 for Input);
 * finding-codes.md § ANAT-D004 satisfiability table.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { runAudit } from '../../../../src/mcp/tools/audit-anatomy';

const positiveInputSource = `
interface InputProps {
  value?: string;
  onChange?: (next: string) => void;
  placeholder?: string;
  // No label, aria-label, or aria-labelledby prop — ANAT-D004 fires.
}

export const Input = ({ value, onChange, placeholder }: InputProps) => (
  <input value={value} onChange={(e) => onChange?.(e.target.value)} placeholder={placeholder} />
);
`;

const negativeInputWithLabelProp = `
interface InputProps {
  label: string;
  value?: string;
  onChange?: (next: string) => void;
}

export const Input = ({ label, value, onChange }: InputProps) => (
  <label>
    {label}
    <input value={value} onChange={(e) => onChange?.(e.target.value)} />
  </label>
);
`;

const negativeInputWithAriaLabel = `
interface InputProps {
  'aria-label': string;
  value?: string;
}

export const Input = (props: InputProps) => (
  <input aria-label={props['aria-label']} value={props.value} />
);
`;

const negativeInputWithAriaLabelledby = `
interface InputProps {
  'aria-labelledby': string;
  value?: string;
}

export const Input = (props: InputProps) => (
  <input aria-labelledby={props['aria-labelledby']} value={props.value} />
);
`;

describe('audit-anatomy Input convention — ANAT-D004', () => {
  let projectRoot: string;
  let positivePath: string;
  let withLabelPath: string;
  let withAriaLabelPath: string;
  let withAriaLabelledbyPath: string;

  beforeAll(() => {
    projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-anatomy-input-'));
    positivePath = path.join(projectRoot, 'PositiveInput.tsx');
    withLabelPath = path.join(projectRoot, 'WithLabelInput.tsx');
    withAriaLabelPath = path.join(projectRoot, 'WithAriaLabelInput.tsx');
    withAriaLabelledbyPath = path.join(projectRoot, 'WithAriaLabelledbyInput.tsx');
    fs.writeFileSync(positivePath, positiveInputSource, 'utf8');
    fs.writeFileSync(withLabelPath, negativeInputWithLabelProp, 'utf8');
    fs.writeFileSync(withAriaLabelPath, negativeInputWithAriaLabel, 'utf8');
    fs.writeFileSync(withAriaLabelledbyPath, negativeInputWithAriaLabelledby, 'utf8');
  });

  afterAll(() => {
    if (projectRoot && fs.existsSync(projectRoot)) {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it('emits exactly one ANAT-D004 finding for an Input missing every labelling affordance', async () => {
    const result = await runAudit({
      path: projectRoot,
      mode: 'fast',
      files: ['PositiveInput.tsx'],
    });

    expect(result.findings).toHaveLength(1);
    const finding = result.findings[0]!;
    expect(finding.code).toBe('ANAT-D004');
    expect(finding.severity).toBe('error');
    expect(finding.componentType).toBe('Input');
    expect(finding.file).toBe('PositiveInput.tsx');
    expect(finding.rule.source).toBe('APG/textbox');
    expect(finding.fix.kind).toBe('manual');
    // Fix hint references the three labelling affordances callers can choose from.
    expect(finding.fix.description).toMatch(/label|aria-label|aria-labelledby/);

    expect(result.summary.bySeverity.error).toBe(1);
    expect(result.summary.byCode['ANAT-D004']).toBe(1);
    expect(result.catalog.conventionsApplied).toEqual(['Input']);
  });

  it('emits zero findings for an Input that accepts a `label` prop', async () => {
    const result = await runAudit({
      path: projectRoot,
      mode: 'fast',
      files: ['WithLabelInput.tsx'],
    });

    expect(result.findings).toHaveLength(0);
    expect(result.summary.bySeverity.error).toBe(0);
    expect(result.catalog.conventionsApplied).toEqual(['Input']);
  });

  it('emits zero findings for an Input that accepts an `aria-label` prop', async () => {
    const result = await runAudit({
      path: projectRoot,
      mode: 'fast',
      files: ['WithAriaLabelInput.tsx'],
    });

    expect(result.findings).toHaveLength(0);
    expect(result.catalog.conventionsApplied).toEqual(['Input']);
  });

  it('emits zero findings for an Input that accepts an `aria-labelledby` prop', async () => {
    const result = await runAudit({
      path: projectRoot,
      mode: 'fast',
      files: ['WithAriaLabelledbyInput.tsx'],
    });

    expect(result.findings).toHaveLength(0);
    expect(result.catalog.conventionsApplied).toEqual(['Input']);
  });

  it('respects strictness=permissive — softens ANAT-D004 from error to warn', async () => {
    const result = await runAudit({
      path: projectRoot,
      mode: 'fast',
      files: ['PositiveInput.tsx'],
      designStrictness: 'permissive',
    });

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.code).toBe('ANAT-D004');
    expect(result.findings[0]!.severity).toBe('warn');
    expect(result.summary.bySeverity.warn).toBe(1);
    expect(result.summary.bySeverity.error).toBe(0);
  });

  it('partitions findings correctly when Button and Input fixtures run together', async () => {
    // Add a Button-missing-content fixture alongside the Input one so the
    // multi-component path is exercised (catalogue applies both conventions
    // in the same call without cross-contamination).
    const buttonPath = path.join(projectRoot, 'NoContentButton.tsx');
    fs.writeFileSync(
      buttonPath,
      `interface ButtonProps { onClick?: () => void; }\nexport const Button = ({ onClick }: ButtonProps) => <button onClick={onClick} />;\n`,
      'utf8'
    );

    const result = await runAudit({
      path: projectRoot,
      mode: 'fast',
      files: ['PositiveInput.tsx', 'NoContentButton.tsx'],
    });

    expect(result.findings).toHaveLength(2);
    const codes = result.findings.map((f) => f.code).sort();
    expect(codes).toEqual(['ANAT-D001', 'ANAT-D004']);
    expect(result.catalog.conventionsApplied).toEqual(['Button', 'Input']);
  });
});
