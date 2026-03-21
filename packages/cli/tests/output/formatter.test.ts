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
