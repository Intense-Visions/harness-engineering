import { describe, it, expect } from 'vitest';
import { NoOpExecutor } from '../../../src/feedback/executor/noop';
import type { AgentConfig } from '../../../src/feedback/types';

describe('NoOpExecutor', () => {
  const executor = new NoOpExecutor();

  const testConfig: AgentConfig = {
    type: 'architecture-enforcer',
    context: {
      files: ['test.ts'],
      diff: 'test diff',
    },
  };

  it('should have name "noop"', () => {
    expect(executor.name).toBe('noop');
  });

  describe('health()', () => {
    it('should return available: true', async () => {
      const result = await executor.health();
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.available).toBe(true);
      }
    });
  });

  describe('spawn()', () => {
    it('should create process with completed status', async () => {
      const result = await executor.spawn(testConfig);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.id).toBeDefined();
        expect(result.value.status).toBe('completed');
        expect(result.value.config).toEqual(testConfig);
      }
    });

    it('should generate unique IDs', async () => {
      const result1 = await executor.spawn(testConfig);
      const result2 = await executor.spawn(testConfig);
      expect(result1.ok && result2.ok).toBe(true);
      if (result1.ok && result2.ok) {
        expect(result1.value.id).not.toBe(result2.value.id);
      }
    });
  });

  describe('status()', () => {
    it('should return process status', async () => {
      const spawnResult = await executor.spawn(testConfig);
      expect(spawnResult.ok).toBe(true);
      if (spawnResult.ok) {
        const statusResult = await executor.status(spawnResult.value.id);
        expect(statusResult.ok).toBe(true);
        if (statusResult.ok) {
          expect(statusResult.value.id).toBe(spawnResult.value.id);
        }
      }
    });

    it('should return error for unknown process', async () => {
      const result = await executor.status('unknown-id');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('AGENT_SPAWN_ERROR');
      }
    });
  });

  describe('wait()', () => {
    it('should return approved review', async () => {
      const spawnResult = await executor.spawn(testConfig);
      expect(spawnResult.ok).toBe(true);
      if (spawnResult.ok) {
        const waitResult = await executor.wait(spawnResult.value.id);
        expect(waitResult.ok).toBe(true);
        if (waitResult.ok) {
          expect(waitResult.value.approved).toBe(true);
          expect(waitResult.value.agentType).toBe('architecture-enforcer');
        }
      }
    });

    it('should return error for unknown process', async () => {
      const result = await executor.wait('unknown-id');
      expect(result.ok).toBe(false);
    });
  });

  describe('kill()', () => {
    it('should remove process', async () => {
      const spawnResult = await executor.spawn(testConfig);
      expect(spawnResult.ok).toBe(true);
      if (spawnResult.ok) {
        const killResult = await executor.kill(spawnResult.value.id);
        expect(killResult.ok).toBe(true);

        const statusResult = await executor.status(spawnResult.value.id);
        expect(statusResult.ok).toBe(false);
      }
    });
  });
});
