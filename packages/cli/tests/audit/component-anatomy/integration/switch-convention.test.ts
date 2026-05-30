/**
 * Integration test for the Switch convention (Phase 2 catalog expansion).
 *
 * Exercises the full pipeline end-to-end for the Switch convention:
 *
 *   resolveComponentType  →  resolveAnatomyRules  →  parseComponentDefinition
 *                          →  runConventionRule    →  runAudit (MCP)
 *
 * Covers ANAT-D007 (Switch: missing required `label` slot) at all three
 * supported labelling satisfiers (`label`, `aria-label`, `aria-labelledby`)
 * and the positive case for a Switch definition whose prop type exposes
 * none of them. Mirrors the structure of input-convention.test.ts and
 * dialog-convention.test.ts — Switch is the fourth catalogued component
 * to share the three-satisfier shape with Input.label / Dialog.title.
 *
 * Refs: docs/changes/design-pipeline/audit-component-anatomy/proposal.md
 * (Phase 2 catalog expansion; Success Criteria #1 for Switch);
 * finding-codes.md § ANAT-D007 satisfiability table.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { runAudit } from '../../../../src/mcp/tools/audit-anatomy';

const positiveSwitchSource = `
interface SwitchProps {
  checked?: boolean;
  onCheckedChange?: (next: boolean) => void;
  // No label, aria-label, or aria-labelledby prop — ANAT-D007 fires.
}

export const Switch = ({ checked, onCheckedChange }: SwitchProps) => (
  <button
    role="switch"
    aria-checked={checked}
    onClick={() => onCheckedChange?.(!checked)}
  />
);
`;

const negativeSwitchWithLabelProp = `
interface SwitchProps {
  label: string;
  checked?: boolean;
  onCheckedChange?: (next: boolean) => void;
}

export const Switch = ({ label, checked, onCheckedChange }: SwitchProps) => (
  <label>
    {label}
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onCheckedChange?.(!checked)}
    />
  </label>
);
`;

const negativeSwitchWithAriaLabel = `
interface SwitchProps {
  'aria-label': string;
  checked?: boolean;
}

export const Switch = (props: SwitchProps) => (
  <button
    role="switch"
    aria-label={props['aria-label']}
    aria-checked={props.checked}
  />
);
`;

const negativeSwitchWithAriaLabelledby = `
interface SwitchProps {
  'aria-labelledby': string;
  checked?: boolean;
}

export const Switch = (props: SwitchProps) => (
  <button
    role="switch"
    aria-labelledby={props['aria-labelledby']}
    aria-checked={props.checked}
  />
);
`;

describe('audit-anatomy Switch convention — ANAT-D007', () => {
  let projectRoot: string;
  let positivePath: string;
  let withLabelPath: string;
  let withAriaLabelPath: string;
  let withAriaLabelledbyPath: string;

  beforeAll(() => {
    projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-anatomy-switch-'));
    positivePath = path.join(projectRoot, 'PositiveSwitch.tsx');
    withLabelPath = path.join(projectRoot, 'WithLabelSwitch.tsx');
    withAriaLabelPath = path.join(projectRoot, 'WithAriaLabelSwitch.tsx');
    withAriaLabelledbyPath = path.join(projectRoot, 'WithAriaLabelledbySwitch.tsx');
    fs.writeFileSync(positivePath, positiveSwitchSource, 'utf8');
    fs.writeFileSync(withLabelPath, negativeSwitchWithLabelProp, 'utf8');
    fs.writeFileSync(withAriaLabelPath, negativeSwitchWithAriaLabel, 'utf8');
    fs.writeFileSync(withAriaLabelledbyPath, negativeSwitchWithAriaLabelledby, 'utf8');
  });

  afterAll(() => {
    if (projectRoot && fs.existsSync(projectRoot)) {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it('emits exactly one ANAT-D007 finding for a Switch missing every labelling affordance', async () => {
    const result = await runAudit({
      path: projectRoot,
      mode: 'fast',
      files: ['PositiveSwitch.tsx'],
    });

    expect(result.findings).toHaveLength(1);
    const finding = result.findings[0]!;
    expect(finding.code).toBe('ANAT-D007');
    expect(finding.severity).toBe('error');
    expect(finding.componentType).toBe('Switch');
    expect(finding.file).toBe('PositiveSwitch.tsx');
    expect(finding.rule.source).toBe('APG/switch');
    expect(finding.fix.kind).toBe('manual');
    // Fix hint references the three labelling affordances the caller may
    // choose from — the verbatim ConventionRule.fixHint text.
    expect(finding.fix.description).toMatch(/label|aria-label|aria-labelledby/);

    expect(result.summary.bySeverity.error).toBe(1);
    expect(result.summary.byCode['ANAT-D007']).toBe(1);
    expect(result.catalog.conventionsApplied).toEqual(['Switch']);
  });

  it('emits zero findings for a Switch that accepts a `label` prop', async () => {
    const result = await runAudit({
      path: projectRoot,
      mode: 'fast',
      files: ['WithLabelSwitch.tsx'],
    });

    expect(result.findings).toHaveLength(0);
    expect(result.summary.bySeverity.error).toBe(0);
    expect(result.catalog.conventionsApplied).toEqual(['Switch']);
  });

  it('emits zero findings for a Switch that accepts an `aria-label` prop', async () => {
    const result = await runAudit({
      path: projectRoot,
      mode: 'fast',
      files: ['WithAriaLabelSwitch.tsx'],
    });

    expect(result.findings).toHaveLength(0);
    expect(result.catalog.conventionsApplied).toEqual(['Switch']);
  });

  it('emits zero findings for a Switch that accepts an `aria-labelledby` prop', async () => {
    const result = await runAudit({
      path: projectRoot,
      mode: 'fast',
      files: ['WithAriaLabelledbySwitch.tsx'],
    });

    expect(result.findings).toHaveLength(0);
    expect(result.catalog.conventionsApplied).toEqual(['Switch']);
  });

  it('respects strictness=permissive — softens ANAT-D007 from error to warn', async () => {
    const result = await runAudit({
      path: projectRoot,
      mode: 'fast',
      files: ['PositiveSwitch.tsx'],
      designStrictness: 'permissive',
    });

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.code).toBe('ANAT-D007');
    expect(result.findings[0]!.severity).toBe('warn');
    expect(result.summary.bySeverity.warn).toBe(1);
    expect(result.summary.bySeverity.error).toBe(0);
  });

  it('respects strictness=strict — keeps ANAT-D007 at error (already top severity)', async () => {
    // Strict only promotes warn → error; the existing default for ANAT-D007
    // is already error, so strict is a no-op. Lock that contract here so a
    // future severity-matrix change cannot silently double-promote.
    const result = await runAudit({
      path: projectRoot,
      mode: 'fast',
      files: ['PositiveSwitch.tsx'],
      designStrictness: 'strict',
    });

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.severity).toBe('error');
  });

  it('partitions findings correctly when Switch and other catalogued components run together', async () => {
    // Add Button-missing-content and Input-missing-label fixtures alongside
    // the Switch one so the multi-component path is exercised across the
    // form-field family (catalog applies all three conventions in the
    // same call without cross-contamination).
    const buttonPath = path.join(projectRoot, 'NoContentButton.tsx');
    const inputPath = path.join(projectRoot, 'NoLabelInput.tsx');
    fs.writeFileSync(
      buttonPath,
      `interface ButtonProps { onClick?: () => void; }\nexport const Button = ({ onClick }: ButtonProps) => <button onClick={onClick} />;\n`,
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
      files: ['PositiveSwitch.tsx', 'NoContentButton.tsx', 'NoLabelInput.tsx'],
    });

    expect(result.findings).toHaveLength(3);
    const codes = result.findings.map((f) => f.code).sort();
    expect(codes).toEqual(['ANAT-D001', 'ANAT-D004', 'ANAT-D007']);
    expect(result.catalog.conventionsApplied).toEqual(['Button', 'Input', 'Switch']);
  });
});
