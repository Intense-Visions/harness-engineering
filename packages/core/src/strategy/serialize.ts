import type { StrategyDoc, StrategySectionName } from '@harness-engineering/types';
import { OPTIONAL_STRATEGY_SECTIONS, REQUIRED_STRATEGY_SECTIONS } from '@harness-engineering/types';

export interface SerializeStrategyDocOptions {
  /**
   * Override the H1 line emitted between the frontmatter and the first H2.
   * When omitted, defaults to `# <frontmatter.name> Strategy`. Callers that
   * are re-writing an existing STRATEGY.md pass the user's preserved H1 so
   * customizations like `# Acme — Engineering Strategy` survive the round-trip.
   */
  h1?: string;
}

/**
 * Authoritative emission order: REQUIRED sections first (in template order),
 * then OPTIONAL sections (also in template order). Sections supplied by the
 * caller in any other order are reordered on serialize — the on-disk file
 * always matches the contract order so diffs against the template stay
 * meaningful.
 */
const SECTION_ORDER: readonly StrategySectionName[] = [
  ...REQUIRED_STRATEGY_SECTIONS,
  ...OPTIONAL_STRATEGY_SECTIONS,
];

function emitFrontmatter(doc: StrategyDoc): string {
  // last_updated is intentionally quoted: gray-matter parses unquoted ISO
  // dates back into Date objects (we strip them in parser.coerceFrontmatter),
  // so quoting on write avoids the round-trip coercion entirely.
  const lines = [
    '---',
    `name: ${doc.frontmatter.name}`,
    `last_updated: "${doc.frontmatter.last_updated}"`,
    `version: ${doc.frontmatter.version}`,
    '---',
  ];
  return lines.join('\n');
}

function emitH1(doc: StrategyDoc, opts: SerializeStrategyDocOptions): string {
  if (typeof opts.h1 === 'string' && opts.h1.trim().length > 0) {
    return opts.h1.trimEnd();
  }
  return `# ${doc.frontmatter.name} Strategy`;
}

function emitSection(name: StrategySectionName, body: string): string {
  // Body is trimmed so we own the whitespace around each section heading;
  // empty bodies still produce a heading + blank line block (schema rejects
  // empty bodies upstream so this is a defensive shape, not a happy path).
  const trimmed = body.trim();
  return trimmed.length === 0 ? `## ${name}\n` : `## ${name}\n\n${trimmed}\n`;
}

/**
 * Serialize a StrategyDoc back to Markdown. Pure function — no filesystem,
 * no clock, no environment. The writer (`writeStrategyDoc`) composes this
 * with atomic disk semantics; tests cover the two halves independently.
 *
 * Invariants:
 *   - parse(serialize(doc)) ≡ doc (round-trip — covered by serialize.test.ts)
 *   - sections appear in REQUIRED-then-OPTIONAL template order regardless of
 *     the input array order
 *   - trailing newline always present
 */
export function serializeStrategyDoc(
  doc: StrategyDoc,
  opts: SerializeStrategyDocOptions = {}
): string {
  const sectionByName = new Map(doc.sections.map((s) => [s.name, s.body]));

  const sectionBlocks: string[] = [];
  for (const name of SECTION_ORDER) {
    const body = sectionByName.get(name);
    if (body === undefined) continue;
    sectionBlocks.push(emitSection(name, body));
  }

  const blocks = [emitFrontmatter(doc), '', emitH1(doc, opts), '', sectionBlocks.join('\n')];
  // Collapse to a single trailing newline. Join with '\n' produces tight
  // spacing because emitSection already terminates each section with its own
  // newline. The final '\n' guarantees the trailing-newline invariant even
  // when there are no sections.
  const out = blocks.join('\n');
  return out.endsWith('\n') ? out : out + '\n';
}
