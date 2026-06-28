/**
 * Parser for the optional `## Component Anatomy Overrides` section of DESIGN.md.
 *
 * Per-component overrides of the convention library (source-of-truth Layer 2,
 * Decision #1). See docs/changes/design-pipeline/audit-component-anatomy/
 * proposal.md → "DESIGN.md schema additions":
 *
 *   ## Component Anatomy Overrides
 *
 *   ### Button
 *
 *   slots:
 *   - content (required)
 *   - icon-leading
 *   states:
 *   - disabled (exclusive)
 *   variants: primary, secondary, ghost
 *   sizes: sm, md, lg
 *
 * Tolerant of indentation, inline (`variants: a, b`) vs. list (`- a`) value
 * styles, and `(required)` / `(exclusive)` flags.
 */

import type { AnatomyPart, ConventionRule } from '../rules/convention-rule.js';

const SINGULAR = { slots: 'slot', states: 'state', variants: 'variant', sizes: 'size' } as const;
type Axis = keyof typeof SINGULAR;

const SOURCE_REF = 'design-component-anatomy/design-md';

function partFrom(raw: string, axis: Axis): AnatomyPart | null {
  const m = /^([A-Za-z0-9][A-Za-z0-9-]*)\s*(?:\(([^)]*)\))?/.exec(raw.trim());
  const name = m?.[1];
  if (!name) return null;
  const flags = (m?.[2] ?? '').toLowerCase();
  return {
    name,
    required: /\brequired\b/.test(flags),
    ...(/\bexclusive\b/.test(flags) ? { exclusive: true } : {}),
    fixHint: `Add the \`${name}\` ${SINGULAR[axis]} to this component (declared in the DESIGN.md anatomy override).`,
  };
}

/**
 * Parse the overrides section into a `componentType → ConventionRule` map.
 * Returns an empty map when the section is absent.
 */
export function parseAnatomyOverrides(designMd: string): Map<string, ConventionRule> {
  const lines = designMd.split('\n');
  const out = new Map<string, ConventionRule>();

  let i = lines.findIndex((l) => /^#{1,6}\s+Component Anatomy Overrides\b/i.test(l));
  if (i === -1) return out;

  let current: { type: string; axes: Record<Axis, AnatomyPart[]> } | null = null;
  let currentAxis: Axis | null = null;

  const flush = (): void => {
    if (!current) return;
    out.set(current.type, {
      componentType: current.type,
      slots: current.axes.slots,
      states: current.axes.states,
      variants: current.axes.variants,
      sizes: current.axes.sizes,
      source: { ref: SOURCE_REF },
    });
  };

  for (i += 1; i < lines.length; i++) {
    const line = lines[i]!;
    // A new h1/h2 ends the overrides section (component headings are h3+).
    if (/^#{1,2}\s/.test(line)) break;

    const compHeading = /^#{3,6}\s+(.+?)\s*$/.exec(line);
    if (compHeading) {
      flush();
      current = {
        type: compHeading[1]!.trim(),
        axes: { slots: [], states: [], variants: [], sizes: [] },
      };
      currentAxis = null;
      continue;
    }
    if (!current) continue;

    const axisMatch = /^\s*(slots|states|variants|sizes)\s*:\s*(.*)$/i.exec(line);
    if (axisMatch) {
      currentAxis = axisMatch[1]!.toLowerCase() as Axis;
      const inline = axisMatch[2]!.trim();
      if (inline) {
        for (const tok of inline.split(',')) {
          const part = partFrom(tok, currentAxis);
          if (part) current.axes[currentAxis].push(part);
        }
        currentAxis = null; // inline form is self-contained
      }
      continue;
    }

    const listItem = /^\s*[-*]\s+(.*)$/.exec(line);
    if (listItem && currentAxis) {
      const part = partFrom(listItem[1]!, currentAxis);
      if (part) current.axes[currentAxis].push(part);
    }
  }
  flush();
  return out;
}
