import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Repo-level guard on the ONE claim the `partial-extraction` label must never
 * make: that the duplicated wrapper already lives in the module every member
 * calls into, so the repair is a delete-and-import.
 *
 * It is false, and it is false everywhere. Measured at Scope C on 2026-10-21,
 * the duplicated wrapper is among its `sharedImport` module's exports in **0 of
 * the 7** labelled classes on this repository. Even `parseFencedJson` — the
 * case the spec names as the signal's origin — fails it: `shared/craft/fenced-json`
 * exports `extractFencedJsonPayload`, not the wrapper. That the wrapper was
 * never extracted IS the finding. It is not something a reader can import.
 *
 * WHY THIS TEST EXISTS, and why it asserts an ABSENCE.
 *
 * The claim has now been "fixed" twice and survived both times:
 *   - Phase 4's gate-fix batch corrected four places (`AGENTS.md`, the
 *     refactoring SKILL, the changeset, criterion 3) and recorded the claim as
 *     "corrected in all four places". Six further live sites were never looked
 *     at: `core/src/duplication/index.ts` twice — BOTH shipping to consumers
 *     via `dist/index.d.ts` — `cli/src/mcp/tools/entropy.ts` twice,
 *     `cli/src/commands/cleanup.ts`, and the changeset's own lead paragraph,
 *     which would have shipped it in the release notes.
 *   - Phase 5 added `tests/code-craft/sibling-evidence.test.ts:88`
 *     (`not.toMatch(/already exists/i)`) — the repo's only absence-assertion,
 *     and it is scoped to ONE rendered prompt string. Six sites outside that
 *     string were invisible to it.
 *
 * Presence-assertions have failed to catch this FOUR times, and the reason is
 * structural rather than careless: an assertion that the CORRECTION is present
 * is satisfied by a text that contains the correction AND the false claim side
 * by side. Only an assertion that the FALSE CLAIM IS ABSENT can fail on that
 * text. This is the general form of Phase 5's N2 lesson — pinning a
 * correction's presence is not pinning the false claim's absence — applied at
 * repo scope instead of at one function's output.
 *
 * SCOPE. Everything that SHIPS: every package's `src` (source, and therefore the
 * emitted `.d.ts` JSDoc that consumers read in their editors) plus
 * `.changeset/` (the release notes). Plus the refactoring SKILL, which is the
 * surface that turns the label into an INSTRUCTION to a model — the highest
 * blast radius of the four.
 *
 * NOT scoped: `docs/` and `AGENTS.md`, which carry the genuinely historical
 * framings ("the row PROMISED a delete-and-import repair with nothing to
 * import") that describe the past defect correctly and must stay. No exclusion
 * list is needed to protect them, because the banned patterns are the
 * PRESENT-TENSE assertions only — a deliberate property, since an exclusion
 * list is itself a thing a future writer can add themselves to.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');

/**
 * The present-tense phrasings of the false claim.
 *
 * Each is the literal text that was live in a shipping file before the
 * FINAL_REVIEW batch, generalized only as far as the sites that actually
 * carried it:
 *   - `shared helper already exists` (core `index.ts:72`, cli `entropy.ts:216`)
 *     and `shared module already exists` (core `index.ts:409`).
 *   - `repair is delete-and-import rather than design` (cli `entropy.ts:233`,
 *     `cleanup.ts:436`, the changeset) and `refactor is ...` (core
 *     `index.ts:410`) — one alternation, because the verb was never the point.
 *   - `repair is usually delete-and-import` (the refactoring SKILL) — "usually"
 *     is not a hedge at 0 of 7, it is a false frequency claim.
 */
const BANNED_CLAIMS: readonly { readonly pattern: RegExp; readonly why: string }[] = [
  {
    pattern: /shared (helper|module) already exists/i,
    why: 'The shared MODULE exists; the duplicated WRAPPER does not live in it (0 of 7 measured). Say the members CALL INTO the module.',
  },
  {
    pattern: /\b(repair|refactor|fix) is (usually |always |simply )?delete-and-import\b/i,
    why: 'Not necessarily a delete-and-import, and never measurably so on this repo. Say it is NOT necessarily one and tell the reader to open the module and confirm its exports.',
  },
];

/**
 * Directory names never walked: build output, deps, caches.
 *
 * Consulted only for subdirectories ENCOUNTERED during a walk, never for the
 * root handed to {@link walk}. A surviving mutant records the consequence:
 * adding `'src'` to this set changes nothing, because each package's `src` is
 * passed as a walk root rather than reached through one, and no package nests a
 * `src/src`. Equivalent, not a gap — the scope assertion below kills the
 * mutations that DO collapse the surface (skip every subdirectory, match no
 * extension, drop `.changeset`).
 */
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'coverage', '.turbo', '__snapshots__']);

function walk(dir: string, matches: (file: string) => boolean, out: string[] = []): string[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    // `withFileTypes` reports a symlink as neither file nor directory, so the
    // platform mirrors under `agents/skills/{cursor,codex,gemini-cli}` are
    // skipped by construction rather than by name — they are symlinks to the
    // `claude-code` originals, so scanning them would only double-report.
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(full, matches, out);
    } else if (entry.isFile() && matches(full)) {
      out.push(full);
    }
  }
  return out;
}

/** Every shipping file the claim could live in, as repo-relative paths. */
function shippingFiles(): string[] {
  const files: string[] = [];

  const packagesDir = path.join(repoRoot, 'packages');
  for (const pkg of fs.readdirSync(packagesDir, { withFileTypes: true })) {
    if (!pkg.isDirectory()) continue;
    const src = path.join(packagesDir, pkg.name, 'src');
    if (!fs.existsSync(src)) continue;
    files.push(...walk(src, (f) => f.endsWith('.ts') || f.endsWith('.tsx')));
  }

  const changesetDir = path.join(repoRoot, '.changeset');
  if (fs.existsSync(changesetDir)) {
    files.push(...walk(changesetDir, (f) => f.endsWith('.md') && path.basename(f) !== 'README.md'));
  }

  const skills = path.join(repoRoot, 'agents', 'skills', 'claude-code');
  if (fs.existsSync(skills)) {
    files.push(...walk(skills, (f) => f.endsWith('.md')));
  }

  return files.map((f) => path.relative(repoRoot, f));
}

describe('the partial-extraction label never promises a delete-and-import', () => {
  const files = shippingFiles();

  it('scans a non-trivial shipping surface', () => {
    // Without this, a walk that silently returned [] — a renamed `src`, a
    // thrown readdir, a SKIP_DIRS entry that swallowed everything — would make
    // every absence assertion below pass vacuously. An absence test that
    // cannot see anything is the failure mode this whole file exists to
    // prevent, so the scope is itself asserted.
    expect(files.length).toBeGreaterThan(500);
    expect(files).toContain(path.join('packages', 'core', 'src', 'duplication', 'index.ts'));
    expect(files).toContain(path.join('packages', 'cli', 'src', 'commands', 'cleanup.ts'));
    expect(files).toContain(path.join('packages', 'cli', 'src', 'mcp', 'tools', 'entropy.ts'));
    expect(files.some((f) => f.startsWith(`.changeset${path.sep}`))).toBe(true);
    expect(files).toContain(
      path.join('agents', 'skills', 'claude-code', 'harness-refactoring', 'SKILL.md')
    );
  });

  for (const { pattern, why } of BANNED_CLAIMS) {
    it(`no shipping file asserts ${pattern.source}`, () => {
      const offenders: string[] = [];
      for (const rel of files) {
        const lines = fs.readFileSync(path.join(repoRoot, rel), 'utf8').split('\n');
        lines.forEach((line, i) => {
          if (pattern.test(line)) offenders.push(`${rel}:${i + 1}: ${line.trim()}`);
        });
      }

      // The message carries the correction, not just the failure: whoever trips
      // this is mid-sentence and needs to know what to write instead.
      expect(offenders, `${why}\n\n${offenders.join('\n')}`).toEqual([]);
    });
  }

  it('matches the claim across a line wrap, which is how it shipped', () => {
    // Every one of the six surviving sites was a JSDoc comment, and three of
    // them split the phrase across two lines at the 80-column wrap. A
    // line-by-line scan would miss those, so the whole-file text is scanned
    // with newlines-and-comment-leaders normalized to single spaces.
    const offenders: string[] = [];
    for (const rel of files) {
      const flat = fs
        .readFileSync(path.join(repoRoot, rel), 'utf8')
        .replace(/\n\s*(\*|\/\/)?\s*/g, ' ');
      for (const { pattern } of BANNED_CLAIMS) {
        if (pattern.test(flat)) offenders.push(`${rel} (wrapped): ${pattern.source}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
