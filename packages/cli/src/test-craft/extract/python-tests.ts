/**
 * Per-test extractor for pytest — light-parse (regex + indentation) walk of a
 * Python test file capturing every `def test_*` function with its enclosing
 * `class Test*` nesting and skip/parametrize markers.
 *
 * Deliberately not a full Python AST: the critique layer only needs the test
 * name, nesting chain, and verbatim body text, all of which indentation-based
 * scanning recovers reliably for idiomatic pytest suites. Mirrors the
 * light-parse precedent set by the graph ingest TestDescriptionExtractor.
 */

import type { ExtractedTest } from '../findings/schema.js';

const MAX_BODY_CHARS = 1500;

/** Matches pytest file naming: test_*.py or *_test.py. */
export function isPythonTestFile(fileName: string): boolean {
  const base = fileName.replace(/^.*[/\\]/, '');
  return /^test_.*\.py$/.test(base) || /^.*_test\.py$/.test(base);
}

export interface ExtractPythonTestsInput {
  file: string;
  source: string;
}

interface WalkState {
  /** Stack of enclosing Test* classes. */
  classStack: Array<{ name: string; indent: number }>;
  /** True when a pending @pytest.mark.skip/skipif decorator was seen. */
  skipped: boolean;
}

function indentOf(line: string): number {
  return line.length - line.trimStart().length;
}

/** Pop classes the current (non-blank, non-comment) line has dedented out of. */
function popDedentedClasses(state: WalkState, trimmed: string, indent: number): void {
  if (trimmed === '' || trimmed.startsWith('#')) return;
  while (state.classStack.length > 0 && indent <= (state.classStack.at(-1)?.indent ?? 0)) {
    state.classStack.pop();
  }
}

/** Consume a decorator line; returns true when the line was a decorator. */
function consumeDecorator(state: WalkState, trimmed: string): boolean {
  if (!trimmed.startsWith('@')) return false;
  const marker = /^@\s*pytest\.mark\.(\w+)/.exec(trimmed)?.[1];
  state.skipped = state.skipped || marker === 'skip' || marker === 'skipif';
  return true;
}

/** Consume a `class Test*` line; returns true when the line opened one. */
function consumeTestClass(state: WalkState, trimmed: string, indent: number): boolean {
  const name = /^class\s+(Test\w*)\s*[(:]/.exec(trimmed)?.[1];
  if (name === undefined) return false;
  state.classStack.push({ name, indent });
  return true;
}

function truncateBody(body: string): string {
  return body.length > MAX_BODY_CHARS ? body.slice(0, MAX_BODY_CHARS) + '\n[…truncated]' : body;
}

export function extractPythonTests(input: ExtractPythonTestsInput): ExtractedTest[] {
  const lines = input.source.split('\n');
  const out: ExtractedTest[] = [];
  const state: WalkState = { classStack: [], skipped: false };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const trimmed = line.trim();
    const indent = indentOf(line);

    popDedentedClasses(state, trimmed, indent);
    if (consumeDecorator(state, trimmed)) continue;
    if (consumeTestClass(state, trimmed, indent)) {
      state.skipped = false;
      continue;
    }

    const testName = /^(?:async\s+)?def\s+(test_\w+)\s*\(/.exec(trimmed)?.[1];
    if (testName !== undefined) {
      out.push({
        file: input.file,
        line: i + 1,
        testName,
        nesting: state.classStack.map((c) => c.name),
        body: truncateBody(extractBody(lines, i, indent)),
        framework: 'pytest',
        skipped: state.skipped,
        // pytest has no first-class "todo"; a bare `pass`/`...` body is the
        // closest analogue and is critiqued rather than skipped.
        todo: false,
        only: false,
      });
    }

    if (trimmed !== '') state.skipped = false;
  }

  return out;
}

/** Capture the def's body: lines more indented than the def, until dedent. */
function extractBody(lines: readonly string[], defIndex: number, defIndent: number): string {
  const body: string[] = [lines[defIndex]?.trim() ?? ''];
  for (let i = defIndex + 1; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (line.trim() === '') {
      body.push('');
      continue;
    }
    if (indentOf(line) <= defIndent) break;
    body.push(line);
  }
  // Trim trailing blank lines
  while (body.length > 0 && body.at(-1) === '') body.pop();
  return body.join('\n');
}
