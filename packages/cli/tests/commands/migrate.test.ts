import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { detectLegacyArtifacts, runMigrate } from '../../src/commands/migrate';

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'harness-migrate-test-'));
}

function writeFile(dir: string, rel: string, content: string): void {
  const full = path.join(dir, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

describe('detectLegacyArtifacts', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = makeTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('reports clean when neither legacy path exists', async () => {
    const result = await detectLegacyArtifacts(tmp);
    expect(result).toEqual({ adrLegacy: false, planLegacy: false });
  });

  it('detects legacy ADR directory with content', async () => {
    writeFile(tmp, '.harness/architecture/some-topic/ADR-001.md', '# ADR\n');
    const result = await detectLegacyArtifacts(tmp);
    expect(result.adrLegacy).toBe(true);
    expect(result.planLegacy).toBe(false);
  });

  it('detects legacy plans directory with plan files', async () => {
    writeFile(tmp, 'docs/plans/2026-01-01-foo-plan.md', '# Plan\n');
    const result = await detectLegacyArtifacts(tmp);
    expect(result.adrLegacy).toBe(false);
    expect(result.planLegacy).toBe(true);
  });

  it('ignores docs/plans/index.md (not a real plan)', async () => {
    writeFile(tmp, 'docs/plans/index.md', '# Index\n');
    const result = await detectLegacyArtifacts(tmp);
    expect(result.planLegacy).toBe(false);
  });
});

describe('runMigrate', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = makeTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('reports nothing to do when no legacy artifacts exist', async () => {
    const result = await runMigrate({ cwd: tmp, dryRun: true, yes: true, orphanStrategy: 'skip' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.movesPlanned).toBe(0);
  });

  it('migrates a legacy ADR via dry run without moving files', async () => {
    writeFile(tmp, '.harness/architecture/foo/ADR-001.md', '# ADR\n');
    const result = await runMigrate({ cwd: tmp, dryRun: true, yes: true, orphanStrategy: 'skip' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.dryRun).toBe(true);
      expect(result.value.movesPlanned).toBe(1);
      expect(result.value.movesApplied).toBe(0);
    }
    expect(fs.existsSync(path.join(tmp, '.harness/architecture/foo/ADR-001.md'))).toBe(true);
    expect(fs.existsSync(path.join(tmp, 'docs/architecture/foo/ADR-001.md'))).toBe(false);
  });

  it('moves a legacy ADR to docs/architecture when applied', async () => {
    writeFile(tmp, '.harness/architecture/foo/ADR-001.md', '# ADR\n');
    const result = await runMigrate({ cwd: tmp, yes: true, orphanStrategy: 'skip' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.movesApplied).toBe(1);
    expect(fs.existsSync(path.join(tmp, '.harness/architecture/foo/ADR-001.md'))).toBe(false);
    expect(fs.existsSync(path.join(tmp, 'docs/architecture/foo/ADR-001.md'))).toBe(true);
  });

  it('co-locates a plan with its proposal via header reference', async () => {
    writeFile(tmp, 'docs/changes/billing/proposal.md', '# Billing\n');
    writeFile(
      tmp,
      'docs/plans/2026-01-01-billing-phase1-plan.md',
      '# Plan\n\n**Spec:** docs/changes/billing/proposal.md\n'
    );
    const result = await runMigrate({ cwd: tmp, yes: true, orphanStrategy: 'skip' });
    expect(result.ok).toBe(true);
    expect(
      fs.existsSync(path.join(tmp, 'docs/changes/billing/plans/2026-01-01-billing-phase1-plan.md'))
    ).toBe(true);
    expect(fs.existsSync(path.join(tmp, 'docs/plans/2026-01-01-billing-phase1-plan.md'))).toBe(
      false
    );
  });

  it('routes VERIFICATION files into verifications/ subfolder', async () => {
    writeFile(tmp, 'docs/changes/auth/proposal.md', '# Auth\n');
    writeFile(
      tmp,
      'docs/plans/2026-01-01-auth-phase1-VERIFICATION.md',
      '# Verification\n\n**Spec:** docs/changes/auth/proposal.md\n'
    );
    await runMigrate({ cwd: tmp, yes: true, orphanStrategy: 'skip' });
    expect(
      fs.existsSync(
        path.join(tmp, 'docs/changes/auth/verifications/2026-01-01-auth-phase1-VERIFICATION.md')
      )
    ).toBe(true);
  });

  it('updates references in docs after moving plans', async () => {
    writeFile(tmp, 'docs/changes/api/proposal.md', '# API\n');
    writeFile(
      tmp,
      'docs/plans/2026-01-01-api-plan.md',
      '# Plan\n\n**Spec:** docs/changes/api/proposal.md\n'
    );
    writeFile(
      tmp,
      'docs/roadmap.md',
      '# Roadmap\n\n- **Plan:** docs/plans/2026-01-01-api-plan.md\n'
    );
    await runMigrate({ cwd: tmp, yes: true, orphanStrategy: 'skip' });
    const roadmap = fs.readFileSync(path.join(tmp, 'docs/roadmap.md'), 'utf8');
    expect(roadmap).toContain('docs/changes/api/plans/2026-01-01-api-plan.md');
    expect(roadmap).not.toContain('docs/plans/2026-01-01-api-plan.md');
  });

  it('leaves orphan plans in docs/plans/ when --orphan-strategy=skip', async () => {
    writeFile(tmp, 'docs/plans/2026-01-01-mystery-plan.md', '# Plan\n');
    await runMigrate({ cwd: tmp, yes: true, orphanStrategy: 'skip' });
    expect(fs.existsSync(path.join(tmp, 'docs/plans/2026-01-01-mystery-plan.md'))).toBe(true);
  });

  it('buckets orphans into a stub topic when --orphan-strategy=bucket', async () => {
    writeFile(tmp, 'docs/plans/2026-01-01-mystery-plan.md', '# Plan\n');
    await runMigrate({
      cwd: tmp,
      yes: true,
      orphanStrategy: 'bucket',
      orphanTopic: 'legacy-plans',
    });
    expect(
      fs.existsSync(path.join(tmp, 'docs/changes/legacy-plans/plans/2026-01-01-mystery-plan.md'))
    ).toBe(true);
    expect(fs.existsSync(path.join(tmp, 'docs/plans/2026-01-01-mystery-plan.md'))).toBe(false);
  });

  it('uses autopilot session state when available (preferred over header)', async () => {
    writeFile(tmp, 'docs/changes/correct-topic/proposal.md', '# Correct\n');
    writeFile(tmp, 'docs/changes/wrong-topic/proposal.md', '# Wrong\n');
    writeFile(
      tmp,
      '.harness/sessions/changes--correct-topic--proposal/autopilot-state.json',
      JSON.stringify({
        specPath: 'docs/changes/correct-topic/proposal.md',
        phases: [{ planPath: 'docs/plans/2026-01-01-ambiguous-plan.md' }],
      })
    );
    writeFile(
      tmp,
      'docs/plans/2026-01-01-ambiguous-plan.md',
      '# Plan\n\n**Spec:** docs/changes/wrong-topic/proposal.md\n'
    );
    await runMigrate({ cwd: tmp, yes: true, orphanStrategy: 'skip' });
    expect(
      fs.existsSync(path.join(tmp, 'docs/changes/correct-topic/plans/2026-01-01-ambiguous-plan.md'))
    ).toBe(true);
    expect(
      fs.existsSync(path.join(tmp, 'docs/changes/wrong-topic/plans/2026-01-01-ambiguous-plan.md'))
    ).toBe(false);
  });

  it('matches plan via filename prefix when no autopilot or header signal exists', async () => {
    writeFile(tmp, 'docs/changes/notifications/proposal.md', '# Notifications\n');
    writeFile(tmp, 'docs/plans/2026-01-01-notifications-plan.md', '# Plan with no spec line\n');
    await runMigrate({ cwd: tmp, yes: true, orphanStrategy: 'skip' });
    expect(
      fs.existsSync(
        path.join(tmp, 'docs/changes/notifications/plans/2026-01-01-notifications-plan.md')
      )
    ).toBe(true);
  });

  it('does not falsely match when filename only shares a prefix with a topic', async () => {
    // Topic "auth" exists; plan "auth-helper-plan" should NOT match (auth-helper != auth)
    writeFile(tmp, 'docs/changes/auth/proposal.md', '# Auth\n');
    writeFile(tmp, 'docs/plans/2026-01-01-authhelper-plan.md', '# Plan\n');
    await runMigrate({ cwd: tmp, yes: true, orphanStrategy: 'skip' });
    // Should remain in docs/plans/ as orphan (no word-boundary match)
    expect(fs.existsSync(path.join(tmp, 'docs/plans/2026-01-01-authhelper-plan.md'))).toBe(true);
    expect(
      fs.existsSync(path.join(tmp, 'docs/changes/auth/plans/2026-01-01-authhelper-plan.md'))
    ).toBe(false);
  });

  it('returns an error when --orphan-strategy=bucket is used without --orphan-topic', async () => {
    writeFile(tmp, 'docs/plans/2026-01-01-mystery-plan.md', '# Plan\n');
    const result = await runMigrate({ cwd: tmp, yes: true, orphanStrategy: 'bucket' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('--orphan-topic');
    }
  });

  it('respects custom docsDir from harness.config.json for ADR target', async () => {
    writeFile(
      tmp,
      'harness.config.json',
      JSON.stringify({ version: 1, name: 'test', docsDir: './documentation' })
    );
    writeFile(tmp, '.harness/architecture/foo/ADR-001.md', '# ADR\n');
    await runMigrate({ cwd: tmp, yes: true, orphanStrategy: 'skip' });
    expect(fs.existsSync(path.join(tmp, 'documentation/architecture/foo/ADR-001.md'))).toBe(true);
    expect(fs.existsSync(path.join(tmp, 'docs/architecture/foo/ADR-001.md'))).toBe(false);
  });
});
