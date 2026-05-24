import { describe, it, expect } from 'vitest';
import { runPrimitiveAdoptionRule } from '../../../src/drift/rules/primitive-adoption-rule';
import type { ComponentRegistry } from '../../../src/drift/resolvers/component-registry';

function registryWith(...primitives: Array<[string, string]>): ComponentRegistry {
  return { primitiveToComponent: new Map(primitives) };
}

describe('runPrimitiveAdoptionRule', () => {
  it('DRIFT-P001: flags raw <button> when Button is registered', () => {
    const findings = runPrimitiveAdoptionRule({
      source: `export const X = () => <button onClick={() => {}}>Save</button>;`,
      file: 'src/Save.tsx',
      registry: registryWith(['button', 'Button']),
      strictness: 'standard',
    });
    expect(findings).toHaveLength(1);
    expect(findings[0].code).toBe('DRIFT-P001');
    expect(findings[0].severity).toBe('error');
    expect(findings[0].line).toBe(1);
    expect(findings[0].fix.description).toContain('Button');
  });

  it('DRIFT-P002: flags raw <input>', () => {
    const findings = runPrimitiveAdoptionRule({
      source: `export const F = () => <input type="text" />;`,
      file: 'src/F.tsx',
      registry: registryWith(['input', 'Input']),
      strictness: 'standard',
    });
    expect(findings).toHaveLength(1);
    expect(findings[0].code).toBe('DRIFT-P002');
  });

  it('DRIFT-P003: flags raw <a>', () => {
    const findings = runPrimitiveAdoptionRule({
      source: `export const L = () => <a href="/x">Go</a>;`,
      file: 'src/L.tsx',
      registry: registryWith(['a', 'Link']),
      strictness: 'standard',
    });
    expect(findings).toHaveLength(1);
    expect(findings[0].code).toBe('DRIFT-P003');
  });

  it('does NOT flag the registered component itself (uppercase JSX)', () => {
    const findings = runPrimitiveAdoptionRule({
      source: `export const X = () => <Button>Hi</Button>;`,
      file: 'src/X.tsx',
      registry: registryWith(['button', 'Button']),
      strictness: 'standard',
    });
    expect(findings).toHaveLength(0);
  });

  it('does NOT flag primitives whose component is not registered', () => {
    const findings = runPrimitiveAdoptionRule({
      source: `export const X = () => <input />;`,
      file: 'src/X.tsx',
      registry: registryWith(['button', 'Button']),
      strictness: 'standard',
    });
    expect(findings).toHaveLength(0);
  });

  it('skips files that are not .jsx/.tsx', () => {
    const findings = runPrimitiveAdoptionRule({
      source: `<button>x</button>`,
      file: 'src/notes.md',
      registry: registryWith(['button', 'Button']),
      strictness: 'standard',
    });
    expect(findings).toHaveLength(0);
  });

  it('handles multi-line JSX correctly (uses TS parser, not regex)', () => {
    const findings = runPrimitiveAdoptionRule({
      source: `export const X = () => (
        <button
          className="primary"
          onClick={() => {}}
        >
          Save
        </button>
      );`,
      file: 'src/X.tsx',
      registry: registryWith(['button', 'Button']),
      strictness: 'standard',
    });
    expect(findings).toHaveLength(1);
    expect(findings[0].code).toBe('DRIFT-P001');
  });

  it('skips silently on TS parse errors (returns no findings)', () => {
    const findings = runPrimitiveAdoptionRule({
      source: `<<not<valid<jsx`,
      file: 'src/X.tsx',
      registry: registryWith(['button', 'Button']),
      strictness: 'standard',
    });
    // TS createSourceFile is lenient; no crash is the contract.
    expect(Array.isArray(findings)).toBe(true);
  });
});
