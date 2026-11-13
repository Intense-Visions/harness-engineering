// packages/cli/tests/craft/capability-subset-law.test.ts
//
// Phase 3, criterion 2. `CraftDomainRule.supportedLanguages` is a CAPABILITY
// CLAIM: a domain that declares a language is promising a host it can critique
// files in it. When wiring runs ahead of extraction the domain is dispatched,
// reads a file it cannot parse, and reports a confident clean pass — the silent
// zero the whole feature exists to prevent.
//
// TWO DESIGN DECISIONS, both measured rather than assumed:
//
// 1. The law is expressed over EXTENSIONS, not languages (DP-3). A
//    language-granular law compares {typescript} subset-of {typescript} and
//    passes while `.mts` and `.cts` extract nothing.
// 2. Each probe asserts a KNOWN DECLARED SYMBOL, never a count (DP-4).
//    `extractIdentifiers` has no extension gate and returns non-empty GARBAGE
//    for Python, Go, Rust and Java (measured: cart.py -> [function:,
//    function:, type:Cart] — two empty names, `compute_total` absent). A
//    "returns something" probe would pass for all four and would not redden
//    when naming-craft is widened. It would be decorative.
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  EXTENSION_MAP,
  CRAFT_REVIEW_DOMAINS,
  CRAFT_ANY_LANGUAGE,
  type SupportedLanguage,
} from '@harness-engineering/core';
import { extractCodeUnits } from '../../src/code-craft/extract/units';
import { extractIdentifiers } from '../../src/naming-craft/extract/identifiers';
import { detectSignals } from '../../src/security-craft/extract/signals';
import { extractTests } from '../../src/test-craft/extract/tests';
import { extractPythonTests } from '../../src/test-craft/extract/python-tests';
import { detectFramework } from '../../src/test-craft/extract/framework';

/** Identical source across an extension family: the EXTENSION is the only variable. */
const TSJS_SOURCE = [
  'export function computeTotal(items) {',
  '  let total = 0;',
  '  for (const item of items) {',
  '    total += item;',
  '  }',
  '  return total;',
  '}',
].join('\n');

/** Benign, signal-bearing: `app.get` -> http-handler, `fetch` -> data-egress. No eval/exec. */
const SECURITY_SOURCE = [
  'export function wire(app, url) {',
  "  app.get('/users/:id', async (req, res) => {",
  '    const data = await fetch(url);',
  '    res.json(data);',
  '  });',
  '}',
].join('\n');

const SPEC_SOURCE = [
  "describe('cart', () => {",
  "  it('adds an item', () => {",
  '    const c = [];',
  '    c.push(1);',
  '    expect(c.length).toBe(1);',
  '  });',
  '});',
].join('\n');

export const CORPUS = path.join(__dirname, '..', 'fixtures', 'craft-languages');

/**
 * Non-TS/JS languages have genuinely different source, so they come from the
 * real corpus. Each symbol is VERIFIED against the fixture on disk: Go's free
 * function is lowercase `computeTotal`, Rust's lives inside `mod totals`.
 */
const LANGUAGE_FIXTURE: Record<string, { file: string; symbol: string }> = {
  '.py': { file: 'cart.py', symbol: 'compute_total' },
  '.go': { file: 'cart.go', symbol: 'computeTotal' },
  '.rs': { file: 'cart.rs', symbol: 'compute_total' },
  '.java': { file: 'Cart.java', symbol: 'computeTotal' },
};

/** Test-shaped corpus fixtures, for probing test-craft outside TS/JS. */
const TEST_FIXTURE: Record<string, string> = {
  '.go': 'cart_test.go',
};

/** The eight extensions EXTENSION_MAP maps to typescript or javascript. */
export function isTsJsExt(ext: string): boolean {
  const lang = EXTENSION_MAP[ext];
  return lang === 'typescript' || lang === 'javascript';
}

function readCorpus(file: string): string | null {
  const p = path.join(CORPUS, file);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : null;
}

/** A missing fixture returns null, which the law turns into a FAILURE, never a skip. */
function corpusSource(ext: string): string | null {
  const entry = LANGUAGE_FIXTURE[ext];
  return entry ? readCorpus(entry.file) : null;
}

function corpusTestSource(ext: string): string | null {
  const file = TEST_FIXTURE[ext];
  return file ? readCorpus(file) : null;
}

function tsjsOrCorpusSource(ext: string): string | null {
  return isTsJsExt(ext) ? TSJS_SOURCE : corpusSource(ext);
}

/**
 * The symbol the probe must find, keyed off the file's extension. An extension
 * with no fixture yields a sentinel no extractor can ever emit, so a missing
 * fixture reads as NOT FOUND rather than as a vacuous pass.
 */
export function expectedSymbol(filePath: string): string {
  const ext = filePath.slice(filePath.lastIndexOf('.'));
  if (isTsJsExt(ext)) return 'computeTotal';
  return LANGUAGE_FIXTURE[ext]?.symbol ?? '<no-fixture-symbol>';
}

type ProbeResult = { found: boolean; detail: string };
type Probe = (filePath: string, source: string) => Promise<ProbeResult> | ProbeResult;

/**
 * The file NAME the probe presents, which is part of the capability question:
 * every one of these extractors dispatches on the path, not only on the text.
 * Corpus-backed languages use their real fixture name so the probe never
 * depends on a synthetic name a parser might reject (`probe.java` would not
 * match its `public class Cart`).
 */
function defaultFileFor(ext: string): string {
  return LANGUAGE_FIXTURE[ext]?.file ?? `probe${ext}`;
}

/**
 * test-craft is the one domain whose production routing gates on the test-file
 * NAMING CONVENTION (`isTsJsTestFileName`, shared with the discovery walk), so
 * `probe.ts` would extract zero for a reason that has nothing to do with the
 * extension under test. Caught by the probe table's own TS control.
 */
function testFileFor(ext: string): string {
  if (isTsJsExt(ext)) return `probe.test${ext}`;
  return TEST_FIXTURE[ext] ?? `probe${ext}`;
}

export const PROBES: Record<
  string,
  { probe: Probe; sourceFor: (ext: string) => string | null; fileFor: (ext: string) => string }
> = {
  'code-craft': {
    fileFor: defaultFileFor,
    sourceFor: (ext) => tsjsOrCorpusSource(ext),
    probe: async (f, s) => {
      const units = await extractCodeUnits(s, f);
      const names = units.map((u) => u.name);
      return { found: names.includes(expectedSymbol(f)), detail: `units=[${names.join('|')}]` };
    },
  },
  'naming-craft': {
    fileFor: defaultFileFor,
    sourceFor: (ext) => tsjsOrCorpusSource(ext),
    probe: (f, s) => {
      const names = extractIdentifiers(f, s).map((i) => i.name);
      return { found: names.includes(expectedSymbol(f)), detail: `ids=[${names.join('|')}]` };
    },
  },
  'security-craft': {
    fileFor: defaultFileFor,
    // Signals are CALL-SITE shaped, so the fixture must contain a call a
    // scanner can see. `security-findings/src/insecure.ts` yields ZERO
    // detectSignals (measured) — it is a check-security fixture, not a
    // security-craft one.
    sourceFor: (ext) => (isTsJsExt(ext) ? SECURITY_SOURCE : corpusSource(ext)),
    probe: (f, s) => {
      const kinds = detectSignals(s, f).map((x) => x.kind);
      return { found: kinds.length > 0, detail: `signals=[${kinds.join('|')}]` };
    },
  },
  'test-craft': {
    fileFor: testFileFor,
    sourceFor: (ext) => (isTsJsExt(ext) ? SPEC_SOURCE : corpusTestSource(ext)),
    // Mirrors the production routing at test-craft/index.ts. One line, mirrored
    // deliberately: `extractTestsForFile` is module-private, and drift here can
    // only make the law STRICTER (a red to investigate), never a false green.
    probe: (f, s) => {
      const tests = f.endsWith('.py')
        ? extractPythonTests({ file: f, source: s })
        : extractTests({ file: f, source: s, framework: detectFramework(s, f) });
      return { found: tests.length > 0, detail: `tests=${tests.length}` };
    },
  },
};

export const GATED = CRAFT_REVIEW_DOMAINS.filter(
  (d) => d.supportedLanguages !== CRAFT_ANY_LANGUAGE
);

/** Every EXTENSION_MAP extension that maps to one of the domain's declared languages. */
export function declaredExtensions(langs: readonly SupportedLanguage[]): string[] {
  const set = new Set<SupportedLanguage>(langs);
  return Object.entries(EXTENSION_MAP)
    .filter(([, lang]) => set.has(lang))
    .map(([ext]) => ext)
    .sort();
}

describe('the probe table itself works (the probes own positive control)', () => {
  // If a probe were broken — a bad import, a changed signature, a fixture that
  // moved — EVERY case in the subset law would redden for a reason that has
  // nothing to do with capability. This pins the four probes against the
  // TypeScript control first, so a red in the law is a red about extraction.
  const TS_CONTROL = [
    { skill: 'code-craft', ext: '.ts' },
    { skill: 'naming-craft', ext: '.ts' },
    { skill: 'security-craft', ext: '.ts' },
    { skill: 'test-craft', ext: '.ts' },
  ] as const;

  it.each(TS_CONTROL)('the $skill probe finds what it looks for in $ext', async (c) => {
    const { probe, sourceFor, fileFor } = PROBES[c.skill];
    const source = sourceFor(c.ext);
    expect(source, `no source for ${c.skill} ${c.ext}`).not.toBeNull();
    const result = await probe(path.join(CORPUS, fileFor(c.ext)), source as string);
    expect(result.found, `the ${c.skill} probe is broken: ${result.detail}`).toBe(true);
  });
});

describe('THE SUBSET LAW: a declared language is a capability claim, per EXTENSION', () => {
  // ANTI-VACUITY. Two empty sets satisfy any subset assertion, and the easiest
  // false green in this file is a GATED list that silently became empty (e.g. a
  // table edit flipping every domain to 'any').
  it('has gated domains to check, and a probe for each', () => {
    expect(GATED.length).toBeGreaterThanOrEqual(4);
    for (const d of GATED) expect(PROBES[d.skill], `no probe for ${d.skill}`).toBeDefined();
  });

  const CASES = GATED.flatMap((d) =>
    declaredExtensions(d.supportedLanguages as readonly SupportedLanguage[]).map((ext) => ({
      skill: d.skill,
      ext,
    }))
  );

  it('covers every declared (domain, extension) pair', () => {
    // A shrinking case list is how this law dies quietly.
    expect(CASES.length).toBeGreaterThanOrEqual(8 * 1 + 4);
  });

  it.each(CASES)('$skill can actually extract from $ext', async ({ skill, ext }) => {
    const { probe, sourceFor, fileFor } = PROBES[skill];
    const source = sourceFor(ext);
    // A MISSING FIXTURE IS A FAILURE, NOT A SKIP. A seventh language entering
    // EXTENSION_MAP automatically enters code-craft's declared set and lands
    // here with no fixture; that must be loud.
    expect(source, `${skill} declares ${ext} but the probe has no fixture for it`).not.toBeNull();
    const file = path.join(CORPUS, fileFor(ext));
    const result = await probe(file, source as string);
    expect(
      result.found,
      `${skill} DECLARES ${ext} but extracts nothing from it — wiring is ahead of ` +
        `extraction, which is the silent zero this law exists to prevent. ${result.detail}`
    ).toBe(true);
  });
});

describe('the probe can report absence (positive control at the same scope)', () => {
  // Each pair is a language the domain does NOT declare. If any of these came
  // back `found`, the probe would be answering a different question than the
  // law asks — and `extractIdentifiers` in particular returns non-empty
  // GARBAGE for every non-TS language (measured: cart.py -> [function:,
  // function:, type:Cart]).
  const NEGATIVE = [
    { skill: 'naming-craft', ext: '.py', file: 'cart.py' },
    { skill: 'naming-craft', ext: '.rs', file: 'cart.rs' },
    { skill: 'security-craft', ext: '.py', file: 'cart.py' },
    { skill: 'test-craft', ext: '.go', file: 'cart_test.go' },
  ] as const;

  it.each(NEGATIVE)('$skill cannot extract from $ext (and does not claim to)', async (c) => {
    const declared = CRAFT_REVIEW_DOMAINS.find((d) => d.skill === c.skill)!;
    const langs = declared.supportedLanguages as readonly SupportedLanguage[];
    expect(langs, 'control is stale: the domain now declares this language').not.toContain(
      EXTENSION_MAP[c.ext]
    );
    const file = path.join(CORPUS, c.file);
    const result = await PROBES[c.skill].probe(file, fs.readFileSync(file, 'utf-8'));
    expect(result.found, `probe reported capability it should not have: ${result.detail}`).toBe(
      false
    );
  });
});
