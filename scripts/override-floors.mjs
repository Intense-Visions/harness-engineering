#!/usr/bin/env node
/**
 * Check that every root `pnpm.overrides` security floor is actually in force
 * in pnpm-lock.yaml (issue #2258).
 *
 * The overrides block is the repo's dependency security-floor mechanism, but
 * nothing verified that a floor reached the lockfile: a floor can be written,
 * reviewed and merged while the resolved version stays below it, and nothing
 * moves a floor once it is written. This script makes the first condition a
 * gate and the second one visible.
 *
 * Default (offline) mode — no network, reads only package.json and
 * pnpm-lock.yaml. FAILS (exit 1) when:
 *   (a) inert floor: a resolved instance of an overridden package does not
 *       satisfy the override's range. For a plain `name` key that is ANY
 *       resolved instance (pnpm rewrites every specifier for `name`); for a
 *       `name@selector` key it is an instance still inside the selector but
 *       outside the override range (the override never applied to it).
 *   (b) lockfile drift: the lockfile's recorded `overrides:` block disagrees
 *       with package.json, i.e. the lockfile was not regenerated after a floor
 *       was edited.
 *   (c) an override range this script cannot parse (fail closed — an
 *       unparseable floor must not read as a satisfied one).
 * Warnings (exit 0): an override matching no resolved package (unused), and
 * override forms this script does not evaluate (`parent>child`, `$ref`,
 * `npm:` aliases, removals).
 *
 * `--latest` mode additionally queries `pnpm view <pkg> versions --json` and
 * reports, as an ADVISORY (never a failure), each overridden package whose
 * resolved version is below the newest published version the override's own
 * range already permits — the "the range allowed the fix but nothing moved"
 * rot #2258 measured. Raise the floor string to move it; `pnpm update` cannot.
 *
 * The check logic (`parseRange`, `satisfies`, `parseLockfile`, `checkFloors`,
 * `findAdvancements`) is exported as pure functions for unit testing; only
 * `main()` touches the filesystem or network. Importing has no side effects.
 *
 * Usage: node scripts/override-floors.mjs [--latest] [--root <dir>]
 *   --root  directory holding package.json + pnpm-lock.yaml (default: repo root)
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Minimal semver (the subset pnpm.overrides uses here). Unsupported syntax
// throws, so the caller can fail closed instead of guessing.
// ---------------------------------------------------------------------------

const VERSION_RE = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;
const PARTIAL_RE = /^v?(\d+|[xX*])(?:\.(\d+|[xX*]))?(?:\.(\d+|[xX*]))?(?:-([0-9A-Za-z.-]+))?$/;

/** @returns {{ major: number, minor: number, patch: number, pre: string[] } | null} */
export function parseVersion(v) {
  const m = VERSION_RE.exec(String(v).trim());
  if (!m) return null;
  return { major: +m[1], minor: +m[2], patch: +m[3], pre: m[4] ? m[4].split('.') : [] };
}

/** Compare two parsed versions: negative, zero or positive. */
export function compareVersions(a, b) {
  for (const k of ['major', 'minor', 'patch']) {
    if (a[k] !== b[k]) return a[k] - b[k];
  }
  if (a.pre.length === 0 && b.pre.length === 0) return 0;
  if (a.pre.length === 0) return 1; // release > prerelease
  if (b.pre.length === 0) return -1;
  for (let i = 0; i < Math.max(a.pre.length, b.pre.length); i++) {
    const x = a.pre[i];
    const y = b.pre[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const xn = /^\d+$/.test(x);
    const yn = /^\d+$/.test(y);
    if (xn && yn && +x !== +y) return +x - +y;
    if (xn !== yn) return xn ? -1 : 1;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

const v = (major, minor, patch, pre = []) => ({ major, minor, patch, pre });
const isWild = (s) => s === undefined || s === 'x' || s === 'X' || s === '*';

/** Expand one comparator token into a list of [op, version] bounds. */
function expandComparator(token) {
  if (token === '*' || token === 'x' || token === 'X' || token === '') return [];
  const m = /^(\^|~|>=|<=|>|<|=)?(.+)$/.exec(token);
  const op = m[1] || '';
  const p = PARTIAL_RE.exec(m[2]);
  if (!p) throw new Error(`unsupported comparator ${JSON.stringify(token)}`);
  const [, Ms, ms, ps, pre] = p;
  if (isWild(Ms)) {
    if (op === '<' || op === '>') return [['<', v(0, 0, 0, ['0'])]]; // matches nothing
    return [];
  }
  const M = +Ms;
  const preArr = pre ? pre.split('.') : [];
  if (isWild(ms)) {
    // Partial major: "5", ">=5", "<5", "^5", "~5".
    switch (op) {
      case '>=':
        return [['>=', v(M, 0, 0)]];
      case '>':
        return [['>=', v(M + 1, 0, 0)]];
      case '<':
        return [['<', v(M, 0, 0, ['0'])]];
      case '<=':
        return [['<', v(M + 1, 0, 0, ['0'])]];
      default:
        return [
          ['>=', v(M, 0, 0)],
          ['<', v(M + 1, 0, 0, ['0'])],
        ];
    }
  }
  const mi = +ms;
  if (isWild(ps)) {
    // Partial minor: "0.27", ">=1.2", "^1.2", "~1.2".
    switch (op) {
      case '>=':
        return [['>=', v(M, mi, 0)]];
      case '>':
        return [['>=', v(M, mi + 1, 0)]];
      case '<':
        return [['<', v(M, mi, 0, ['0'])]];
      case '<=':
        return [['<', v(M, mi + 1, 0, ['0'])]];
      case '^':
        return M === 0
          ? [
              ['>=', v(0, mi, 0)],
              ['<', v(0, mi + 1, 0, ['0'])],
            ]
          : [
              ['>=', v(M, mi, 0)],
              ['<', v(M + 1, 0, 0, ['0'])],
            ];
      default:
        return [
          ['>=', v(M, mi, 0)],
          ['<', v(M, mi + 1, 0, ['0'])],
        ];
    }
  }
  const full = v(M, mi, +ps, preArr);
  switch (op) {
    case '^': {
      const upper =
        M > 0 ? v(M + 1, 0, 0, ['0']) : mi > 0 ? v(0, mi + 1, 0, ['0']) : v(0, 0, +ps + 1, ['0']);
      return [
        ['>=', full],
        ['<', upper],
      ];
    }
    case '~':
      return [
        ['>=', full],
        ['<', v(M, mi + 1, 0, ['0'])],
      ];
    case '':
    case '=':
      return [['=', full]];
    default:
      return [[op, full]];
  }
}

/**
 * Parse a semver range into a list of comparator sets (OR of ANDs).
 * Throws on syntax outside the supported subset (hyphen ranges, etc.).
 */
export function parseRange(range) {
  const text = String(range).trim();
  if (/\s-\s/.test(text))
    throw new Error(`hyphen ranges are not supported: ${JSON.stringify(range)}`);
  return text.split('||').map((set) =>
    set
      .trim()
      // Allow "> = 1.2.3"-style spacing between an operator and its version.
      .replace(/(\^|~|>=|<=|>|<|=)\s+/g, '$1')
      .split(/\s+/)
      .filter(Boolean)
      .flatMap(expandComparator)
  );
}

/** Does `version` satisfy `range`? Throws when either cannot be parsed. */
export function satisfies(version, range) {
  const ver = typeof version === 'string' ? parseVersion(version) : version;
  if (!ver) throw new Error(`unparseable version ${JSON.stringify(version)}`);
  const sets = typeof range === 'string' ? parseRange(range) : range;
  return sets.some((set) =>
    set.every(([op, bound]) => {
      const c = compareVersions(ver, bound);
      switch (op) {
        case '>=':
          return c >= 0;
        case '>':
          return c > 0;
        case '<':
          return c < 0;
        case '<=':
          return c <= 0;
        default:
          return c === 0;
      }
    })
  );
}

// ---------------------------------------------------------------------------
// Lockfile + override key parsing
// ---------------------------------------------------------------------------

const unquote = (s) =>
  s
    .trim()
    .replace(/^'(.*)'$/s, '$1')
    .replace(/^"(.*)"$/s, '$1');

/**
 * Parse the parts of pnpm-lock.yaml this check needs, without a YAML
 * dependency: the recorded `overrides:` block, and every resolved
 * `name -> versions` pair from the `packages:` section. Handles lockfile v6
 * keys (`/name@1.2.3(peer@x):`) and v9 keys (`name@1.2.3(peer@x):`).
 *
 * @param {string} text
 * @returns {{ overrides: Record<string, string> | null, resolved: Map<string, Set<string>> }}
 */
export function parseLockfile(text) {
  const lines = String(text).split(/\r?\n/);
  let section = null;
  let overrides = null;
  const resolved = new Map();
  for (const line of lines) {
    const top = /^([A-Za-z][\w-]*):\s*$/.exec(line);
    if (top) {
      section = top[1];
      if (section === 'overrides') overrides = {};
      continue;
    }
    if (/^\S/.test(line)) {
      section = null;
      continue;
    }
    if (section === 'overrides') {
      const m = /^ {2}('[^']*'|"[^"]*"|[^:\s][^:]*?):\s*(.+?)\s*$/.exec(line);
      if (m) overrides[unquote(m[1])] = unquote(m[2]);
    } else if (section === 'packages') {
      const m = /^ {2}(\S.*):\s*$/.exec(line);
      if (!m) continue;
      const key = unquote(m[1]).replace(/^\//, '').replace(/\(.*$/, '');
      const at = key.lastIndexOf('@');
      if (at <= 0) continue;
      const name = key.slice(0, at);
      const version = key.slice(at + 1);
      if (!parseVersion(version)) continue; // tarball/link/git keys — not a semver resolution
      if (!resolved.has(name)) resolved.set(name, new Set());
      resolved.get(name).add(version);
    }
  }
  return { overrides, resolved };
}

/**
 * Split an override key into `{ name, selector }`, or `{ unsupported }` for
 * forms this check does not evaluate (`parent>child`).
 */
export function parseOverrideKey(key) {
  if (key.includes('>')) return { unsupported: 'parent>child override' };
  const at = key.indexOf('@', key.startsWith('@') ? 1 : 0);
  if (at === -1) return { name: key, selector: null };
  return { name: key.slice(0, at), selector: key.slice(at + 1) };
}

/** Override targets that are not version ranges and are not evaluated. */
function unsupportedTarget(target) {
  if (target === '-') return 'removal override';
  if (target.startsWith('$')) return 'reference to a direct dependency ($)';
  if (/^(npm|link|file|workspace|git|github|https?):/.test(target)) return 'non-range target';
  return null;
}

/**
 * Check every override floor against the resolved lockfile.
 *
 * @param {object} args
 * @param {Record<string, string>} args.overrides package.json `pnpm.overrides`.
 * @param {{ overrides: Record<string, string> | null, resolved: Map<string, Set<string>> }} args.lockfile
 * @returns {{
 *   ok: boolean,
 *   failures: Array<{ type: 'inert' | 'drift' | 'unparseable', key: string, detail: string }>,
 *   warnings: Array<{ type: 'unused' | 'unsupported', key: string, detail: string }>,
 *   checked: Array<{ key: string, name: string, range: string, versions: string[] }>,
 * }}
 */
export function checkFloors({ overrides, lockfile }) {
  const failures = [];
  const warnings = [];
  const checked = [];
  const ovr = overrides && typeof overrides === 'object' ? overrides : {};

  // (b) drift between package.json and the lockfile's recorded overrides.
  const recorded = lockfile.overrides || {};
  for (const key of new Set([...Object.keys(ovr), ...Object.keys(recorded)])) {
    if (ovr[key] !== recorded[key]) {
      failures.push({
        type: 'drift',
        key,
        detail:
          `override ${key}: package.json says ${JSON.stringify(ovr[key] ?? null)}, pnpm-lock.yaml ` +
          `records ${JSON.stringify(recorded[key] ?? null)}. Run \`pnpm install\` to re-resolve.`,
      });
    }
  }

  for (const [key, target] of Object.entries(ovr)) {
    const parsedKey = parseOverrideKey(key);
    const why = parsedKey.unsupported || unsupportedTarget(String(target));
    if (why) {
      warnings.push({ type: 'unsupported', key, detail: `override ${key}: ${why} — not checked.` });
      continue;
    }
    const { name, selector } = parsedKey;
    let range;
    let selectorRange = null;
    try {
      range = parseRange(target);
      if (selector) selectorRange = parseRange(selector);
    } catch (err) {
      failures.push({
        type: 'unparseable',
        key,
        detail: `override ${key}: ${JSON.stringify(target)} — ${err.message}. Cannot verify the floor.`,
      });
      continue;
    }
    const versions = [...(lockfile.resolved.get(name) || [])];
    const inScope = selectorRange
      ? versions.filter((ver) => satisfies(ver, selectorRange) || satisfies(ver, range))
      : versions;
    if (inScope.length === 0) {
      warnings.push({
        type: 'unused',
        key,
        detail: `override ${key}: no resolved ${name}${selector ? `@${selector}` : ''} in pnpm-lock.yaml — the floor protects nothing and may be removable.`,
      });
      continue;
    }
    for (const ver of inScope) {
      if (!satisfies(ver, range)) {
        failures.push({
          type: 'inert',
          key,
          detail: `override ${key}: ${JSON.stringify(target)} is NOT in force — pnpm-lock.yaml resolves ${name}@${ver}.`,
        });
      }
    }
    checked.push({
      key,
      name,
      range: target,
      versions: inScope.filter((x) => satisfies(x, range)),
    });
  }

  return { ok: failures.length === 0, failures, warnings, checked };
}

/**
 * Advisory: for each checked override, the newest published version its own
 * range permits, when that is newer than a resolved instance.
 *
 * @param {Array<{ key: string, name: string, range: string, versions: string[] }>} checked
 * @param {Record<string, string[]>} published name -> published versions.
 * @returns {Array<{ key: string, name: string, resolved: string, latest: string }>}
 */
export function findAdvancements(checked, published) {
  const out = [];
  for (const c of checked) {
    const candidates = (published[c.name] || [])
      .map((s) => ({ s, p: parseVersion(s) }))
      .filter(({ p }) => p && p.pre.length === 0 && satisfies(p, c.range));
    if (candidates.length === 0) continue;
    const latest = candidates.reduce((a, b) => (compareVersions(a.p, b.p) >= 0 ? a : b));
    for (const ver of c.versions) {
      if (compareVersions(parseVersion(ver), latest.p) < 0) {
        out.push({ key: c.key, name: c.name, resolved: ver, latest: latest.s });
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function publishedVersions(name) {
  const out = execFileSync('pnpm', ['view', name, 'versions', '--json'], {
    encoding: 'utf-8',
    maxBuffer: 64 * 1024 * 1024,
    shell: process.platform === 'win32',
  });
  const parsed = JSON.parse(out);
  return Array.isArray(parsed) ? parsed : [parsed];
}

function main() {
  const here = dirname(fileURLToPath(import.meta.url));
  const rootIdx = process.argv.indexOf('--root');
  const repoRoot =
    rootIdx !== -1 && process.argv[rootIdx + 1]
      ? resolve(process.argv[rootIdx + 1])
      : resolve(here, '..');
  const latestMode = process.argv.includes('--latest');

  const pkg = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf-8'));
  const overrides = (pkg.pnpm && pkg.pnpm.overrides) || {};
  const lockfile = parseLockfile(readFileSync(resolve(repoRoot, 'pnpm-lock.yaml'), 'utf-8'));
  const { ok, failures, warnings, checked } = checkFloors({ overrides, lockfile });

  const total = Object.keys(overrides).length;
  console.log(
    `override-floors: ${total} pnpm.overrides ${total === 1 ? 'entry' : 'entries'}, ` +
      `${checked.length} verified in force against pnpm-lock.yaml.`
  );
  for (const w of warnings) console.log(`  [warn] ${w.detail}`);

  if (latestMode) {
    const published = {};
    for (const name of new Set(checked.map((c) => c.name))) {
      try {
        published[name] = publishedVersions(name);
      } catch (err) {
        console.log(`  [warn] could not query published versions of ${name}: ${err.message}`);
      }
    }
    const adv = findAdvancements(checked, published);
    for (const a of adv) {
      console.log(
        `  [advisory] ${a.key}: resolved ${a.name}@${a.resolved}, but the range permits ${a.latest}. ` +
          `If ${a.latest} carries a fix, raise the floor — \`pnpm update\` cannot move an override.`
      );
    }
    if (adv.length === 0)
      console.log('  --latest: every resolved instance is the newest its range permits.');
  }

  if (ok) {
    console.log('\nOK — every override floor is in force in pnpm-lock.yaml.');
    process.exit(0);
  }
  console.error('\noverride-floors FAILED:');
  for (const f of failures) console.error(`  [${f.type}] ${f.detail}`);
  console.error(
    '\nA pnpm.overrides floor that the lockfile does not honour protects nothing while\n' +
      'looking curated. Re-resolve with `pnpm install` (pinned pnpm from packageManager)\n' +
      'and commit the lockfile. See issue #2258.'
  );
  process.exit(1);
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();
