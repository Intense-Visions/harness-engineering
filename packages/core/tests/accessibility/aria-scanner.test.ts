import { describe, it, expect } from 'vitest';
import { AriaScanner, ariaRules } from '../../src/accessibility';

const scanner = new AriaScanner();

function codesFor(content: string, file = 'Component.tsx'): string[] {
  return scanner.scanContent(content, file).map((f) => f.ruleId);
}

describe('ARIA rules catalog', () => {
  it('exposes the A11Y-* rules with references', () => {
    expect(ariaRules.length).toBeGreaterThan(0);
    for (const rule of ariaRules) {
      expect(rule.id).toMatch(/^A11Y-\d+$/);
      expect(rule.patterns.length).toBeGreaterThan(0);
      expect(rule.references?.length).toBeGreaterThan(0);
    }
  });
});

describe('A11Y-014 — aria-hidden on focusable element', () => {
  it('flags aria-hidden="true" on a <button>', () => {
    expect(codesFor('<button aria-hidden="true">Save</button>')).toContain('A11Y-014');
  });

  it('flags aria-hidden={true} on an <input>', () => {
    expect(codesFor('<input type="text" aria-hidden={true} />')).toContain('A11Y-014');
  });

  it('flags the bare aria-hidden JSX shorthand on a <select>', () => {
    expect(codesFor('<select aria-hidden><option>a</option></select>')).toContain('A11Y-014');
  });

  it('flags aria-hidden="true" on an <a> that has href', () => {
    expect(codesFor('<a href="/home" aria-hidden="true">Home</a>')).toContain('A11Y-014');
    // attribute order reversed
    expect(codesFor('<a aria-hidden="true" href="/home">Home</a>')).toContain('A11Y-014');
  });

  it('does NOT flag aria-hidden on a non-focusable <span> or <div>', () => {
    expect(codesFor('<span aria-hidden="true"><Icon /></span>')).not.toContain('A11Y-014');
    expect(codesFor('<div aria-hidden="true" className="decorative" />')).not.toContain('A11Y-014');
  });

  it('does NOT flag an <a> without href (not focusable)', () => {
    expect(codesFor('<a aria-hidden="true" onClick={noop}>x</a>')).not.toContain('A11Y-014');
  });

  it('does NOT flag a dynamic aria-hidden binding (may resolve to false)', () => {
    expect(codesFor('<button aria-hidden={isHidden}>Save</button>')).not.toContain('A11Y-014');
  });

  it('does NOT flag aria-hidden="false" on a focusable element', () => {
    expect(codesFor('<button aria-hidden="false">Save</button>')).not.toContain('A11Y-014');
  });
});

describe('A11Y-042 — positive tabindex', () => {
  it('flags tabIndex={1}', () => {
    expect(codesFor('<div role="button" tabIndex={1} />')).toContain('A11Y-042');
  });

  it('flags tabindex="3" (HTML string form)', () => {
    expect(codesFor('<span tabindex="3">x</span>')).toContain('A11Y-042');
  });

  it('does NOT flag tabIndex={0} (natural order)', () => {
    expect(codesFor('<div role="button" tabIndex={0} />')).not.toContain('A11Y-042');
  });

  it('does NOT flag tabIndex={-1} (programmatic focus)', () => {
    expect(codesFor('<div tabIndex={-1} />')).not.toContain('A11Y-042');
  });
});

describe('AriaScanner scan surface', () => {
  it('reports file and 1-indexed line for each finding', () => {
    const src = ['<div>', '  <button aria-hidden="true">Go</button>', '</div>'].join('\n');
    const findings = scanner.scanContent(src, 'src/Widget.tsx');
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ ruleId: 'A11Y-014', file: 'src/Widget.tsx', line: 2 });
  });

  it('returns clean for accessible markup', () => {
    const src = [
      '<button aria-label="Close" onClick={onClose}>',
      '  <XIcon aria-hidden="true" />',
      '</button>',
      '<a href="/next" tabIndex={0}>Next</a>',
    ].join('\n');
    expect(scanner.scanContent(src, 'src/Clean.tsx')).toHaveLength(0);
  });

  it('scanFiles skips non-markup extensions', async () => {
    const result = await scanner.scanFiles(['server.py', 'data.json']);
    expect(result.findings).toHaveLength(0);
  });
});
