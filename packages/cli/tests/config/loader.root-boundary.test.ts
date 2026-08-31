import { describe, it, expect, vi } from 'vitest';
import * as path from 'path';

let existsSyncOverride: ((p: string) => boolean) | undefined;

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    default: {
      ...actual.default,
      existsSync: (p: unknown) =>
        existsSyncOverride ? existsSyncOverride(p as string) : actual.existsSync(p as never),
    },
    existsSync: (p: unknown) =>
      existsSyncOverride ? existsSyncOverride(p as string) : actual.existsSync(p as never),
  };
});

const { findConfigFile } = await import('../../src/config/loader');

/**
 * bug-fleet HUNT candidate (cli-config-surface area).
 *
 * `findConfigFile`'s docstring says it searches "moving up the directory
 * tree until the root is reached" — implying the root directory itself is
 * checked. The implementation's loop condition is `while (currentDir !==
 * root)`, which stops the moment `currentDir` becomes the root WITHOUT ever
 * running the existence check for that iteration. A `harness.config.json`
 * placed directly at the filesystem root (e.g. a container `WORKDIR /`, or
 * `C:\harness.config.json` on Windows) is therefore never found, even
 * though every directory strictly between the start dir and the root was
 * checked.
 *
 * `fs.existsSync` is mocked so the test never touches the real filesystem
 * root — only the pure path-manipulation control flow of `findConfigFile`
 * is under test.
 */
describe('findConfigFile — filesystem root boundary', () => {
  it('finds a harness.config.json located exactly at the filesystem root', () => {
    const root = path.parse(process.cwd()).root;
    const rootConfigPath = path.join(root, 'harness.config.json');
    // Start several directories below the root; none of the intermediate
    // directories have a config file — only the root does.
    const startDir = path.join(root, 'some', 'nested', 'start-dir');

    existsSyncOverride = (p: string) => p === rootConfigPath;

    const result = findConfigFile(startDir);

    existsSyncOverride = undefined;

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(rootConfigPath);
    }
  });
});
