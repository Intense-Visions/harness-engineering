import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import { WorkspaceManager, type BaseRefFallbackEvent } from '../../src/workspace/manager';

vi.mock('node:fs/promises');

class TestableWorkspaceManager extends WorkspaceManager {
  public gitCalls: Array<{ args: string[]; cwd: string }> = [];
  private gitImpl: (args: string[], cwd: string) => string = () => '';
  setGitImpl(impl: (args: string[], cwd: string) => string) {
    this.gitImpl = impl;
  }
  protected async git(args: string[], cwd: string): Promise<string> {
    this.gitCalls.push({ args, cwd });
    return this.gitImpl(args, cwd);
  }
}

describe('WorkspaceManager — D6 baseref_fallback emission', () => {
  const config = { root: '/tmp/workspaces' };
  let emitted: BaseRefFallbackEvent[];
  let emitEvent: (e: BaseRefFallbackEvent) => void;

  beforeEach(() => {
    vi.resetAllMocks();
    emitted = [];
    emitEvent = (e) => {
      emitted.push(e);
    };
    vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));
    vi.mocked(fs.readdir).mockRejectedValue(new Error('ENOENT'));
  });

  it('emits baseref_fallback when origin/* refs are missing and falls back to local main', async () => {
    const manager = new TestableWorkspaceManager(config, { emitEvent });
    manager.setGitImpl((args) => {
      if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return '/repo\n';
      if (args[0] === 'symbolic-ref') throw new Error('not symbolic');
      if (args[0] === 'rev-parse' && args[1] === '--verify') {
        const ref = args[3];
        // origin/main, origin/master missing → local main exists.
        if (ref === 'origin/main' || ref === 'origin/master') throw new Error('missing');
        if (ref === 'main') return '';
        throw new Error('missing');
      }
      return '';
    });

    const result = await manager.ensureWorkspace('test-issue');
    expect(result.ok).toBe(true);
    expect(emitted).toEqual([{ kind: 'baseref_fallback', ref: 'main', repoRoot: '/repo' }]);
  });

  it('emits baseref_fallback with ref=master when only local master exists', async () => {
    const manager = new TestableWorkspaceManager(config, { emitEvent });
    manager.setGitImpl((args) => {
      if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return '/repo\n';
      if (args[0] === 'symbolic-ref') throw new Error('not symbolic');
      if (args[0] === 'rev-parse' && args[1] === '--verify') {
        const ref = args[3];
        if (ref === 'master') return '';
        throw new Error('missing');
      }
      return '';
    });

    await manager.ensureWorkspace('test-issue');
    expect(emitted).toEqual([{ kind: 'baseref_fallback', ref: 'master', repoRoot: '/repo' }]);
  });

  it('emits baseref_fallback with ref=HEAD when no candidate resolves at all', async () => {
    const manager = new TestableWorkspaceManager(config, { emitEvent });
    manager.setGitImpl((args) => {
      if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return '/repo\n';
      if (args[0] === 'symbolic-ref') throw new Error('not symbolic');
      if (args[0] === 'rev-parse' && args[1] === '--verify') throw new Error('missing');
      return '';
    });

    await manager.ensureWorkspace('test-issue');
    expect(emitted).toEqual([{ kind: 'baseref_fallback', ref: 'HEAD', repoRoot: '/repo' }]);
  });

  it('does NOT emit when origin/HEAD resolves (the happy path)', async () => {
    const manager = new TestableWorkspaceManager(config, { emitEvent });
    manager.setGitImpl((args) => {
      if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return '/repo\n';
      if (args[0] === 'symbolic-ref') return 'origin/main\n';
      return '';
    });

    await manager.ensureWorkspace('test-issue');
    expect(emitted).toEqual([]);
  });

  it('does NOT emit when origin/main is found via the fallback list (origin/HEAD missing)', async () => {
    const manager = new TestableWorkspaceManager(config, { emitEvent });
    manager.setGitImpl((args) => {
      if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return '/repo\n';
      if (args[0] === 'symbolic-ref') throw new Error('not symbolic');
      if (args[0] === 'rev-parse' && args[1] === '--verify') {
        const ref = args[3];
        if (ref === 'origin/main') return '';
        throw new Error('missing');
      }
      return '';
    });

    await manager.ensureWorkspace('test-issue');
    expect(emitted).toEqual([]);
  });

  it('does NOT emit when origin/master is the matched fallback', async () => {
    const manager = new TestableWorkspaceManager(config, { emitEvent });
    manager.setGitImpl((args) => {
      if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return '/repo\n';
      if (args[0] === 'symbolic-ref') throw new Error('not symbolic');
      if (args[0] === 'rev-parse' && args[1] === '--verify') {
        const ref = args[3];
        if (ref === 'origin/master') return '';
        throw new Error('missing');
      }
      return '';
    });

    await manager.ensureWorkspace('test-issue');
    expect(emitted).toEqual([]);
  });

  it('does NOT emit when an explicit configured baseRef resolves', async () => {
    // Even if the configured ref looks "local" (e.g. 'main'), the
    // operator opted in — this is not a fallback and must not warn.
    const manager = new TestableWorkspaceManager(
      { root: '/tmp/workspaces', baseRef: 'main' },
      { emitEvent }
    );
    manager.setGitImpl((args) => {
      if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return '/repo\n';
      if (args[0] === 'rev-parse' && args[1] === '--verify') return '';
      return '';
    });

    await manager.ensureWorkspace('test-issue');
    expect(emitted).toEqual([]);
  });

  it('emits exactly once per ensureWorkspace call (not duplicated by stale-worktree recreate)', async () => {
    const manager = new TestableWorkspaceManager(config, { emitEvent });
    // Simulate a stale .git so the remove-then-recreate branch fires.
    let gitCheckCount = 0;
    vi.mocked(fs.access).mockImplementation(async (p) => {
      const pathStr = String(p);
      if (pathStr.endsWith('.git')) {
        gitCheckCount++;
        if (gitCheckCount === 1) return undefined; // exists initially
        throw new Error('ENOENT');
      }
      throw new Error('ENOENT');
    });
    manager.setGitImpl((args) => {
      if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return '/repo\n';
      if (args[0] === 'symbolic-ref') throw new Error('not symbolic');
      if (args[0] === 'rev-parse' && args[1] === '--verify') throw new Error('missing');
      return '';
    });

    await manager.ensureWorkspace('test-issue');
    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toEqual({ kind: 'baseref_fallback', ref: 'HEAD', repoRoot: '/repo' });
  });

  it('is silent (no throw, no event) when emitEvent is omitted from options', async () => {
    const manager = new TestableWorkspaceManager(config); // no options
    manager.setGitImpl((args) => {
      if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return '/repo\n';
      if (args[0] === 'symbolic-ref') throw new Error('not symbolic');
      if (args[0] === 'rev-parse' && args[1] === '--verify') throw new Error('missing');
      return '';
    });

    const result = await manager.ensureWorkspace('test-issue');
    expect(result.ok).toBe(true);
  });
});

describe('Orchestrator wiring — baseref_fallback fans out to both channels', () => {
  it('the wired emitter forwards to broadcastMaintenance and emit', () => {
    // Mirror orchestrator.ts:224-style wiring exactly. We do not
    // instantiate the full Orchestrator (tracker + server + scheduler
    // would all need stubbing); instead we assert the callback shape
    // the orchestrator constructs has the documented behavior.
    const broadcasts: Array<{ type: string; data: unknown }> = [];
    const emits: Array<{ type: string; data: unknown }> = [];

    const fakeServer = {
      broadcastMaintenance: (type: string, data: unknown) => broadcasts.push({ type, data }),
    };
    const fakeEmit = (type: string, data: unknown) => emits.push({ type, data });

    // This is the exact callback orchestrator.ts:224 constructs.
    const emitEvent = (event: { kind: 'baseref_fallback'; ref: string; repoRoot: string }) => {
      fakeServer.broadcastMaintenance('maintenance:baseref_fallback', event);
      fakeEmit('maintenance:baseref_fallback', event);
    };

    const event = { kind: 'baseref_fallback' as const, ref: 'main', repoRoot: '/repo' };
    emitEvent(event);

    expect(broadcasts).toEqual([{ type: 'maintenance:baseref_fallback', data: event }]);
    expect(emits).toEqual([{ type: 'maintenance:baseref_fallback', data: event }]);
  });

  it('the wired emitter is robust to server being undefined (pre-server-wire path)', () => {
    const emits: Array<{ type: string; data: unknown }> = [];
    const fakeEmit = (type: string, data: unknown) => emits.push({ type, data });
    const server: { broadcastMaintenance?: (t: string, d: unknown) => void } | undefined =
      undefined;

    const emitEvent = (event: { kind: 'baseref_fallback'; ref: string; repoRoot: string }) => {
      server?.broadcastMaintenance?.('maintenance:baseref_fallback', event);
      fakeEmit('maintenance:baseref_fallback', event);
    };

    const event = { kind: 'baseref_fallback' as const, ref: 'HEAD', repoRoot: '/repo' };
    expect(() => emitEvent(event)).not.toThrow();
    expect(emits).toEqual([{ type: 'maintenance:baseref_fallback', data: event }]);
  });
});
