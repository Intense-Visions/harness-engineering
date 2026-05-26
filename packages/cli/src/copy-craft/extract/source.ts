/**
 * Source-side extractor — single TS Compiler API walk that emits items
 * for all four source surfaces (error, log, cli-output, comment).
 * Amortizes AST parse cost across surfaces.
 *
 * Source: docs/changes/craft-pipeline/copy-craft/proposal.md
 *   (Technical Design → Source extractors).
 */

import ts from 'typescript';
import * as path from 'node:path';
import type { CopySurface, ExtractedCopyItem } from '../findings/schema.js';

const LOG_LEVELS = ['log', 'info', 'warn', 'warning', 'error', 'debug', 'trace', 'fatal'];

export interface SourceExtractInput {
  file: string;
  source: string;
  /** Globs (or path substrings) that mark a file as CLI source. v1 uses
   *  substring containment for simplicity. */
  cliOutputPaths?: string[];
  /** Which surfaces to extract. Defaults to all four source surfaces. */
  surfaces?: CopySurface[];
}

export function extractFromSource(input: SourceExtractInput): ExtractedCopyItem[] {
  if (!/\.(?:ts|tsx|js|jsx)$/i.test(input.file)) return [];

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

  const surfaces = new Set<CopySurface>(
    input.surfaces ?? ['error', 'log', 'cli-output', 'comment']
  );
  const isCliSource =
    surfaces.has('cli-output') && fileMatchesCliPaths(input.file, input.cliOutputPaths);

  const out: ExtractedCopyItem[] = [];
  const seenCommentStarts = new Set<number>();

  visit(sourceFile, sourceFile, input.file, surfaces, isCliSource, out);
  // Extract comments separately (one walk over the source text for comment ranges)
  if (surfaces.has('comment')) {
    extractComments(input.file, input.source, sourceFile, seenCommentStarts, out);
  }
  return out;
}

function visit(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  file: string,
  surfaces: Set<CopySurface>,
  isCliSource: boolean,
  out: ExtractedCopyItem[]
): void {
  // Error: throw new <X>Error(...) — X ends in 'Error' or is the bare 'Err' callable
  if (surfaces.has('error') && ts.isThrowStatement(node) && node.expression !== undefined) {
    if (ts.isNewExpression(node.expression)) {
      const ctorName = getIdentifierName(node.expression.expression);
      if (ctorName !== null && /Error$/.test(ctorName)) {
        const firstArg = node.expression.arguments?.[0];
        const message = extractStringMessage(firstArg);
        if (message !== null) {
          pushItem(out, file, sourceFile, node, 'error', message, { errorType: ctorName });
        }
      }
    }
  }
  // Err({ message: "..." }) — Result-style returns
  if (surfaces.has('error') && ts.isCallExpression(node)) {
    const calleeName = getIdentifierName(node.expression);
    if (calleeName === 'Err' && node.arguments.length === 1) {
      const arg = node.arguments[0]!;
      if (ts.isObjectLiteralExpression(arg)) {
        const messageProp = arg.properties.find(
          (p) => ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === 'message'
        ) as ts.PropertyAssignment | undefined;
        if (messageProp !== undefined) {
          const message = extractStringMessage(messageProp.initializer);
          if (message !== null) {
            pushItem(out, file, sourceFile, node, 'error', message, { errorType: 'Err' });
          }
        }
      }
    }
  }

  // Log: console.X(...) or *.X(...) where X is a known log level
  if ((surfaces.has('log') || isCliSource) && ts.isCallExpression(node)) {
    if (ts.isPropertyAccessExpression(node.expression)) {
      const methodName = node.expression.name.text;
      const receiverName = getIdentifierName(node.expression.expression);
      const isConsole = receiverName === 'console';
      const isLoggerLike = receiverName !== null && isLikelyLogger(receiverName);
      if ((isConsole || isLoggerLike) && LOG_LEVELS.includes(methodName)) {
        const firstArg = node.arguments[0];
        const message = extractStringMessage(firstArg);
        if (message !== null) {
          const isCliCall = isCliSource && (isConsole || receiverName === 'formatter');
          // CLI output takes precedence when the file is in CLI source paths
          // AND surface is enabled; otherwise treat as log.
          const surface: CopySurface =
            isCliCall && surfaces.has('cli-output')
              ? 'cli-output'
              : surfaces.has('log')
                ? 'log'
                : null!;
          if (surface !== null) {
            pushItem(out, file, sourceFile, node, surface, message, {
              logLevel: methodName,
            });
          }
        }
      }
    }
  }

  ts.forEachChild(node, (child) => visit(child, sourceFile, file, surfaces, isCliSource, out));
}

function extractComments(
  file: string,
  source: string,
  sourceFile: ts.SourceFile,
  seenStarts: Set<number>,
  out: ExtractedCopyItem[]
): void {
  // Walk the token stream to find all comment ranges. ts.getLeadingCommentRanges /
  // ts.getTrailingCommentRanges fire per node; we collect uniquely by start position
  // so we don't double-count a comment that's leading-of-A and trailing-of-B.
  function visitForComments(node: ts.Node): void {
    const leading = ts.getLeadingCommentRanges(source, node.getFullStart()) ?? [];
    const trailing = ts.getTrailingCommentRanges(source, node.getEnd()) ?? [];
    for (const range of [...leading, ...trailing]) {
      if (seenStarts.has(range.pos)) continue;
      seenStarts.add(range.pos);
      const text = source.slice(range.pos, range.end);
      // Skip JSDoc (/** ... */) — that's docs-craft territory.
      if (/^\s*\/\*\*/.test(text)) continue;
      // Skip shebang-style + license banner blocks (very crude: anything in first 20 lines
      // that contains "Copyright" or "License" or "SPDX")
      const isLicenseBanner =
        range.pos < 1000 && /(Copyright|License|SPDX|Apache|MIT|BSD)/i.test(text);
      if (isLicenseBanner) continue;
      const cleaned = cleanCommentText(text);
      if (cleaned.length === 0) continue;
      const { line: zeroLine } = sourceFile.getLineAndCharacterOfPosition(range.pos);
      out.push({
        file,
        line: zeroLine + 1,
        surface: 'comment',
        snippet: cleaned,
        context: {},
      });
    }
    ts.forEachChild(node, visitForComments);
  }
  visitForComments(sourceFile);
}

function pushItem(
  out: ExtractedCopyItem[],
  file: string,
  sourceFile: ts.SourceFile,
  node: ts.Node,
  surface: CopySurface,
  snippet: string,
  context: ExtractedCopyItem['context']
): void {
  const { line: zeroLine } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  out.push({
    file,
    line: zeroLine + 1,
    surface,
    snippet,
    context,
  });
}

function extractStringMessage(node: ts.Node | undefined): string | null {
  if (node === undefined) return null;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  if (ts.isTemplateExpression(node)) {
    // For template literals with interpolation, return the literal parts joined
    // with placeholder markers. The LLM can still critique tone / specificity
    // of the static surrounding text.
    const head = node.head.text;
    const spans = node.templateSpans.map((s) => `\${...}${s.literal.text}`).join('');
    return head + spans;
  }
  return null;
}

function getIdentifierName(node: ts.Node): string | null {
  if (ts.isIdentifier(node)) return node.text;
  if (ts.isPropertyAccessExpression(node)) return getIdentifierName(node.name);
  return null;
}

function isLikelyLogger(name: string): boolean {
  // Common logger receiver names — extend in v1.x as patterns emerge
  const known = ['logger', 'log', 'pino', 'winston', 'console', 'console2'];
  return known.includes(name);
}

function fileMatchesCliPaths(file: string, cliPaths: string[] | undefined): boolean {
  const paths = cliPaths ?? defaultCliOutputPaths();
  const normalized = file.split(path.sep).join('/');
  return paths.some((p) => normalized.includes(p));
}

function defaultCliOutputPaths(): string[] {
  // POSIX-style substrings; checked against the file path with separators normalized.
  return ['packages/cli/src/commands/', '/src/commands/', '/src/cli/'];
}

function cleanCommentText(raw: string): string {
  // Strip leading `//` or `/*` and trailing `*/`; trim per-line `*` prefix in block comments.
  let text = raw.trim();
  if (text.startsWith('//')) {
    return text.slice(2).trim();
  }
  if (text.startsWith('/*') && text.endsWith('*/')) {
    text = text.slice(2, -2);
    return text
      .split('\n')
      .map((line) => line.replace(/^\s*\*\s?/, '').trim())
      .filter((line) => line.length > 0)
      .join('\n')
      .trim();
  }
  return text;
}
