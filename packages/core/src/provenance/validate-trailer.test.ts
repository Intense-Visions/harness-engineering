import { describe, it, expect } from 'vitest';
import {
  PROVENANCE_TRAILER_VERSION,
  collectProvenanceTrailerEntries,
  formatProvenanceTrailer,
  parseProvenanceTrailer,
} from './commit-trailer';
import { validateProvenanceTrailer } from './validate-trailer';

/** A commit message carrying the trailer the emitter actually produces. */
function emitted(): string {
  return `feat: something\n\n${formatProvenanceTrailer({
    skill: 'roadmap-fleet',
    skillVersion: '5.12.0',
    runId: 'run_abc',
    lane: 'build',
  })}`;
}

/** Issue codes reported for a message, for concise assertions. */
function issueCodes(message: string): string[] {
  return validateProvenanceTrailer(message).issues.map((i) => i.code);
}

describe('collectProvenanceTrailerEntries', () => {
  it('returns every Harness-* line in document order, duplicates included', () => {
    const message = [
      'fix: thing',
      '',
      'Harness-Run: a@1.0.0',
      'Co-authored-by: Someone <s@example.com>',
      'Harness-Provenance-Version: 1',
      'Harness-Run: b@2.0.0',
    ].join('\n');

    expect(collectProvenanceTrailerEntries(message)).toEqual([
      ['Harness-Run', 'a@1.0.0'],
      ['Harness-Provenance-Version', '1'],
      ['Harness-Run', 'b@2.0.0'],
    ]);
  });

  it('is the same grammar the parser uses — the parser keeps the LAST duplicate', () => {
    const message = 'Harness-Run: a@1.0.0\nHarness-Provenance-Version: 1\nHarness-Run: b@2.0.0';
    expect(parseProvenanceTrailer(message)?.skill).toBe('b');
  });
});

describe('validateProvenanceTrailer — presence is not shape', () => {
  it('reports a message with no Harness-Run key as absent, never malformed', () => {
    const result = validateProvenanceTrailer('chore: a perfectly ordinary human commit');
    expect(result.status).toBe('absent');
    expect(result.trailer).toBeNull();
    expect(result.issues).toEqual([]);
  });

  it('reports a message carrying only OTHER trailers as absent', () => {
    const message = 'fix: x\n\nClaude-Session: https://claude.ai/code/session_1';
    expect(validateProvenanceTrailer(message).status).toBe('absent');
  });
});

describe('validateProvenanceTrailer — well-formed input', () => {
  it('accepts the trailer the emitter produces', () => {
    const result = validateProvenanceTrailer(emitted());
    expect(result.status).toBe('valid');
    expect(result.issues).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.trailer?.skill).toBe('roadmap-fleet');
  });

  it('accepts a trailer surrounded by unrelated trailers', () => {
    const message = `${emitted()}\nCo-authored-by: Someone <s@example.com>`;
    expect(validateProvenanceTrailer(message).status).toBe('valid');
  });
});

describe('validateProvenanceTrailer — malformed input', () => {
  it('catches a duplicated key that the parser Map hides', () => {
    const message = 'Harness-Run: a@1.0.0\nHarness-Provenance-Version: 1\nHarness-Run: b@2.0.0';
    const result = validateProvenanceTrailer(message);
    expect(result.status).toBe('malformed');
    expect(result.issues.map((i) => i.code)).toContain('duplicate-key');
    // The lenient parser sees nothing wrong here — that is the gap this closes.
    expect(parseProvenanceTrailer(message)).not.toBeNull();
  });

  it('catches an absent schema version that the parser silently defaults', () => {
    expect(issueCodes('Harness-Run: a@1.0.0')).toEqual(['missing-version']);
    expect(parseProvenanceTrailer('Harness-Run: a@1.0.0')?.schemaVersion).toBe(
      PROVENANCE_TRAILER_VERSION
    );
  });

  it('catches a non-integer schema version', () => {
    expect(issueCodes('Harness-Run: a@1.0.0\nHarness-Provenance-Version: one')).toEqual([
      'invalid-version',
    ]);
  });

  it('catches a schema version outside the known range', () => {
    const future = PROVENANCE_TRAILER_VERSION + 1;
    expect(issueCodes(`Harness-Run: a@1.0.0\nHarness-Provenance-Version: ${future}`)).toEqual([
      'unknown-version',
    ]);
    expect(issueCodes('Harness-Run: a@1.0.0\nHarness-Provenance-Version: 0')).toEqual([
      'unknown-version',
    ]);
  });

  it('catches an empty skill name', () => {
    expect(issueCodes('Harness-Run: @1.0.0\nHarness-Provenance-Version: 1')).toEqual([
      'empty-skill',
    ]);
  });

  it('catches a Harness-Run value with no @ separator', () => {
    expect(issueCodes('Harness-Run: roadmap-fleet\nHarness-Provenance-Version: 1')).toEqual([
      'missing-skill-version',
    ]);
  });

  it('catches a Harness-Run value with nothing after the @', () => {
    expect(issueCodes('Harness-Run: roadmap-fleet@\nHarness-Provenance-Version: 1')).toEqual([
      'missing-skill-version',
    ]);
  });

  it('reports every issue it finds, not just the first', () => {
    const codes = issueCodes('Harness-Run: @\nHarness-Run: @');
    expect(codes).toContain('duplicate-key');
    expect(codes).toContain('missing-version');
    expect(codes).toContain('empty-skill');
    expect(codes).toContain('missing-skill-version');
  });
});

describe('validateProvenanceTrailer — advisory warnings', () => {
  it('warns about an ungoverned Harness-* key without failing', () => {
    const result = validateProvenanceTrailer(`${emitted()}\nHarness-Future-Field: value`);
    expect(result.status).toBe('valid');
    expect(result.warnings.map((w) => w.code)).toEqual(['unknown-key']);
  });

  it('warns about a governed key present with an empty value without failing', () => {
    const result = validateProvenanceTrailer(`${emitted()}\nHarness-Model:`);
    expect(result.status).toBe('valid');
    expect(result.warnings.map((w) => w.code)).toEqual(['empty-value']);
  });
});
