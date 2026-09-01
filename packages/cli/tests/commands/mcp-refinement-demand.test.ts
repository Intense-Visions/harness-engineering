import { describe, it, expect } from 'vitest';
import type { RefinementDemandReport } from '@harness-engineering/core';
import { formatRefinementDemand, createMcpRefinementDemandCommand } from '../../src/commands/mcp';

const report: RefinementDemandReport = {
  total: 4,
  byClass: [
    { contextClass: 'file-content', count: 3, frequency: 0.75 },
    { contextClass: 'knowledge', count: 1, frequency: 0.25 },
    { contextClass: 'history', count: 0, frequency: 0 },
    { contextClass: 'telemetry', count: 0, frequency: 0 },
  ],
};

describe('formatRefinementDemand', () => {
  it('lists every class with count and frequency, ranked, plus a total line', () => {
    const out = formatRefinementDemand(report);
    expect(out).toContain('file-content');
    expect(out).toContain('history');
    expect(out).toContain('telemetry');
    expect(out).toContain('knowledge');
    expect(out).toContain('3');
    expect(out).toContain('0.75');
    expect(out).toContain('Total: 4');
  });

  it('renders zero-count classes at the bottom of the ranking', () => {
    const out = formatRefinementDemand(report);
    const idxFileContent = out.indexOf('file-content');
    const idxHistory = out.indexOf('history');
    const idxTelemetry = out.indexOf('telemetry');
    expect(idxFileContent).toBeLessThan(idxHistory);
    expect(idxFileContent).toBeLessThan(idxTelemetry);
  });

  it('handles an all-zero report gracefully', () => {
    const empty: RefinementDemandReport = {
      total: 0,
      byClass: [
        { contextClass: 'file-content', count: 0, frequency: 0 },
        { contextClass: 'history', count: 0, frequency: 0 },
        { contextClass: 'telemetry', count: 0, frequency: 0 },
        { contextClass: 'knowledge', count: 0, frequency: 0 },
      ],
    };
    const out = formatRefinementDemand(empty);
    expect(out).toContain('Total: 0');
  });
});

describe('createMcpRefinementDemandCommand', () => {
  it('builds a refinement-demand command with a --json option', () => {
    const cmd = createMcpRefinementDemandCommand();
    expect(cmd.name()).toBe('refinement-demand');
    const hasJson = cmd.options.some((o) => o.long === '--json');
    expect(hasJson).toBe(true);
  });
});
