/**
 * Unit + CLI tests for the pnpm.overrides floor check (issue #2258).
 *
 * A root `pnpm.overrides` floor is the repo's dependency security floor, but
 * nothing verified that a floor reached pnpm-lock.yaml: a floor could read as
 * curated while the lockfile resolved a version below it. These tests pin the
 * offline check: an inert floor (resolved below the override's range) FAILS, a
 * satisfied floor PASSES, and lockfile/package.json drift FAILS.
 *
 * No network. Run with:
 *   node --test tests/scripts/override-floors.test.mjs
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  checkFloors,
  findAdvancements,
  parseLockfile,
  parseOverrideKey,
  satisfies,
} from '../../scripts/override-floors.mjs';

const SCRIPT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'scripts',
  'override-floors.mjs'
);

/** Build a lockfile v6 text with the given recorded overrides and packages. */
function lockfileV6(overrides, packages) {
  const ovr = Object.entries(overrides)
    .map(([k, v]) => `  '${k}': '${v}'`)
    .join('\n');
  const pkgs = packages
    .map((p) => `  /${p}:\n    resolution: {integrity: sha512-x}\n    dev: true\n`)
    .join('\n');
  return [
    "lockfileVersion: '6.0'",
    '',
    'settings:',
    '  autoInstallPeers: true',
    '',
    'overrides:',
    ovr,
    '',
    'importers:',
    '',
    '  .:',
    '    devDependencies:',
    '      foo:',
    '        specifier: ^1.0.0',
    '        version: 1.0.0',
    '',
    'packages:',
    '',
    pkgs,
  ].join('\n');
}

// --- fixture pairs ------------------------------------------------------------

/** Floor raised in package.json, lockfile regenerated, but resolution stuck below it. */
const INERT = {
  overrides: { undici: '^7.29.1' },
  lock: lockfileV6({ undici: '^7.29.1' }, ['undici@7.29.0', 'foo@1.0.0']),
};

/** Floor raised and the lockfile resolves a version that satisfies it. */
const SATISFIED = {
  overrides: { undici: '^7.29.1' },
  lock: lockfileV6({ undici: '^7.29.1' }, ['undici@7.30.1', 'foo@1.0.0']),
};

// --- semver subset -------------------------------------------------------------

test('satisfies: the range forms pnpm.overrides uses', () => {
  assert.equal(satisfies('7.29.0', '^7.29.1'), false);
  assert.equal(satisfies('7.29.1', '^7.29.1'), true);
  assert.equal(satisfies('8.0.0', '^7.29.1'), false);
  assert.equal(satisfies('0.2.7', '^0.2.6'), true);
  assert.equal(satisfies('0.3.0', '^0.2.6'), false);
  assert.equal(satisfies('3.1.8', '>=3.1.9 <4'), false);
  assert.equal(satisfies('3.1.9', '>=3.1.9 <4'), true);
  assert.equal(satisfies('4.0.0', '>=3.1.9 <4'), false);
  assert.equal(satisfies('4.13.10', '>=4.13.11'), false);
  assert.equal(satisfies('0.27.4', '0.27'), true);
  assert.equal(satisfies('0.28.2', '0.27'), false);
  assert.equal(satisfies('9.0.5', '9'), true);
  assert.equal(satisfies('1.2.3', '<1 || >=1.2.0'), true);
  assert.equal(satisfies('5.0.0-beta.1', '>=5.0.0'), false);
});

test('parseOverrideKey: plain, scoped, selector, scoped+selector, parent>child', () => {
  assert.deepEqual(parseOverrideKey('undici'), { name: 'undici', selector: null });
  assert.deepEqual(parseOverrideKey('@grpc/grpc-js'), { name: '@grpc/grpc-js', selector: null });
  assert.deepEqual(parseOverrideKey('brace-expansion@2'), {
    name: 'brace-expansion',
    selector: '2',
  });
  assert.deepEqual(parseOverrideKey('@scope/x@^1'), { name: '@scope/x', selector: '^1' });
  assert.ok(parseOverrideKey('a>b').unsupported);
});

// --- lockfile parsing ---------------------------------------------------------

test('parseLockfile: v6 keys, peer suffixes, scoped names, recorded overrides', () => {
  const text = [
    "lockfileVersion: '6.0'",
    'overrides:',
    "  '@grpc/grpc-js': ^1.14.5",
    "  brace-expansion@2: '>=2.1.7 <3'",
    'packages:',
    '  /@grpc/grpc-js@1.14.6:',
    '    dev: true',
    '  /brace-expansion@2.1.7:',
    '    dev: true',
    '  /react-router@7.18.2(react-dom@19.0.0)(react@19.0.0):',
    '    dev: true',
    '  /tarball@file:vendor/x.tgz:',
    '    dev: true',
  ].join('\n');
  const { overrides, resolved } = parseLockfile(text);
  assert.deepEqual(overrides, { '@grpc/grpc-js': '^1.14.5', 'brace-expansion@2': '>=2.1.7 <3' });
  assert.deepEqual([...resolved.get('@grpc/grpc-js')], ['1.14.6']);
  assert.deepEqual([...resolved.get('react-router')], ['7.18.2']);
  assert.equal(resolved.has('tarball'), false);
});

test('parseLockfile: v9 keys (no leading slash)', () => {
  const text = [
    'packages:',
    "  '@scope/a@1.2.3':",
    '    resolution: {}',
    '  b@2.0.0:',
    '    resolution: {}',
  ].join('\n');
  const { resolved } = parseLockfile(text);
  assert.deepEqual([...resolved.get('@scope/a')], ['1.2.3']);
  assert.deepEqual([...resolved.get('b')], ['2.0.0']);
});

// --- checkFloors ----------------------------------------------------------------

test('checkFloors: inert floor (resolved below the override) fails', () => {
  const { ok, failures } = checkFloors({
    overrides: INERT.overrides,
    lockfile: parseLockfile(INERT.lock),
  });
  assert.equal(ok, false);
  assert.equal(failures.length, 1);
  assert.equal(failures[0].type, 'inert');
  assert.equal(failures[0].key, 'undici');
  assert.match(failures[0].detail, /undici@7\.29\.0/);
});

test('checkFloors: satisfied floor passes', () => {
  const { ok, failures, checked } = checkFloors({
    overrides: SATISFIED.overrides,
    lockfile: parseLockfile(SATISFIED.lock),
  });
  assert.equal(ok, true, JSON.stringify(failures));
  assert.deepEqual(checked, [
    { key: 'undici', name: 'undici', range: '^7.29.1', versions: ['7.30.1'] },
  ]);
});

test('checkFloors: selector override fails only for instances still inside the selector', () => {
  const overrides = { 'brace-expansion@2': '>=2.1.7 <3', 'esbuild@0.27': '>=0.28.1' };
  const lockOk = parseLockfile(
    lockfileV6(overrides, ['brace-expansion@1.1.12', 'brace-expansion@2.1.7', 'esbuild@0.28.2'])
  );
  assert.equal(checkFloors({ overrides, lockfile: lockOk }).ok, true);

  const lockBad = parseLockfile(
    lockfileV6(overrides, ['brace-expansion@2.1.4', 'esbuild@0.27.3', 'esbuild@0.28.2'])
  );
  const { ok, failures } = checkFloors({ overrides, lockfile: lockBad });
  assert.equal(ok, false);
  assert.deepEqual(failures.map((f) => `${f.type}:${f.key}`).sort(), [
    'inert:brace-expansion@2',
    'inert:esbuild@0.27',
  ]);
});

test('checkFloors: lockfile not regenerated after a floor edit is drift → fail', () => {
  const lock = parseLockfile(lockfileV6({ undici: '^7.29.0' }, ['undici@7.29.0']));
  const { ok, failures } = checkFloors({ overrides: { undici: '^7.29.1' }, lockfile: lock });
  assert.equal(ok, false);
  assert.ok(failures.some((f) => f.type === 'drift' && f.key === 'undici'));
  assert.ok(failures.some((f) => f.type === 'inert' && f.key === 'undici'));
});

test('checkFloors: unparseable range fails closed; unused and parent>child only warn', () => {
  const overrides = { a: '1.0.0 - 2.0.0', b: '>=1.0.0', 'c>d': '^1.0.0', e: 'npm:other@1' };
  const lock = parseLockfile(lockfileV6(overrides, ['a@1.5.0']));
  const { ok, failures, warnings } = checkFloors({ overrides, lockfile: lock });
  assert.equal(ok, false);
  assert.deepEqual(
    failures.map((f) => `${f.type}:${f.key}`),
    ['unparseable:a']
  );
  assert.deepEqual(warnings.map((w) => `${w.type}:${w.key}`).sort(), [
    'unsupported:c>d',
    'unsupported:e',
    'unused:b',
  ]);
});

// --- findAdvancements (--latest advisory) ---------------------------------------

test('findAdvancements: reports the newest stable version the range permits', () => {
  const checked = [{ key: 'undici', name: 'undici', range: '^7.29.1', versions: ['7.29.1'] }];
  const adv = findAdvancements(checked, {
    undici: ['7.29.0', '7.29.1', '7.30.2', '7.31.0-rc.1', '8.0.0'],
  });
  assert.deepEqual(adv, [{ key: 'undici', name: 'undici', resolved: '7.29.1', latest: '7.30.2' }]);
  assert.deepEqual(findAdvancements(checked, { undici: ['7.29.1'] }), []);
});

// --- CLI end to end on fixture package.json + pnpm-lock.yaml pairs --------------

function runCli(fixture) {
  const dir = mkdtempSync(path.join(tmpdir(), 'override-floors-'));
  try {
    writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({ name: 'fixture', private: true, pnpm: { overrides: fixture.overrides } })
    );
    writeFileSync(path.join(dir, 'pnpm-lock.yaml'), fixture.lock);
    return spawnSync(process.execPath, [SCRIPT, '--root', dir], { encoding: 'utf-8' });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('CLI: inert-floor fixture exits 1 and names the stuck resolution', () => {
  const r = runCli(INERT);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stderr, /\[inert\] override undici/);
});

test('CLI: satisfied-floor fixture exits 0', () => {
  const r = runCli(SATISFIED);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /OK — every override floor is in force/);
});
