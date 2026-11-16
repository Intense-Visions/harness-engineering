// agents/skills/tests/bug-fleet-verify-provenance.test.ts
//
// Guard for #2239: bug-fleet's VERIFY provenance gate must name artifacts the
// skills it composes ACTUALLY leave behind.
//
// bug-fleet rejects any item without "pipeline provenance" — "Absent provenance
// = the pipeline did not run = rejected". It used to locate that provenance
// under `.harness/sessions/<slug>/`, a directory neither composed skill writes:
// `harness-tdd` declares `state: { persistent: false, files: [] }` and
// `harness-debugging` keeps its session in `.harness/debug/`. An orchestrator
// following the skill literally therefore rejected every item, real bugs
// included. Producer and consumer were both prose, so nothing caught the drift.
//
// This file pins the producer/consumer contract mechanically: every `.harness/`
// path bug-fleet names must be a path a composed skill documents writing (in its
// SKILL.md or its skill.yaml `state.files`), and the gate must stay a gate.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parse } from 'yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = resolve(__dirname, '..', 'claude-code');

const CONSUMER = 'bug-fleet';
/** The skills bug-fleet's VERIFY says leave the provenance behind. */
const PRODUCERS = ['harness-tdd', 'harness-debugging'] as const;

const read = (skill: string, file: string): string =>
  readFileSync(resolve(SKILLS_DIR, skill, file), 'utf-8');

/** Every `.harness/...` path literal in a text, trailing punctuation stripped. */
function harnessPaths(text: string): string[] {
  const found = text.match(/\.harness\/[A-Za-z0-9_<>.\-/]*/g) ?? [];
  return [...new Set(found.map((p) => p.replace(/[.]+$/, '')))];
}

/** The `.harness/` locations a producer documents writing. */
function producerWrites(skill: string): string[] {
  const md = harnessPaths(read(skill, 'SKILL.md'));
  const yaml = parse(read(skill, 'skill.yaml')) as { state?: { files?: string[] } };
  const declared = (yaml.state?.files ?? []).filter((f) => f.startsWith('.harness/'));
  return [...new Set([...md, ...declared])];
}

/** A consumed path is satisfied by an identical documented path, or by a documented directory containing it. */
function isProduced(path: string, writes: string[]): boolean {
  return writes.some((w) => w === path || (w.endsWith('/') && path.startsWith(w)));
}

/** The VERIFY section of bug-fleet's SKILL.md. */
function verifySection(): string {
  const text = read(CONSUMER, 'SKILL.md');
  const start = text.indexOf('### Phase 4: VERIFY');
  const end = text.indexOf('### Phase 5:', start);
  expect(start, 'bug-fleet SKILL.md has a Phase 4 VERIFY section').toBeGreaterThan(-1);
  return text.slice(start, end === -1 ? undefined : end);
}

describe('bug-fleet VERIFY provenance is satisfiable by its composed skills (#2239)', () => {
  const writes = PRODUCERS.flatMap(producerWrites);

  it('every .harness/ path bug-fleet names is one a composed skill documents writing', () => {
    const consumed = [
      ...harnessPaths(read(CONSUMER, 'SKILL.md')),
      ...harnessPaths(read(CONSUMER, 'skill.yaml')),
    ];
    const orphans = consumed.filter((p) => !isProduced(p, writes));
    expect(
      orphans,
      `paths no composed skill writes (producers write: ${writes.join(', ')})`
    ).toEqual([]);
  });

  it('the VERIFY provenance step names the harness-debugging session location', () => {
    const debugWrites = producerWrites('harness-debugging');
    const named = harnessPaths(verifySection()).filter((p) => isProduced(p, debugWrites));
    expect(named.length, 'VERIFY names at least one .harness/debug/ session path').toBeGreaterThan(
      0
    );
  });

  it('VERIFY does not demand session state from harness-tdd, which persists none', () => {
    const tddYaml = parse(read('harness-tdd', 'skill.yaml')) as {
      state?: { persistent?: boolean };
    };
    // Premise of this assertion: if harness-tdd ever starts persisting state, revisit it.
    expect(tddYaml.state?.persistent).toBe(false);
    expect(verifySection()).not.toMatch(/`harness-tdd` session state/);
    // The tdd half is evidenced by its committed cycle: the reproducing-test commit.
    expect(verifySection()).toMatch(/reproducing-test commit/);
  });

  it('absent provenance still rejects the item — the gate is fixed, not removed', () => {
    expect(verifySection()).toMatch(
      /\*\*Absent provenance = the pipeline did not run = rejected\*\*/
    );
  });
});
