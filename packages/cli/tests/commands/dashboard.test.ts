import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';

const mockSpawn = vi.fn();
vi.mock('node:child_process', () => ({
  spawn: (...args: unknown[]) => mockSpawn(...args),
}));

vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => false),
}));

vi.mock('node:timers', () => ({
  setTimeout: vi.fn((_cb: () => void, _ms: number) => {}),
}));

import { existsSync } from 'node:fs';
import { setTimeout as mockedSetTimeout } from 'node:timers';
import { createDashboardCommand } from '../../src/commands/dashboard';

const mockedExistsSync = vi.mocked(existsSync);

function createMockChild() {
  const handlers: Record<string, (...args: unknown[]) => void> = {};
  return {
    on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
      handlers[event] = cb;
    }),
    unref: vi.fn(),
    _handlers: handlers,
  };
}

function createProgram(): Command {
  const program = new Command();
  program.exitOverride();
  program.addCommand(createDashboardCommand());
  return program;
}

describe('createDashboardCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSpawn.mockReturnValue(createMockChild());
  });

  it('creates a command named "dashboard"', () => {
    const cmd = createDashboardCommand();
    expect(cmd.name()).toBe('dashboard');
  });

  it('has a description', () => {
    const cmd = createDashboardCommand();
    expect(cmd.description()).toContain('dashboard');
  });

  it('has --port option with default 3700', () => {
    const cmd = createDashboardCommand();
    const portOpt = cmd.options.find((o) => o.long === '--port');
    expect(portOpt).toBeDefined();
    expect(portOpt?.defaultValue).toBe('3700');
  });

  it('has --api-port option with default 3701', () => {
    const cmd = createDashboardCommand();
    const apiPortOpt = cmd.options.find((o) => o.long === '--api-port');
    expect(apiPortOpt).toBeDefined();
    expect(apiPortOpt?.defaultValue).toBe('3701');
  });

  it('has --no-open option', () => {
    const cmd = createDashboardCommand();
    const noOpenOpt = cmd.options.find((o) => o.long === '--no-open');
    expect(noOpenOpt).toBeDefined();
  });

  it('has --cwd option', () => {
    const cmd = createDashboardCommand();
    const cwdOpt = cmd.options.find((o) => o.long === '--cwd');
    expect(cwdOpt).toBeDefined();
  });
});

describe('dashboard action', () => {
  const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
    throw new Error('process.exit');
  });
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

  beforeEach(() => {
    vi.clearAllMocks();
    mockSpawn.mockReturnValue(createMockChild());
  });

  afterEach(() => {
    errorSpy.mockClear();
    logSpy.mockClear();
  });

  it('exits when server script cannot be resolved', async () => {
    // All existsSync calls return false (no server found)
    mockedExistsSync.mockReturnValue(false);

    const program = createProgram();
    await expect(program.parseAsync(['node', 'test', 'dashboard', '--no-open'])).rejects.toThrow(
      'process.exit'
    );

    expect(mockExit).toHaveBeenCalledWith(1);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Could not locate the dashboard server')
    );
  });

  it('spawns node for built server script', async () => {
    // Make the require.resolve path fail but a built fallback path succeed
    let callCount = 0;
    mockedExistsSync.mockImplementation((_p) => {
      callCount++;
      // Return true on a specific fallback call (the first built fallback)
      return callCount === 1;
    });

    const program = createProgram();
    await program.parseAsync(['node', 'test', 'dashboard', '--no-open']);

    expect(mockSpawn).toHaveBeenCalledWith(
      'node',
      expect.arrayContaining([expect.stringContaining('serve.js')]),
      expect.objectContaining({ env: expect.any(Object) })
    );
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Dashboard API starting'));
  });

  it('sets up browser open with setTimeout when --open (default)', async () => {
    let callCount = 0;
    mockedExistsSync.mockImplementation(() => {
      callCount++;
      return callCount === 1;
    });

    const program = createProgram();
    await program.parseAsync(['node', 'test', 'dashboard']);

    expect(vi.mocked(mockedSetTimeout)).toHaveBeenCalledWith(expect.any(Function), 1_500);
  });

  it('passes --no-open through to the action', async () => {
    let callCount = 0;
    mockedExistsSync.mockImplementation(() => {
      callCount++;
      return callCount === 1;
    });

    const program = createProgram();
    await program.parseAsync(['node', 'test', 'dashboard', '--no-open']);

    // Commander maps --no-open to opts.open = false.
    // The action runs through regardless. We just verify it doesn't crash.
    expect(mockSpawn).toHaveBeenCalled();
  });

  it('passes custom ports to environment', async () => {
    let callCount = 0;
    mockedExistsSync.mockImplementation(() => {
      callCount++;
      return callCount === 1;
    });

    const program = createProgram();
    await program.parseAsync([
      'node',
      'test',
      'dashboard',
      '--port',
      '4000',
      '--api-port',
      '4001',
      '--no-open',
    ]);

    const spawnCall = mockSpawn.mock.calls[0];
    const env = spawnCall[2].env;
    expect(env.DASHBOARD_API_PORT).toBe('4001');
    expect(env.DASHBOARD_CLIENT_PORT).toBe('4000');
  });

  it('handles child process error event', async () => {
    const child = createMockChild();
    mockSpawn.mockReturnValue(child);
    let callCount = 0;
    mockedExistsSync.mockImplementation(() => {
      callCount++;
      return callCount === 1;
    });

    const program = createProgram();
    await program.parseAsync(['node', 'test', 'dashboard', '--no-open']);

    // Trigger the error handler
    expect(() => {
      child._handlers['error']?.(new Error('spawn failed'));
    }).toThrow('process.exit');

    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('handles child process non-zero exit', async () => {
    const child = createMockChild();
    mockSpawn.mockReturnValue(child);
    let callCount = 0;
    mockedExistsSync.mockImplementation(() => {
      callCount++;
      return callCount === 1;
    });

    const program = createProgram();
    await program.parseAsync(['node', 'test', 'dashboard', '--no-open']);

    // Trigger the exit handler with non-zero code
    expect(() => {
      child._handlers['exit']?.(1);
    }).toThrow('process.exit');

    expect(mockExit).toHaveBeenCalledWith(1);
  });
});
