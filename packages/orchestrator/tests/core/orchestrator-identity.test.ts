import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';

vi.mock('node:fs/promises');
vi.mock('node:os', async () => {
  const actual = await vi.importActual<typeof import('node:os')>('node:os');
  return { ...actual, hostname: vi.fn(() => 'test-host.local') };
});

describe('resolveOrchestratorId', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.resetModules();
  });

  it('returns explicit configId when provided', async () => {
    const { resolveOrchestratorId } = await import('../../src/core/orchestrator-identity');
    const result = await resolveOrchestratorId('my-explicit-id');
    expect(result).toBe('my-explicit-id');
    expect(fs.readFile).not.toHaveBeenCalled();
  });

  it('reads existing machine ID from disk and combines with hostname', async () => {
    vi.mocked(fs.readFile).mockResolvedValue('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
    const { resolveOrchestratorId } = await import('../../src/core/orchestrator-identity');
    const result = await resolveOrchestratorId();
    // Hostname "test-host.local" -> "test-host" (strip .local)
    expect(result).toMatch(/^test-host-[a-f0-9]{8}$/);
    expect(fs.writeFile).not.toHaveBeenCalled();
  });

  it('creates and persists a new UUID when file does not exist', async () => {
    vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT: no such file or directory'));
    vi.mocked(fs.mkdir).mockResolvedValue(undefined);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);

    const { resolveOrchestratorId } = await import('../../src/core/orchestrator-identity');
    const result = await resolveOrchestratorId();
    expect(result).toMatch(/^test-host-[a-f0-9]{8}$/);
    expect(fs.mkdir).toHaveBeenCalledTimes(1);
    expect(fs.writeFile).toHaveBeenCalledTimes(1);
    // Verify the UUID was written
    const writtenUuid = vi.mocked(fs.writeFile).mock.calls[0]![1] as string;
    expect(writtenUuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('produces consistent results for the same machine ID', async () => {
    const fixedUuid = '12345678-1234-1234-1234-123456789abc';
    vi.mocked(fs.readFile).mockResolvedValue(fixedUuid);
    const { resolveOrchestratorId } = await import('../../src/core/orchestrator-identity');
    const result1 = await resolveOrchestratorId();
    const result2 = await resolveOrchestratorId();
    expect(result1).toBe(result2);
  });
});
