/**
 * Build a {@link ConventionRule} override from `@anatomy-*` JSDoc tags.
 *
 * Tag grammar (docs/changes/design-pipeline/audit-component-anatomy/proposal.md
 * → "JSDoc tag grammar"):
 *
 *   @anatomy-slot content required
 *   @anatomy-slot icon-leading
 *   @anatomy-state disabled exclusive
 *   @anatomy-variant primary|secondary|ghost|danger
 *   @anatomy-size sm|md|lg
 *
 * Slots/states are one part per tag with trailing `required` / `exclusive`
 * flags; variants/sizes are a single pipe-delimited tag listing every value.
 */

import type { AnatomyPart, ConventionRule } from '../rules/convention-rule.js';
import { readJsDocTag } from './jsdoc.js';

/** Source ref stamped on JSDoc-authored overrides (citation only). */
const JSDOC_SOURCE_REF = 'design-component-anatomy/jsdoc';

function fixHint(name: string, axis: string): string {
  return `Add the \`${name}\` ${axis} to this component, or drop the \`@anatomy-${axis} ${name}\` tag if it no longer applies.`;
}

/** Parse a `@anatomy-slot` / `@anatomy-state` value: `name [required] [exclusive]`. */
function parseFlaggedPart(value: string, axis: 'slot' | 'state'): AnatomyPart | null {
  const tokens = value.split(/\s+/).filter(Boolean);
  const name = tokens[0];
  if (!name) return null;
  const flags = new Set(tokens.slice(1).map((t) => t.toLowerCase()));
  return {
    name,
    required: flags.has('required'),
    ...(flags.has('exclusive') ? { exclusive: true } : {}),
    fixHint: fixHint(name, axis),
  };
}

/** Parse a `@anatomy-variant` / `@anatomy-size` pipe-delimited value into parts. */
function parsePipeList(value: string, axis: 'variant' | 'size'): AnatomyPart[] {
  return value
    .split('|')
    .map((n) => n.trim())
    .filter(Boolean)
    .map((name) => ({ name, required: false, fixHint: fixHint(name, axis) }));
}

/**
 * Construct a ConventionRule from a doc block's `@anatomy-*` tags, or `null`
 * when the block declares no anatomy axes (so callers fall through to the next
 * source-of-truth layer).
 */
export function buildAnatomyRuleFromJsDoc(
  jsdoc: string,
  componentType: string
): ConventionRule | null {
  const slots = readJsDocTag(jsdoc, 'anatomy-slot')
    .map((v) => parseFlaggedPart(v, 'slot'))
    .filter((p): p is AnatomyPart => p !== null);
  const states = readJsDocTag(jsdoc, 'anatomy-state')
    .map((v) => parseFlaggedPart(v, 'state'))
    .filter((p): p is AnatomyPart => p !== null);
  const variants = readJsDocTag(jsdoc, 'anatomy-variant').flatMap((v) =>
    parsePipeList(v, 'variant')
  );
  const sizes = readJsDocTag(jsdoc, 'anatomy-size').flatMap((v) => parsePipeList(v, 'size'));

  if (slots.length === 0 && states.length === 0 && variants.length === 0 && sizes.length === 0) {
    return null;
  }
  return { componentType, slots, states, variants, sizes, source: { ref: JSDOC_SOURCE_REF } };
}
