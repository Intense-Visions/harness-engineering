import { beforeEach, describe, expect, it } from 'vitest';

import {
  AdvisoryInstallAdapter,
  InstallError,
  type EvictRequest,
  type InspectRequest,
  type InstallAdapter,
  type InstallRequest,
  type InstallResult,
  type ListRequest,
  type RemoteModelInfo,
} from '../../src/installer/index.js';
import { PoolManager } from '../../src/pool/manager.js';
import { PoolStateStore, type PoolFilesystem } from '../../src/pool/state.js';
import type { PoolEntry, PoolState } from '../../src/pool/types.js';

interface RecordedFsOp {
  op: 'read' | 'write' | 'rename' | 'mkdir';
  path: string;
  contents?: string;
}

function makeFs(initial: Record<string, string> = {}): {
  fs: PoolFilesystem;
  files: Record<string, string>;
  ops: RecordedFsOp[];
} {
  const files: Record<string, string> = { ...initial };
  const ops: RecordedFsOp[] = [];
  const fs: PoolFilesystem = {
    async readFile(path) {
      ops.push({ op: 'read', path });
      if (path in files) return files[path] as string;
      const err = new Error(`ENOENT: ${path}`) as Error & { code: string };
      err.code = 'ENOENT';
      throw err;
    },
    async writeFile(path, contents) {
      ops.push({ op: 'write', path, contents });
      files[path] = contents;
    },
    async rename(from, to) {
      ops.push({ op: 'rename', path: `${from}->${to}` });
      if (!(from in files)) throw new Error(`source missing: ${from}`);
      files[to] = files[from] as string;
      delete files[from];
    },
    async mkdir(path) {
      ops.push({ op: 'mkdir', path });
    },
  };
  return { fs, files, ops };
}

type InstallResponder = (request: InstallRequest) => Promise<InstallResult> | InstallResult;
type EvictResponder = (request: EvictRequest) => Promise<InstallResult> | InstallResult;
type ListResponder = (request: ListRequest) => Promise<RemoteModelInfo[]> | RemoteModelInfo[];
type InspectResponder = (request: InspectRequest) => Promise<RemoteModelInfo> | RemoteModelInfo;

interface StubInstaller {
  adapter: InstallAdapter;
  installs: InstallRequest[];
  evicts: EvictRequest[];
  lists: ListRequest[];
  inspects: InspectRequest[];
  installResponder: InstallResponder;
  evictResponder: EvictResponder;
  listResponder: ListResponder;
  inspectResponder: InspectResponder;
}

function stubInstaller(): StubInstaller {
  const installs: InstallRequest[] = [];
  const evicts: EvictRequest[] = [];
  const lists: ListRequest[] = [];
  const inspects: InspectRequest[] = [];
  const stub: StubInstaller = {
    installs,
    evicts,
    lists,
    inspects,
    installResponder: ({ name }) => ({ status: 'success', name }),
    evictResponder: ({ name }) => ({ status: 'success', name }),
    listResponder: () => [],
    inspectResponder: () => {
      throw new InstallError('parse_failed', 'no inspect responder configured');
    },
    adapter: {
      async install(req) {
        installs.push(req);
        return stub.installResponder(req);
      },
      async evict(req) {
        evicts.push(req);
        return stub.evictResponder(req);
      },
      async list(req = {}) {
        lists.push(req);
        return stub.listResponder(req);
      },
      async inspect(req) {
        inspects.push(req);
        return stub.inspectResponder(req);
      },
    },
  };
  return stub;
}

const POOL_PATH = '/tmp/lmlm/pool.json';
const TMP_PATH = `${POOL_PATH}.tmp`;
const FROZEN_NOW = Date.parse('2026-05-30T15:00:00.000Z');

function entry(overrides: Partial<PoolEntry> = {}): PoolEntry {
  return {
    ollamaName: 'qwen3:32b',
    hfRepoId: 'Qwen/Qwen3-32B-GGUF',
    sizeOnDiskGb: 18,
    installedAt: '2026-05-20T12:00:00.000Z',
    lastUsedAt: '2026-05-29T12:00:00.000Z',
    currentScore: 75,
    ...overrides,
  };
}

function seededState(overrides: Partial<PoolState> = {}, entries: PoolEntry[] = []): PoolState {
  const used = entries.reduce((sum, e) => sum + e.sizeOnDiskGb, 0);
  return {
    diskBudgetGb: 100,
    diskUsedGb: used,
    entries,
    allowedOrgs: ['Qwen', 'deepseek-ai'],
    allowedFamilies: [],
    lastRefreshAt: null,
    ...overrides,
  };
}

async function makeManager(initial?: PoolState): Promise<{
  manager: PoolManager;
  store: PoolStateStore;
  installer: StubInstaller;
  fs: { fs: PoolFilesystem; files: Record<string, string>; ops: RecordedFsOp[] };
  warnings: Array<{ message: string; cause?: unknown }>;
}> {
  const seedFiles: Record<string, string> = {};
  if (initial) {
    seedFiles[POOL_PATH] = JSON.stringify({ version: 1, state: initial }, null, 2);
  }
  const fs = makeFs(seedFiles);
  const store = new PoolStateStore({ path: POOL_PATH, fs: fs.fs });
  await store.load();
  const installer = stubInstaller();
  const warnings: Array<{ message: string; cause?: unknown }> = [];
  const manager = new PoolManager({
    store,
    installer: installer.adapter,
    now: () => FROZEN_NOW,
    onWarn: (message, cause) => warnings.push({ message, cause }),
  });
  return { manager, store, installer, fs, warnings };
}

describe('PoolManager — allowlist (D1, F8)', () => {
  it('rejects install when org is not in allowedOrgs (OT1)', async () => {
    const { manager, installer } = await makeManager(seededState({ allowedOrgs: ['Qwen'] }));
    const result = await manager.install({
      hfRepoId: 'random-org/foo',
      ollamaName: 'foo:7b',
      sizeOnDiskGb: 5,
    });
    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.code).toBe('not_allowed');
      expect(result.message).toMatch(/org/);
    }
    expect(installer.installs).toHaveLength(0);
    expect(installer.inspects).toHaveLength(0);
    expect(installer.evicts).toHaveLength(0);
  });

  it('rejects install when family is not in allowedFamilies (OT2)', async () => {
    const { manager, installer } = await makeManager(
      seededState({ allowedOrgs: ['Qwen'], allowedFamilies: ['qwen3'] })
    );
    const result = await manager.install({
      hfRepoId: 'Qwen/Qwen2.5-7B',
      ollamaName: 'qwen2.5:7b',
      sizeOnDiskGb: 5,
      family: 'qwen2',
    });
    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.code).toBe('not_allowed');
      expect(result.message).toMatch(/family/);
    }
    expect(installer.installs).toHaveLength(0);
  });

  it('accepts install when allowedFamilies is empty (OT3)', async () => {
    const { manager, installer } = await makeManager(
      seededState({ allowedOrgs: ['Qwen'], allowedFamilies: [] })
    );
    installer.inspectResponder = ({ name }) => ({ ollamaName: name, sizeOnDiskGb: 18 });
    const result = await manager.install({
      hfRepoId: 'Qwen/Qwen3-32B-GGUF',
      ollamaName: 'qwen3:32b',
    });
    expect(result.status).toBe('success');
  });
});

describe('PoolManager — idempotency (S2)', () => {
  it('returns success without invoking the installer when the entry already exists (OT4)', async () => {
    const seeded = seededState({}, [entry()]);
    const { manager, installer } = await makeManager(seeded);
    const result = await manager.install({
      hfRepoId: 'Qwen/Qwen3-32B-GGUF',
      ollamaName: 'qwen3:32b',
      sizeOnDiskGb: 18,
    });
    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.alreadyInstalled).toBe(true);
      expect(result.evicted).toEqual([]);
    }
    expect(installer.installs).toHaveLength(0);
    expect(installer.inspects).toHaveLength(0);
  });
});

describe('PoolManager — happy path (F4)', () => {
  it('inspect → install → append + persist; persist runs exactly once (OT5)', async () => {
    const { manager, installer, fs } = await makeManager(
      seededState({ allowedOrgs: ['Qwen'], diskBudgetGb: 100 })
    );
    installer.inspectResponder = ({ name }) => ({ ollamaName: name, sizeOnDiskGb: 18 });

    const events: string[] = [];
    const result = await manager.install({
      hfRepoId: 'Qwen/Qwen3-32B-GGUF',
      ollamaName: 'qwen3:32b',
      initialScore: 42,
      onEvent: (e) => events.push(e.kind),
    });

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.entry).toMatchObject({
        ollamaName: 'qwen3:32b',
        hfRepoId: 'Qwen/Qwen3-32B-GGUF',
        sizeOnDiskGb: 18,
        installedAt: new Date(FROZEN_NOW).toISOString(),
        lastUsedAt: null,
        currentScore: 42,
      });
      expect(result.evicted).toEqual([]);
    }

    expect(installer.inspects.map((r) => r.name)).toEqual(['qwen3:32b']);
    expect(installer.installs).toHaveLength(1);
    expect(installer.installs[0]?.name).toBe('qwen3:32b');
    expect(installer.installs[0]?.onEvent).toBeDefined();

    const persistOps = fs.ops.filter((o) => o.op === 'write' || o.op === 'rename');
    expect(persistOps.filter((o) => o.op === 'write').map((o) => o.path)).toEqual([TMP_PATH]);
    expect(persistOps.filter((o) => o.op === 'rename').map((o) => o.path)).toEqual([
      `${TMP_PATH}->${POOL_PATH}`,
    ]);

    const snapshot = manager.snapshot();
    expect(snapshot.entries.map((e) => e.ollamaName)).toEqual(['qwen3:32b']);
    expect(snapshot.diskUsedGb).toBe(18);
  });

  it('skips installer.inspect when sizeOnDiskGb is supplied (OT6)', async () => {
    const { manager, installer } = await makeManager(
      seededState({ allowedOrgs: ['Qwen'], diskBudgetGb: 100 })
    );
    installer.inspectResponder = () => {
      throw new Error('should not be invoked');
    };
    const result = await manager.install({
      hfRepoId: 'Qwen/Qwen3-32B-GGUF',
      ollamaName: 'qwen3:32b',
      sizeOnDiskGb: 18,
    });
    expect(result.status).toBe('success');
    expect(installer.inspects).toHaveLength(0);
    expect(installer.installs).toHaveLength(1);
  });
});

describe('PoolManager — budget + eviction (F5, S5)', () => {
  it('plans eviction, evicts in order, then installs (OT7)', async () => {
    const seeded = seededState({ allowedOrgs: ['Qwen', 'deepseek-ai'], diskBudgetGb: 50 }, [
      entry({
        ollamaName: 'low:7b',
        hfRepoId: 'Qwen/Qwen2.5-7B',
        sizeOnDiskGb: 10,
        currentScore: 40,
        lastUsedAt: '2026-05-01T00:00:00.000Z',
      }),
      entry({
        ollamaName: 'mid:13b',
        hfRepoId: 'Qwen/Qwen2.5-13B',
        sizeOnDiskGb: 18,
        currentScore: 55,
        lastUsedAt: '2026-05-20T00:00:00.000Z',
      }),
      entry({
        ollamaName: 'high:32b',
        hfRepoId: 'Qwen/Qwen3-32B-GGUF',
        sizeOnDiskGb: 18,
        currentScore: 80,
        lastUsedAt: '2026-05-25T00:00:00.000Z',
      }),
    ]);
    const { manager, installer } = await makeManager(seeded);

    // budget 50, used 46, available 4. New install wants 20 → deficit 16.
    // Eviction order by lowest score: low(10) first, then mid(18). After
    // both evicts freedGb=28 ≥ 16.
    const result = await manager.install({
      hfRepoId: 'deepseek-ai/DeepSeek-R1-Distill-Llama-70B',
      ollamaName: 'deepseek-r1:70b',
      sizeOnDiskGb: 20,
    });

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.evicted.map((e) => e.ollamaName)).toEqual(['low:7b', 'mid:13b']);
    }
    expect(installer.evicts.map((r) => r.name)).toEqual(['low:7b', 'mid:13b']);
    expect(installer.installs.map((r) => r.name)).toEqual(['deepseek-r1:70b']);

    const snapshot = manager.snapshot();
    expect(snapshot.entries.map((e) => e.ollamaName).sort()).toEqual([
      'deepseek-r1:70b',
      'high:32b',
    ]);
    expect(snapshot.diskUsedGb).toBe(38);
  });

  it('rejects with budget_exceeded when even maximal eviction is insufficient (OT8)', async () => {
    const seeded = seededState({ allowedOrgs: ['Qwen'], diskBudgetGb: 20 }, [
      entry({ ollamaName: 'a', sizeOnDiskGb: 10, currentScore: 50 }),
    ]);
    const { manager, installer } = await makeManager(seeded);
    const result = await manager.install({
      hfRepoId: 'Qwen/Big',
      ollamaName: 'big:huge',
      sizeOnDiskGb: 999,
    });
    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.code).toBe('budget_exceeded');
      expect(result.evicted).toEqual([]);
    }
    expect(installer.installs).toHaveLength(0);
    expect(installer.evicts).toHaveLength(0);
  });

  it('halts pre-commit eviction on the first installer_unavailable (OT9)', async () => {
    const seeded = seededState({ allowedOrgs: ['Qwen'], diskBudgetGb: 30 }, [
      entry({ ollamaName: 'low', sizeOnDiskGb: 10, currentScore: 40 }),
      entry({ ollamaName: 'mid', sizeOnDiskGb: 15, currentScore: 55 }),
    ]);
    const { manager, installer } = await makeManager(seeded);
    installer.evictResponder = ({ name }) =>
      name === 'low'
        ? { status: 'error', code: 'installer_unavailable', message: 'down' }
        : { status: 'success', name };
    const result = await manager.install({
      hfRepoId: 'Qwen/Qwen3-32B-GGUF',
      ollamaName: 'new:32b',
      sizeOnDiskGb: 20,
    });
    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.code).toBe('installer_unavailable');
      expect(result.evicted).toEqual([]);
    }
    expect(installer.evicts.map((r) => r.name)).toEqual(['low']);
    expect(installer.installs).toHaveLength(0);
    // Pool state preserved.
    expect(manager.snapshot().entries.map((e) => e.ollamaName)).toEqual(['low', 'mid']);
  });
});

describe('PoolManager — install failure modes (D13, S6, S7)', () => {
  it('propagates failed_target_missing without mutating pool state (OT10)', async () => {
    const { manager, installer } = await makeManager(
      seededState({ allowedOrgs: ['Qwen'], diskBudgetGb: 100 })
    );
    installer.inspectResponder = ({ name }) => ({ ollamaName: name, sizeOnDiskGb: 10 });
    installer.installResponder = () => ({
      status: 'error',
      code: 'failed_target_missing',
      message: 'gone',
    });
    const result = await manager.install({
      hfRepoId: 'Qwen/Qwen3-32B-GGUF',
      ollamaName: 'qwen3:32b',
    });
    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.code).toBe('failed_target_missing');
      expect(result.evicted).toEqual([]);
    }
    expect(installer.evicts).toHaveLength(0);
    expect(manager.snapshot().entries).toEqual([]);
  });

  it('runs best-effort partial-byte cleanup on install_failed (OT11)', async () => {
    const { manager, installer } = await makeManager(
      seededState({ allowedOrgs: ['Qwen'], diskBudgetGb: 100 })
    );
    installer.inspectResponder = ({ name }) => ({ ollamaName: name, sizeOnDiskGb: 10 });
    installer.installResponder = () => ({
      status: 'error',
      code: 'install_failed',
      message: 'disk full',
    });
    const result = await manager.install({
      hfRepoId: 'Qwen/Qwen3-32B-GGUF',
      ollamaName: 'qwen3:32b',
    });
    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.code).toBe('install_failed');
    }
    expect(installer.evicts.map((r) => r.name)).toEqual(['qwen3:32b']);
    expect(manager.snapshot().entries).toEqual([]);
  });

  it('does not attempt cleanup on installer_unavailable (OT12)', async () => {
    const { manager, installer } = await makeManager(
      seededState({ allowedOrgs: ['Qwen'], diskBudgetGb: 100 })
    );
    installer.inspectResponder = ({ name }) => ({ ollamaName: name, sizeOnDiskGb: 10 });
    installer.installResponder = () => ({
      status: 'error',
      code: 'installer_unavailable',
      message: 'down',
    });
    const result = await manager.install({
      hfRepoId: 'Qwen/Qwen3-32B-GGUF',
      ollamaName: 'qwen3:32b',
    });
    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.code).toBe('installer_unavailable');
    }
    expect(installer.evicts).toHaveLength(0);
  });

  it('surfaces installer.inspect installer_unavailable (OT13)', async () => {
    const { manager, installer } = await makeManager(
      seededState({ allowedOrgs: ['Qwen'], diskBudgetGb: 100 })
    );
    installer.inspectResponder = () => {
      throw new InstallError('installer_unavailable', 'down');
    };
    const result = await manager.install({
      hfRepoId: 'Qwen/Qwen3-32B-GGUF',
      ollamaName: 'qwen3:32b',
    });
    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.code).toBe('installer_unavailable');
    }
    expect(installer.installs).toHaveLength(0);
  });

  it('surfaces installer.inspect parse_failed (OT14)', async () => {
    const { manager, installer } = await makeManager(
      seededState({ allowedOrgs: ['Qwen'], diskBudgetGb: 100 })
    );
    installer.inspectResponder = () => {
      throw new InstallError('parse_failed', 'bogus json');
    };
    const result = await manager.install({
      hfRepoId: 'Qwen/Qwen3-32B-GGUF',
      ollamaName: 'qwen3:32b',
    });
    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.code).toBe('parse_failed');
    }
    expect(installer.installs).toHaveLength(0);
  });
});

describe('PoolManager — evict (D12 primitive)', () => {
  it('removes a known entry on installer.evict success (OT15)', async () => {
    const seeded = seededState({}, [entry()]);
    const { manager, installer, fs } = await makeManager(seeded);
    const result = await manager.evict({ ollamaName: 'qwen3:32b' });
    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.removed?.ollamaName).toBe('qwen3:32b');
    }
    expect(installer.evicts.map((r) => r.name)).toEqual(['qwen3:32b']);
    expect(manager.snapshot().entries).toEqual([]);
    expect(fs.ops.some((o) => o.op === 'rename')).toBe(true);
  });

  it('returns alreadyAbsent success for unknown names (OT16)', async () => {
    const { manager, installer } = await makeManager(seededState({}, []));
    const result = await manager.evict({ ollamaName: 'ghost' });
    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.alreadyAbsent).toBe(true);
      expect(result.removed).toBeNull();
    }
    expect(installer.evicts).toHaveLength(0);
  });

  it('reconciles silently when installer returns not_in_pool (OT17)', async () => {
    const seeded = seededState({}, [entry()]);
    const { manager, installer } = await makeManager(seeded);
    installer.evictResponder = ({ name }) => ({
      status: 'error',
      code: 'not_in_pool',
      message: `gone: ${name}`,
    });
    const result = await manager.evict({ ollamaName: 'qwen3:32b' });
    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.reconciled).toBe(true);
      expect(result.removed?.ollamaName).toBe('qwen3:32b');
    }
    expect(manager.snapshot().entries).toEqual([]);
  });

  it('preserves pool state on installer_unavailable evict (OT18)', async () => {
    const seeded = seededState({}, [entry()]);
    const { manager, installer } = await makeManager(seeded);
    installer.evictResponder = () => ({
      status: 'error',
      code: 'installer_unavailable',
      message: 'down',
    });
    const result = await manager.evict({ ollamaName: 'qwen3:32b' });
    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.code).toBe('installer_unavailable');
    }
    expect(manager.snapshot().entries.map((e) => e.ollamaName)).toEqual(['qwen3:32b']);
  });
});

describe('PoolManager — reconcile (D12)', () => {
  it('prunes pool entries not present on the installer (OT19)', async () => {
    const seeded = seededState({}, [
      entry({ ollamaName: 'keep:a' }),
      entry({ ollamaName: 'drop:b' }),
      entry({ ollamaName: 'keep:c' }),
    ]);
    const { manager, installer, fs } = await makeManager(seeded);
    installer.listResponder = () => [
      { ollamaName: 'keep:a', sizeOnDiskGb: 18 },
      { ollamaName: 'keep:c', sizeOnDiskGb: 18 },
    ];
    const result = await manager.reconcile();
    expect(result.removed.map((e) => e.ollamaName)).toEqual(['drop:b']);
    expect(
      manager
        .snapshot()
        .entries.map((e) => e.ollamaName)
        .sort()
    ).toEqual(['keep:a', 'keep:c']);
    expect(fs.ops.some((o) => o.op === 'rename')).toBe(true);
  });

  it('leaves pool state untouched on installer_unavailable (OT20)', async () => {
    const seeded = seededState({}, [entry()]);
    const { manager, installer, warnings, fs } = await makeManager(seeded);
    installer.listResponder = () => {
      throw new InstallError('installer_unavailable', 'down');
    };
    const result = await manager.reconcile();
    expect(result.removed).toEqual([]);
    expect(manager.snapshot().entries.map((e) => e.ollamaName)).toEqual(['qwen3:32b']);
    expect(warnings.some((w) => /installer\.list/.test(w.message))).toBe(true);
    expect(fs.ops.filter((o) => o.op === 'write' || o.op === 'rename')).toEqual([]);
  });

  it('returns a no-op when every pool entry is still present (no persist)', async () => {
    const seeded = seededState({}, [entry()]);
    const { manager, installer, fs } = await makeManager(seeded);
    installer.listResponder = () => [{ ollamaName: 'qwen3:32b', sizeOnDiskGb: 18 }];
    const result = await manager.reconcile();
    expect(result.removed).toEqual([]);
    expect(fs.ops.filter((o) => o.op === 'write' || o.op === 'rename')).toEqual([]);
  });
});

describe('PoolManager — bookkeeping seams', () => {
  it('markUsed updates lastUsedAt and persists (OT21)', async () => {
    const seeded = seededState({}, [entry({ lastUsedAt: null })]);
    const { manager, fs } = await makeManager(seeded);
    await manager.markUsed('qwen3:32b');
    expect(manager.snapshot().entries[0]?.lastUsedAt).toBe(new Date(FROZEN_NOW).toISOString());
    expect(fs.ops.some((o) => o.op === 'rename')).toBe(true);
  });

  it('markUsed is a silent no-op for unknown names', async () => {
    const seeded = seededState({}, [entry()]);
    const { manager, fs, warnings } = await makeManager(seeded);
    await manager.markUsed('ghost');
    expect(warnings).toEqual([]);
    expect(fs.ops.filter((o) => o.op === 'write')).toEqual([]);
  });

  it('updateScores persists once across multiple updates and ignores unknown names (OT22)', async () => {
    const seeded = seededState({}, [
      entry({ ollamaName: 'a', currentScore: 10 }),
      entry({ ollamaName: 'b', currentScore: 20 }),
    ]);
    const { manager, fs } = await makeManager(seeded);
    await manager.updateScores([
      { ollamaName: 'a', currentScore: 88 },
      { ollamaName: 'b', currentScore: 91 },
      { ollamaName: 'ghost', currentScore: 50 },
    ]);
    const entries = manager.snapshot().entries;
    expect(entries.find((e) => e.ollamaName === 'a')?.currentScore).toBe(88);
    expect(entries.find((e) => e.ollamaName === 'b')?.currentScore).toBe(91);
    expect(fs.ops.filter((o) => o.op === 'rename')).toHaveLength(1);
  });

  it('updateScores is a no-op when no update matches', async () => {
    const seeded = seededState({}, [entry()]);
    const { manager, fs } = await makeManager(seeded);
    await manager.updateScores([{ ollamaName: 'ghost', currentScore: 99 }]);
    expect(fs.ops.filter((o) => o.op === 'rename')).toEqual([]);
  });
});

describe('PoolManager — configurePool + snapshot + isAllowed (Phase 7 seams)', () => {
  it('configurePool updates only the supplied fields (OT23)', async () => {
    const seeded = seededState(
      { diskBudgetGb: 100, allowedOrgs: ['Qwen'], allowedFamilies: ['qwen3'] },
      [entry()]
    );
    const { manager } = await makeManager(seeded);
    const next = await manager.configurePool({ diskBudgetGb: 200 });
    expect(next.diskBudgetGb).toBe(200);
    expect(next.allowedOrgs).toEqual(['Qwen']);
    expect(next.allowedFamilies).toEqual(['qwen3']);
    expect(next.entries.map((e) => e.ollamaName)).toEqual(['qwen3:32b']);

    const after = await manager.configurePool({ allowedOrgs: ['Qwen', 'deepseek-ai'] });
    expect(after.diskBudgetGb).toBe(200);
    expect(after.allowedOrgs).toEqual(['Qwen', 'deepseek-ai']);
  });

  it('snapshot returns a frozen clone (OT24)', async () => {
    const seeded = seededState({}, [entry()]);
    const { manager } = await makeManager(seeded);
    const first = manager.snapshot();
    first.entries.push({ ...entry(), ollamaName: 'tamper' });
    const second = manager.snapshot();
    expect(second.entries.map((e) => e.ollamaName)).toEqual(['qwen3:32b']);
  });

  it('isAllowed honors family case-insensitivity and org case-sensitivity (OT25)', async () => {
    const seeded = seededState({ allowedOrgs: ['Qwen'], allowedFamilies: ['Qwen3'] });
    const { manager } = await makeManager(seeded);
    expect(manager.isAllowed({ hfRepoId: 'Qwen/Qwen3', family: 'qwen3' })).toBe(true);
    expect(manager.isAllowed({ hfRepoId: 'Qwen/Qwen3', family: 'qwen2' })).toBe(false);
    expect(manager.isAllowed({ hfRepoId: 'qwen/Qwen3', family: 'qwen3' })).toBe(false); // org case-sensitive
    expect(manager.isAllowed({ hfRepoId: 'Qwen/Qwen3' })).toBe(false); // family required when allowedFamilies non-empty

    await manager.configurePool({ allowedFamilies: [] });
    expect(manager.isAllowed({ hfRepoId: 'Qwen/Qwen3' })).toBe(true); // any family allowed
  });
});

describe('PoolManager — adapter selection (advisory short-circuit)', () => {
  it('install against AdvisoryInstallAdapter surfaces advisory_only (S6 / D4)', async () => {
    const fs = makeFs();
    const store = new PoolStateStore({ path: POOL_PATH, fs: fs.fs });
    await store.load();
    const manager = new PoolManager({
      store,
      installer: new AdvisoryInstallAdapter({ backend: 'lmstudio' }),
      now: () => FROZEN_NOW,
    });
    await manager.configurePool({ allowedOrgs: ['Qwen'], diskBudgetGb: 100 });
    const result = await manager.install({
      hfRepoId: 'Qwen/Qwen3-32B-GGUF',
      ollamaName: 'qwen3:32b',
    });
    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.code).toBe('advisory_only');
    }
  });
});
