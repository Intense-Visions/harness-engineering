import { describe, it, expect } from 'vitest';
import { OutputFormatter, OutputMode, parseConventionalMarkdown } from '../../src/output/formatter';

describe('OutputFormatter', () => {
  describe('json mode', () => {
    it('outputs valid JSON', () => {
      const formatter = new OutputFormatter(OutputMode.JSON);
      const data = { valid: true, issues: [] };
      const result = formatter.format(data);
      expect(JSON.parse(result)).toEqual(data);
    });
  });

  describe('text mode', () => {
    it('formats validation success', () => {
      const formatter = new OutputFormatter(OutputMode.TEXT);
      const data = { valid: true, issues: [] };
      const result = formatter.formatValidation(data);
      expect(result).toContain('valid');
    });

    it('formats validation failures with issues', () => {
      const formatter = new OutputFormatter(OutputMode.TEXT);
      const data = {
        valid: false,
        issues: [{ file: 'src/index.ts', message: 'Missing export' }],
      };
      const result = formatter.formatValidation(data);
      expect(result).toContain('src/index.ts');
      expect(result).toContain('Missing export');
    });
  });

  describe('quiet mode', () => {
    it('outputs nothing on success', () => {
      const formatter = new OutputFormatter(OutputMode.QUIET);
      const data = { valid: true, issues: [] };
      const result = formatter.formatValidation(data);
      expect(result).toBe('');
    });

    it('outputs only errors on failure', () => {
      const formatter = new OutputFormatter(OutputMode.QUIET);
      const data = {
        valid: false,
        issues: [{ file: 'test.ts', message: 'Error' }],
      };
      const result = formatter.formatValidation(data);
      expect(result).toContain('Error');
    });

    it('reports an abstention even though nothing failed', () => {
      // The dominant abstention case has `valid: true` (no findings), which used
      // to hit the QUIET early return and print nothing at all.
      const formatter = new OutputFormatter(OutputMode.QUIET);
      const result = formatter.formatValidation({
        valid: true,
        issues: [],
        unavailableChecks: [
          { check: 'roadmapHealth', file: 'docs/roadmap.md', reason: 'could not be parsed' },
        ],
      });
      expect(result).toContain('docs/roadmap.md');
      expect(result).toContain('could not be parsed');
    });
  });

  describe('unavailable checks', () => {
    const ABSTENTION = {
      check: 'roadmapHealth',
      file: 'docs/roadmap.md',
      reason: 'docs/roadmap.md could not be parsed, so no roadmap health rule ran: bad status',
      suggestion: 'Fix the reported section.',
    };

    it('renders "Validation incomplete" instead of a pass or fail verdict', () => {
      const formatter = new OutputFormatter(OutputMode.TEXT);
      const result = formatter.formatValidation({
        valid: true,
        issues: [],
        unavailableChecks: [ABSTENTION],
      });
      expect(result).toContain('Validation incomplete');
      expect(result).toContain('Checks that could not run');
      expect(result).toContain('roadmapHealth');
      expect(result).toContain('bad status');
      expect(result).not.toContain('validation passed');
    });

    it('shows both the incomplete headline and the failed findings when both apply', () => {
      const formatter = new OutputFormatter(OutputMode.TEXT);
      const result = formatter.formatValidation({
        valid: false,
        issues: [{ file: 'src/index.ts', message: 'Missing export' }],
        unavailableChecks: [ABSTENTION],
      });
      expect(result).toContain('Validation incomplete');
      expect(result).toContain('Validation failed (1 issues)');
      // An abstention must never swallow the findings from checks that did run.
      expect(result).toContain('Missing export');
    });

    it('does not call advisory findings a failure when nothing failed', () => {
      // Warnings never flip `valid`. Labelling them "Validation failed" just
      // because a check abstained reports a failure that did not happen.
      const formatter = new OutputFormatter(OutputMode.TEXT);
      const result = formatter.formatValidation({
        valid: true,
        issues: [{ file: 'docs/roadmap.md', message: 'is "planned" with no spec and no plan' }],
        unavailableChecks: [ABSTENTION],
      });
      expect(result).toContain('Validation incomplete');
      expect(result).toContain('advisory finding');
      expect(result).toContain('no spec and no plan');
      expect(result).not.toContain('Validation failed');
    });

    it('still signals failure when a failing check pushed no issue', () => {
      const formatter = new OutputFormatter(OutputMode.TEXT);
      const result = formatter.formatValidation({
        valid: false,
        issues: [],
        unavailableChecks: [ABSTENTION],
      });
      expect(result).toContain('Validation incomplete');
      expect(result).toContain('Validation failed');
    });

    it('distinguishes an abstention from a finding in quiet mode', () => {
      const formatter = new OutputFormatter(OutputMode.QUIET);
      const result = formatter.formatValidation({
        valid: false,
        issues: [{ file: 'src/index.ts', message: 'Missing export' }],
        unavailableChecks: [ABSTENTION],
      });
      const [first, second] = result.split('\n');
      expect(first).toMatch(/^\[unavailable\] /);
      expect(second).toBe('src/index.ts: Missing export');
    });

    it('shows the suggestion only in verbose mode', () => {
      const text = new OutputFormatter(OutputMode.TEXT).formatValidation({
        valid: true,
        issues: [],
        unavailableChecks: [ABSTENTION],
      });
      const verbose = new OutputFormatter(OutputMode.VERBOSE).formatValidation({
        valid: true,
        issues: [],
        unavailableChecks: [ABSTENTION],
      });
      expect(text).not.toContain('Fix the reported section.');
      expect(verbose).toContain('Fix the reported section.');
    });

    it('renders identically whether the list is empty or omitted', () => {
      const formatter = new OutputFormatter(OutputMode.TEXT);
      const omitted = formatter.formatValidation({ valid: true, issues: [] });
      const empty = formatter.formatValidation({ valid: true, issues: [], unavailableChecks: [] });
      expect(empty).toBe(omitted);

      const quiet = new OutputFormatter(OutputMode.QUIET);
      expect(quiet.formatValidation({ valid: true, issues: [], unavailableChecks: [] })).toBe(
        quiet.formatValidation({ valid: true, issues: [] })
      );
    });
  });
});

describe('parseConventionalMarkdown', () => {
  it('extracts CRITICAL finding', () => {
    const result = parseConventionalMarkdown('**[CRITICAL]** Missing auth check');
    expect(result).toEqual([{ type: 'CRITICAL', title: 'Missing auth check' }]);
  });

  it('extracts multiple findings', () => {
    const input = [
      '**[CRITICAL]** Bad thing',
      '**[STRENGTH]** Good thing',
      '**[SUGGESTION]** Maybe this',
    ].join('\n');
    const result = parseConventionalMarkdown(input);
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ type: 'CRITICAL', title: 'Bad thing' });
    expect(result[1]).toEqual({ type: 'STRENGTH', title: 'Good thing' });
    expect(result[2]).toEqual({ type: 'SUGGESTION', title: 'Maybe this' });
  });

  it('extracts Phase progress markers', () => {
    const result = parseConventionalMarkdown('**[Phase 3/7]** Context scoping');
    expect(result).toEqual([{ type: 'Phase 3/7', title: 'Context scoping' }]);
  });

  it('extracts FIXED markers', () => {
    const result = parseConventionalMarkdown('**[FIXED]** Added missing link');
    expect(result).toEqual([{ type: 'FIXED', title: 'Added missing link' }]);
  });

  it('extracts IMPORTANT markers', () => {
    const result = parseConventionalMarkdown('**[IMPORTANT]** Check error handling');
    expect(result).toEqual([{ type: 'IMPORTANT', title: 'Check error handling' }]);
  });

  it('returns empty array for no matches', () => {
    const result = parseConventionalMarkdown('Just some regular text');
    expect(result).toEqual([]);
  });

  it('ignores non-matching bold text', () => {
    const result = parseConventionalMarkdown('**bold** not a marker');
    expect(result).toEqual([]);
  });
});
