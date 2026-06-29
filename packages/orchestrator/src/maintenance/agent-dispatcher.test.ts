import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAgentDispatcher } from './agent-dispatcher';
import { MockBackend } from '../agent/backends/mock';

const logger = { info: vi.fn(), warn: vi.fn() };

beforeEach(() => vi.clearAllMocks());

describe('createAgentDispatcher', () => {
  it('no-ops (and never touches git) when the backend name is unknown', async () => {
    const git = vi.fn();
    const dispatcher = createAgentDispatcher({ resolveBackend: () => null, git, logger });

    const result = await dispatcher.dispatch('harness-arch-fix', 'main', 'missing', '/repo');

    expect(result).toEqual({ producedCommits: false, fixed: 0 });
    expect(git).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('unknown backend "missing"'),
      expect.objectContaining({ skill: 'harness-arch-fix' })
    );
  });

  it('reports the commit count when HEAD advances during the session', async () => {
    const revParse = ['sha-before', 'sha-after'];
    const git = vi.fn((args: string[]) => {
      if (args[0] === 'rev-parse') return revParse.shift()!;
      if (args[0] === 'rev-list') return '3';
      return '';
    });
    const dispatcher = createAgentDispatcher({
      resolveBackend: () => new MockBackend(),
      git,
      logger,
    });

    const result = await dispatcher.dispatch('harness-arch-fix', 'fix/x', 'mock', '/repo');

    expect(result).toEqual({ producedCommits: true, fixed: 3 });
    expect(git).toHaveBeenCalledWith(['rev-parse', 'HEAD'], '/repo');
    expect(git).toHaveBeenCalledWith(['rev-list', '--count', 'sha-before..sha-after'], '/repo');
  });

  it('reports no commits when HEAD is unchanged', async () => {
    const git = vi.fn(() => 'sha-same'); // rev-parse returns the same sha both times
    const dispatcher = createAgentDispatcher({
      resolveBackend: () => new MockBackend(),
      git,
      logger,
    });

    const result = await dispatcher.dispatch('skill', 'b', 'mock', '/repo');

    expect(result).toEqual({ producedCommits: false, fixed: 0 });
    // rev-list is never needed when HEAD did not move.
    expect(git).not.toHaveBeenCalledWith(expect.arrayContaining(['rev-list']), expect.anything());
  });

  it('counts the first commit when the repo had no prior HEAD', async () => {
    let call = 0;
    const git = vi.fn((args: string[]) => {
      if (args[0] === 'rev-parse') {
        call += 1;
        if (call === 1) throw new Error('fatal: no HEAD yet'); // empty repo before
        return 'sha-new'; // a commit exists after
      }
      return '';
    });
    const dispatcher = createAgentDispatcher({
      resolveBackend: () => new MockBackend(),
      git,
      logger,
    });

    const result = await dispatcher.dispatch('skill', 'b', 'mock', '/repo');

    expect(result).toEqual({ producedCommits: true, fixed: 1 });
  });
});
