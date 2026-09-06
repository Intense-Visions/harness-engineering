import { describe, it, expect } from 'vitest';
import { parseRoadmap } from '../../src/roadmap/parse';

/**
 * bug-fleet A1 reproduction.
 *
 * `parseRoadmap` is line-oriented and every anchor it uses is LF-only: the
 * frontmatter fence is `/^---\n([\s\S]*?)\n---/`, and the heading / field
 * patterns use `$` under `/m`, which in JS matches before `\n` but NOT before
 * `\r`. A CRLF document therefore fails at the very first gate with
 * "Missing or malformed YAML frontmatter", and even past it every captured
 * value would carry a trailing `\r` (a `- **Status:** planned\r` row fails the
 * VALID_STATUSES membership check).
 *
 * This repo pins LF via `.gitattributes`, but the roadmap store reads adopter
 * files verbatim (`node-io.ts` → `fsp.readFile(p, 'utf-8')`, no normalization),
 * and harness ships to adopters whose checkouts may be CRLF (Windows +
 * `core.autocrlf=true`). Every roadmap operation is unavailable to them.
 */
const CRLF_ROADMAP = [
  '---',
  'project: demo',
  'version: 1',
  'last_synced: 2026-07-17T00:00:00.000Z',
  'last_manual_edit: 2026-07-17T00:00:00.000Z',
  '---',
  '',
  '# Roadmap',
  '',
  '## Current Work',
  '',
  '### A feature',
  '',
  '- **Status:** planned',
  '- **Spec:** —',
  '- **Summary:** x',
  '- **Blockers:** —',
  '- **Plan:** —',
  '',
].join('\r\n');

describe('parseRoadmap — CRLF documents', () => {
  it('parses a roadmap whose lines end in CRLF', () => {
    const parsed = parseRoadmap(CRLF_ROADMAP);
    expect(parsed.ok).toBe(true);
  });
});
