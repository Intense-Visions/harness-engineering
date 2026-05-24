/**
 * Parse design-system/DESIGN.md `## Component Registry` section.
 *
 * Returns a registry map: { 'button' → 'Button', 'input' → 'Input', ... }
 * keyed by lowercased HTML primitive tag name → registered component name.
 * detect-design-drift's primitive-adoption rule uses this map to decide
 * whether a raw `<button>` JSX element should be flagged in favor of an
 * imported `<Button>` component.
 *
 * Format expected (per audit-component-anatomy spec):
 *
 *   ## Component Registry
 *
 *   | Type    | File                            | Notes        |
 *   |---------|---------------------------------|--------------|
 *   | Button  | packages/ui/src/Button.tsx      |              |
 *   | Input   | packages/ui/src/Input/index.tsx |              |
 *   | Link    | packages/ui/src/Link.tsx        |              |
 *
 * Maps known registered Type → HTML primitive tag using HTML_PRIMITIVE_MAP:
 *   Button   → button
 *   Input    → input
 *   Textarea → textarea
 *   Link     → a
 *   Anchor   → a
 *
 * Returns null when DESIGN.md is absent or the Component Registry section
 * isn't present. Primitive-adoption checks then skip silently.
 *
 * Source: docs/changes/design-pipeline/detect-design-drift/proposal.md
 *   (Inputs → Component Registry).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

export interface ComponentRegistry {
  /** Map: lowercased HTML primitive tag → registered component name. */
  primitiveToComponent: Map<string, string>;
}

/**
 * Tags this rule cares about. Each value is the canonical registered
 * component name; aliases listed in HTML_PRIMITIVE_MAP_REVERSE.
 */
const HTML_PRIMITIVE_MAP: Record<string, string> = {
  Button: 'button',
  Input: 'input',
  Textarea: 'textarea',
  Link: 'a',
  Anchor: 'a',
};

export function loadComponentRegistry(projectRoot: string): ComponentRegistry | null {
  const designMdPath = path.join(projectRoot, 'design-system', 'DESIGN.md');
  if (!fs.existsSync(designMdPath)) return null;
  let raw: string;
  try {
    raw = fs.readFileSync(designMdPath, 'utf-8');
  } catch {
    return null;
  }
  const section = extractComponentRegistrySection(raw);
  if (section === null) return null;
  return parseRegistryTable(section);
}

/**
 * Extract the body of the `## Component Registry` heading from DESIGN.md.
 * Returns null if the section isn't present.
 */
function extractComponentRegistrySection(markdown: string): string | null {
  const lines = markdown.split('\n');
  let inSection = false;
  const collected: string[] = [];
  for (const line of lines) {
    if (line.startsWith('## ')) {
      if (inSection) break; // hit the next H2
      if (line.toLowerCase().startsWith('## component registry')) {
        inSection = true;
        continue;
      }
    }
    if (inSection) collected.push(line);
  }
  return inSection ? collected.join('\n') : null;
}

/**
 * Parse the markdown table inside the section. Tolerant of varying column
 * spacing and presence of separator lines.
 */
function parseRegistryTable(section: string): ComponentRegistry {
  const primitiveToComponent = new Map<string, string>();
  for (const rawLine of section.split('\n')) {
    const line = rawLine.trim();
    if (!line.startsWith('|')) continue;
    // Skip header separator (---|---|---)
    if (/^\|\s*-+/.test(line)) continue;
    const cells = line
      .split('|')
      .map((c) => c.trim())
      .filter((c) => c.length > 0);
    if (cells.length < 1) continue;
    const type = cells[0]!;
    // Skip the header row (literal "Type")
    if (type.toLowerCase() === 'type') continue;
    const primitive = HTML_PRIMITIVE_MAP[type];
    if (primitive !== undefined) {
      primitiveToComponent.set(primitive, type);
    }
  }
  return { primitiveToComponent };
}
