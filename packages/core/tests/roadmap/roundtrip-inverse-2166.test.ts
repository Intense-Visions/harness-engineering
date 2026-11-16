import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import * as path from 'node:path';
import { parseRoadmap } from '../../src/roadmap/parse';
import { serializeRoadmap } from '../../src/roadmap/serialize';
import { parseShard, serializeShard } from '../../src/roadmap/store/shard';
import { encodeListItem, decodeListField } from '../../src/roadmap/list-field';
import { encodeSummaryField, decodeSummaryField } from '../../src/roadmap/summary-field';

// Regression guard for #2166: the roadmap codec was not an inverse on the TEXT side.
//
// 1. Backslashes in prose (`Summary`, `Plan`, `Blockers`) were unconditionally
//    doubled on write, so a roadmap documenting a regex (`\d{3}`) had its prose
//    rewritten to `\\d{3}` on the first unrelated write.
// 2. Empty optional bullets (`- **Priority:** —`, `- **External-ID:** —`) were
//    dropped when no extended field carried a value.
//
// The fixture is the issue's exact reproduction (backslashes as authored).
const ISSUE_FIXTURE =
  String.raw`---
project: repro
version: 1
created: 2026-09-16
updated: 2026-09-16
last_synced: 2026-09-16T00:00:00.000Z
last_manual_edit: 2026-09-16T00:00:00.000Z
---

# Roadmap

## Demo

### A Row Whose Prose Contains A Backslash

- **Status:** planned
- **Spec:** —
- **Summary:** Matches ` +
  '`\\d{3}` and `(?<=\\d), (\\d{3})(?!\\d)`' +
  String.raw` in prose.
- **Blockers:** —
- **Plan:** Backfill ~3,777 films; the regex is ` +
  '`\\bword\\b`' +
  String.raw`.
- **Priority:** —
- **External-ID:** —
`;

function roundTrip(markdown: string): string {
  const parsed = parseRoadmap(markdown);
  if (!parsed.ok) throw parsed.error;
  return serializeRoadmap(parsed.value);
}

describe('roadmap round-trip is a text inverse (#2166)', () => {
  it('the fixture really contains single backslashes (guards the fixture itself)', () => {
    expect(ISSUE_FIXTURE).toContain('- **Summary:** Matches `\\d{3}`');
    expect(ISSUE_FIXTURE).not.toContain('\\\\');
  });

  it('serialize(parse(fixture)) is byte-identical to the issue fixture', () => {
    expect(roundTrip(ISSUE_FIXTURE)).toBe(ISSUE_FIXTURE);
  });

  it('keeps backslash prose byte-for-byte in Summary and Plan', () => {
    const out = roundTrip(ISSUE_FIXTURE);
    expect(out).toContain(
      '- **Summary:** Matches `\\d{3}` and `(?<=\\d), (\\d{3})(?!\\d)` in prose.'
    );
    expect(out).toContain('- **Plan:** Backfill ~3,777 films; the regex is `\\bword\\b`.');
  });

  it('keeps empty optional Priority / External-ID bullets that were present in the input', () => {
    const out = roundTrip(ISSUE_FIXTURE);
    expect(out).toContain('- **Priority:** —');
    expect(out).toContain('- **External-ID:** —');
    // ...and does not invent the Assignee bullet the input never had.
    expect(out).not.toContain('- **Assignee:**');
  });

  it('survives the shard → unshard path byte-identically', () => {
    const parsed = parseRoadmap(ISSUE_FIXTURE);
    if (!parsed.ok) throw parsed.error;
    const feature = parsed.value.milestones[0]!.features[0]!;
    const shardMd = serializeShard({ slug: 'a-row', milestone: 'Demo', order: 0, feature });
    const reShard = parseShard(shardMd);
    if (!reShard.ok) throw reShard.error;
    parsed.value.milestones[0]!.features[0] = reShard.value.feature;
    expect(serializeRoadmap(parsed.value)).toBe(ISSUE_FIXTURE);
    expect(shardMd).toContain('`\\bword\\b`');
    expect(shardMd).toContain('- **Priority:** —');
  });

  it('keeps an empty Updated-At bullet alongside a populated extended block', () => {
    const md = ISSUE_FIXTURE.replace(
      '- **Priority:** —\n- **External-ID:** —\n',
      '- **Assignee:** @me\n- **Priority:** —\n- **External-ID:** —\n- **Updated-At:** —\n'
    );
    expect(md).toContain('- **Updated-At:** —');
    expect(roundTrip(md)).toBe(md);
  });

  it('is idempotent across repeated round-trips', () => {
    const once = roundTrip(ISSUE_FIXTURE);
    expect(roundTrip(once)).toBe(once);
  });
});

// A deterministic corpus: prose with backslashes, commas-in-numbers, em-dashes,
// and every escape-adjacent shape the codecs must disambiguate.
const VALUE_CORPUS = [
  'plain',
  '\\d{3}',
  '(?<=\\d), (\\d{3})(?!\\d)',
  '\\bword\\b',
  'path\\to\\thing',
  'trailing backslash \\',
  '\\',
  '\\\\',
  'a\\\\b',
  'a\\nb',
  'a\\rb',
  'back\\, slash then comma',
  'back\\,no-space',
  '3,777 films',
  'Q4,FY26',
  'em — dash',
  'a\nb',
  'mixed \\ and \n and \\n',
];

describe('codec value inverse: decode(encode(x)) === x (#2166)', () => {
  it.each(VALUE_CORPUS.filter((v) => !/[\r\n]/.test(v)))('list item %j', (item) => {
    expect(decodeListField(encodeListItem(item.trim()))).toEqual([item.trim()]);
    // and as one of several items
    expect(decodeListField([item.trim(), 'next'].map(encodeListItem).join(', '))).toEqual([
      item.trim(),
      'next',
    ]);
  });

  it.each(VALUE_CORPUS)('summary %j', (value) => {
    expect(decodeSummaryField(encodeSummaryField(value))).toBe(value);
  });
});

// Authored prose a human writes into the file: it contains backslashes but no
// sequence the codecs give meaning to (`\\`, `\n`, `\r`, `\,`).
const PROSE_CORPUS = [
  'Matches `\\d{3}` and `(?<=\\d), (\\d{3})(?!\\d)` in prose.',
  'Backfill ~3,777 films; the regex is `\\bword\\b`.',
  'C:\\Users\\me\\file',
  'escape a quote as \\"x\\"',
  'Thousands 1,166 and 3,777',
];

describe('codec text inverse: encode(decode(s)) === s for authored prose (#2166)', () => {
  it.each(PROSE_CORPUS)('summary %j', (text) => {
    expect(encodeSummaryField(decodeSummaryField(text))).toBe(text);
  });

  it.each(PROSE_CORPUS.filter((t) => !/, /.test(t)))('list field %j', (text) => {
    expect(decodeListField(text).map(encodeListItem).join(', ')).toBe(text);
  });
});

// Idempotence over this repository's real roadmap shards: whatever the canonical
// form is, a second parse → serialize must not move it.
describe("parse → serialize → parse is idempotent over this repo's shards (#2166)", () => {
  const shardDir = path.resolve(__dirname, '../../../../docs/roadmap.d');
  let files: string[] = [];
  try {
    files = readdirSync(shardDir).filter((f) => f.endsWith('.md') && !f.startsWith('_'));
  } catch {
    files = [];
  }

  it('found the shard directory', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('every shard is a fixed point after one canonicalizing write', () => {
    const unstable: string[] = [];
    for (const file of files) {
      const raw = readFileSync(path.join(shardDir, file), 'utf8').replace(/\r\n?/g, '\n');
      const first = parseShard(raw);
      if (!first.ok) throw new Error(`${file}: ${first.error.message}`);
      const once = serializeShard(first.value);
      const second = parseShard(once);
      if (!second.ok) throw new Error(`${file}: ${second.error.message}`);
      expect(second.value).toEqual(first.value);
      if (serializeShard(second.value) !== once) unstable.push(file);
    }
    expect(unstable).toEqual([]);
  });
});
