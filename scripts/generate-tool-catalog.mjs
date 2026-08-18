#!/usr/bin/env node

/**
 * Canonical tool & skill catalog generator — regenerate-and-gate, not detect-only.
 *
 * Boots the *live* MCP tool definitions (from the built CLI dist) and the
 * *live* skill contracts (every `skill.yaml` under agents/skills/claude-code)
 * and emits a single canonical reference catalog that captures each tool's and
 * skill's real name, description, and full declared schema/contract. A `--check`
 * mode regenerates the catalog to a temp location and exits non-zero on any diff,
 * so a divergence between a tool's real input schema and its documented schema
 * fails the build.
 *
 * This is the schema-level twin of `generate-docs.mjs`: `mcp-tools.md` renders a
 * shallow one-line-per-parameter summary and cannot see drift inside a nested
 * object, an enum, an array `items` schema, or the `required` set. This catalog
 * serializes the *entire* live JSON schema, so any such drift is gated.
 *
 * Mirrors the existing generate-then-diff-gate convention exactly
 * (`generate-barrel-exports:check`, `generate-docs --check`): a plain generate
 * command plus a `--check` verify command, wired into CI and the pre-push hook.
 *
 * Usage:
 *   node scripts/generate-tool-catalog.mjs           # generate the catalog
 *   node scripts/generate-tool-catalog.mjs --check    # verify freshness (CI)
 *
 * Output:
 *   docs/reference/tool-catalog.md
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { parse as parseYaml } from 'yaml';

const ROOT = resolve(import.meta.dirname, '..');
const REFERENCE_DIR = join(ROOT, 'docs', 'reference');
const OUTPUT = join(REFERENCE_DIR, 'tool-catalog.md');
const SKILLS_DIR = join(ROOT, 'agents', 'skills', 'claude-code');
const HEADER =
  '<!-- AUTO-GENERATED — do not edit. Run `pnpm run generate:tool-catalog` to regenerate. -->\n\n';

/**
 * Locale-independent, platform-stable string comparison in Unicode code-point
 * order. `localeCompare` is ICU/locale-dependent and can order the same list
 * differently across operating systems, producing platform-dependent bytes and
 * spurious "catalog is stale" CI failures (see generate-docs.mjs #1081). A raw
 * code-point comparison is a total order over distinct strings and is identical
 * on every platform.
 */
function byCodePoint(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Escape angle brackets in prose so VitePress does not parse them as Vue/HTML tags. */
function escapeVitePress(text) {
  return text
    .replace(/<([a-zA-Z])/g, '&lt;$1')
    .replace(/(<\/[a-zA-Z])/g, (m) => '&lt;' + m.slice(2));
}

/**
 * Serialize a value as canonical, deterministic JSON with object keys sorted so
 * the bytes are stable regardless of the source declaration order. Nested
 * objects and arrays are handled recursively; arrays preserve their order
 * (order is meaningful for e.g. `required` and `enum`).
 */
function canonicalJson(value) {
  return JSON.stringify(sortKeysDeep(value), null, 2);
}

function sortKeysDeep(value) {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort(byCodePoint)) {
      out[key] = sortKeysDeep(value[key]);
    }
    return out;
  }
  return value;
}

// ─── MCP tools ───────────────────────────────────────────────────────────────

/**
 * Load the live MCP tool definitions from the built CLI. Requires `pnpm build`
 * first (same precondition as generate-docs.mjs's CLI/MCP references).
 */
async function loadToolDefinitions() {
  const cliModule = await import(join(ROOT, 'packages', 'cli', 'dist', 'index.js'));
  const defs = cliModule.getToolDefinitions?.() ?? cliModule.TOOL_DEFINITIONS;
  if (!Array.isArray(defs) || defs.length === 0) {
    throw new Error(
      'No live MCP tool definitions found. Build the CLI first: pnpm build (getToolDefinitions returned empty).'
    );
  }
  return defs;
}

function renderToolSection(tools) {
  const lines = [`## MCP Tools (${tools.length})\n\n`];
  lines.push(
    'Every shipped MCP tool, booted live from the built server, with its full input schema. ',
    'A drift between a tool’s real schema and this catalog fails the build.\n\n'
  );
  for (const tool of [...tools].sort((a, b) => byCodePoint(a.name, b.name))) {
    lines.push(`### \`${tool.name}\`\n\n`);
    if (tool.description) {
      lines.push(`${escapeVitePress(tool.description)}\n\n`);
    }
    lines.push('**Input schema:**\n\n');
    lines.push('```json\n');
    lines.push(canonicalJson(tool.inputSchema ?? {}));
    lines.push('\n```\n\n');
  }
  return lines.join('');
}

// ─── Skills ──────────────────────────────────────────────────────────────────

/**
 * Load and normalize every skill contract from `skill.yaml`. A skill's "schema"
 * is its declared contract (frontmatter): name, description, tiers, type,
 * cognitive mode, platforms, triggers, and dependencies. Drift in any of these
 * is what this catalog gates.
 */
function loadSkills() {
  if (!existsSync(SKILLS_DIR)) return [];
  const skills = [];
  const entries = readdirSync(SKILLS_DIR, { withFileTypes: true }).sort((a, b) =>
    byCodePoint(a.name, b.name)
  );
  for (const dir of entries) {
    if (!dir.isDirectory()) continue;
    const yamlPath = join(SKILLS_DIR, dir.name, 'skill.yaml');
    if (!existsSync(yamlPath)) continue;
    try {
      const skill = parseYaml(readFileSync(yamlPath, 'utf-8')) ?? {};
      skills.push({
        name: skill.name || dir.name,
        description: skill.description || '',
        tier: skill.tier ?? 3,
        catalogTier: skill.catalog_tier ?? 1,
        type: skill.type || 'flexible',
        cognitiveMode: skill.cognitive_mode || '',
        platforms: skill.platforms || [],
        triggers: skill.triggers || [],
        dependsOn: skill.depends_on || [],
      });
    } catch (err) {
      console.warn(`  ⚠ Skipping malformed skill.yaml: ${yamlPath} (${err.message})`);
    }
  }
  return skills;
}

function renderSkillSection(skills) {
  const lines = [`## Skills (${skills.length})\n\n`];
  lines.push(
    'Every shipped skill contract, read live from its `skill.yaml`. ',
    'A drift between a skill’s real declared contract and this catalog fails the build.\n\n'
  );
  for (const skill of [...skills].sort((a, b) => byCodePoint(a.name, b.name))) {
    lines.push(`### ${escapeVitePress(skill.name)}\n\n`);
    if (skill.description) {
      lines.push(`${escapeVitePress(skill.description)}\n\n`);
    }
    lines.push('**Contract:**\n\n');
    lines.push('```json\n');
    lines.push(
      canonicalJson({
        name: skill.name,
        tier: skill.tier,
        catalogTier: skill.catalogTier,
        type: skill.type,
        cognitiveMode: skill.cognitiveMode,
        platforms: skill.platforms,
        triggers: skill.triggers,
        dependsOn: skill.dependsOn,
      })
    );
    lines.push('\n```\n\n');
  }
  return lines.join('');
}

// ─── Render ──────────────────────────────────────────────────────────────────

async function render() {
  const [tools, skills] = [await loadToolDefinitions(), loadSkills()];
  return (
    HEADER +
    '# Tool & Skill Catalog\n\n' +
    'Canonical, regenerated-and-gated reference for every shipped MCP tool and skill. ' +
    'Unlike the summary in [MCP Tools Reference](./mcp-tools.md), this catalog serializes each ' +
    'tool’s **full live input schema** and each skill’s **full declared contract**, so a ' +
    'divergence between a definition’s real schema and its documentation is caught by ' +
    '`pnpm run generate:tool-catalog:check` in CI rather than drifting silently.\n\n' +
    renderToolSection(tools) +
    renderSkillSection(skills)
  );
}

async function main() {
  const isCheck = process.argv.includes('--check');

  if (!existsSync(REFERENCE_DIR)) mkdirSync(REFERENCE_DIR, { recursive: true });

  // The catalog is emitted as fully deterministic bytes (code-point-sorted
  // entries, deep-sorted JSON keys, `\n` newlines). It is intentionally NOT run
  // through prettier — prettier's embedded-JSON array formatting is non-
  // idempotent around its print-width boundary (it collapses a short `enum`
  // array on one pass and re-expands it on the next), which would make the
  // freshness check flap. The file is listed in `.prettierignore` so
  // `format:check` leaves it alone and this generator is its sole authority.
  const content = await render();

  if (!isCheck) {
    writeFileSync(OUTPUT, content);
    console.log(`✓ Wrote ${OUTPUT}`);
    return;
  }

  // --check: regenerate to a temp location and diff against the committed
  // catalog. Exit non-zero on any difference.
  if (!existsSync(OUTPUT)) {
    console.error(
      '✗ docs/reference/tool-catalog.md is missing. Run `pnpm run generate:tool-catalog`.'
    );
    process.exit(1);
  }
  const tmpDir = join(tmpdir(), `harness-tool-catalog-${process.pid}`);
  mkdirSync(tmpDir, { recursive: true });
  const tmpFile = join(tmpDir, 'tool-catalog.md');
  writeFileSync(tmpFile, content);
  const fresh = readFileSync(tmpFile, 'utf-8');
  const committed = readFileSync(OUTPUT, 'utf-8');
  try {
    rmSync(tmpFile, { force: true });
  } catch {
    /* ignore */
  }
  if (fresh !== committed) {
    console.error(
      '✗ docs/reference/tool-catalog.md is stale — a tool/skill schema drifted from its documentation.\n' +
        '  Run `pnpm run generate:tool-catalog` and commit the result.'
    );
    process.exit(1);
  }
  console.log('✓ Tool & skill catalog is up to date.');
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
