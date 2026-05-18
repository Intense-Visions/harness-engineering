import { parse as parseYaml } from 'yaml';
import {
  getProposal,
  updateProposal,
  ProposalNotFoundError,
  type SkillProposal,
  type ProposalGateFinding,
} from '@harness-engineering/core';

/**
 * Phase 4 gate (degraded mode, see spec D5).
 *
 * The full design calls for `harness skill run harness-soundness-review
 * --mode skill` against materialized proposal content. The skill-mode check
 * vocabulary is not yet designed; its design is the explicit follow-up spec
 * referenced in Phase 4's Non-goals.
 *
 * In v1 we run a small set of mechanical checks inline against the proposal
 * payload. They cover the obvious structural failures (unparseable YAML,
 * empty markdown, name/regex drift) without needing an LLM. The result
 * shape mirrors the eventual soundness-review output so the downstream
 * promote step (and dashboard panel) does not need to change when
 * skill-mode lands.
 */

export class GateRunError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GateRunError';
  }
}

export interface GateResult {
  proposalId: string;
  status: SkillProposal['status'];
  findings: ProposalGateFinding[];
  runAt: string;
}

const SKILL_NAME_RE = /^[a-z][a-z0-9-]*$/;

function checkSkillYaml(yaml: string): ProposalGateFinding[] {
  const findings: ProposalGateFinding[] = [];
  let doc: unknown;
  try {
    doc = parseYaml(yaml);
  } catch (err) {
    findings.push({
      severity: 'error',
      title: 'skill.yaml does not parse',
      detail: err instanceof Error ? err.message : String(err),
    });
    return findings;
  }
  if (!doc || typeof doc !== 'object') {
    findings.push({
      severity: 'error',
      title: 'skill.yaml top-level is not a mapping',
      detail: 'Expected a YAML document with keys at the root (name, version, description, …).',
    });
    return findings;
  }
  const obj = doc as Record<string, unknown>;
  if (typeof obj['name'] !== 'string') {
    findings.push({
      severity: 'error',
      title: 'skill.yaml missing `name`',
      detail: 'Every skill must declare its kebab-case name.',
    });
  }
  if (typeof obj['version'] !== 'string') {
    findings.push({
      severity: 'error',
      title: 'skill.yaml missing `version`',
      detail: 'Every skill must declare a semver version string.',
    });
  }
  if (typeof obj['description'] !== 'string') {
    findings.push({
      severity: 'warning',
      title: 'skill.yaml missing `description`',
      detail: 'Description is strongly recommended for discoverability.',
    });
  }
  return findings;
}

function checkSkillMd(md: string): ProposalGateFinding[] {
  const findings: ProposalGateFinding[] = [];
  if (md.trim().length < 40) {
    findings.push({
      severity: 'error',
      title: 'SKILL.md is too short',
      detail: 'A skill needs a meaningful description (at least 40 non-whitespace characters).',
    });
  }
  if (!/^#\s+\S/m.test(md)) {
    findings.push({
      severity: 'warning',
      title: 'SKILL.md has no top-level heading',
      detail: 'Convention: open SKILL.md with `# <Skill Name>`.',
    });
  }
  return findings;
}

function checkName(name: string): ProposalGateFinding[] {
  if (SKILL_NAME_RE.test(name)) return [];
  return [
    {
      severity: 'error',
      title: 'skill name violates the kebab-case rule',
      detail: `"${name}" must match /^[a-z][a-z0-9-]*$/. Use only lowercase letters, digits, and hyphens; start with a letter.`,
    },
  ];
}

function checkDiff(diff: string): ProposalGateFinding[] {
  const findings: ProposalGateFinding[] = [];
  if (!diff.includes('---') || !diff.includes('+++')) {
    findings.push({
      severity: 'error',
      title: 'Refinement diff is not in unified-diff format',
      detail: 'Diffs must include both `---` and `+++` headers.',
    });
  }
  // Need at least one hunk marker.
  if (!/^@@\s/m.test(diff)) {
    findings.push({
      severity: 'warning',
      title: 'Refinement diff has no hunk marker',
      detail: 'A unified diff typically contains at least one `@@` line.',
    });
  }
  return findings;
}

function deriveFindings(proposal: SkillProposal): ProposalGateFinding[] {
  const findings: ProposalGateFinding[] = [];
  findings.push(...checkName(proposal.content.name));
  if (proposal.kind === 'new-skill') {
    findings.push(...checkSkillYaml(proposal.content.skillYaml ?? ''));
    findings.push(...checkSkillMd(proposal.content.skillMd ?? ''));
  } else if (proposal.kind === 'refinement') {
    findings.push(...checkDiff(proposal.content.diff ?? ''));
  }
  return findings;
}

/**
 * Synchronously run the gate against the given proposal. The proposal is
 * read from disk, checks are computed, and the proposal JSON is patched
 * with the gate result. Returns the post-update gate snapshot for the
 * caller to render.
 */
export async function runGate(projectPath: string, proposalId: string): Promise<GateResult> {
  const proposal = await getProposal(projectPath, proposalId);
  if (!proposal) throw new ProposalNotFoundError(proposalId);

  if (proposal.status === 'approved' || proposal.status === 'rejected') {
    throw new GateRunError(
      `proposal ${proposalId} is already ${proposal.status}; cannot re-run the gate`
    );
  }

  const findings = deriveFindings(proposal);
  const runAt = new Date().toISOString();
  const hasError = findings.some((f) => f.severity === 'error');
  const nextStatus: SkillProposal['status'] = hasError ? 'gate-failed' : 'gate-running';

  const updated = await updateProposal(projectPath, proposalId, {
    status: nextStatus,
    gate: { lastRunAt: runAt, findings },
  });

  return {
    proposalId: updated.id,
    status: updated.status,
    findings,
    runAt,
  };
}
