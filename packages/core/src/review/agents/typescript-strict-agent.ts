import type { ContextBundle, ReviewFinding, ReviewAgentDescriptor } from '../types';
import { makeFindingId } from '../constants';

/**
 * TypeScript-strict review agent — activated when a non-test `.ts` or `.tsx`
 * is in the diff. Flags type holes that disable the checker, refactor
 * regressions, and existing-file complexity that would be safer as a new
 * module.
 *
 * Emits `subagent: 'typescript-strict'` and numeric `confidence`.
 */
export const TYPESCRIPT_STRICT_DESCRIPTOR: ReviewAgentDescriptor = {
  domain: 'bug',
  tier: 'standard',
  displayName: 'TypeScript-strict',
  focusAreas: [
    'Type holes that disable the checker (any, unknown-as-X assertions, ts-ignore/ts-expect-error)',
    'Existing-file complexity (large file growth as a Single-Responsibility risk)',
    'Refactor regression risk — changed exports without companion test updates',
    'Five-second rule — names a reader cannot guess from the call site',
  ],
};

const EXPLICIT_ANY_PATTERN = /(?<![A-Za-z0-9_$])(?:any|Array\s*<\s*any\s*>)(?![A-Za-z0-9_$])/;
const TS_IGNORE_PATTERN = /\/\/\s*@?ts-(ignore|expect-error)\b/;
const UNSAFE_AS_UNKNOWN = /\bas\s+unknown\s+as\s+\w+/;
const NON_NULL_ASSERTION = /\)!|\]\s*!|[\w$]+!\.(?:[\w$])/;
const VAGUE_HELPER_NAME =
  /^\s*(?:export\s+)?(?:async\s+)?function\s+(handle|process|do|stuff|util|helper)\w*\s*\(/i;

function isProductionTsFile(path: string): boolean {
  if (!/\.(ts|tsx)$/.test(path)) return false;
  if (/\.d\.ts$/.test(path)) return false;
  if (/\.(test|spec)\.(ts|tsx)$/.test(path)) return false;
  if (/__tests__\//.test(path)) return false;
  return true;
}

function isProductionFile(path: string): boolean {
  return isProductionTsFile(path);
}

interface CandidateMatch {
  file: string;
  line: number;
  snippet: string;
}

function scan(bundle: ContextBundle, predicate: (line: string) => boolean): CandidateMatch[] {
  const matches: CandidateMatch[] = [];
  for (const cf of bundle.changedFiles) {
    if (!isProductionFile(cf.path)) continue;
    const lines = cf.content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      const codePart = stripLineComment(line);
      if (predicate(codePart) || predicate(line)) {
        matches.push({ file: cf.path, line: i + 1, snippet: line.trim() });
      }
    }
  }
  return matches;
}

function stripLineComment(line: string): string {
  const idx = line.indexOf('//');
  if (idx === -1) return line;
  if (TS_IGNORE_PATTERN.test(line)) return line;
  return line.slice(0, idx);
}

function detectExplicitAny(bundle: ContextBundle): ReviewFinding[] {
  return scan(bundle, (codeLine) => {
    const cleaned = codeLine.replace(/(['"`])[^'"`]*\1/g, '""');
    return /:\s*any(?![A-Za-z0-9_$])/.test(cleaned) || /\bas\s+any(?![A-Za-z0-9_$])/.test(cleaned);
  })
    .map((m) => ({
      id: makeFindingId('ts-strict', m.file, m.line, 'explicit any'),
      file: m.file,
      lineRange: [m.line, m.line] as [number, number],
      domain: 'bug' as const,
      severity: 'important' as const,
      title: 'Explicit `any` disables the type checker',
      rationale:
        'An `any`-typed value bypasses every downstream check. Future callers receive no help from the compiler when they pass the wrong shape.',
      suggestion:
        'Replace `any` with the narrowest type that compiles — a union, `unknown` with a type predicate, or a generic. If the shape is truly external, parse it with a schema (zod, valibot) at the boundary.',
      evidence: [`Line ${m.line}: ${m.snippet}`],
      validatedBy: 'heuristic' as const,
      subagent: 'typescript-strict' as const,
      confidence: 100 as const,
    }))
    .filter((f) => EXPLICIT_ANY_PATTERN.test(f.evidence[0]!));
}

function detectTsIgnore(bundle: ContextBundle): ReviewFinding[] {
  return scan(bundle, (line) => TS_IGNORE_PATTERN.test(line)).map((m) => ({
    id: makeFindingId('ts-strict', m.file, m.line, 'ts ignore'),
    file: m.file,
    lineRange: [m.line, m.line] as [number, number],
    domain: 'bug' as const,
    severity: 'important' as const,
    title: 'ts-ignore / ts-expect-error suppresses a type error',
    rationale:
      'Suppressing a type error hides a real signal from the compiler. The reason for the suppression is rarely captured, and the original error is invisible at the call site.',
    suggestion:
      'Either remove the directive and fix the underlying type, or replace it with a typed assertion accompanied by a comment that names the invariant being asserted.',
    evidence: [`Line ${m.line}: ${m.snippet}`],
    validatedBy: 'heuristic' as const,
    subagent: 'typescript-strict' as const,
    confidence: 100 as const,
  }));
}

function detectUnsafeAsUnknown(bundle: ContextBundle): ReviewFinding[] {
  return scan(bundle, (line) => UNSAFE_AS_UNKNOWN.test(line)).map((m) => ({
    id: makeFindingId('ts-strict', m.file, m.line, 'as unknown as'),
    file: m.file,
    lineRange: [m.line, m.line] as [number, number],
    domain: 'bug' as const,
    severity: 'important' as const,
    title: '`as unknown as X` is a double-cast escape hatch',
    rationale:
      'The pattern bypasses the type system entirely. If the runtime shape diverges from X, downstream code crashes with a type-confusion error that points at the wrong line.',
    suggestion:
      'Parse the value at the boundary with a schema, or refine via a narrowing predicate so the cast becomes unnecessary.',
    evidence: [`Line ${m.line}: ${m.snippet}`],
    validatedBy: 'heuristic' as const,
    subagent: 'typescript-strict' as const,
    confidence: 100 as const,
  }));
}

function detectNonNullAssertion(bundle: ContextBundle): ReviewFinding[] {
  return scan(bundle, (line) => NON_NULL_ASSERTION.test(line))
    .filter((m) => !/process\.env\./.test(m.snippet))
    .map((m) => ({
      id: makeFindingId('ts-strict', m.file, m.line, 'non null assertion'),
      file: m.file,
      lineRange: [m.line, m.line] as [number, number],
      domain: 'bug' as const,
      severity: 'suggestion' as const,
      title: 'Non-null assertion (`!`) bypasses the null check',
      rationale:
        'The `!` operator promises the compiler that the value is not nullish. If that promise is wrong, the failure shows up as a `Cannot read properties of undefined` at runtime far from the assertion.',
      suggestion:
        'Guard with an explicit `if (value == null) throw new Error(...)` so the assertion is verified at runtime, or refactor the producer to return a non-nullable type.',
      evidence: [`Line ${m.line}: ${m.snippet}`],
      validatedBy: 'heuristic' as const,
      subagent: 'typescript-strict' as const,
      confidence: 75 as const,
    }));
}

function detectLargeFileGrowth(bundle: ContextBundle): ReviewFinding[] {
  return bundle.changedFiles
    .filter((cf) => isProductionFile(cf.path) && cf.lines > 400)
    .map((cf) => ({
      id: makeFindingId('ts-strict', cf.path, 1, 'file growth'),
      file: cf.path,
      lineRange: [1, cf.lines] as [number, number],
      domain: 'architecture' as const,
      severity: 'suggestion' as const,
      title: `File grew to ${cf.lines} lines — Single Responsibility risk`,
      rationale:
        'Past 400 lines a single TypeScript file typically encodes more than one responsibility. Adding to it compounds the burden on future readers and reviewers.',
      suggestion:
        'Identify two responsibilities and split the larger one into a new module. A new file with a clear name reads better than a longer file with vague boundaries.',
      evidence: [`File length: ${cf.lines} lines`],
      validatedBy: 'heuristic' as const,
      subagent: 'typescript-strict' as const,
      confidence: 50 as const,
    }));
}

function detectVagueNames(bundle: ContextBundle): ReviewFinding[] {
  return scan(bundle, (line) => VAGUE_HELPER_NAME.test(line)).map((m) => ({
    id: makeFindingId('ts-strict', m.file, m.line, 'vague name'),
    file: m.file,
    lineRange: [m.line, m.line] as [number, number],
    domain: 'bug' as const,
    severity: 'suggestion' as const,
    title: 'Vague function name — fails the five-second rule',
    rationale:
      'A name like `handle*` or `process*` or `doStuff` does not let a reader predict what the function does from a call site. Future maintainers must read the body to know — every time.',
    suggestion:
      'Rename to a verb-object phrase that says what changes (e.g., `applyDiscount`, `serializeOrder`). If you cannot name it, the function probably does more than one thing.',
    evidence: [`Line ${m.line}: ${m.snippet}`],
    validatedBy: 'heuristic' as const,
    subagent: 'typescript-strict' as const,
    confidence: 50 as const,
  }));
}

/**
 * Run the typescript-strict review agent. Caller must verify activation
 * (non-test `.ts`/`.tsx` in diff) per the depth calibrator.
 */
export function runTypescriptStrictAgent(bundle: ContextBundle): ReviewFinding[] {
  const findings: ReviewFinding[] = [];
  findings.push(...detectExplicitAny(bundle));
  findings.push(...detectTsIgnore(bundle));
  findings.push(...detectUnsafeAsUnknown(bundle));
  findings.push(...detectNonNullAssertion(bundle));
  findings.push(...detectLargeFileGrowth(bundle));
  findings.push(...detectVagueNames(bundle));
  return findings;
}
