/**
 * sync-plugin-pin.mjs — keep the pinned MCP server version in the plugin
 * manifests in lockstep with the published CLI version.
 *
 * Each marketplace manifest launches the MCP server via an npx pin, e.g.
 *
 *   "args": ["-y", "-p", "@harness-engineering/cli@10.2.0", "harness-mcp"]
 *
 * The release flow bumps `packages/cli/package.json` (`changeset version`) but
 * does NOT touch these manifests, so the pin used to be a manual, forgettable
 * step. This script reads the CLI version and rewrites the
 * `@harness-engineering/cli@<version>` token inside every manifest's
 * `mcpServers.harness.args` to match.
 *
 * It is wired into the root `version` script so the changesets "Version
 * Packages" PR carries the manifest pin bump in the same commit that bumps the
 * CLI version. A human still reviews that PR.
 *
 * Formatting note: the rewrite is a surgical replacement of only the version
 * token in the raw file text — NOT a JSON.stringify round-trip. Prettier keeps
 * the short `args` array inline, which JSON.stringify would expand, so a full
 * re-serialize would create noise and fail `prettier --check`. The JSON parse
 * is used to locate the pin robustly; the write preserves byte-for-byte
 * formatting everywhere except the version number.
 *
 * Idempotent: at the target version it changes nothing and reports "already in
 * sync". Node ESM, no dependencies.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Manifests carrying the MCP pin, relative to the repo root. */
export const MANIFEST_PATHS = [
  '.claude-plugin/plugin.json',
  '.codex-plugin/plugin.json',
  '.cursor-plugin/plugin.json',
  '.gemini-extension/gemini-extension.json',
  '.antigravity-extension/config/mcp_config.json',
];

const PIN_PREFIX = '@harness-engineering/cli@';
const PIN_RE = /^@harness-engineering\/cli@/;

/** Read the CLI package version that the pins should track. */
export function readCliVersion(root = REPO_ROOT) {
  const pkg = JSON.parse(readFileSync(path.join(root, 'packages', 'cli', 'package.json'), 'utf8'));
  return pkg.version;
}

/**
 * Locate the pinned CLI version inside a parsed manifest's
 * `mcpServers.harness.args`. Prefers the value that follows a `-p` flag; falls
 * back to any arg matching the pin prefix. Returns the current version string,
 * or null if no pin is present.
 */
export function findPinnedVersion(manifest) {
  const args = manifest?.mcpServers?.harness?.args;
  if (!Array.isArray(args)) return null;
  const pFlag = args.indexOf('-p');
  if (
    pFlag !== -1 &&
    pFlag + 1 < args.length &&
    typeof args[pFlag + 1] === 'string' &&
    PIN_RE.test(args[pFlag + 1])
  ) {
    return args[pFlag + 1].slice(PIN_PREFIX.length);
  }
  const matched = args.find((a) => typeof a === 'string' && PIN_RE.test(a));
  return matched ? matched.slice(PIN_PREFIX.length) : null;
}

/**
 * Compute the synced content for a single manifest.
 *
 * @param {string} raw - the manifest file's current text.
 * @param {string} version - the target CLI version.
 * @returns {{ status: 'synced' | 'unchanged' | 'no-pin', previous: string|null, content: string }}
 */
export function syncManifestContent(raw, version) {
  const manifest = JSON.parse(raw);
  const previous = findPinnedVersion(manifest);
  if (previous === null) {
    return { status: 'no-pin', previous: null, content: raw };
  }
  if (previous === version) {
    return { status: 'unchanged', previous, content: raw };
  }
  const content = raw.split(PIN_PREFIX + previous).join(PIN_PREFIX + version);
  return { status: 'synced', previous, content };
}

/** Run the sync across every manifest. Returns the number of files changed. */
export function syncPluginPins(root = REPO_ROOT, { log = console.log } = {}) {
  const version = readCliVersion(root);
  let changed = 0;
  for (const rel of MANIFEST_PATHS) {
    const abs = path.join(root, rel);
    const raw = readFileSync(abs, 'utf8');
    const { status, previous, content } = syncManifestContent(raw, version);
    if (status === 'no-pin') {
      log(`${rel}: no @harness-engineering/cli pin found — skipped`);
      continue;
    }
    if (status === 'unchanged') {
      log(`${rel}: already in sync (@${version})`);
      continue;
    }
    writeFileSync(abs, content);
    changed += 1;
    log(`${rel}: updated pin ${previous} -> ${version}`);
  }
  log(changed === 0 ? 'All manifests already in sync.' : `Updated ${changed} manifest(s).`);
  return changed;
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  syncPluginPins();
}
