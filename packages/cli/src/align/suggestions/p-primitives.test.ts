import { describe, it, expect } from 'vitest';
import type { DriftFinding, DriftFindingCode } from '../../drift/findings/finding';
import { emitPrimitiveSuggestion } from './p-primitives';

/**
 * Behavior guard for the DRIFT-P* suggestion emitter. emitPrimitiveSuggestion
 * looks up the finding code in a tag→component table and produces a
 * FixSuggestion (description + preview). Mapped codes name the registered
 * primitive; unmapped codes fall back to a generic 'Component'. The emitter is
 * pure — no IO, timers, or randomness — so no mocking is required.
 */

// Minimal DriftFinding factory; only `code` drives emitPrimitiveSuggestion, so
// the remaining fields are inert placeholders kept type-faithful.
function makeFinding(code: DriftFindingCode): DriftFinding {
  return {
    code,
    severity: 'warn',
    file: 'src/example.tsx',
    line: null,
    message: 'raw primitive detected',
    evidence: { snippet: '<button>' },
    rule: { id: code, category: 'primitive-adoption' },
    fix: { kind: 'manual', description: 'adopt the registered primitive' },
  };
}

// The mapping the emitter is contracted to honor. Keyed by finding code →
// registered component name (source of truth for the assertions below).
const CODE_TO_COMPONENT: ReadonlyArray<readonly [DriftFindingCode, string]> = [
  ['DRIFT-P001', 'Button'],
  ['DRIFT-P002', 'Input'],
  ['DRIFT-P003', 'Link'],
  ['DRIFT-P004', 'Textarea'],
];

describe('emitPrimitiveSuggestion', () => {
  it.each(CODE_TO_COMPONENT)(
    'maps %s to the registered <%s> primitive in both description and preview',
    (code, component) => {
      const tag = component.toLowerCase();

      const suggestion = emitPrimitiveSuggestion(makeFinding(code));

      expect(suggestion.description).toBe(
        `Replace raw <${tag}> with the registered <${component}> primitive. ` +
          `Audit props: event handlers (onClick), ref forwarding, and ` +
          `className merging may differ from the raw HTML element.`
      );
      expect(suggestion.preview).toBe(
        `Suggested replacement:\n` +
          `  import { ${component} } from '<your component library>';\n` +
          `  …\n` +
          `  <${component} … />`
      );
    }
  );

  it('falls back to the generic <Component> for an unmapped DRIFT-P code', () => {
    const suggestion = emitPrimitiveSuggestion(makeFinding('DRIFT-P999'));

    expect(suggestion.description).toContain('registered <Component> primitive');
    expect(suggestion.description).toContain('Replace raw <component>');
    expect(suggestion.preview).toContain(`import { Component } from '<your component library>';`);
    expect(suggestion.preview).toContain('<Component … />');
  });

  it('does not leak a mapped component name into an unrelated code', () => {
    // A token-bypass code is never in the primitive table, so it must default.
    const suggestion = emitPrimitiveSuggestion(makeFinding('DRIFT-T001'));

    expect(suggestion.description).toContain('<Component>');
    expect(suggestion.description).not.toContain('<Button>');
  });

  it('returns exactly the FixSuggestion shape (description + preview) and nothing else', () => {
    const suggestion = emitPrimitiveSuggestion(makeFinding('DRIFT-P001'));

    expect(Object.keys(suggestion).sort()).toEqual(['description', 'preview']);
  });
});
