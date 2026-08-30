import * as fs from 'fs';
import * as path from 'path';
import { detectEcosystem, type Ecosystem } from '@harness-engineering/orchestrator';
import { COMPREHENSION_ROOT } from '@harness-engineering/core';
import type { ResolvedTemplate } from './engine.js';
import { appendFrameworkSection } from './agents-append.js';

/**
 * Persist tooling and framework metadata into harness.config.json after template write.
 * Shared between CLI init and MCP init_project.
 */
export function persistToolingConfig(
  targetDir: string,
  resolveResult: ResolvedTemplate,
  framework?: string
): void {
  const configPath = path.join(targetDir, 'harness.config.json');
  if (!fs.existsSync(configPath)) return;

  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    const overlayMeta = resolveResult.overlayMetadata;

    // Add framework to template section
    if (framework) {
      config.template = config.template || {};
      config.template.framework = framework;
    }

    // Add tooling from overlay metadata (framework takes precedence over base)
    if (overlayMeta?.tooling) {
      config.tooling = { ...config.tooling, ...overlayMeta.tooling };
      delete config.tooling.lockFile;
    } else if (resolveResult.metadata.tooling && !config.tooling) {
      config.tooling = { ...resolveResult.metadata.tooling };
      delete config.tooling.lockFile;
    }

    // Remove level:null for non-JS languages
    if (config.template?.level === null || config.template?.level === undefined) {
      delete config.template.level;
    }

    fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
  } catch {
    // Config file is malformed — skip patching silently
  }
}

/**
 * Ensure .harness/.gitignore exists so runtime artifacts are never committed.
 * Shared between CLI init and MCP init_project.
 */
export function ensureHarnessGitignore(targetDir: string): void {
  const gitignorePath = path.join(targetDir, '.harness', '.gitignore');

  // Tracked categories (intentionally NOT ignored):
  //   hooks/                       — team-policy enforcement scripts (block-no-verify,
  //                                  protect-config, quality-warner, …) plus profile.json.
  //                                  Treated like a lockfile: review CLI-upgrade diffs.
  //   security/timeline.json       — shared security trend ledger keyed by commit hash.
  //                                  Lifecycle paths are repo-relative.
  const content = `# Runtime artifacts (generated, ephemeral, session-scoped)
analyses/
graph/
debug/
interactions/
sessions/
streams/
workspaces/
state.json
state.events.jsonl
state.snapshot.json
state/
handoff.json
handoff-*.json
autopilot-state.json
session-taint-*.json
dispatch-last-head.txt
health-snapshot.json
release-readiness.json
skills-index.json
stack-profile.json
metrics/
.install-id
telemetry.json
.telemetry-notice-shown
# tokens.json*: generated gateway-token store (and disabled/backup variants)
tokens.json*

# Phase 3 webhook delivery queue — SQLite runtime DB (and WAL/SHM sidecars)
webhook-queue.sqlite
webhook-queue.sqlite-wal
webhook-queue.sqlite-shm
# Maintenance task run history (regenerated each tick)
maintenance/
# craft/: generated craft-run records
craft/
# spill/: generated overflow/spill artifacts
spill/

# security/: track timeline.json (trend ledger), ignore everything else
security/*
!security/timeline.json
`;

  fs.mkdirSync(path.dirname(gitignorePath), { recursive: true });

  if (!fs.existsSync(gitignorePath)) {
    fs.writeFileSync(gitignorePath, content);
    return;
  }

  // Preserve user customizations: only append template entries not already present.
  const existing = fs.readFileSync(gitignorePath, 'utf8');
  const existingLines = new Set(existing.split('\n').map((l) => l.trim()));
  const missing = content
    .split('\n')
    .filter((l) => l.trim() && !l.startsWith('#') && !existingLines.has(l.trim()));
  if (missing.length > 0) {
    const prefix = existing.endsWith('\n') ? '' : '\n';
    fs.appendFileSync(gitignorePath, prefix + missing.join('\n') + '\n');
  }
}

/** Marker line prefixed to the harness-managed block in the repo-root `.ignore`. */
const SEARCH_IGNORE_MARKER = '# harness: committed compiled-comprehension units';

/** The single ignore pattern that excludes the committed comprehension shard tree. */
const COMPREHENSION_SEARCH_IGNORE_PATTERN = `${COMPREHENSION_ROOT}/`;

/**
 * Ensure a repo-root `.ignore` excludes the committed compiled-comprehension shard
 * tree (`.harness/comprehension/`) from raw text/file search (issue #1692).
 *
 * The units are TRACKED on purpose (the LLM-free serve-time hash gate needs them
 * committed), but that makes them show up in `rg` / `grep -r` / editor code search,
 * doubling hits on any symbol that appears in both the source and its unit's
 * summary/interface-contract — ironic for a context-reduction feature. Ripgrep,
 * `fd`, and `ag` all honor a `.ignore` file and skip its patterns EVEN for tracked
 * files, so a `.harness/comprehension/` entry there hides the units from raw search
 * WITHOUT untracking them from git. Harness's own graph-scoped tools never ingest
 * `.harness/`, so they are unaffected.
 *
 * `.ignore` (not `.gitignore`) is deliberate: `.gitignore` would untrack the units
 * and break the serve-time gate. `.ignore` is a search-layer concern only.
 *
 * Never throws — a read/write failure degrades to a no-op so scaffolding never fails
 * on this advisory step. Preserves user customizations: creates the file when absent,
 * otherwise appends the pattern only when it is not already present.
 */
export function ensureComprehensionSearchIgnore(targetDir: string): void {
  try {
    const ignorePath = path.join(targetDir, '.ignore');
    const block = `${SEARCH_IGNORE_MARKER}\n${COMPREHENSION_SEARCH_IGNORE_PATTERN}\n`;

    if (!fs.existsSync(ignorePath)) {
      fs.writeFileSync(ignorePath, block);
      return;
    }

    const existing = fs.readFileSync(ignorePath, 'utf8');
    const present = existing
      .split('\n')
      .some((l) => l.trim() === COMPREHENSION_SEARCH_IGNORE_PATTERN);
    if (present) return;

    const prefix = existing.length === 0 || existing.endsWith('\n') ? '' : '\n';
    fs.appendFileSync(ignorePath, prefix + block);
  } catch {
    // Advisory step — a read/write/permission failure must never fail scaffolding.
  }
}

/**
 * Append framework conventions to existing AGENTS.md after template write.
 * Shared between CLI init and MCP init_project.
 */
export function appendFrameworkAgents(
  targetDir: string,
  framework?: string,
  language?: string
): void {
  if (!framework) return;
  const agentsPath = path.join(targetDir, 'AGENTS.md');
  if (!fs.existsSync(agentsPath)) return;

  try {
    const existing = fs.readFileSync(agentsPath, 'utf-8');
    const updated = appendFrameworkSection(existing, framework, language);
    if (updated !== existing) {
      fs.writeFileSync(agentsPath, updated);
    }
  } catch {
    // AGENTS.md is unreadable — skip append silently
  }
}

export interface EcosystemAfterCreateResult {
  ecosystem: Ecosystem | null;
  orchestratorConfigWritten: boolean;
  rewritten: boolean;
  installCommand?: string;
}

const ORCHESTRATOR_CONFIG = 'harness.orchestrator.md';

/**
 * Best-effort post-write step: when the scaffolded orchestrator config is in the
 * write set and an ecosystem is detected at `cwd`, rewrite the single
 * `afterCreate:` frontmatter line to the ecosystem's install command. Never throws
 * — a read/write failure or an absent/malformed `afterCreate:` line degrades to
 * `rewritten: false` so `harness init` never fails on this advisory step.
 */
export function applyEcosystemAfterCreate(
  cwd: string,
  writtenFiles: string[]
): EcosystemAfterCreateResult {
  const ecosystem = detectEcosystem(cwd);
  const configPath = path.join(cwd, ORCHESTRATOR_CONFIG);
  const orchestratorConfigWritten =
    writtenFiles.includes(ORCHESTRATOR_CONFIG) && fs.existsSync(configPath);

  if (!ecosystem || !orchestratorConfigWritten) {
    return { ecosystem, orchestratorConfigWritten, rewritten: false };
  }

  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    // Anchored to the `afterCreate:` key; non-global → first match only. Sibling
    // hook lines and the comment block above are untouched. The separator after
    // the colon is `[ \t]` (not `\s`) so an empty-value `afterCreate:` line does
    // not match — matching `\s` there would let it consume the following newline
    // and delete the next sibling hook line (the docstring's "malformed → no-op").
    const pattern = /^([ \t]*)afterCreate:[ \t].*$/m;
    if (!pattern.test(content)) {
      return { ecosystem, orchestratorConfigWritten, rewritten: false };
    }
    // Replacer function (not a replacement string) so the install command is
    // treated as a literal — a `$` in the command would otherwise be reinterpreted
    // as a `$n`/`$&` pattern by String.prototype.replace.
    const updated = content.replace(
      pattern,
      (_match, indent: string) => `${indent}afterCreate: '${ecosystem.installCommand}'`
    );
    fs.writeFileSync(configPath, updated);
    return {
      ecosystem,
      orchestratorConfigWritten,
      rewritten: true,
      installCommand: ecosystem.installCommand,
    };
  } catch {
    // Read/write failure — degrade to no-op; init must not fail here.
    return { ecosystem, orchestratorConfigWritten, rewritten: false };
  }
}
