import { describe, expect, it } from 'vitest';

import { InstallError } from '../../src/installer/errors.js';
import { OllamaInstallAdapter } from '../../src/installer/ollama.js';
import type {
  InstallEvent,
  InstallerFetchResponse,
  InstallerFetcher,
} from '../../src/installer/types.js';

interface RecordedCall {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
}

function asyncLines(lines: string[]): AsyncIterable<string> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const line of lines) yield line;
    },
  };
}

function streamingResponse(status: number, lines: string[]): InstallerFetchResponse {
  return {
    status,
    json: async () => {
      throw new Error('streaming response — no json');
    },
    text: async () => lines.join('\n'),
    body: asyncLines(lines),
  };
}

function jsonResponse(status: number, body: unknown): InstallerFetchResponse {
  return {
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

function textResponse(status: number, body: string): InstallerFetchResponse {
  return {
    status,
    json: async () => {
      throw new Error('not json');
    },
    text: async () => body,
  };
}

function makeFetcher(
  responder: (call: RecordedCall) => InstallerFetchResponse | Promise<InstallerFetchResponse>
): { fetcher: InstallerFetcher; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const fetcher: InstallerFetcher = async (url, init) => {
    const call: RecordedCall = {
      url,
      method: init.method,
      headers: init.headers,
      body: init.body,
      signal: init.signal,
    };
    calls.push(call);
    return responder(call);
  };
  return { fetcher, calls };
}

describe('OllamaInstallAdapter.install', () => {
  it('streams pulling → progress → success events and resolves success', async () => {
    const lines = [
      '{"status":"pulling manifest"}',
      '{"status":"downloading","completed":50,"total":100}',
      '{"status":"success"}',
    ];
    const { fetcher, calls } = makeFetcher(() => streamingResponse(200, lines));
    const adapter = new OllamaInstallAdapter({ fetcher });

    const events: InstallEvent[] = [];
    const result = await adapter.install({
      name: 'qwen3:32b',
      onEvent: (e) => events.push(e),
    });

    expect(result).toEqual({ status: 'success', name: 'qwen3:32b' });
    expect(events.map((e) => e.kind)).toEqual(['pulling', 'progress', 'success']);
    expect(events[1]).toMatchObject({
      kind: 'progress',
      completedBytes: 50,
      totalBytes: 100,
      message: 'downloading',
    });

    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call?.url).toBe('http://localhost:11434/api/pull');
    expect(call?.method).toBe('POST');
    expect(call?.headers?.['Content-Type']).toBe('application/json');
    expect(JSON.parse(call?.body ?? '{}')).toEqual({ name: 'qwen3:32b', stream: true });
  });

  it('maps manifest-not-found stream errors to failed_target_missing', async () => {
    const lines = ['{"error":"pull model manifest: file does not exist"}'];
    const { fetcher } = makeFetcher(() => streamingResponse(200, lines));
    const adapter = new OllamaInstallAdapter({ fetcher });

    const events: InstallEvent[] = [];
    const result = await adapter.install({
      name: 'qwen3:32b',
      onEvent: (e) => events.push(e),
    });

    expect(result).toEqual({
      status: 'error',
      code: 'failed_target_missing',
      message: 'pull model manifest: file does not exist',
    });
    expect(events).toEqual([
      {
        kind: 'error',
        code: 'failed_target_missing',
        message: 'pull model manifest: file does not exist',
      },
    ]);
  });

  it('maps fetcher rejection (ECONNREFUSED) to installer_unavailable', async () => {
    const fetcher: InstallerFetcher = async () => {
      throw new Error('connect ECONNREFUSED 127.0.0.1:11434');
    };
    const adapter = new OllamaInstallAdapter({ fetcher });
    const result = await adapter.install({ name: 'qwen3:32b' });
    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.code).toBe('installer_unavailable');
      expect(result.message).toContain('ECONNREFUSED');
    }
  });

  it('maps a stream that ends without success to install_failed', async () => {
    const lines = [
      '{"status":"pulling manifest"}',
      '{"status":"downloading","completed":50,"total":100}',
    ];
    const { fetcher } = makeFetcher(() => streamingResponse(200, lines));
    const adapter = new OllamaInstallAdapter({ fetcher });
    const events: InstallEvent[] = [];
    const result = await adapter.install({ name: 'qwen3:32b', onEvent: (e) => events.push(e) });
    expect(result).toEqual({
      status: 'error',
      code: 'install_failed',
      message: 'pull stream ended without success',
    });
    expect(events.at(-1)).toEqual({
      kind: 'error',
      code: 'install_failed',
      message: 'pull stream ended without success',
    });
  });

  it('maps a non-2xx HTTP response to failed_target_missing on 404', async () => {
    const { fetcher } = makeFetcher(() => textResponse(404, 'not found'));
    const adapter = new OllamaInstallAdapter({ fetcher });
    const result = await adapter.install({ name: 'ghost:1b' });
    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.code).toBe('failed_target_missing');
    }
  });

  it('maps a non-2xx HTTP response to installer_unavailable on 5xx', async () => {
    const { fetcher } = makeFetcher(() => textResponse(503, 'busy'));
    const adapter = new OllamaInstallAdapter({ fetcher });
    const result = await adapter.install({ name: 'qwen3:32b' });
    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.code).toBe('installer_unavailable');
    }
  });

  it('forwards the caller signal into the fetcher init', async () => {
    const lines = ['{"status":"success"}'];
    const { fetcher, calls } = makeFetcher(() => streamingResponse(200, lines));
    const adapter = new OllamaInstallAdapter({ fetcher });
    const controller = new AbortController();
    await adapter.install({ name: 'qwen3:32b', signal: controller.signal });
    expect(calls[0]?.signal).toBe(controller.signal);
  });

  it('does not throw when the onEvent callback throws', async () => {
    const warnings: string[] = [];
    const lines = ['{"status":"pulling manifest"}', '{"status":"success"}'];
    const { fetcher } = makeFetcher(() => streamingResponse(200, lines));
    const adapter = new OllamaInstallAdapter({ fetcher, onWarn: (m) => warnings.push(m) });
    const result = await adapter.install({
      name: 'qwen3:32b',
      onEvent: () => {
        throw new Error('consumer boom');
      },
    });
    expect(result.status).toBe('success');
    expect(warnings.some((m) => m.includes('event consumer'))).toBe(true);
  });
});

describe('OllamaInstallAdapter.evict', () => {
  it('issues DELETE /api/delete and resolves success on 200', async () => {
    const { fetcher, calls } = makeFetcher(() => jsonResponse(200, {}));
    const adapter = new OllamaInstallAdapter({ fetcher });
    const result = await adapter.evict({ name: 'qwen3:32b' });
    expect(result).toEqual({ status: 'success', name: 'qwen3:32b' });
    expect(calls[0]?.method).toBe('DELETE');
    expect(calls[0]?.url).toBe('http://localhost:11434/api/delete');
    expect(JSON.parse(calls[0]?.body ?? '{}')).toEqual({ name: 'qwen3:32b' });
  });

  it('maps 404 to not_in_pool', async () => {
    const { fetcher } = makeFetcher(() => textResponse(404, 'missing'));
    const adapter = new OllamaInstallAdapter({ fetcher });
    const result = await adapter.evict({ name: 'qwen3:32b' });
    expect(result).toEqual({
      status: 'error',
      code: 'not_in_pool',
      message: 'ollama delete 404 for qwen3:32b',
    });
  });

  it('maps a network rejection to installer_unavailable', async () => {
    const fetcher: InstallerFetcher = async () => {
      throw new Error('ECONNREFUSED');
    };
    const adapter = new OllamaInstallAdapter({ fetcher });
    const result = await adapter.evict({ name: 'qwen3:32b' });
    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.code).toBe('installer_unavailable');
    }
  });
});

describe('OllamaInstallAdapter.list', () => {
  it('parses /api/tags into RemoteModelInfo[]', async () => {
    const body = {
      models: [
        {
          name: 'qwen3:32b',
          size: 4_294_967_296, // exactly 4 GiB
          digest: 'sha256:abc',
          modified_at: '2026-05-29T12:00:00.000Z',
        },
        { name: 'llama3:8b', size: 8 * 1024 ** 3 },
      ],
    };
    const { fetcher, calls } = makeFetcher(() => jsonResponse(200, body));
    const adapter = new OllamaInstallAdapter({ fetcher });
    const list = await adapter.list();
    expect(list).toEqual([
      {
        ollamaName: 'qwen3:32b',
        sizeOnDiskGb: 4,
        digest: 'sha256:abc',
        modifiedAt: '2026-05-29T12:00:00.000Z',
      },
      { ollamaName: 'llama3:8b', sizeOnDiskGb: 8 },
    ]);
    expect(calls[0]?.method).toBe('GET');
    expect(calls[0]?.url).toBe('http://localhost:11434/api/tags');
  });

  it('returns an empty array and warns when the shape is unexpected', async () => {
    const warnings: string[] = [];
    const { fetcher } = makeFetcher(() => jsonResponse(200, { models: 'not-an-array' }));
    const adapter = new OllamaInstallAdapter({ fetcher, onWarn: (m) => warnings.push(m) });
    await expect(adapter.list()).resolves.toEqual([]);
    expect(warnings).toEqual(['ollama tags response missing models array']);
  });

  it('throws InstallError(installer_unavailable) on fetcher rejection', async () => {
    const fetcher: InstallerFetcher = async () => {
      throw new Error('ECONNREFUSED');
    };
    const adapter = new OllamaInstallAdapter({ fetcher });
    const err = await adapter.list().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(InstallError);
    expect((err as InstallError).code).toBe('installer_unavailable');
  });

  it('skips entries with missing fields rather than throwing', async () => {
    const { fetcher } = makeFetcher(() =>
      jsonResponse(200, {
        models: [
          { name: 'good:1b', size: 1024 ** 3 },
          { name: 'no-size:1b' },
          { size: 1024 ** 3 },
          null,
          'string',
        ],
      })
    );
    const adapter = new OllamaInstallAdapter({ fetcher });
    await expect(adapter.list()).resolves.toEqual([{ ollamaName: 'good:1b', sizeOnDiskGb: 1 }]);
  });

  it('forwards the caller signal into the fetcher init', async () => {
    const { fetcher, calls } = makeFetcher(() => jsonResponse(200, { models: [] }));
    const adapter = new OllamaInstallAdapter({ fetcher });
    const controller = new AbortController();
    await adapter.list({ signal: controller.signal });
    // Internal fetchWithTimeout combines signals, so the inner signal is a
    // composed controller; we assert that *some* signal was forwarded.
    expect(calls[0]?.signal).toBeInstanceOf(AbortSignal);
  });
});

describe('OllamaInstallAdapter.inspect', () => {
  it('parses /api/show into RemoteModelInfo', async () => {
    const body = {
      size_bytes: 18 * 1024 ** 3,
      digest: 'sha256:def',
      modified_at: '2026-05-29T12:00:00.000Z',
    };
    const { fetcher, calls } = makeFetcher(() => jsonResponse(200, body));
    const adapter = new OllamaInstallAdapter({ fetcher });
    const info = await adapter.inspect({ name: 'qwen3:32b' });
    expect(info).toEqual({
      ollamaName: 'qwen3:32b',
      sizeOnDiskGb: 18,
      digest: 'sha256:def',
      modifiedAt: '2026-05-29T12:00:00.000Z',
    });
    expect(calls[0]?.method).toBe('POST');
    expect(calls[0]?.url).toBe('http://localhost:11434/api/show');
    expect(JSON.parse(calls[0]?.body ?? '{}')).toEqual({ name: 'qwen3:32b' });
  });

  it('accepts legacy size field on older Ollama versions', async () => {
    const { fetcher } = makeFetcher(() => jsonResponse(200, { size: 4 * 1024 ** 3 }));
    const adapter = new OllamaInstallAdapter({ fetcher });
    const info = await adapter.inspect({ name: 'qwen3:8b' });
    expect(info.sizeOnDiskGb).toBe(4);
  });

  it('throws InstallError(failed_target_missing) on 404', async () => {
    const { fetcher } = makeFetcher(() => textResponse(404, 'no such model'));
    const adapter = new OllamaInstallAdapter({ fetcher });
    const err = await adapter.inspect({ name: 'ghost:1b' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(InstallError);
    expect((err as InstallError).code).toBe('failed_target_missing');
    expect((err as InstallError).target).toBe('ghost:1b');
  });

  it('throws InstallError(parse_failed) on missing size field', async () => {
    const { fetcher } = makeFetcher(() => jsonResponse(200, { digest: 'sha256:x' }));
    const adapter = new OllamaInstallAdapter({ fetcher });
    const err = await adapter.inspect({ name: 'qwen3:32b' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(InstallError);
    expect((err as InstallError).code).toBe('parse_failed');
  });

  it('throws InstallError(installer_unavailable) on fetcher rejection', async () => {
    const fetcher: InstallerFetcher = async () => {
      throw new Error('ECONNREFUSED');
    };
    const adapter = new OllamaInstallAdapter({ fetcher });
    const err = await adapter.inspect({ name: 'qwen3:32b' }).catch((e: unknown) => e);
    expect((err as InstallError).code).toBe('installer_unavailable');
    expect((err as InstallError).target).toBe('qwen3:32b');
  });
});
