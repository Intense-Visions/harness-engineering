import { describe, it, expect } from 'vitest';
import { createPredictCommand } from '../../src/commands/predict';

describe('predict command', () => {
  describe('createPredictCommand', () => {
    it('creates command with correct name', () => {
      const cmd = createPredictCommand();
      expect(cmd.name()).toBe('predict');
    });

    it('has --category option', () => {
      const cmd = createPredictCommand();
      const opts = cmd.options.map((o) => o.long);
      expect(opts).toContain('--category');
    });

    it('has --no-roadmap option', () => {
      const cmd = createPredictCommand();
      const opts = cmd.options.map((o) => o.long);
      expect(opts).toContain('--no-roadmap');
    });

    it('has --horizon option', () => {
      const cmd = createPredictCommand();
      const opts = cmd.options.map((o) => o.long);
      expect(opts).toContain('--horizon');
    });

    it('has description', () => {
      const cmd = createPredictCommand();
      expect(cmd.description()).toContain('Predict');
    });
  });
});
