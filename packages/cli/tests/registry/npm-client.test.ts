import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  resolvePackageName,
  fetchPackageMetadata,
  downloadTarball,
  type NpmPackageMetadata,
} from '../../src/registry/npm-client';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('resolvePackageName', () => {
  it('prepends @harness-skills/ to bare name', () => {
    expect(resolvePackageName('deployment')).toBe('@harness-skills/deployment');
  });

  it('returns already-scoped name unchanged', () => {
    expect(resolvePackageName('@harness-skills/deployment')).toBe('@harness-skills/deployment');
  });

  it('rejects non-harness-skills scoped packages', () => {
    expect(() => resolvePackageName('@other/pkg')).toThrow(
      'Only @harness-skills/ scoped packages are supported'
    );
  });
});

describe('fetchPackageMetadata', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches and returns metadata for a valid package', async () => {
    const mockMetadata: NpmPackageMetadata = {
      name: '@harness-skills/deployment',
      'dist-tags': { latest: '1.2.0' },
      versions: {
        '1.0.0': {
          version: '1.0.0',
          dist: {
            tarball: 'https://registry.npmjs.org/@harness-skills/deployment/-/deployment-1.0.0.tgz',
            shasum: 'abc123',
            integrity: 'sha512-abc123',
          },
        },
        '1.2.0': {
          version: '1.2.0',
          dist: {
            tarball: 'https://registry.npmjs.org/@harness-skills/deployment/-/deployment-1.2.0.tgz',
            shasum: 'def456',
            integrity: 'sha512-def456',
          },
        },
      },
    };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockMetadata),
    });

    const result = await fetchPackageMetadata('@harness-skills/deployment');
    expect(result).toEqual(mockMetadata);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://registry.npmjs.org/%40harness-skills%2Fdeployment',
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  it('throws on 404 (package not found)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    });
    await expect(fetchPackageMetadata('@harness-skills/nonexistent')).rejects.toThrow(
      'Package @harness-skills/nonexistent not found'
    );
  });

  it('throws with network error message on fetch failure', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('fetch failed'));
    await expect(fetchPackageMetadata('@harness-skills/deployment')).rejects.toThrow(
      'Cannot reach npm registry'
    );
  });
});

describe('downloadTarball', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('downloads tarball and returns Buffer', async () => {
    const tarballContent = Buffer.from('fake-tarball-content');
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: () => Promise.resolve(tarballContent.buffer),
    });

    const result = await downloadTarball('https://example.com/pkg.tgz');
    expect(Buffer.isBuffer(result)).toBe(true);
  });

  it('retries once on failure then succeeds', async () => {
    const tarballContent = Buffer.from('fake-tarball-content');
    mockFetch.mockRejectedValueOnce(new Error('network error')).mockResolvedValueOnce({
      ok: true,
      arrayBuffer: () => Promise.resolve(tarballContent.buffer),
    });

    const result = await downloadTarball('https://example.com/pkg.tgz');
    expect(Buffer.isBuffer(result)).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('throws after retry exhausted', async () => {
    mockFetch
      .mockRejectedValueOnce(new Error('network error'))
      .mockRejectedValueOnce(new Error('network error'));

    await expect(downloadTarball('https://example.com/pkg.tgz')).rejects.toThrow('Download failed');
  });

  it('throws on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });

    await expect(downloadTarball('https://example.com/pkg.tgz')).rejects.toThrow('Download failed');
  });
});
