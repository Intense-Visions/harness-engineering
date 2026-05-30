/**
 * Integration test for the Select convention (Phase 2 catalog
 * expansion #5).
 *
 * Exercises the full pipeline end-to-end for the fifth catalogued
 * component:
 *
 *   resolveComponentType  →  resolveAnatomyRules  →  parseComponentDefinition
 *                          →  runConventionRule    →  runAudit (MCP)
 *
 * Covers ANAT-D006 (Select: missing required `label` slot) at all three
 * supported labelling satisfiers (`label`, `aria-label`, and
 * `aria-labelledby`) and the silent-skip case for a Select definition
 * whose prop type is missing every labelling affordance. Also verifies
 * the APG-mandated non-satisfaction of `placeholder` (placeholder text
 * is not the field's accessible name).
 *
 * Refs: docs/changes/design-pipeline/audit-component-anatomy/proposal.md
 * (Phase 2 catalog expansion; Success Criteria #1 for Select);
 * finding-codes.md § ANAT-D006 satisfiability table;
 * phase-0-schema-spike/conventions/select.md.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { runAudit } from '../../../../src/mcp/tools/audit-anatomy';

const positiveSelectSource = `
interface SelectProps {
  value?: string;
  onChange?: (next: string) => void;
  options: Array<{ value: string; label: string }>;
  // No \`label\`, \`aria-label\`, or \`aria-labelledby\` prop — ANAT-D006 fires.
}

export const Select = ({ value, onChange, options }: SelectProps) => (
  <select value={value} onChange={(e) => onChange?.(e.target.value)}>
    {options.map((opt) => (
      <option key={opt.value} value={opt.value}>{opt.label}</option>
    ))}
  </select>
);
`;

const placeholderOnlySelectSource = `
interface SelectProps {
  value?: string;
  placeholder?: string;
  options: Array<{ value: string; label: string }>;
  // Has \`placeholder\` but NO \`label\` / \`aria-label\` / \`aria-labelledby\` —
  // APG explicitly warns placeholder is not the field's accessible name.
  // ANAT-D006 still fires.
}

export const Select = ({ value, placeholder, options }: SelectProps) => (
  <select value={value}>
    {placeholder && <option value="">{placeholder}</option>}
    {options.map((opt) => (
      <option key={opt.value} value={opt.value}>{opt.label}</option>
    ))}
  </select>
);
`;

const negativeSelectWithLabelProp = `
interface SelectProps {
  label: string;
  value?: string;
  options: Array<{ value: string; label: string }>;
}

export const Select = ({ label, value, options }: SelectProps) => (
  <label>
    {label}
    <select value={value}>
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  </label>
);
`;

const negativeSelectWithAriaLabel = `
interface SelectProps {
  'aria-label': string;
  value?: string;
  options: Array<{ value: string; label: string }>;
}

export const Select = (props: SelectProps) => (
  <select aria-label={props['aria-label']} value={props.value}>
    {props.options.map((opt) => (
      <option key={opt.value} value={opt.value}>{opt.label}</option>
    ))}
  </select>
);
`;

const negativeSelectWithAriaLabelledby = `
interface SelectProps {
  'aria-labelledby': string;
  value?: string;
  options: Array<{ value: string; label: string }>;
}

export const Select = (props: SelectProps) => (
  <select aria-labelledby={props['aria-labelledby']} value={props.value}>
    {props.options.map((opt) => (
      <option key={opt.value} value={opt.value}>{opt.label}</option>
    ))}
  </select>
);
`;

describe('audit-anatomy Select convention — ANAT-D006', () => {
  let projectRoot: string;
  let positivePath: string;
  let placeholderOnlyPath: string;
  let withLabelPath: string;
  let withAriaLabelPath: string;
  let withAriaLabelledbyPath: string;

  beforeAll(() => {
    projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-anatomy-select-'));
    positivePath = path.join(projectRoot, 'PositiveSelect.tsx');
    placeholderOnlyPath = path.join(projectRoot, 'PlaceholderOnlySelect.tsx');
    withLabelPath = path.join(projectRoot, 'WithLabelSelect.tsx');
    withAriaLabelPath = path.join(projectRoot, 'WithAriaLabelSelect.tsx');
    withAriaLabelledbyPath = path.join(projectRoot, 'WithAriaLabelledbySelect.tsx');
    fs.writeFileSync(positivePath, positiveSelectSource, 'utf8');
    fs.writeFileSync(placeholderOnlyPath, placeholderOnlySelectSource, 'utf8');
    fs.writeFileSync(withLabelPath, negativeSelectWithLabelProp, 'utf8');
    fs.writeFileSync(withAriaLabelPath, negativeSelectWithAriaLabel, 'utf8');
    fs.writeFileSync(withAriaLabelledbyPath, negativeSelectWithAriaLabelledby, 'utf8');
  });

  afterAll(() => {
    if (projectRoot && fs.existsSync(projectRoot)) {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it('emits exactly one ANAT-D006 finding for a Select missing every labelling affordance', async () => {
    const result = await runAudit({
      path: projectRoot,
      mode: 'fast',
      files: ['PositiveSelect.tsx'],
    });

    expect(result.findings).toHaveLength(1);
    const finding = result.findings[0]!;
    expect(finding.code).toBe('ANAT-D006');
    expect(finding.severity).toBe('error');
    expect(finding.componentType).toBe('Select');
    expect(finding.file).toBe('PositiveSelect.tsx');
    expect(finding.rule.source).toBe('APG/listbox');
    expect(finding.fix.kind).toBe('manual');
    // Fix hint references the three labelling affordances callers can choose from.
    expect(finding.fix.description).toMatch(/label|aria-label|aria-labelledby/);

    expect(result.summary.bySeverity.error).toBe(1);
    expect(result.summary.byCode['ANAT-D006']).toBe(1);
    expect(result.catalog.conventionsApplied).toEqual(['Select']);
  });

  it('still emits ANAT-D006 when only `placeholder` is present (APG explicitly forbids placeholder-as-label)', async () => {
    const result = await runAudit({
      path: projectRoot,
      mode: 'fast',
      files: ['PlaceholderOnlySelect.tsx'],
    });

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.code).toBe('ANAT-D006');
    expect(result.findings[0]!.componentType).toBe('Select');
  });

  it('emits zero findings for a Select that accepts a `label` prop', async () => {
    const result = await runAudit({
      path: projectRoot,
      mode: 'fast',
      files: ['WithLabelSelect.tsx'],
    });

    expect(result.findings).toHaveLength(0);
    expect(result.summary.bySeverity.error).toBe(0);
    expect(result.catalog.conventionsApplied).toEqual(['Select']);
  });

  it('emits zero findings for a Select that accepts an `aria-label` prop', async () => {
    const result = await runAudit({
      path: projectRoot,
      mode: 'fast',
      files: ['WithAriaLabelSelect.tsx'],
    });

    expect(result.findings).toHaveLength(0);
    expect(result.catalog.conventionsApplied).toEqual(['Select']);
  });

  it('emits zero findings for a Select that accepts an `aria-labelledby` prop', async () => {
    const result = await runAudit({
      path: projectRoot,
      mode: 'fast',
      files: ['WithAriaLabelledbySelect.tsx'],
    });

    expect(result.findings).toHaveLength(0);
    expect(result.catalog.conventionsApplied).toEqual(['Select']);
  });

  it('respects strictness=permissive — softens ANAT-D006 from error to warn', async () => {
    const result = await runAudit({
      path: projectRoot,
      mode: 'fast',
      files: ['PositiveSelect.tsx'],
      designStrictness: 'permissive',
    });

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.code).toBe('ANAT-D006');
    expect(result.findings[0]!.severity).toBe('warn');
    expect(result.summary.bySeverity.warn).toBe(1);
    expect(result.summary.bySeverity.error).toBe(0);
  });

  it('respects strictness=strict — ANAT-D006 stays at error (already top severity)', async () => {
    const result = await runAudit({
      path: projectRoot,
      mode: 'fast',
      files: ['PositiveSelect.tsx'],
      designStrictness: 'strict',
    });

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.severity).toBe('error');
  });

  it('partitions findings across Button, Input, Dialog, EmptyState, and Select fixtures in one run', async () => {
    // Confirm the five-component catalog applies all conventions in the
    // same call without cross-contamination — each fixture emits exactly
    // its expected finding code; the labelling-family fixtures (Input,
    // Dialog, Select) do not bleed into each other.
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
    const dialogPath = path.join(projectRoot, 'NoTitleDialog.tsx');
    fs.writeFileSync(
      dialogPath,
      `interface DialogProps { open: boolean; }\nexport const Dialog = ({ open }: DialogProps) => open ? <div role="dialog" /> : null;\n`,
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
        'PositiveSelect.tsx',
        'NoContentButton.tsx',
        'NoLabelInput.tsx',
        'NoTitleDialog.tsx',
        'NoHeadlineEmptyState.tsx',
      ],
    });

    expect(result.findings).toHaveLength(5);
    const codes = result.findings.map((f) => f.code).sort();
    expect(codes).toEqual(['ANAT-D001', 'ANAT-D004', 'ANAT-D005', 'ANAT-D006', 'ANAT-D020']);
    expect(result.catalog.conventionsApplied).toEqual([
      'Button',
      'Dialog',
      'EmptyState',
      'Input',
      'Select',
    ]);
  });
});
