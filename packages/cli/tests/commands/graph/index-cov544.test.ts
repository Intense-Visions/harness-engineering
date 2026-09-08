import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { Command } from 'commander';

const runGraphStatus = vi.fn();
const runGraphExport = vi.fn();
const runGraphIntegrity = vi.fn();
const printGraphIntegrity = vi.fn();

vi.mock('../../../src/commands/graph/status.js', () => ({
  runGraphStatus: (...a: unknown[]) => runGraphStatus(...a),
}));
vi.mock('../../../src/commands/graph/export.js', () => ({
  runGraphExport: (...a: unknown[]) => runGraphExport(...a),
}));
vi.mock('../../../src/commands/graph/integrity.js', () => ({
  runGraphIntegrity: (...a: unknown[]) => runGraphIntegrity(...a),
  printGraphIntegrity: (...a: unknown[]) => printGraphIntegrity(...a),
}));

import { createGraphCommand } from '../../../src/commands/graph/index';

let logOutput: string[];
let errOutput: string[];
let exitCode: number | undefined;

const logSpy = vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => {
  logOutput.push(a.map(String).join(' '));
});
const errSpy = vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => {
  errOutput.push(a.map(String).join(' '));
});
const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
  exitCode = code;
  throw new Error('exit:' + code);
}) as never);

function run(args: string[]): Promise<unknown> {
  const parent = new Command();
  parent.option('--json').option('--config <path>');
  parent.addCommand(createGraphCommand());
  parent.exitOverride();
  return parent.parseAsync(['graph', ...args], { from: 'user' });
}

beforeEach(() => {
  vi.clearAllMocks();
  logOutput = [];
  errOutput = [];
  exitCode = undefined;
});

afterAll(() => {
  logSpy.mockRestore();
  errSpy.mockRestore();
  exitSpy.mockRestore();
});

describe('graph status action (cov544)', () => {
  it('no_graph prints message and returns (no exit)', async () => {
    runGraphStatus.mockResolvedValue({ status: 'no_graph', message: 'No graph found' });
    await run(['status']);
    expect(logOutput.join('\n')).toContain('No graph found');
  });

  it('schema_mismatch prints message', async () => {
    runGraphStatus.mockResolvedValue({ status: 'schema_mismatch', message: 'schema drift' });
    await run(['status']);
    expect(logOutput.join('\n')).toContain('schema drift');
  });

  it('ok status renders counts, nodesByType and connectorSyncStatus', async () => {
    runGraphStatus.mockResolvedValue({
      status: 'ok',
      nodeCount: 5,
      edgeCount: 3,
      lastScanTimestamp: '2026-01-01',
      nodesByType: { file: 2, function: 3 },
      connectorSyncStatus: { github: '2026-01-01' },
    });
    await run(['status']);
    const out = logOutput.join('\n');
    expect(out).toContain('5 nodes, 3 edges');
    expect(out).toContain('Nodes by type:');
    expect(out).toContain('file: 2');
    expect(out).toContain('Connector sync status:');
    expect(out).toContain('github: last synced');
  });

  it('ok status without nodesByType/connectorSyncStatus takes the short branches', async () => {
    runGraphStatus.mockResolvedValue({
      status: 'ok',
      nodeCount: 1,
      edgeCount: 0,
      lastScanTimestamp: 't',
    });
    await run(['status']);
    const out = logOutput.join('\n');
    expect(out).toContain('1 nodes, 0 edges');
    expect(out).not.toContain('Nodes by type:');
    expect(out).not.toContain('Connector sync status:');
  });

  it('json mode prints stringified result', async () => {
    runGraphStatus.mockResolvedValue({ status: 'ok', nodeCount: 1, edgeCount: 0 });
    await run(['--json', 'status']);
    expect(JSON.parse(logOutput[0]).nodeCount).toBe(1);
  });

  it('catch path prints error and exits 2', async () => {
    runGraphStatus.mockRejectedValue(new Error('kaput'));
    await expect(run(['status'])).rejects.toThrow('exit:2');
    expect(exitCode).toBe(2);
    expect(errOutput.join('\n')).toContain('kaput');
  });

  it('catch path stringifies non-Error rejections', async () => {
    runGraphStatus.mockRejectedValue('weird');
    await expect(run(['status'])).rejects.toThrow('exit:2');
    expect(errOutput.join('\n')).toContain('weird');
  });
});

describe('graph integrity action (cov544)', () => {
  it('checkedNothing exits ZERO_DENOMINATOR (3)', async () => {
    runGraphIntegrity.mockResolvedValue({ report: { findings: [], checkedNothing: true } });
    await expect(run(['integrity'])).rejects.toThrow('exit:3');
    expect(exitCode).toBe(3);
    expect(printGraphIntegrity).toHaveBeenCalled();
  });

  it('no report exits ZERO_DENOMINATOR (3)', async () => {
    runGraphIntegrity.mockResolvedValue({ report: undefined });
    await expect(run(['integrity'])).rejects.toThrow('exit:3');
    expect(exitCode).toBe(3);
  });

  it('error findings without --report-only exit VALIDATION_FAILED (1)', async () => {
    runGraphIntegrity.mockResolvedValue({
      report: { findings: [{ severity: 'error' }], checkedNothing: false },
    });
    await expect(run(['integrity'])).rejects.toThrow('exit:1');
    expect(exitCode).toBe(1);
  });

  it('error findings WITH --report-only do not exit non-zero', async () => {
    runGraphIntegrity.mockResolvedValue({
      report: { findings: [{ severity: 'error' }], checkedNothing: false },
    });
    await run(['integrity', '--report-only']);
    expect(exitCode).toBeUndefined();
  });

  it('clean report (no error findings) does not exit', async () => {
    runGraphIntegrity.mockResolvedValue({
      report: { findings: [{ severity: 'warning' }], checkedNothing: false },
    });
    await run(['integrity']);
    expect(exitCode).toBeUndefined();
  });

  it('json mode stringifies result', async () => {
    runGraphIntegrity.mockResolvedValue({
      report: { findings: [{ severity: 'warning' }], checkedNothing: false },
    });
    await run(['--json', 'integrity']);
    expect(logOutput.join('\n')).toContain('findings');
    expect(printGraphIntegrity).not.toHaveBeenCalled();
  });

  it('--findings-json prints the findings contract line', async () => {
    runGraphIntegrity.mockResolvedValue({
      report: { findings: [{ severity: 'warning' }], checkedNothing: false },
    });
    await run(['integrity', '--findings-json']);
    expect(logOutput.join('\n')).toContain('graph-integrity');
  });

  it('catch path exits ERROR (2)', async () => {
    runGraphIntegrity.mockRejectedValue(new Error('boom'));
    await expect(run(['integrity'])).rejects.toThrow('exit:2');
    expect(exitCode).toBe(2);
    expect(errOutput.join('\n')).toContain('boom');
  });
});

describe('graph export action (cov544)', () => {
  it('prints exported output', async () => {
    runGraphExport.mockResolvedValue('graph TD');
    await run(['export', '--format', 'mermaid']);
    expect(logOutput.join('\n')).toContain('graph TD');
  });

  it('catch path prints error and exits 2', async () => {
    runGraphExport.mockRejectedValue(new Error('nope'));
    await expect(run(['export', '--format', 'json'])).rejects.toThrow('exit:2');
    expect(exitCode).toBe(2);
    expect(errOutput.join('\n')).toContain('nope');
  });

  it('catch path stringifies non-Error rejection', async () => {
    runGraphExport.mockRejectedValue('str');
    await expect(run(['export', '--format', 'json'])).rejects.toThrow('exit:2');
    expect(errOutput.join('\n')).toContain('str');
  });
});
