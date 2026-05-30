import { describe, expect, it } from 'vitest';

import { AdvisoryInstallAdapter } from '../../src/installer/advisory.js';
import { InstallError, isInstallError } from '../../src/installer/errors.js';

describe('AdvisoryInstallAdapter', () => {
  it('renders the LM Studio install command for a plain identifier', () => {
    const adapter = new AdvisoryInstallAdapter({ backend: 'lmstudio' });
    expect(adapter.renderCommand({ name: 'qwen3-32b' })).toBe('lms get qwen3-32b');
  });

  it('renders the vLLM serve command', () => {
    const adapter = new AdvisoryInstallAdapter({ backend: 'vllm' });
    expect(adapter.renderCommand({ name: 'Qwen/Qwen3-32B' })).toBe('vllm serve Qwen/Qwen3-32B');
  });

  it('renders the llama.cpp server command', () => {
    const adapter = new AdvisoryInstallAdapter({ backend: 'llamacpp' });
    expect(adapter.renderCommand({ name: 'qwen3-32b.Q4_K_M.gguf' })).toBe(
      'llama-server -m qwen3-32b.Q4_K_M.gguf'
    );
  });

  it('shell-quotes ids containing spaces or special characters', () => {
    const adapter = new AdvisoryInstallAdapter({ backend: 'lmstudio' });
    expect(adapter.renderCommand({ name: 'foo bar' })).toBe(`lms get 'foo bar'`);
    expect(adapter.renderCommand({ name: "it's" })).toBe(`lms get 'it'\\''s'`);
  });

  it('rejects install with InstallError advisory_only', async () => {
    const adapter = new AdvisoryInstallAdapter({ backend: 'vllm' });
    const err = await adapter.install({ name: 'qwen3-32b' }).catch((e: unknown) => e);
    expect(isInstallError(err)).toBe(true);
    expect((err as InstallError).code).toBe('advisory_only');
    expect((err as InstallError).target).toBe('qwen3-32b');
    expect((err as InstallError).message).toContain('vllm serve qwen3-32b');
  });

  it('rejects evict with InstallError advisory_only', async () => {
    const adapter = new AdvisoryInstallAdapter({ backend: 'lmstudio' });
    const err = await adapter.evict({ name: 'qwen3-32b' }).catch((e: unknown) => e);
    expect((err as InstallError).code).toBe('advisory_only');
    expect((err as InstallError).target).toBe('qwen3-32b');
  });

  it('list resolves to an empty array (resolver is authoritative)', async () => {
    const adapter = new AdvisoryInstallAdapter({ backend: 'llamacpp' });
    await expect(adapter.list()).resolves.toEqual([]);
  });

  it('rejects inspect with InstallError advisory_only', async () => {
    const adapter = new AdvisoryInstallAdapter({ backend: 'vllm' });
    const err = await adapter.inspect({ name: 'qwen3-32b' }).catch((e: unknown) => e);
    expect((err as InstallError).code).toBe('advisory_only');
    expect((err as InstallError).target).toBe('qwen3-32b');
  });
});
