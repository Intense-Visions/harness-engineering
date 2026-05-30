/**
 * Integration test for the Checkbox convention (Phase 2 catalog expansion).
 *
 * Exercises the full pipeline end-to-end for the Checkbox convention:
 *
 *   resolveComponentType  →  resolveAnatomyRules  →  parseComponentDefinition
 *                          →  runConventionRule    →  runAudit (MCP)
 *
 * Covers ANAT-D008 (Checkbox: missing required `label` slot) at all three
 * supported labelling satisfiers (`label`, `aria-label`, `aria-labelledby`)
 * and the positive case for a Checkbox definition whose prop type exposes
 * none of them. Mirrors the structure of switch-convention.test.ts —
 * Checkbox is the fifth catalogued component to share the three-satisfier
 * shape with Input.label / Dialog.title / Select.label / Switch.label.
 *
 * Refs: docs/changes/design-pipeline/audit-component-anatomy/proposal.md
 * (Phase 2 catalog expansion; Success Criteria #1 for Checkbox);
 * finding-codes.md § ANAT-D008 satisfiability table.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { runAudit } from '../../../../src/mcp/tools/audit-anatomy';

const positiveCheckboxSource = `
interface CheckboxProps {
  checked?: boolean;
  onCheckedChange?: (next: boolean) => void;
  // No label, aria-label, or aria-labelledby prop — ANAT-D008 fires.
}

export const Checkbox = ({ checked, onCheckedChange }: CheckboxProps) => (
  <input
    type="checkbox"
    checked={checked}
    onChange={(e) => onCheckedChange?.(e.target.checked)}
  />
);
`;

const negativeCheckboxWithLabelProp = `
interface CheckboxProps {
  label: string;
  checked?: boolean;
  onCheckedChange?: (next: boolean) => void;
}

export const Checkbox = ({ label, checked, onCheckedChange }: CheckboxProps) => (
  <label>
    {label}
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onCheckedChange?.(e.target.checked)}
    />
  </label>
);
`;

const negativeCheckboxWithAriaLabel = `
interface CheckboxProps {
  'aria-label': string;
  checked?: boolean;
}

export const Checkbox = (props: CheckboxProps) => (
  <input
    type="checkbox"
    aria-label={props['aria-label']}
    checked={props.checked}
  />
);
`;

const negativeCheckboxWithAriaLabelledby = `
interface CheckboxProps {
  'aria-labelledby': string;
  checked?: boolean;
}

export const Checkbox = (props: CheckboxProps) => (
  <input
    type="checkbox"
    aria-labelledby={props['aria-labelledby']}
    checked={props.checked}
  />
);
`;

describe('audit-anatomy Checkbox convention — ANAT-D008', () => {
  let projectRoot: string;
  let positivePath: string;
  let withLabelPath: string;
  let withAriaLabelPath: string;
  let withAriaLabelledbyPath: string;

  beforeAll(() => {
    projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-anatomy-checkbox-'));
    positivePath = path.join(projectRoot, 'PositiveCheckbox.tsx');
    withLabelPath = path.join(projectRoot, 'WithLabelCheckbox.tsx');
    withAriaLabelPath = path.join(projectRoot, 'WithAriaLabelCheckbox.tsx');
    withAriaLabelledbyPath = path.join(projectRoot, 'WithAriaLabelledbyCheckbox.tsx');
    fs.writeFileSync(positivePath, positiveCheckboxSource, 'utf8');
    fs.writeFileSync(withLabelPath, negativeCheckboxWithLabelProp, 'utf8');
    fs.writeFileSync(withAriaLabelPath, negativeCheckboxWithAriaLabel, 'utf8');
    fs.writeFileSync(withAriaLabelledbyPath, negativeCheckboxWithAriaLabelledby, 'utf8');
  });

  afterAll(() => {
    if (projectRoot && fs.existsSync(projectRoot)) {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it('emits exactly one ANAT-D008 finding for a Checkbox missing every labelling affordance', async () => {
    const result = await runAudit({
      path: projectRoot,
      mode: 'fast',
      files: ['PositiveCheckbox.tsx'],
    });

    expect(result.findings).toHaveLength(1);
    const finding = result.findings[0]!;
    expect(finding.code).toBe('ANAT-D008');
    expect(finding.severity).toBe('error');
    expect(finding.componentType).toBe('Checkbox');
    expect(finding.file).toBe('PositiveCheckbox.tsx');
    expect(finding.rule.source).toBe('APG/checkbox');
    expect(finding.fix.kind).toBe('manual');
    // Fix hint references the three labelling affordances the caller may
    // choose from — the verbatim ConventionRule.fixHint text.
    expect(finding.fix.description).toMatch(/label|aria-label|aria-labelledby/);

    expect(result.summary.bySeverity.error).toBe(1);
    expect(result.summary.byCode['ANAT-D008']).toBe(1);
    expect(result.catalog.conventionsApplied).toEqual(['Checkbox']);
  });

  it('emits zero findings for a Checkbox that accepts a `label` prop', async () => {
    const result = await runAudit({
      path: projectRoot,
      mode: 'fast',
      files: ['WithLabelCheckbox.tsx'],
    });

    expect(result.findings).toHaveLength(0);
    expect(result.summary.bySeverity.error).toBe(0);
    expect(result.catalog.conventionsApplied).toEqual(['Checkbox']);
  });

  it('emits zero findings for a Checkbox that accepts an `aria-label` prop', async () => {
    const result = await runAudit({
      path: projectRoot,
      mode: 'fast',
      files: ['WithAriaLabelCheckbox.tsx'],
    });

    expect(result.findings).toHaveLength(0);
    expect(result.catalog.conventionsApplied).toEqual(['Checkbox']);
  });

  it('emits zero findings for a Checkbox that accepts an `aria-labelledby` prop', async () => {
    const result = await runAudit({
      path: projectRoot,
      mode: 'fast',
      files: ['WithAriaLabelledbyCheckbox.tsx'],
    });

    expect(result.findings).toHaveLength(0);
    expect(result.catalog.conventionsApplied).toEqual(['Checkbox']);
  });

  it('respects strictness=permissive — softens ANAT-D008 from error to warn', async () => {
    const result = await runAudit({
      path: projectRoot,
      mode: 'fast',
      files: ['PositiveCheckbox.tsx'],
      designStrictness: 'permissive',
    });

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.code).toBe('ANAT-D008');
    expect(result.findings[0]!.severity).toBe('warn');
    expect(result.summary.bySeverity.warn).toBe(1);
    expect(result.summary.bySeverity.error).toBe(0);
  });

  it('respects strictness=strict — keeps ANAT-D008 at error (already top severity)', async () => {
    // Strict only promotes warn → error; the existing default for ANAT-D008
    // is already error, so strict is a no-op. Lock that contract here so a
    // future severity-matrix change cannot silently double-promote.
    const result = await runAudit({
      path: projectRoot,
      mode: 'fast',
      files: ['PositiveCheckbox.tsx'],
      designStrictness: 'strict',
    });

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.severity).toBe('error');
  });

  it('partitions findings correctly when Checkbox and other catalogued components run together', async () => {
    // Add Switch-missing-label and Input-missing-label fixtures alongside
    // the Checkbox one so the multi-component path is exercised across the
    // form-field family (catalog applies all three conventions in the
    // same call without cross-contamination).
    const switchPath = path.join(projectRoot, 'NoLabelSwitch.tsx');
    const inputPath = path.join(projectRoot, 'NoLabelInput.tsx');
    fs.writeFileSync(
      switchPath,
      `interface SwitchProps { checked?: boolean; }\nexport const Switch = ({ checked }: SwitchProps) => <button role="switch" aria-checked={checked} />;\n`,
      'utf8'
    );
    fs.writeFileSync(
      inputPath,
      `interface InputProps { value?: string; }\nexport const Input = ({ value }: InputProps) => <input value={value} />;\n`,
      'utf8'
    );

    const result = await runAudit({
      path: projectRoot,
      mode: 'fast',
      files: ['PositiveCheckbox.tsx', 'NoLabelSwitch.tsx', 'NoLabelInput.tsx'],
    });

    expect(result.findings).toHaveLength(3);
    const codes = result.findings.map((f) => f.code).sort();
    expect(codes).toEqual(['ANAT-D004', 'ANAT-D007', 'ANAT-D008']);
    expect(result.catalog.conventionsApplied).toEqual(['Checkbox', 'Input', 'Switch']);
  });
});
