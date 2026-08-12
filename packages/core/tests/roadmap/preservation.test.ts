import { describe, it, expect } from 'vitest';
import { findUnpreservedLines } from '../../src/roadmap/preservation';
import { serializeRoadmap } from '../../src/roadmap/serialize';
import { MONOLITH_ROADMAP, MIGRATION_ROADMAP, OLD_ROADMAP_MD } from './store/fixtures';

describe('findUnpreservedLines (#839 monolith write-preservation guard)', () => {
  describe('canonical serializer output round-trips losslessly (drift-catcher)', () => {
    // If serializeRoadmap ever emits a new field, these break until the field is
    // added to MODELED_FIELD_KEYS — keeping the guard's key set in sync.
    it('reports nothing for a plain serialized roadmap', () => {
      expect(findUnpreservedLines(serializeRoadmap(MONOLITH_ROADMAP))).toEqual([]);
    });

    it('reports nothing for a serialized roadmap with extended fields + assignment history', () => {
      // MIGRATION_ROADMAP exercises Assignee/Priority/External-ID rows and a
      // populated assignment-history table.
      expect(findUnpreservedLines(serializeRoadmap(MIGRATION_ROADMAP))).toEqual([]);
    });
  });

  describe('detects hand-authored content the serializer would drop', () => {
    it('flags a milestone-section blockquote but not the preamble above it', () => {
      const lost = findUnpreservedLines(OLD_ROADMAP_MD).map((l) => l.text);
      // Prose inside a milestone section is still unmodeled and still lost.
      expect(lost.filter((t) => t.startsWith('> Section intro prose'))).toHaveLength(1);
      // The block under the title is the preamble: modeled and re-emitted (#1328),
      // so flagging it would block a monolith write that loses nothing.
      expect(lost).not.toContain(
        '<!-- Hand-authored preamble: directives and notes to the tooling downstream. -->'
      );
      expect(lost).not.toContain(
        'This line and the comment above round-trip verbatim through shard -> regen.'
      );
    });

    it('flags a multi-line Summary continuation, an Issue bullet, and a blockquote with correct line numbers', () => {
      const md = [
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
        '> Section intro blockquote.',
        '',
        '### Local backend',
        '',
        '- **Status:** in-progress',
        '- **Spec:** —',
        '- **Summary:** Ship the local backend end to end.',
        '  This second line is a continuation and is dropped.',
        '- **Issue:** [#837](https://x/y/837)',
        '- **Blockers:** —',
        '- **Plan:** —',
      ].join('\n');

      const lost = findUnpreservedLines(md);
      const byText = new Map(lost.map((l) => [l.text, l.line]));

      expect(byText.get('> Section intro blockquote.')).toBe(12);
      expect(byText.get('  This second line is a continuation and is dropped.')).toBe(19);
      expect(byText.get('- **Issue:** [#837](https://x/y/837)')).toBe(20);
      // Modeled single-line fields and headings are NOT flagged.
      expect(lost.map((l) => l.text)).not.toContain('- **Status:** in-progress');
      expect(lost.map((l) => l.text)).not.toContain('### Local backend');
    });

    it('flags an indented heading/field (parser anchors at column 0)', () => {
      const md = [
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
        '  ### Indented feature',
        '  - **Status:** planned',
      ].join('\n');
      const texts = findUnpreservedLines(md).map((l) => l.text);
      expect(texts).toContain('  ### Indented feature');
      expect(texts).toContain('  - **Status:** planned');
    });
  });

  describe('tolerates cosmetic normalizations (not content loss)', () => {
    it('does NOT flag a non-`# Roadmap` H1 title or `Milestone:`/`Feature:` heading prefixes', () => {
      // The serializer canonicalizes the title to `# Roadmap` and strips the
      // prefixes — cosmetic single-line normalizations, not the body loss #839
      // is about. A real-world roadmap in this exact shape must still be writable.
      const md = [
        '---',
        'project: demo',
        'version: 1',
        'last_synced: 2026-07-17T00:00:00.000Z',
        'last_manual_edit: 2026-07-17T00:00:00.000Z',
        '---',
        '',
        '# Project Roadmap',
        '',
        '## Milestone: MVP Release',
        '',
        '### Feature: Auth System',
        '- **Status:** in-progress',
        '- **Spec:** —',
        '- **Summary:** Authentication',
      ].join('\n');
      expect(findUnpreservedLines(md)).toEqual([]);
    });

    it('does NOT flag `Blocked by`/`Plans` input aliases', () => {
      const md = [
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
        '- **Blocked by:** Some other feature',
        '- **Plans:** docs/plan.md',
        '- **Summary:** —',
      ].join('\n');
      expect(findUnpreservedLines(md)).toEqual([]);
    });
  });
});
