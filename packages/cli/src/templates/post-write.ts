import * as fs from 'fs';
import * as path from 'path';
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
  //                                  protect-config, quality-gate, …) plus profile.json.
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
events.jsonl
.install-id
telemetry.json
.telemetry-notice-shown

# Phase 3 webhook delivery queue — SQLite runtime DB (and WAL/SHM sidecars)
webhook-queue.sqlite
webhook-queue.sqlite-wal
webhook-queue.sqlite-shm
# Maintenance task run history (regenerated each tick)
maintenance/

# security/: track timeline.json (trend ledger), ignore everything else
security/*
!security/timeline.json
`;

  fs.mkdirSync(path.dirname(gitignorePath), { recursive: true });
  fs.writeFileSync(gitignorePath, content);
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
