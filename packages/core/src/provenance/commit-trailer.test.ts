import { describe, it, expect } from 'vitest';
import {
  PROVENANCE_TRAILER_VERSION,
  PROVENANCE_TRAILER_KEYS,
  formatProvenanceTrailer,
  appendProvenanceTrailer,
  hasProvenanceTrailer,
  parseProvenanceTrailer,
  type ProvenanceTrailerInput,
} from './commit-trailer';

const full: ProvenanceTrailerInput = {
  skill: 'roadmap-fleet',
  skillVersion: '5.12.0',
  runId: 'run_abc123',
  model: 'claude-opus-4-8',
  sessionId: 'sess_789',
  lane: 'build',
  agent: 'harness-task-executor',
};

describe('formatProvenanceTrailer', () => {
  it('emits the primary Harness-Run key as <skill>@<version> plus the schema version', () => {
    const block = formatProvenanceTrailer(full);
    expect(block.split('\n')[0]).toBe('Harness-Run: roadmap-fleet@5.12.0');
    expect(block).toContain(`${PROVENANCE_TRAILER_KEYS.version}: ${PROVENANCE_TRAILER_VERSION}`);
  });

  it('is deterministic and ordered', () => {
    const a = formatProvenanceTrailer(full);
    const b = formatProvenanceTrailer(full);
    expect(a).toBe(b);
    expect(a).toBe(
      [
        'Harness-Run: roadmap-fleet@5.12.0',
        'Harness-Provenance-Version: 1',
        'Harness-Run-Id: run_abc123',
        'Harness-Lane: build',
        'Harness-Agent: harness-task-executor',
        'Harness-Model: claude-opus-4-8',
        'Harness-Session: sess_789',
      ].join('\n')
    );
  });

  it('omits optional fields that are absent', () => {
    const block = formatProvenanceTrailer({ skill: 'autopilot', skillVersion: '1.0.0' });
    expect(block).toBe('Harness-Run: autopilot@1.0.0\nHarness-Provenance-Version: 1');
    expect(block).not.toContain('Harness-Run-Id');
    expect(block).not.toContain('Harness-Model');
  });

  it('defaults an omitted skill version to 0.0.0', () => {
    const block = formatProvenanceTrailer({ skill: 'autopilot' });
    expect(block.split('\n')[0]).toBe('Harness-Run: autopilot@0.0.0');
  });

  it('sanitizes embedded newlines so a value cannot forge an extra key', () => {
    const block = formatProvenanceTrailer({
      skill: 'x',
      skillVersion: '1.0.0',
      model: 'evil\nHarness-Lane: injected',
    });
    // The injected newline must not create a second Harness-Lane line.
    const laneLines = block.split('\n').filter((l) => l.startsWith('Harness-Lane:'));
    expect(laneLines).toHaveLength(0);
    expect(block).toContain('Harness-Model: evil Harness-Lane: injected');
  });
});

describe('parseProvenanceTrailer', () => {
  it('round-trips a fully-populated trailer', () => {
    const parsed = parseProvenanceTrailer(formatProvenanceTrailer(full));
    expect(parsed).toEqual({
      schemaVersion: 1,
      skill: 'roadmap-fleet',
      skillVersion: '5.12.0',
      runId: 'run_abc123',
      model: 'claude-opus-4-8',
      sessionId: 'sess_789',
      lane: 'build',
      agent: 'harness-task-executor',
    });
  });

  it('round-trips a minimal trailer (skill + version only)', () => {
    const parsed = parseProvenanceTrailer(formatProvenanceTrailer({ skill: 'autopilot' }));
    expect(parsed).toEqual({ schemaVersion: 1, skill: 'autopilot', skillVersion: '0.0.0' });
  });

  it('returns null for an interactive / non-fleet commit (no Harness-Run key)', () => {
    const interactive = 'feat: do a thing\n\nClaude-Session: https://claude.ai/code/session_x';
    expect(parseProvenanceTrailer(interactive)).toBeNull();
  });

  it('returns null for an empty message', () => {
    expect(parseProvenanceTrailer('')).toBeNull();
  });

  it('finds the trailer when it coexists with other trailers', () => {
    const message = [
      'fix: patch something',
      '',
      'Co-authored-by: Someone <s@example.com>',
      'Harness-Run: bug-fleet@2.0.0',
      'Harness-Provenance-Version: 1',
      'Harness-Model: sonnet',
      'Claude-Session: https://claude.ai/code/session_y',
    ].join('\n');
    const parsed = parseProvenanceTrailer(message);
    expect(parsed).toMatchObject({ skill: 'bug-fleet', skillVersion: '2.0.0', model: 'sonnet' });
  });

  it('falls back to the current schema version when the version line is missing/garbage', () => {
    const parsed = parseProvenanceTrailer(
      'x\n\nHarness-Run: s@1.0.0\nHarness-Provenance-Version: NaN'
    );
    expect(parsed?.schemaVersion).toBe(PROVENANCE_TRAILER_VERSION);
  });
});

describe('appendProvenanceTrailer / hasProvenanceTrailer', () => {
  it('appends the block separated by a blank line and remains parseable', () => {
    const out = appendProvenanceTrailer('feat: add feature', full);
    expect(out.startsWith('feat: add feature\n\nHarness-Run:')).toBe(true);
    expect(parseProvenanceTrailer(out)).not.toBeNull();
  });

  it('is idempotent — a message that already has a Harness-Run trailer is unchanged', () => {
    const once = appendProvenanceTrailer('feat: add feature', full);
    const twice = appendProvenanceTrailer(once, full);
    expect(twice).toBe(once);
  });

  it('returns just the block when the base message is empty', () => {
    const out = appendProvenanceTrailer('', full);
    expect(out).toBe(formatProvenanceTrailer(full));
  });

  it('hasProvenanceTrailer detects presence/absence', () => {
    expect(hasProvenanceTrailer('feat: x')).toBe(false);
    expect(hasProvenanceTrailer(appendProvenanceTrailer('feat: x', full))).toBe(true);
  });
});
