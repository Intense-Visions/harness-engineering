import { describe, it, expect } from 'vitest';
import * as orch from '../../src/index';

describe('orchestrator barrel — Phase 3 CLI surface', () => {
  it('exports the maintenance executor + reporter + check-script runner', () => {
    expect(typeof orch.TaskRunner).toBe('function');
    expect(typeof orch.MaintenanceReporter).toBe('function');
    expect(typeof orch.CheckScriptRunner).toBe('function');
    expect(typeof orch.selectTasks).toBe('function'); // already present, guard against regression
    // #679: the real maintenance agent dispatcher + backend factory must be on
    // the barrel so the on-demand CLI (`maintenance run --fix`) can wire them.
    expect(typeof orch.createAgentDispatcher).toBe('function');
    expect(typeof orch.createBackend).toBe('function');
  });
});
