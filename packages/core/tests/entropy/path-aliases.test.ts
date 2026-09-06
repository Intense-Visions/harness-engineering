import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { dirname, join, resolve, sep } from 'path';
import {
  loadPathAliases,
  resolveAliasCandidates,
  type PathAlias,
} from '../../src/entropy/path-aliases';

/**
 * Characterization tests for the currently-shipped behavior of the tsconfig
 * `paths` alias loader (`loadPathAliases` / `resolveAliasCandidates`).
 *
 * The module exists to prevent the regression in issue #1759: before it, any
 * file reached only through an alias import (`@lib/foo`) was falsely reported
 * dead because the dead-code resolver treated every non-relative specifier as an
 * external package. `tests/entropy/detectors/dead-code-path-alias.test.ts`
 * covers the happy path indirectly through `buildSnapshot`; these tests pin the
 * loader's own contract directly — the degenerate configs, the JSONC tolerance,
 * the `extends` chain, the `baseUrl` semantics, and the match ordering.
 *
 * `loadPathAliases` reads the real filesystem, so every case builds a throwaway
 * tsconfig tree under `os.tmpdir()`; nothing is written into the repo.
 *
 * Windows: `normalizeTargets` builds target prefixes with `path.resolve`, so
 * they carry the platform separator, and `resolveAliasCandidates` converts the
 * wildcard capture to the platform separator too. Every path assertion below
 * therefore either compares `toPosix(...)` on both sides or builds the expected
 * value with `path.resolve` — never a hardcoded `/`.
 */
describe('entropy/path-aliases', () => {
  const tempRoots: string[] = [];

  /** Normalize to POSIX separators so assertions match on Windows too. */
  const toPosix = (p: string): string => p.replaceAll('\\', '/');

  /** Compare two absolute paths separator-independently. */
  const expectSamePath = (actual: string, expected: string): void => {
    expect(toPosix(actual)).toBe(toPosix(expected));
  };

  async function makeRoot(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'path-aliases-'));
    tempRoots.push(dir);
    return dir;
  }

  /** Write a config file (creating parent dirs) at `relPath` under `root`. */
  async function writeConfig(root: string, relPath: string, contents: string): Promise<void> {
    const full = join(root, relPath);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, contents, 'utf8');
  }

  afterEach(async () => {
    await Promise.all(tempRoots.map((dir) => rm(dir, { recursive: true, force: true })));
    tempRoots.length = 0;
  });

  describe('loadPathAliases — configurations that yield no aliases', () => {
    it('returns an empty list when the root has no tsconfig.json', async () => {
      const root = await makeRoot();

      await expect(loadPathAliases(root)).resolves.toEqual([]);
    });

    it('returns an empty list when tsconfig declares no compilerOptions.paths', async () => {
      const root = await makeRoot();
      await writeConfig(
        root,
        'tsconfig.json',
        JSON.stringify({ compilerOptions: { baseUrl: '.', strict: true } })
      );

      await expect(loadPathAliases(root)).resolves.toEqual([]);
    });

    it('returns an empty list when tsconfig has no compilerOptions block at all', async () => {
      const root = await makeRoot();
      await writeConfig(root, 'tsconfig.json', JSON.stringify({ include: ['src'] }));

      await expect(loadPathAliases(root)).resolves.toEqual([]);
    });

    it('returns an empty list when the tsconfig path exists but cannot be read', async () => {
      const root = await makeRoot();
      // A directory at the tsconfig path passes the existence check but fails the
      // read, exercising the unreadable-config branch deterministically.
      await mkdir(join(root, 'tsconfig.json'), { recursive: true });

      await expect(loadPathAliases(root)).resolves.toEqual([]);
    });

    it('falls back to an empty list — silently — when tsconfig is unparseable', async () => {
      // Deliberate silent fallback, not an oversight: the docblock frames alias
      // support as "opt-in with zero configuration", so a broken tsconfig must
      // degrade to "no aliases" rather than throwing and taking down the whole
      // entropy scan. This test pins that contract; a future change that starts
      // throwing (or logging-and-throwing) here should fail this test on purpose.
      const root = await makeRoot();
      await writeConfig(root, 'tsconfig.json', '{ "compilerOptions": { "paths": { oops');

      await expect(loadPathAliases(root)).resolves.toEqual([]);
    });
  });

  describe('loadPathAliases — JSONC tolerance', () => {
    it('parses a tsconfig with line comments, block comments and trailing commas', async () => {
      const root = await makeRoot();
      await writeConfig(
        root,
        'tsconfig.json',
        `{
  // Line comment before compilerOptions.
  /*
   * Block comment spanning
   * several lines.
   */
  "compilerOptions": {
    "baseUrl": ".", // trailing line comment
    "paths": {
      "@lib/*": ["src/lib/*",], // trailing comma inside the target array
    },
  },
}`
      );

      const aliases = await loadPathAliases(root);

      expect(aliases).toHaveLength(1);
      expect(aliases[0]?.prefix).toBe('@lib/');
      expect(resolveAliasCandidates('@lib/widget', aliases)).toEqual([
        resolve(root, 'src/lib/widget'),
      ]);
    });

    it('preserves a `//` sequence inside a string literal instead of stripping it as a comment', async () => {
      // Strings are the first alternative in the JSONC token regex. If they were
      // not, `//keep/*": [...]` would be eaten to end-of-line, leaving an
      // unterminated string, and the whole config would silently parse to `[]`.
      const root = await makeRoot();
      await writeConfig(
        root,
        'tsconfig.json',
        `{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@lib//keep/*": ["src/keep/*"]
    }
  }
}`
      );

      const aliases = await loadPathAliases(root);

      expect(aliases).toHaveLength(1);
      expect(aliases[0]?.prefix).toBe('@lib//keep/');
      expect(resolveAliasCandidates('@lib//keep/thing', aliases)).toEqual([
        resolve(root, 'src/keep/thing'),
      ]);
    });

    it('preserves a `/*` … `*/` pair that only exists inside string literals', async () => {
      // `"@a/*"` opens a `/*` and `"src/*/deep"` closes it with `*/`. Unprotected
      // strings would let the block-comment rule swallow everything between them.
      const root = await makeRoot();
      await writeConfig(
        root,
        'tsconfig.json',
        `{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@a/*": ["src/*/deep"]
    }
  }
}`
      );

      const aliases = await loadPathAliases(root);

      expect(aliases).toHaveLength(1);
      expect(aliases[0]?.prefix).toBe('@a/');
      // The target's own wildcard sits mid-path, so the capture is spliced into
      // the middle and the target suffix is preserved.
      expect(resolveAliasCandidates('@a/foo', aliases)).toEqual([resolve(root, 'src/foo/deep')]);
    });
  });

  describe('loadPathAliases — extends chain', () => {
    it('inherits paths from a relative `./base.json` extends', async () => {
      const root = await makeRoot();
      await writeConfig(
        root,
        'base.json',
        JSON.stringify({ compilerOptions: { baseUrl: '.', paths: { '@lib/*': ['src/lib/*'] } } })
      );
      await writeConfig(root, 'tsconfig.json', JSON.stringify({ extends: './base.json' }));

      const aliases = await loadPathAliases(root);

      expect(aliases.map((a) => a.prefix)).toEqual(['@lib/']);
      expect(resolveAliasCandidates('@lib/widget', aliases)).toEqual([
        resolve(root, 'src/lib/widget'),
      ]);
    });

    it('appends `.json` to an extends value that has no suffix', async () => {
      const root = await makeRoot();
      await writeConfig(
        root,
        'tsconfig.base.json',
        JSON.stringify({ compilerOptions: { baseUrl: '.', paths: { '@lib/*': ['src/lib/*'] } } })
      );
      // No `.json` suffix — the loader must append one to find the file.
      await writeConfig(root, 'tsconfig.json', JSON.stringify({ extends: './tsconfig.base' }));

      const aliases = await loadPathAliases(root);

      expect(aliases.map((a) => a.prefix)).toEqual(['@lib/']);
      expect(resolveAliasCandidates('@lib/widget', aliases)).toEqual([
        resolve(root, 'src/lib/widget'),
      ]);
    });

    it('follows an absolute extends path', async () => {
      const root = await makeRoot();
      const basePath = join(root, 'cfgs', 'base.json');
      await writeConfig(
        root,
        join('cfgs', 'base.json'),
        JSON.stringify({ compilerOptions: { baseUrl: '.', paths: { '@lib/*': ['src/lib/*'] } } })
      );
      await writeConfig(root, 'tsconfig.json', JSON.stringify({ extends: basePath }));

      const aliases = await loadPathAliases(root);

      expect(aliases.map((a) => a.prefix)).toEqual(['@lib/']);
      // baseUrl "." came from the base config, so it resolves against cfgs/.
      expect(resolveAliasCandidates('@lib/widget', aliases)).toEqual([
        resolve(root, 'cfgs/src/lib/widget'),
      ]);
    });

    it('skips a bare package extends, inheriting nothing from it', async () => {
      const root = await makeRoot();
      // A real file at the bare specifier's node_modules location. It must NOT be
      // read: bare extends resolution is deliberately unimplemented.
      await writeConfig(
        root,
        join('node_modules', '@tsconfig', 'node20', 'tsconfig.json'),
        JSON.stringify({ compilerOptions: { baseUrl: '.', paths: { '@pkg/*': ['pkg/*'] } } })
      );
      await writeConfig(
        root,
        'tsconfig.json',
        JSON.stringify({ extends: '@tsconfig/node20/tsconfig.json' })
      );

      await expect(loadPathAliases(root)).resolves.toEqual([]);
    });

    it('lets the nearer config replace — not merge — the extended config paths', async () => {
      const root = await makeRoot();
      await writeConfig(
        root,
        'base.json',
        JSON.stringify({
          compilerOptions: { paths: { '@base/*': ['base-src/*'], '@lib/*': ['base-lib/*'] } },
        })
      );
      await writeConfig(
        root,
        'tsconfig.json',
        JSON.stringify({
          extends: './base.json',
          compilerOptions: { baseUrl: '.', paths: { '@lib/*': ['child-lib/*'] } },
        })
      );

      const aliases = await loadPathAliases(root);

      // The child's `paths` object wins wholesale, so `@base/*` disappears
      // entirely rather than being merged in (matching TS's own semantics).
      expect(aliases.map((a) => a.prefix)).toEqual(['@lib/']);
      expect(resolveAliasCandidates('@lib/widget', aliases)).toEqual([
        resolve(root, 'child-lib/widget'),
      ]);
      expect(resolveAliasCandidates('@base/thing', aliases)).toEqual([]);
    });

    it('follows a multi-level extends chain that stays within the bound', async () => {
      const root = await makeRoot();
      const depth = 8;
      for (let level = 0; level < depth; level += 1) {
        await writeConfig(
          root,
          `base${level}.json`,
          JSON.stringify({ extends: `./base${level + 1}.json` })
        );
      }
      await writeConfig(
        root,
        `base${depth}.json`,
        JSON.stringify({ compilerOptions: { baseUrl: '.', paths: { '@deep/*': ['deep/*'] } } })
      );
      await writeConfig(root, 'tsconfig.json', JSON.stringify({ extends: './base0.json' }));

      const aliases = await loadPathAliases(root);

      expect(aliases.map((a) => a.prefix)).toEqual(['@deep/']);
      expect(resolveAliasCandidates('@deep/widget', aliases)).toEqual([
        resolve(root, 'deep/widget'),
      ]);
    });

    it('stops following a chain deeper than the bound instead of inheriting from it', async () => {
      const root = await makeRoot();
      const depth = 12;
      for (let level = 0; level < depth; level += 1) {
        await writeConfig(
          root,
          `base${level}.json`,
          JSON.stringify({ extends: `./base${level + 1}.json` })
        );
      }
      // Only the config past the bound declares paths.
      await writeConfig(
        root,
        `base${depth}.json`,
        JSON.stringify({ compilerOptions: { baseUrl: '.', paths: { '@deep/*': ['deep/*'] } } })
      );
      await writeConfig(root, 'tsconfig.json', JSON.stringify({ extends: './base0.json' }));

      await expect(loadPathAliases(root)).resolves.toEqual([]);
    });

    it('terminates on a circular extends chain', async () => {
      const root = await makeRoot();
      await writeConfig(root, 'tsconfig.json', JSON.stringify({ extends: './a.json' }));
      await writeConfig(root, 'a.json', JSON.stringify({ extends: './b.json' }));
      await writeConfig(root, 'b.json', JSON.stringify({ extends: './a.json' }));

      // The depth bound is what makes this terminate at all; without it the test
      // would hang rather than fail.
      await expect(loadPathAliases(root)).resolves.toEqual([]);
    });
  });

  describe('loadPathAliases — baseUrl semantics', () => {
    it('resolves targets against the baseUrl declared by a parent config', async () => {
      const root = await makeRoot();
      // baseUrl lives in cfgs/base.json, so it resolves relative to cfgs/ …
      await writeConfig(
        root,
        join('cfgs', 'base.json'),
        JSON.stringify({ compilerOptions: { baseUrl: './src' } })
      );
      // … while `paths` is declared by the child at the root.
      await writeConfig(
        root,
        'tsconfig.json',
        JSON.stringify({
          extends: './cfgs/base.json',
          compilerOptions: { paths: { '@lib/*': ['lib/*'] } },
        })
      );

      const aliases = await loadPathAliases(root);

      // Parent's baseUrlDir (cfgs/) + parent's baseUrl (src) wins over the
      // child's own directory.
      expect(resolveAliasCandidates('@lib/widget', aliases)).toEqual([
        resolve(root, 'cfgs/src/lib/widget'),
      ]);
    });

    it('resolves targets against the declaring config directory when no baseUrl is set (TS5)', async () => {
      const root = await makeRoot();
      await writeConfig(
        root,
        join('config', 'base.json'),
        JSON.stringify({ compilerOptions: { paths: { '@lib/*': ['lib/*'] } } })
      );
      await writeConfig(root, 'tsconfig.json', JSON.stringify({ extends: './config/base.json' }));

      const aliases = await loadPathAliases(root);

      // baseUrl is absent everywhere, so targets are relative to the directory of
      // the config that declared `paths` — config/, not the project root.
      expect(resolveAliasCandidates('@lib/widget', aliases)).toEqual([
        resolve(root, 'config/lib/widget'),
      ]);
    });

    it('keeps an absolute target as-is rather than re-resolving it against baseUrl', async () => {
      const root = await makeRoot();
      const absoluteTarget = join(root, 'elsewhere', '*');
      await writeConfig(
        root,
        'tsconfig.json',
        JSON.stringify({
          compilerOptions: { baseUrl: './src', paths: { '@abs/*': [absoluteTarget] } },
        })
      );

      const aliases = await loadPathAliases(root);

      expectSamePath(
        resolveAliasCandidates('@abs/widget', aliases)[0] ?? '',
        resolve(root, 'elsewhere', 'widget')
      );
    });
  });

  describe('loadPathAliases — malformed paths entries', () => {
    it('skips patterns whose target list is empty or not an array, keeping the valid ones', async () => {
      const root = await makeRoot();
      await writeConfig(
        root,
        'tsconfig.json',
        JSON.stringify({
          compilerOptions: {
            baseUrl: '.',
            paths: {
              '@empty/*': [],
              '@notarray/*': 'src/notarray/*',
              '@ok/*': ['src/ok/*'],
            },
          },
        })
      );

      const aliases = await loadPathAliases(root);

      expect(aliases.map((a) => a.prefix)).toEqual(['@ok/']);
      expect(resolveAliasCandidates('@empty/thing', aliases)).toEqual([]);
      expect(resolveAliasCandidates('@notarray/thing', aliases)).toEqual([]);
      expect(resolveAliasCandidates('@ok/thing', aliases)).toEqual([resolve(root, 'src/ok/thing')]);
    });
  });

  describe('loadPathAliases — pattern and target shapes', () => {
    it('marks a pattern without a `*` as non-wildcard and matches it only on an exact specifier', async () => {
      const root = await makeRoot();
      await writeConfig(
        root,
        'tsconfig.json',
        JSON.stringify({
          compilerOptions: { baseUrl: '.', paths: { '@app/config': ['src/config.ts'] } },
        })
      );

      const aliases = await loadPathAliases(root);

      expect(aliases).toHaveLength(1);
      expect(aliases[0]?.isWildcard).toBe(false);
      expect(aliases[0]?.prefix).toBe('@app/config');
      expect(aliases[0]?.suffix).toBe('');
      expect(resolveAliasCandidates('@app/config', aliases)).toEqual([
        resolve(root, 'src/config.ts'),
      ]);
      // A longer specifier sharing the prefix must not match a non-wildcard alias.
      expect(resolveAliasCandidates('@app/config/nested', aliases)).toEqual([]);
      expect(resolveAliasCandidates('@app/confi', aliases)).toEqual([]);
    });

    it('emits one candidate per target, in declaration order', async () => {
      const root = await makeRoot();
      await writeConfig(
        root,
        'tsconfig.json',
        JSON.stringify({
          compilerOptions: {
            baseUrl: '.',
            paths: { '@lib/*': ['src/first/*', 'src/second/*', 'src/third/*'] },
          },
        })
      );

      const aliases = await loadPathAliases(root);

      expect(aliases[0]?.targets).toHaveLength(3);
      expect(resolveAliasCandidates('@lib/widget', aliases)).toEqual([
        resolve(root, 'src/first/widget'),
        resolve(root, 'src/second/widget'),
        resolve(root, 'src/third/widget'),
      ]);
    });

    it('ignores the captured segment when the target itself has no wildcard', async () => {
      const root = await makeRoot();
      await writeConfig(
        root,
        'tsconfig.json',
        JSON.stringify({
          compilerOptions: { baseUrl: '.', paths: { '@barrel/*': ['src/barrel/index.ts'] } },
        })
      );

      const aliases = await loadPathAliases(root);

      expect(resolveAliasCandidates('@barrel/anything/at/all', aliases)).toEqual([
        resolve(root, 'src/barrel/index.ts'),
      ]);
    });

    it('splices a multi-segment capture using the platform separator', async () => {
      const root = await makeRoot();
      await writeConfig(
        root,
        'tsconfig.json',
        JSON.stringify({
          compilerOptions: { baseUrl: '.', paths: { '@lib/*': ['src/lib/*'] } },
        })
      );

      const aliases = await loadPathAliases(root);
      const [candidate] = resolveAliasCandidates('@lib/nested/deep', aliases);

      // The specifier always uses `/`; the emitted candidate must use the
      // platform separator so it lines up with snapshot file keys on Windows.
      expect(candidate).toBe(resolve(root, 'src/lib/nested/deep'));
      expect(candidate).toContain(`lib${sep}nested${sep}deep`);
    });
  });

  describe('resolveAliasCandidates — matching and ordering', () => {
    const wildcardAlias = (prefix: string, targetPrefix: string, suffix = ''): PathAlias => ({
      prefix,
      suffix,
      isWildcard: true,
      targets: [{ prefix: targetPrefix, suffix: '', isWildcard: true }],
    });

    it('returns an empty list when the specifier matches no alias', async () => {
      const root = await makeRoot();
      await writeConfig(
        root,
        'tsconfig.json',
        JSON.stringify({ compilerOptions: { baseUrl: '.', paths: { '@lib/*': ['src/lib/*'] } } })
      );

      const aliases = await loadPathAliases(root);

      expect(resolveAliasCandidates('react', aliases)).toEqual([]);
      expect(resolveAliasCandidates('./relative', aliases)).toEqual([]);
      expect(resolveAliasCandidates('@other/widget', aliases)).toEqual([]);
    });

    it('returns an empty list when the alias table itself is empty', () => {
      expect(resolveAliasCandidates('@lib/widget', [])).toEqual([]);
    });

    it('orders the more specific alias first when several match (longest prefix wins)', async () => {
      const root = await makeRoot();
      await writeConfig(
        root,
        'tsconfig.json',
        JSON.stringify({
          compilerOptions: {
            baseUrl: '.',
            // Declaration order puts the *less* specific alias first on purpose,
            // so ordering can only come from the longest-prefix sort.
            paths: { '@lib/*': ['src/lib/*'], '@lib/nested/*': ['src/nested-override/*'] },
          },
        })
      );

      const aliases = await loadPathAliases(root);
      expect(aliases.map((a) => a.prefix)).toEqual(['@lib/', '@lib/nested/']);

      expect(resolveAliasCandidates('@lib/nested/deep', aliases)).toEqual([
        resolve(root, 'src/nested-override/deep'),
        resolve(root, 'src/lib/nested/deep'),
      ]);
      // A specifier that only the broad alias matches is unaffected.
      expect(resolveAliasCandidates('@lib/plain', aliases)).toEqual([
        resolve(root, 'src/lib/plain'),
      ]);
    });

    it('requires the specifier to be long enough to hold both the prefix and the suffix', () => {
      const targetPrefix = resolve('/gen') + sep;
      const alias: PathAlias = {
        prefix: '@gen/',
        suffix: '/index',
        isWildcard: true,
        targets: [{ prefix: targetPrefix, suffix: `${sep}index`, isWildcard: true }],
      };

      // '@gen/index' starts with the prefix AND ends with the suffix, but the two
      // overlap — there is no room left for a capture, so it must not match.
      expect(resolveAliasCandidates('@gen/index', [alias])).toEqual([]);
      expectSamePath(
        resolveAliasCandidates('@gen/widget/index', [alias])[0] ?? '',
        resolve('/gen', 'widget', 'index')
      );
    });

    it('matches every alias whose prefix the specifier shares, not just the best one', () => {
      const first = wildcardAlias('@lib/', resolve('/a') + sep);
      const second = wildcardAlias('@lib/deep/', resolve('/b') + sep);

      const candidates = resolveAliasCandidates('@lib/deep/thing', [first, second]);

      expect(candidates).toHaveLength(2);
      expectSamePath(candidates[0] ?? '', resolve('/b', 'thing'));
      expectSamePath(candidates[1] ?? '', resolve('/a', 'deep', 'thing'));
    });
  });
});
