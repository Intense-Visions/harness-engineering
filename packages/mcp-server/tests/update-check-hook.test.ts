import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Mock @harness-engineering/core before importing server
vi.mock('@harness-engineering/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@harness-engineering/core')>();
  return {
    ...actual,
    VERSION: '1.0.0',
    getUpdateNotification: vi.fn(),
    isUpdateCheckEnabled: vi.fn(),
    shouldRunCheck: vi.fn(),
    readCheckState: vi.fn(),
    spawnBackgroundCheck: vi.fn(),
  };
});

import {
  getUpdateNotification,
  isUpdateCheckEnabled,
  shouldRunCheck,
  readCheckState,
  spawnBackgroundCheck,
  VERSION,
} from '@harness-engineering/core';
import { createHarnessServer } from '../src/server';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

const mockGetUpdateNotification = vi.mocked(getUpdateNotification);
const mockIsUpdateCheckEnabled = vi.mocked(isUpdateCheckEnabled);
const mockShouldRunCheck = vi.mocked(shouldRunCheck);
const mockReadCheckState = vi.mocked(readCheckState);
const mockSpawnBackgroundCheck = vi.mocked(spawnBackgroundCheck);

async function createConnectedClient() {
  const server = createHarnessServer('/tmp/test-project');
  const client = new Client({ name: 'test-client', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  return { client, server };
}

describe('MCP Update Check Hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: update check enabled, cooldown elapsed, notification available
    mockIsUpdateCheckEnabled.mockReturnValue(true);
    mockShouldRunCheck.mockReturnValue(true);
    mockReadCheckState.mockReturnValue(null);
    mockGetUpdateNotification.mockReturnValue(
      'Update available: v1.0.0 \u2192 v1.1.0\nRun "harness update" to upgrade.'
    );
    mockSpawnBackgroundCheck.mockReturnValue(undefined);
  });

  it('appends update notification to first tool response', async () => {
    const { client } = await createConnectedClient();

    // Use validate_project since it exists — will fail but that is fine,
    // we are testing the notification append, not the tool logic
    const result = await client.callTool({
      name: 'validate_project',
      arguments: { path: '/tmp/nonexistent' },
    });

    const texts = (result.content as Array<{ type: string; text: string }>)
      .filter((c) => c.type === 'text')
      .map((c) => c.text);

    // Last text block should be the update notification
    expect(texts[texts.length - 1]).toContain('Update available');
    expect(texts[texts.length - 1]).toContain('harness update');
  });

  it('does not append notification when getUpdateNotification returns null', async () => {
    mockGetUpdateNotification.mockReturnValue(null);
    const { client } = await createConnectedClient();

    const result = await client.callTool({
      name: 'validate_project',
      arguments: { path: '/tmp/nonexistent' },
    });

    const texts = (result.content as Array<{ type: string; text: string }>)
      .filter((c) => c.type === 'text')
      .map((c) => c.text);

    for (const text of texts) {
      expect(text).not.toContain('Update available');
    }
  });

  it('calls spawnBackgroundCheck when shouldRunCheck is true', async () => {
    const { client } = await createConnectedClient();

    await client.callTool({
      name: 'validate_project',
      arguments: { path: '/tmp/nonexistent' },
    });

    expect(mockSpawnBackgroundCheck).toHaveBeenCalledOnce();
    expect(mockSpawnBackgroundCheck).toHaveBeenCalledWith(VERSION);
  });

  it('does not call spawnBackgroundCheck when shouldRunCheck is false', async () => {
    mockShouldRunCheck.mockReturnValue(false);
    const { client } = await createConnectedClient();

    await client.callTool({
      name: 'validate_project',
      arguments: { path: '/tmp/nonexistent' },
    });

    expect(mockSpawnBackgroundCheck).not.toHaveBeenCalled();
  });

  it('does not call spawnBackgroundCheck when update check is disabled', async () => {
    mockIsUpdateCheckEnabled.mockReturnValue(false);
    const { client } = await createConnectedClient();

    await client.callTool({
      name: 'validate_project',
      arguments: { path: '/tmp/nonexistent' },
    });

    expect(mockSpawnBackgroundCheck).not.toHaveBeenCalled();
    // Should also not append notification when disabled
    const result = await client.callTool({
      name: 'validate_project',
      arguments: { path: '/tmp/nonexistent' },
    });
    const texts = (result.content as Array<{ type: string; text: string }>)
      .filter((c) => c.type === 'text')
      .map((c) => c.text);
    for (const text of texts) {
      expect(text).not.toContain('Update available');
    }
  });

  it('only runs update check logic on first tool invocation per session', async () => {
    const { client } = await createConnectedClient();

    // First call — should trigger
    await client.callTool({
      name: 'validate_project',
      arguments: { path: '/tmp/nonexistent' },
    });
    expect(mockSpawnBackgroundCheck).toHaveBeenCalledOnce();
    expect(mockGetUpdateNotification).toHaveBeenCalledOnce();

    // Second call — should NOT trigger again
    vi.clearAllMocks();
    mockGetUpdateNotification.mockReturnValue(
      'Update available: v1.0.0 \u2192 v1.1.0\nRun "harness update" to upgrade.'
    );

    const result2 = await client.callTool({
      name: 'validate_project',
      arguments: { path: '/tmp/nonexistent' },
    });

    expect(mockSpawnBackgroundCheck).not.toHaveBeenCalled();
    expect(mockGetUpdateNotification).not.toHaveBeenCalled();

    const texts = (result2.content as Array<{ type: string; text: string }>)
      .filter((c) => c.type === 'text')
      .map((c) => c.text);
    for (const text of texts) {
      expect(text).not.toContain('Update available');
    }
  });

  it('returns normal response if update checker throws', async () => {
    mockGetUpdateNotification.mockImplementation(() => {
      throw new Error('fs read failed');
    });
    const { client } = await createConnectedClient();

    // Should not throw — tool result returned normally
    const result = await client.callTool({
      name: 'validate_project',
      arguments: { path: '/tmp/nonexistent' },
    });

    expect(result.content).toBeDefined();
    expect((result.content as Array<{ type: string; text: string }>).length).toBeGreaterThan(0);
  });
});

async function createConnectedClientWithConfig(config: Record<string, unknown>) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-update-config-'));
  fs.writeFileSync(path.join(tmpDir, 'harness.config.json'), JSON.stringify(config));
  const server = createHarnessServer(tmpDir);
  const client = new Client({ name: 'test-client', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  return { client, server, tmpDir };
}

describe('MCP Update Check with Config', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsUpdateCheckEnabled.mockReturnValue(true);
    mockShouldRunCheck.mockReturnValue(true);
    mockReadCheckState.mockReturnValue(null);
    mockGetUpdateNotification.mockReturnValue(null);
    mockSpawnBackgroundCheck.mockReturnValue(undefined);
  });

  it('passes custom interval from config to isUpdateCheckEnabled and shouldRunCheck', async () => {
    const { client, tmpDir } = await createConnectedClientWithConfig({
      version: 1,
      updateCheckInterval: 7200000,
    });

    await client.callTool({ name: 'validate_project', arguments: { path: '/tmp/nonexistent' } });

    expect(mockIsUpdateCheckEnabled).toHaveBeenCalledWith(7200000);
    expect(mockShouldRunCheck).toHaveBeenCalledWith(null, 7200000);

    fs.rmSync(tmpDir, { recursive: true });
  });

  it('passes 0 interval to disable update checks', async () => {
    mockIsUpdateCheckEnabled.mockReturnValue(false);
    const { client, tmpDir } = await createConnectedClientWithConfig({
      version: 1,
      updateCheckInterval: 0,
    });

    await client.callTool({ name: 'validate_project', arguments: { path: '/tmp/nonexistent' } });

    expect(mockIsUpdateCheckEnabled).toHaveBeenCalledWith(0);
    expect(mockSpawnBackgroundCheck).not.toHaveBeenCalled();

    fs.rmSync(tmpDir, { recursive: true });
  });

  it('uses default interval when config has no updateCheckInterval', async () => {
    const { client, tmpDir } = await createConnectedClientWithConfig({
      version: 1,
    });

    await client.callTool({ name: 'validate_project', arguments: { path: '/tmp/nonexistent' } });

    expect(mockIsUpdateCheckEnabled).toHaveBeenCalledWith(undefined);
    expect(mockShouldRunCheck).toHaveBeenCalledWith(null, 86_400_000);

    fs.rmSync(tmpDir, { recursive: true });
  });
});
