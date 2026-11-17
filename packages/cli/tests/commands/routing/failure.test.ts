import { describe, it, expect, vi, afterEach } from 'vitest';
import { failRoutingCall, routingFailureMessage } from '../../../src/commands/routing/failure';
import { logger } from '../../../src/output/logger';

describe('routing failure helpers (#2673)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env['HARNESS_ORCHESTRATOR_URL'];
  });

  it('routingFailureMessage maps status 0 to an unreachable message (with fallback text)', () => {
    process.env['HARNESS_ORCHESTRATOR_URL'] = 'http://x:1';
    expect(routingFailureMessage({ status: 0, error: 'boom' })).toBe(
      'Failed to reach orchestrator at http://x:1: boom'
    );
    expect(routingFailureMessage({ status: 0 })).toContain('unknown error');
  });

  it('routingFailureMessage maps 503 only when asked, else a labelled generic failure', () => {
    expect(routingFailureMessage({ status: 503 }, { unavailableOn503: true })).toContain(
      'Routing observability not available'
    );
    expect(routingFailureMessage({ status: 503, error: 'down' })).toBe(
      'Request failed (503): down'
    );
    expect(routingFailureMessage({ status: 500 }, { failedLabel: 'Trace failed' })).toBe(
      'Trace failed (500): '
    );
  });

  function capture(json: boolean | undefined) {
    const out: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((s: unknown) => {
      out.push(String(s));
    });
    const err = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    failRoutingCall('nope', 0, json);
    return { out, err, exit };
  }

  it('failRoutingCall under --json emits { error, status } on stdout, logs, and exits 2', () => {
    const { out, err, exit } = capture(true);
    expect(JSON.parse(out.join(''))).toEqual({ error: 'nope', status: 0 });
    expect(err).toHaveBeenCalledWith('nope');
    expect(exit).toHaveBeenCalledWith(2);
  });

  it('failRoutingCall without --json keeps stdout empty', () => {
    const { out, err, exit } = capture(undefined);
    expect(out).toEqual([]);
    expect(err).toHaveBeenCalledWith('nope');
    expect(exit).toHaveBeenCalledWith(2);
  });
});
