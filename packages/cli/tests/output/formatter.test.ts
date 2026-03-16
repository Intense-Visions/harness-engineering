import { describe, it, expect } from 'vitest';
import { OutputFormatter, OutputMode } from '../../src/output/formatter';

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
