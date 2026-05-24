/**
 * BRAND-V001 — Forbidden phrases in UI copy.
 *
 * Scans .tsx/.jsx files (TS Compiler API) for JSX text nodes and
 * string-typed JSX attributes. For each text snippet, checks whether
 * any voice.forbiddenPhrases entry from DESIGN.md appears as a
 * case-insensitive substring. Deduplicates per (file, line, phrase).
 *
 * Skips silently when:
 *   - file is not .jsx/.tsx
 *   - voice.forbiddenPhrases is empty
 *   - TS parser errors (returns empty)
 *
 * Source: docs/changes/design-pipeline/audit-brand-compliance/proposal.md
 *   (Technical Design → BRAND-V001 forbidden-phrases rule).
 */

import ts from 'typescript';
import type { BrandFinding, BrandStrictness } from '../findings/finding.js';
import { severityFor } from '../findings/finding.js';

export interface ForbiddenPhrasesRuleInput {
  source: string;
  file: string;
  forbiddenPhrases: readonly string[];
  strictness: BrandStrictness;
}

export function runForbiddenPhrasesRule(input: ForbiddenPhrasesRuleInput): BrandFinding[] {
  if (input.forbiddenPhrases.length === 0) return [];
  if (!/\.(?:jsx|tsx)$/i.test(input.file)) return [];

  let sourceFile: ts.SourceFile;
  try {
    sourceFile = ts.createSourceFile(
      input.file,
      input.source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX
    );
  } catch {
    return [];
  }

  const findings: BrandFinding[] = [];
  const seen = new Set<string>();
  const phrasesLc = input.forbiddenPhrases.map((p) => p.toLowerCase());

  visit(sourceFile, sourceFile, input.file, phrasesLc, input.strictness, seen, findings);
  return findings;
}

function visit(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  file: string,
  phrasesLc: string[],
  strictness: BrandStrictness,
  seen: Set<string>,
  out: BrandFinding[]
): void {
  // JSX text nodes: <p>Click here</p>
  if (ts.isJsxText(node)) {
    const text = node.getText(sourceFile);
    const trimmed = text.trim();
    if (trimmed.length > 0) {
      checkText(
        trimmed,
        node.getStart(sourceFile),
        sourceFile,
        file,
        phrasesLc,
        strictness,
        seen,
        out
      );
    }
  }
  // String-typed JSX attribute: title="best-in-class"
  if (
    ts.isJsxAttribute(node) &&
    node.initializer !== undefined &&
    ts.isStringLiteral(node.initializer)
  ) {
    const value = node.initializer.text;
    checkText(
      value,
      node.initializer.getStart(sourceFile),
      sourceFile,
      file,
      phrasesLc,
      strictness,
      seen,
      out
    );
  }
  ts.forEachChild(node, (child) =>
    visit(child, sourceFile, file, phrasesLc, strictness, seen, out)
  );
}

function checkText(
  text: string,
  position: number,
  sourceFile: ts.SourceFile,
  file: string,
  phrasesLc: string[],
  strictness: BrandStrictness,
  seen: Set<string>,
  out: BrandFinding[]
): void {
  const textLc = text.toLowerCase();
  const { line: zeroLine } = sourceFile.getLineAndCharacterOfPosition(position);
  const line = zeroLine + 1;
  for (let i = 0; i < phrasesLc.length; i++) {
    const phraseLc = phrasesLc[i]!;
    if (!textLc.includes(phraseLc)) continue;
    const key = `${file}:${line}:${phraseLc}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      code: 'BRAND-V001',
      severity: severityFor('BRAND-V001', strictness),
      file,
      line,
      message: `UI copy contains forbidden phrase "${phraseLc}" — declared at DESIGN.md ## Brand Rules → Voice → forbidden_phrases`,
      evidence: { snippet: text.length > 80 ? text.slice(0, 80) + '…' : text },
      rule: { id: 'BRAND-V001', category: 'voice' },
      fix: {
        kind: 'manual',
        description: `Rewrite to avoid "${phraseLc}". If the phrase is unavoidable for this context, remove it from voice.forbidden_phrases (or scope the audit) — but the default policy is that brand voice trumps convenience.`,
      },
    });
  }
}
