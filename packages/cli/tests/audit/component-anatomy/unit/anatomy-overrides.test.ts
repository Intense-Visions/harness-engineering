import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { extractLeadingJsDoc } from '../../../../src/audit/component-anatomy/parsers/jsdoc';
import { buildAnatomyRuleFromJsDoc } from '../../../../src/audit/component-anatomy/parsers/anatomy-tags';
import { parseAnatomyOverrides } from '../../../../src/audit/component-anatomy/parsers/design-overrides';
import { resolveAnatomyRules } from '../../../../src/audit/component-anatomy/resolvers/source-of-truth';

const TAGGED_SOURCE = `/**
 * @component-type Button
 * @anatomy-slot content required
 * @anatomy-slot icon-leading
 * @anatomy-state disabled exclusive
 * @anatomy-variant primary|secondary|ghost
 * @anatomy-size sm|md|lg
 */
export const Button = () => null;
`;

describe('buildAnatomyRuleFromJsDoc', () => {
  it('builds a ConventionRule from @anatomy-* tags with flags', () => {
    const rule = buildAnatomyRuleFromJsDoc(extractLeadingJsDoc(TAGGED_SOURCE)!, 'Button')!;
    expect(rule.componentType).toBe('Button');
    expect(rule.slots).toEqual([
      expect.objectContaining({ name: 'content', required: true }),
      expect.objectContaining({ name: 'icon-leading', required: false }),
    ]);
    expect(rule.states).toEqual([
      expect.objectContaining({ name: 'disabled', required: false, exclusive: true }),
    ]);
    expect(rule.variants.map((v) => v.name)).toEqual(['primary', 'secondary', 'ghost']);
    expect(rule.sizes.map((s) => s.name)).toEqual(['sm', 'md', 'lg']);
    expect(rule.source.ref).toMatch(/jsdoc/);
  });

  it('returns null when no @anatomy-* tags are present', () => {
    const jsdoc = extractLeadingJsDoc(
      '/**\n * @component-type Button\n */\nexport const Button = 1;'
    )!;
    expect(buildAnatomyRuleFromJsDoc(jsdoc, 'Button')).toBeNull();
  });
});

const DESIGN = `# Design

## Component Anatomy Overrides

### Button

slots:
- content (required)
- icon-leading
states:
- disabled (exclusive)
variants: primary, secondary, ghost
sizes: sm, md, lg

### Input

slots:
- label (required)
`;

describe('parseAnatomyOverrides', () => {
  it('parses per-component overrides with list + inline axis styles', () => {
    const byType = parseAnatomyOverrides(DESIGN);
    const button = byType.get('Button')!;
    expect(button.slots).toEqual([
      expect.objectContaining({ name: 'content', required: true }),
      expect.objectContaining({ name: 'icon-leading', required: false }),
    ]);
    expect(button.states[0]).toMatchObject({ name: 'disabled', exclusive: true });
    expect(button.variants.map((v) => v.name)).toEqual(['primary', 'secondary', 'ghost']);
    expect(byType.get('Input')!.slots[0]).toMatchObject({ name: 'label', required: true });
  });

  it('returns an empty map when the section is absent', () => {
    expect(parseAnatomyOverrides('# Design\n\nnothing here').size).toBe(0);
  });
});

describe('resolveAnatomyRules layering', () => {
  let dir = '';
  afterEach(() => {
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
    dir = '';
  });

  it('Layer 1: JSDoc @anatomy-* wins over the catalog default', () => {
    const rule = resolveAnatomyRules('/abs/Button.tsx', TAGGED_SOURCE, 'Button')!;
    expect(rule.source.ref).toMatch(/jsdoc/);
    expect(rule.slots.map((s) => s.name)).toEqual(['content', 'icon-leading']);
  });

  it('Layer 2: DESIGN.md overrides apply when there is no JSDoc declaration', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anat-ovr-'));
    fs.writeFileSync(path.join(dir, 'DESIGN.md'), DESIGN);
    const file = path.join(dir, 'src', 'Button.tsx');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const rule = resolveAnatomyRules(file, 'export const Button = () => null;', 'Button')!;
    expect(rule.source.ref).toMatch(/design-md/);
    expect(rule.variants.map((v) => v.name)).toEqual(['primary', 'secondary', 'ghost']);
  });

  it('returns null component type → null rule', () => {
    expect(resolveAnatomyRules('/abs/x.tsx', 'x', null)).toBeNull();
  });
});
