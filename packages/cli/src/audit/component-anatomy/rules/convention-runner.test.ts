import { describe, it, expect } from 'vitest';
import { runConventionRule } from './convention-runner';
import type { ConventionRule, AnatomyPart } from './convention-rule';
import type { ParsedComponent } from '../parsers/ast';
import type { AnatomyFindingCode, Severity } from '../findings/finding';

/**
 * Unit coverage for `runConventionRule` — the convention rule runner that
 * turns a ConventionRule + a parsed component definition into `ANAT-D*`
 * required-slot findings.
 *
 * Behaviour pinned here:
 *  - only REQUIRED slots are checked;
 *  - a slot is satisfied by any of its registered satisfier members
 *    (name-only match in the current phase);
 *  - a required, unsatisfied slot with NO allocated finding code is skipped
 *    (the runner never fabricates a code);
 *  - emitted findings carry the mapped code, resolved severity, message,
 *    evidence, rule source, and a manual fix hint.
 */

function slot(name: string, required: boolean, fixHint = `add ${name}`): AnatomyPart {
  return { name, required, fixHint };
}

function rule(overrides: Partial<ConventionRule> & { componentType: string }): ConventionRule {
  return {
    slots: [],
    states: [],
    variants: [],
    sizes: [],
    source: { ref: 'APG/button' },
    ...overrides,
  };
}

function parsed(exportName: string, propTypeMembers: string[]): ParsedComponent {
  return { exportName, propTypeMembers };
}

describe('runConventionRule — required slot findings', () => {
  it('emits ANAT-D001 when Button lacks any content satisfier', () => {
    const r = rule({ componentType: 'Button', slots: [slot('content', true)] });
    const findings = runConventionRule(r, parsed('Button', ['onClick', 'variant']));

    expect(findings).toHaveLength(1);
    const f = findings[0]!;
    expect(f.code).toBe('ANAT-D001');
    expect(f.componentType).toBe('Button');
    expect(f.severity).toBe('error'); // ANAT-D001 default severity, standard strictness
    expect(f.message).toContain('missing the required `content` slot');
    expect(f.message).toContain('Button'); // resolved export name
    expect(f.evidence?.snippet).toContain('onClick');
    expect(f.rule).toEqual({ id: 'ANAT-D001', source: 'APG/button' });
    expect(f.fix).toEqual({ kind: 'manual', description: 'add content' });
    expect(f.line).toBeNull();
  });

  it.each(['children', 'label', 'aria-label'])(
    'does not flag Button when the `%s` satisfier is present',
    (member) => {
      const r = rule({ componentType: 'Button', slots: [slot('content', true)] });
      expect(runConventionRule(r, parsed('Button', [member]))).toEqual([]);
    }
  );

  it('skips non-required slots entirely', () => {
    const r = rule({ componentType: 'Button', slots: [slot('content', false)] });
    expect(runConventionRule(r, parsed('Button', []))).toEqual([]);
  });

  it('skips a required unsatisfied slot that has no allocated finding code', () => {
    // `icon` is unsatisfied and required, but Button has no code mapped for it,
    // so the runner emits nothing rather than fabricate a synthetic code.
    const r = rule({ componentType: 'Button', slots: [slot('icon', true)] });
    expect(runConventionRule(r, parsed('Button', []))).toEqual([]);
  });

  it('satisfies Input.label via the aria-labelledby member (ANAT-D004 three-satisfier set)', () => {
    const r = rule({ componentType: 'Input', slots: [slot('label', true)] });
    expect(runConventionRule(r, parsed('Input', ['aria-labelledby']))).toEqual([]);
  });

  it('emits ANAT-D004 when Input has none of label/aria-label/aria-labelledby', () => {
    const r = rule({ componentType: 'Input', slots: [slot('label', true)] });
    const findings = runConventionRule(r, parsed('Input', ['placeholder']));
    expect(findings.map((f) => f.code)).toEqual(['ANAT-D004']);
  });

  it('reports one finding per unsatisfied mapped slot and none for satisfied ones', () => {
    const r = rule({
      componentType: 'Button',
      slots: [slot('content', true), slot('icon', true)],
    });
    // content unsatisfied (mapped → D001), icon unsatisfied (unmapped → skipped)
    const findings = runConventionRule(r, parsed('Button', []));
    expect(findings.map((f) => f.code)).toEqual(['ANAT-D001']);
  });
});

describe('runConventionRule — options', () => {
  it('honors a caller-supplied severityFor resolver over the default', () => {
    const r = rule({ componentType: 'Button', slots: [slot('content', true)] });
    const severityFor = (_c: AnatomyFindingCode): Severity => 'info';
    const findings = runConventionRule(r, parsed('Button', []), { severityFor });
    expect(findings[0]!.severity).toBe('info');
  });

  it('softens severity under permissive strictness (error → warn)', () => {
    const r = rule({ componentType: 'Button', slots: [slot('content', true)] });
    const findings = runConventionRule(r, parsed('Button', []), { strictness: 'permissive' });
    expect(findings[0]!.severity).toBe('warn');
  });

  it('uses the supplied filePath as the finding file (defaults to empty string)', () => {
    const r = rule({ componentType: 'Button', slots: [slot('content', true)] });
    expect(runConventionRule(r, parsed('Button', []))[0]!.file).toBe('');
    expect(
      runConventionRule(r, parsed('Button', []), { filePath: 'src/Button.tsx' })[0]!.file
    ).toBe('src/Button.tsx');
  });
});
