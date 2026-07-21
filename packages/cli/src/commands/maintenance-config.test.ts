import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { loadMaintenanceConfig, loadAgentBackends, mergeResolvedTasks } from './maintenance-config';
import type { MaintenanceConfig } from '@harness-engineering/types';

/**
 * `mergeResolvedTasks` reads only `.tasks` and `.customTasks`; the required
 * top-level `enabled` flag is irrelevant to task resolution. This helper adds
 * the flag so the partial fixtures below satisfy `MaintenanceConfig` without a
 * cast, keeping each test's `tasks`/`customTasks` shape verbatim.
 */
function cfg(partial: Omit<MaintenanceConfig, 'enabled'>): MaintenanceConfig {
  return { enabled: true, ...partial };
}

/**
 * Unit contract for the shared maintenance task-resolution helpers.
 *
 * Pins the CURRENT behavior of three surfaces:
 *  - `mergeResolvedTasks`: built-in + custom task merging with enabled/schedule
 *    overrides and optional-field copying.
 *  - `loadMaintenanceConfig`: gated read of `harness.orchestrator.md` returning
 *    the `maintenance` slice (or null) and surfacing loader warnings.
 *  - `loadAgentBackends`: synthesis of the legacy backend map via
 *    `migrateAgentConfig`, normalizing empty/absent to null.
 *
 * Fully hermetic: `node:fs`, the orchestrator package (`BUILT_IN_TASKS`,
 * `WorkflowLoader`, `migrateAgentConfig`), and the CLI logger are all mocked, so
 * there is no real filesystem access, no subprocess, and no network.
 */

// Two representative built-in tasks the SUT iterates over. Frozen so a test can
// prove the helper returns copies rather than the shared registry objects.
const BUILT_IN_A = Object.freeze({
  id: 'built-in-a',
  type: 'report-only',
  description: 'Built-in A',
  schedule: '0 2 * * *',
  branch: null,
});
const BUILT_IN_B = Object.freeze({
  id: 'built-in-b',
  type: 'mechanical-ai',
  description: 'Built-in B',
  schedule: '0 3 * * *',
  branch: 'chore/built-in-b',
});

const hoisted = vi.hoisted(() => ({
  builtIns: undefined as unknown[] | undefined,
  existsSyncMock: vi.fn(),
  loadWorkflowMock: vi.fn(),
  migrateMock: vi.fn(),
  warnMock: vi.fn(),
}));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual, existsSync: hoisted.existsSyncMock };
});

vi.mock('@harness-engineering/orchestrator', () => {
  class WorkflowLoader {
    loadWorkflow = hoisted.loadWorkflowMock;
  }
  return {
    // Live getter so a test can swap the built-in registry per-case.
    get BUILT_IN_TASKS() {
      return hoisted.builtIns;
    },
    WorkflowLoader,
    migrateAgentConfig: hoisted.migrateMock,
  };
});

vi.mock('../output/logger', () => ({
  logger: { warn: hoisted.warnMock },
}));

beforeEach(() => {
  hoisted.builtIns = [BUILT_IN_A, BUILT_IN_B];
  hoisted.existsSyncMock.mockReset();
  hoisted.loadWorkflowMock.mockReset();
  hoisted.migrateMock.mockReset();
  hoisted.warnMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── mergeResolvedTasks ──────────────────────────────────────────────────────

describe('mergeResolvedTasks', () => {
  it('returns every built-in as a fresh copy when config is null', () => {
    const tasks = mergeResolvedTasks(null);

    expect(tasks.map((t) => t.id)).toEqual([BUILT_IN_A.id, BUILT_IN_B.id]);
    // Each returned task is a distinct object, not the shared registry entry,
    // so downstream mutation cannot corrupt BUILT_IN_TASKS.
    expect(tasks[0]).not.toBe(BUILT_IN_A);
    expect(tasks[0]).toEqual({ ...BUILT_IN_A });
    // No custom tasks were synthesized.
    expect(tasks.every((t) => t.isCustom === undefined)).toBe(true);
  });

  it('treats an empty maintenance config the same as null (all built-ins, no customs)', () => {
    const tasks = mergeResolvedTasks(cfg({}));
    expect(tasks.map((t) => t.id)).toEqual([BUILT_IN_A.id, BUILT_IN_B.id]);
  });

  it('excludes a built-in whose override sets enabled:false', () => {
    const tasks = mergeResolvedTasks(cfg({ tasks: { [BUILT_IN_A.id]: { enabled: false } } }));

    expect(tasks.map((t) => t.id)).toEqual([BUILT_IN_B.id]);
  });

  it('does NOT exclude a built-in when the override enables it (enabled:true)', () => {
    const tasks = mergeResolvedTasks(cfg({ tasks: { [BUILT_IN_A.id]: { enabled: true } } }));

    expect(tasks.map((t) => t.id)).toContain(BUILT_IN_A.id);
  });

  it('applies a schedule override to a built-in while preserving its other fields', () => {
    const overriddenSchedule = '15 4 * * 1';
    const tasks = mergeResolvedTasks(
      cfg({
        tasks: { [BUILT_IN_A.id]: { schedule: overriddenSchedule } },
      })
    );

    const a = tasks.find((t) => t.id === BUILT_IN_A.id)!;
    expect(a.schedule).toBe(overriddenSchedule);
    // Untouched fields carry through from the registry entry.
    expect(a.description).toBe(BUILT_IN_A.description);
    expect(a.type).toBe(BUILT_IN_A.type);
    // The registry object itself is not mutated.
    expect(BUILT_IN_A.schedule).toBe('0 2 * * *');
  });

  it('appends custom tasks after built-ins, flagged isCustom with defaults from the definition', () => {
    const custom = {
      type: 'pure-ai' as const,
      description: 'My custom task',
      schedule: '0 6 * * *',
      branch: 'chore/custom',
    };
    const tasks = mergeResolvedTasks(cfg({ customTasks: { 'custom-1': custom } }));

    // Built-ins come first, then customs.
    expect(tasks.map((t) => t.id)).toEqual([BUILT_IN_A.id, BUILT_IN_B.id, 'custom-1']);
    const c = tasks.find((t) => t.id === 'custom-1')!;
    expect(c.isCustom).toBe(true);
    expect(c.type).toBe(custom.type);
    expect(c.description).toBe(custom.description);
    expect(c.schedule).toBe(custom.schedule);
    expect(c.branch).toBe(custom.branch);
  });

  it('applies a schedule override to a custom task, overriding its definition schedule', () => {
    const overrideSchedule = '30 7 * * *';
    const tasks = mergeResolvedTasks(
      cfg({
        customTasks: {
          'custom-1': { type: 'pure-ai', description: 'x', schedule: '0 6 * * *', branch: null },
        },
        tasks: { 'custom-1': { schedule: overrideSchedule } },
      })
    );

    expect(tasks.find((t) => t.id === 'custom-1')!.schedule).toBe(overrideSchedule);
  });

  it('excludes a custom task whose override sets enabled:false', () => {
    const tasks = mergeResolvedTasks(
      cfg({
        customTasks: {
          'custom-1': { type: 'pure-ai', description: 'x', schedule: '0 6 * * *', branch: null },
        },
        tasks: { 'custom-1': { enabled: false } },
      })
    );

    expect(tasks.map((t) => t.id)).not.toContain('custom-1');
  });

  it('copies only the optional custom fields that are defined, omitting undefined ones', () => {
    const costCeiling = { maxUsd: 5 };
    const tasks = mergeResolvedTasks(
      cfg({
        customTasks: {
          'custom-1': {
            type: 'mechanical-ai',
            description: 'x',
            schedule: '0 6 * * *',
            branch: null,
            checkCommand: ['ci', 'check'],
            fixSkill: 'fix-it',
            costCeiling,
          } as never,
        },
      })
    );

    const c = tasks.find((t) => t.id === 'custom-1')! as unknown as Record<string, unknown>;
    // Defined optionals are copied through verbatim.
    expect(c.checkCommand).toEqual(['ci', 'check']);
    expect(c.fixSkill).toBe('fix-it');
    expect(c.costCeiling).toBe(costCeiling);
    // Optionals absent from the definition are not present on the output.
    expect(c).not.toHaveProperty('checkScript');
    expect(c).not.toHaveProperty('inlineSkills');
    expect(c).not.toHaveProperty('contextFrom');
  });
});

// ─── loadMaintenanceConfig ───────────────────────────────────────────────────

describe('loadMaintenanceConfig', () => {
  const CWD = '/repo';

  it('returns null when harness.orchestrator.md does not exist', async () => {
    hoisted.existsSyncMock.mockReturnValue(false);

    expect(await loadMaintenanceConfig(CWD)).toBeNull();
    // Never attempts a load when the file is absent.
    expect(hoisted.loadWorkflowMock).not.toHaveBeenCalled();
  });

  it('returns null when the workflow fails to load', async () => {
    hoisted.existsSyncMock.mockReturnValue(true);
    hoisted.loadWorkflowMock.mockResolvedValue({ ok: false });

    expect(await loadMaintenanceConfig(CWD)).toBeNull();
  });

  it('returns the maintenance slice and surfaces loader warnings when the workflow loads', async () => {
    const maintenance = { customTasks: {} };
    hoisted.existsSyncMock.mockReturnValue(true);
    hoisted.loadWorkflowMock.mockResolvedValue({
      ok: true,
      value: { warnings: ['routing warning'], config: { maintenance } },
    });

    const result = await loadMaintenanceConfig(CWD);

    expect(result).toBe(maintenance);
    expect(hoisted.warnMock).toHaveBeenCalledWith('routing warning');
  });

  it('returns null when the loaded config carries no maintenance slice', async () => {
    hoisted.existsSyncMock.mockReturnValue(true);
    hoisted.loadWorkflowMock.mockResolvedValue({
      ok: true,
      value: { warnings: [], config: {} },
    });

    expect(await loadMaintenanceConfig(CWD)).toBeNull();
  });
});

// ─── loadAgentBackends ───────────────────────────────────────────────────────

describe('loadAgentBackends', () => {
  const CWD = '/repo';

  it('returns null when harness.orchestrator.md does not exist', async () => {
    hoisted.existsSyncMock.mockReturnValue(false);

    expect(await loadAgentBackends(CWD)).toBeNull();
    expect(hoisted.loadWorkflowMock).not.toHaveBeenCalled();
  });

  it('returns null when the workflow fails to load', async () => {
    hoisted.existsSyncMock.mockReturnValue(true);
    hoisted.loadWorkflowMock.mockResolvedValue({ ok: false });

    expect(await loadAgentBackends(CWD)).toBeNull();
  });

  it('returns null when the loaded config has no agent block', async () => {
    hoisted.existsSyncMock.mockReturnValue(true);
    hoisted.loadWorkflowMock.mockResolvedValue({
      ok: true,
      value: { warnings: [], config: {} },
    });

    expect(await loadAgentBackends(CWD)).toBeNull();
    // No agent means migration is never attempted.
    expect(hoisted.migrateMock).not.toHaveBeenCalled();
  });

  it('returns the migrated backends map for an agent config', async () => {
    const agent = { backends: {} };
    const migratedBackends = { primary: { type: 'anthropic', model: 'claude' } };
    hoisted.existsSyncMock.mockReturnValue(true);
    hoisted.loadWorkflowMock.mockResolvedValue({
      ok: true,
      value: { warnings: [], config: { agent } },
    });
    hoisted.migrateMock.mockReturnValue({ config: { backends: migratedBackends } });

    const result = await loadAgentBackends(CWD);

    expect(result).toEqual(migratedBackends);
    expect(hoisted.migrateMock).toHaveBeenCalledWith(agent);
  });

  it('falls back to agent.backends when the migration synthesis throws', async () => {
    const agentBackends = { local: { type: 'ollama', model: 'qwen' } };
    const agent = { backends: agentBackends };
    hoisted.existsSyncMock.mockReturnValue(true);
    hoisted.loadWorkflowMock.mockResolvedValue({
      ok: true,
      value: { warnings: [], config: { agent } },
    });
    hoisted.migrateMock.mockImplementation(() => {
      throw new Error('synthesis failed');
    });

    expect(await loadAgentBackends(CWD)).toEqual(agentBackends);
  });

  it('normalizes an empty synthesized backend map to null', async () => {
    const agent = { backends: {} };
    hoisted.existsSyncMock.mockReturnValue(true);
    hoisted.loadWorkflowMock.mockResolvedValue({
      ok: true,
      value: { warnings: [], config: { agent } },
    });
    // Migration yields no backends and the agent itself carries an empty map.
    hoisted.migrateMock.mockReturnValue({ config: {} });

    expect(await loadAgentBackends(CWD)).toBeNull();
  });
});
