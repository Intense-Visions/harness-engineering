/**
 * DRIFT-P* — Primitive adoption detection.
 *
 * Scans JSX/TSX source files for raw HTML primitives where a registered
 * design-system component exists. Uses the TypeScript Compiler API to
 * parse JSX (regex can't reliably distinguish `<button>` from `<Button>`
 * across multi-line JSX).
 *
 * Codes:
 *   DRIFT-P001 — raw <button> where Button is registered
 *   DRIFT-P002 — raw <input> where Input is registered
 *   DRIFT-P003 — raw <a href> where Link or Anchor is registered
 *   DRIFT-P004 — raw <textarea> where Textarea is registered
 *
 * Inputs:
 *   - ComponentRegistry from resolvers/component-registry.ts
 *     (returns null when DESIGN.md ## Component Registry is absent)
 *
 * Behavior when registry absent: all rules skip silently (no findings).
 * Behavior when a specific primitive isn't registered: that specific rule
 * skips for that primitive — we don't impose adoption rules the project
 * hasn't declared.
 *
 * Source: docs/changes/design-pipeline/detect-design-drift/proposal.md
 *   (Code namespace → DRIFT-P*).
 */

import ts from 'typescript';
import type { DriftFinding, DriftStrictness } from '../findings/finding.js';
import { severityFor } from '../findings/finding.js';
import type { ComponentRegistry } from '../resolvers/component-registry.js';

/**
 * Map: lowercased HTML tag → finding code emitted for it.
 */
const TAG_TO_CODE: Record<string, 'DRIFT-P001' | 'DRIFT-P002' | 'DRIFT-P003' | 'DRIFT-P004'> = {
  button: 'DRIFT-P001',
  input: 'DRIFT-P002',
  a: 'DRIFT-P003',
  textarea: 'DRIFT-P004',
};

export interface PrimitiveAdoptionRuleInput {
  source: string;
  file: string;
  registry: ComponentRegistry;
  strictness: DriftStrictness;
}

export function runPrimitiveAdoptionRule(input: PrimitiveAdoptionRuleInput): DriftFinding[] {
  const { source, file, registry, strictness } = input;

  // Only parse files that look like JSX/TSX — extension check is cheap
  if (!/\.(?:jsx|tsx)$/i.test(file)) return [];

  let sourceFile: ts.SourceFile;
  try {
    sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  } catch {
    return [];
  }

  const findings: DriftFinding[] = [];
  visit(sourceFile, sourceFile, registry, strictness, findings);
  return findings;
}

function visit(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  registry: ComponentRegistry,
  strictness: DriftStrictness,
  out: DriftFinding[]
): void {
  // JSX self-closing element: <input />
  if (ts.isJsxSelfClosingElement(node)) {
    handleJsxTag(node.tagName, node, sourceFile, registry, strictness, out);
  }
  // JSX opening element: <button>...</button>
  if (ts.isJsxOpeningElement(node)) {
    handleJsxTag(node.tagName, node, sourceFile, registry, strictness, out);
  }
  ts.forEachChild(node, (child) => visit(child, sourceFile, registry, strictness, out));
}

function handleJsxTag(
  tagName: ts.JsxTagNameExpression,
  parent: ts.JsxOpeningLikeElement,
  sourceFile: ts.SourceFile,
  registry: ComponentRegistry,
  strictness: DriftStrictness,
  out: DriftFinding[]
): void {
  if (!ts.isIdentifier(tagName)) return; // Skip member expressions like <Foo.Bar>
  const tag = tagName.text;
  // Lowercase = HTML primitive in JSX semantics. Uppercase = component.
  if (tag[0] !== tag[0]!.toLowerCase()) return;
  const lower = tag.toLowerCase();
  const componentName = registry.primitiveToComponent.get(lower);
  if (componentName === undefined) return;
  const code = TAG_TO_CODE[lower];
  if (code === undefined) return;

  const { line: zeroLine, character } = sourceFile.getLineAndCharacterOfPosition(
    parent.getStart(sourceFile)
  );
  const line = zeroLine + 1;

  out.push({
    code,
    severity: severityFor(code, strictness),
    file: sourceFile.fileName,
    line,
    column: character + 1,
    message: `Raw <${tag}> element where the registered component "${componentName}" should be used`,
    evidence: { snippet: extractLine(sourceFile.getFullText(), parent.getStart(sourceFile)) },
    rule: { id: code, category: 'primitive-adoption' },
    fix: {
      kind: 'codemod-todo',
      description: `Import ${componentName} from your component library and replace <${tag}> with <${componentName}>. If this raw primitive is intentional (e.g. inside the ${componentName} component's own implementation), add a JSDoc \`@allow-raw-primitive\` annotation on the file.`,
    },
  });
}

function extractLine(source: string, offset: number): string {
  const start = source.lastIndexOf('\n', offset) + 1;
  const endIdx = source.indexOf('\n', offset);
  const end = endIdx === -1 ? source.length : endIdx;
  return source.slice(start, end).trim();
}
