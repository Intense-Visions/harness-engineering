import { describe, it, expect } from 'vitest';
import type {
  DashHardwareProfile,
  DashPoolStateView,
  DashPoolEntryView,
  DashRankedModel,
  LocalModelsPoolEvent,
  LocalModelsProposalEvent,
} from '../../../src/client/types/local-models';
import type { WebSocketMessage } from '../../../src/client/types/orchestrator';

describe('local-models client types', () => {
  it('pool view entries carry an optional pendingEviction flag', () => {
    const entry: DashPoolEntryView = {
      ollamaName: 'qwen3:32b',
      hfRepoId: 'Qwen/Qwen3-32B-GGUF',
      sizeOnDiskGb: 18,
      installedAt: '2026-07-01T00:00:00.000Z',
      lastUsedAt: null,
      currentScore: 82,
      pendingEviction: true,
    };
    const view: DashPoolStateView = {
      diskBudgetGb: 100,
      diskUsedGb: 18,
      entries: [entry],
      allowedOrgs: ['Qwen'],
      allowedFamilies: [],
      lastRefreshAt: null,
    };
    expect(view.entries[0].pendingEviction).toBe(true);
  });

  it('WebSocketMessage union accepts the two local-models topics', () => {
    const poolFrame: WebSocketMessage = {
      type: 'local-models:pool',
      data: { action: 'evict', phase: 'evict_completed' } satisfies LocalModelsPoolEvent,
    };
    const propFrame: WebSocketMessage = {
      type: 'local-models:proposal',
      data: { id: 'p1', status: 'created' } satisfies LocalModelsProposalEvent,
    };
    expect(poolFrame.type).toBe('local-models:pool');
    expect(propFrame.type).toBe('local-models:proposal');
  });

  const _hw: DashHardwareProfile = {
    platform: 'macos',
    vramGb: 36,
    ramGb: 36,
    bandwidthGbps: 400,
    cpuName: 'Apple M3 Max',
    detectedAt: '2026-07-01T00:00:00.000Z',
  };
  const _rm: DashRankedModel = {
    hfRepoId: 'Qwen/Qwen3-32B-GGUF',
    sizeB: 32,
    quant: 'Q4_K_M',
    estimatedVramGb: 20,
    estimatedTokPerSec: 30,
    speedConfidence: 'medium',
    score: 82,
    evidence: 'direct',
    benchmarkSnapshot: '2026-05-21',
    fitsHardware: true,
  };
  it('exercises the standalone Dash type fixtures', () => {
    expect(_hw.platform).toBe('macos');
    expect(_rm.hfRepoId).toBe('Qwen/Qwen3-32B-GGUF');
  });
});
