import * as fs from 'fs';
import * as path from 'path';
import type { Result } from '@harness-engineering/core';
import { Ok } from '@harness-engineering/core';
import { loadPersona } from '../loader';
import type { Persona, CommandStep } from '../schema';
import { toKebabCase } from '../../utils/string';
import { generateCIWorkflow } from './ci-workflow';

/**
 * Repo-local persona CI-workflow synchronization (#663).
 *
 * Persona YAMLs declare `on_pr` / `on_commit` / `scheduled` triggers and
 * `outputs.ci-workflow: true`, but nothing committed honors them. This module
 * turns those dormant declarations into committed, runnable GitHub Actions
 * workflows and provides the drift guard that fails when a persona's declared
 * trigger has no up-to-date committed workflow (mirrors `generate:plugin:check`).
 *
 * Only the CLI-command tier of each persona is emitted here (the generator
 * drops skill steps). Persona reviews that need an LLM/agent runner are served
 * by `required-review.yml`'s `harness review-ci` agent-runtime path, not by
 * these workflows.
 */

/** Trigger events that warrant a committed workflow (`manual` alone does not). */
const CI_TRIGGER_EVENTS = new Set(['on_pr', 'on_commit', 'scheduled']);

/** Filename prefix that namespaces generated persona workflows. */
export const PERSONA_WORKFLOW_PREFIX = 'persona-';

export interface PersonaWorkflowTarget {
  persona: Persona;
  /** Source persona filename, e.g. `harness-pm.yaml`. */
  sourceFile: string;
  /** kebab-cased persona name, e.g. `harness-pm`. */
  slug: string;
  /** Committed workflow filename, e.g. `persona-harness-pm.yml`. */
  filename: string;
}

function hasCommandStep(persona: Persona): boolean {
  return persona.steps.some((s): s is CommandStep => 'command' in s);
}

function hasCITrigger(persona: Persona): boolean {
  return persona.triggers.some((t) => CI_TRIGGER_EVENTS.has(t.event));
}

/**
 * Enumerate the personas that should have a committed CI workflow.
 *
 * A persona qualifies when it (a) opts in via `outputs.ci-workflow: true`,
 * (b) declares at least one CI-firing trigger, and (c) has at least one command
 * step to run (skill-only personas produce no runnable CI job). Invalid persona
 * files are skipped — the loader validates them elsewhere.
 */
export function getPersonaWorkflowTargets(personasDir: string): PersonaWorkflowTarget[] {
  if (!fs.existsSync(personasDir)) return [];
  const targets: PersonaWorkflowTarget[] = [];
  const entries = fs
    .readdirSync(personasDir)
    .filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'))
    .sort();
  for (const entry of entries) {
    const result = loadPersona(path.join(personasDir, entry));
    if (!result.ok) continue;
    const persona = result.value;
    if (!persona.outputs['ci-workflow']) continue;
    if (!hasCITrigger(persona)) continue;
    if (!hasCommandStep(persona)) continue;
    const slug = toKebabCase(persona.name);
    targets.push({
      persona,
      sourceFile: entry,
      slug,
      filename: `${PERSONA_WORKFLOW_PREFIX}${slug}.yml`,
    });
  }
  return targets;
}

/**
 * Render the full file content (header + YAML) for a persona's workflow.
 *
 * Uses the `workspace` runner (build-from-source, node 22) and `advisory` mode
 * (continue-on-error) so the job honors the declared triggers without blocking.
 */
export function renderPersonaWorkflowFile(target: PersonaWorkflowTarget): Result<string, Error> {
  const result = generateCIWorkflow(target.persona, 'github', {
    runner: 'workspace',
    advisory: true,
  });
  if (!result.ok) return result;
  const header = [
    '# GENERATED FILE — do not edit by hand.',
    `# Source persona: agents/personas/${target.sourceFile} (outputs.ci-workflow: true)`,
    '# Regenerate:   pnpm generate:persona-workflows',
    '# Drift guard:  pnpm generate:persona-workflows:check  (enforced in CI)',
    '#',
    "# Advisory (continue-on-error): honors the persona's declared triggers at the",
    "# CLI-command tier without blocking the PR. The persona's LLM/agent-runtime",
    '# steps (skill steps) are delivered via required-review.yml, not here. See',
    '# docs/changes/honor-persona-triggers/proposal.md (#663).',
    '',
    '',
  ].join('\n');
  return Ok(header + result.value);
}

export interface WorkflowDriftIssue {
  filename: string;
  kind: 'missing' | 'stale' | 'orphaned';
  detail: string;
}

export interface WorkflowSyncResult {
  targets: PersonaWorkflowTarget[];
  issues: WorkflowDriftIssue[];
  /** Files written (write mode only). */
  written: string[];
}

/** Resolve the `.github/workflows` dir that sits beside the personas' repo root. */
export function resolveWorkflowsDir(personasDir: string): string {
  // personasDir is <root>/agents/personas → repo root is two levels up.
  return path.join(personasDir, '..', '..', '.github', 'workflows');
}

/**
 * Check committed persona workflows against freshly-rendered content.
 *
 * Reports three drift kinds: a target with no committed file (`missing`), a
 * committed file whose content differs from the render (`stale`), and a
 * `persona-*.yml` in the workflows dir with no backing target (`orphaned`).
 */
export function checkPersonaWorkflows(
  personasDir: string,
  workflowsDir: string
): Result<WorkflowSyncResult, Error> {
  const targets = getPersonaWorkflowTargets(personasDir);
  const issues: WorkflowDriftIssue[] = [];
  const expectedFilenames = new Set(targets.map((t) => t.filename));

  for (const target of targets) {
    const rendered = renderPersonaWorkflowFile(target);
    if (!rendered.ok) return rendered;
    const filePath = path.join(workflowsDir, target.filename);
    if (!fs.existsSync(filePath)) {
      issues.push({
        filename: target.filename,
        kind: 'missing',
        detail: `persona "${target.persona.name}" declares a CI trigger + ci-workflow but no committed workflow exists`,
      });
      continue;
    }
    const current = fs.readFileSync(filePath, 'utf-8');
    if (current !== rendered.value) {
      issues.push({
        filename: target.filename,
        kind: 'stale',
        detail: `committed workflow is out of date with agents/personas/${target.sourceFile}`,
      });
    }
  }

  if (fs.existsSync(workflowsDir)) {
    const orphans = fs
      .readdirSync(workflowsDir)
      .filter((f) => f.startsWith(PERSONA_WORKFLOW_PREFIX) && f.endsWith('.yml'))
      .filter((f) => !expectedFilenames.has(f));
    for (const filename of orphans) {
      issues.push({
        filename,
        kind: 'orphaned',
        detail: 'no persona backs this generated workflow (deleted or renamed persona?)',
      });
    }
  }

  return Ok({ targets, issues, written: [] });
}

/**
 * Regenerate committed persona workflows. Writes each target's file and removes
 * orphaned `persona-*.yml` files. Returns the sync result with `written` set.
 */
export function writePersonaWorkflows(
  personasDir: string,
  workflowsDir: string
): Result<WorkflowSyncResult, Error> {
  const targets = getPersonaWorkflowTargets(personasDir);
  const written: string[] = [];
  fs.mkdirSync(workflowsDir, { recursive: true });

  const expectedFilenames = new Set(targets.map((t) => t.filename));
  for (const target of targets) {
    const rendered = renderPersonaWorkflowFile(target);
    if (!rendered.ok) return rendered;
    const filePath = path.join(workflowsDir, target.filename);
    fs.writeFileSync(filePath, rendered.value);
    written.push(target.filename);
  }

  // Prune orphans so a deleted/renamed persona doesn't leave a stale workflow.
  const orphans = fs
    .readdirSync(workflowsDir)
    .filter((f) => f.startsWith(PERSONA_WORKFLOW_PREFIX) && f.endsWith('.yml'))
    .filter((f) => !expectedFilenames.has(f));
  for (const filename of orphans) {
    fs.rmSync(path.join(workflowsDir, filename));
  }

  return Ok({ targets, issues: [], written });
}
