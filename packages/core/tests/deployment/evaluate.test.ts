import { describe, it, expect } from 'vitest';
import { evaluateDeploymentGate } from '../../src/deployment/evaluate';
import { surface } from './fixtures';

const withPipeline = (content: string) =>
  surface({
    pipelineFiles: [{ path: '.github/workflows/deploy.yml', content }],
    hasProductionTarget: true,
  });

describe('evaluateDeploymentGate — status + DEPLOY-SEC001', () => {
  it('disabled short-circuits (SC7)', () => {
    expect(evaluateDeploymentGate(surface(), { enabled: false }).status).toBe('disabled');
  });
  it('abstains on an empty surface with no config (SC6)', () => {
    expect(evaluateDeploymentGate(surface(), undefined).status).toBe('abstained');
  });
  it('does not abstain when deployment config is present (SC edge)', () => {
    const r = evaluateDeploymentGate(surface(), { enabled: true });
    expect(r.status).not.toBe('abstained');
  });
  it('flags a hardcoded secret in a pipeline (SC2)', () => {
    const res = evaluateDeploymentGate(withPipeline('env:\n  AWS: "AKIAIOSFODNN7EXAMPLE"'), {
      enabled: true,
    });
    const sec = res.findings.find((f) => f.code === 'DEPLOY-SEC001');
    expect(sec?.severity).toBe('hard');
    expect(res.status).toBe('blocked');
  });
  it('does NOT flag an env-var/CI reference (SC2, D8)', () => {
    const res = evaluateDeploymentGate(withPipeline('env:\n  TOKEN: ${{ secrets.NPM_TOKEN }}'), {
      enabled: true,
    });
    expect(res.findings.some((f) => f.code === 'DEPLOY-SEC001')).toBe(false);
  });
  it('does NOT flag a shell-var reference (SC2, D8)', () => {
    const res = evaluateDeploymentGate(
      withPipeline('env:\n  password: "$AUTOAPPROVE_PAT"'),
      { enabled: true }
    );
    expect(res.findings.some((f) => f.code === 'DEPLOY-SEC001')).toBe(false);
  });
  it('ignores an override on DEPLOY-SEC001 (SC8, non-waivable)', () => {
    const res = evaluateDeploymentGate(withPipeline('env:\n  AWS: "AKIAIOSFODNN7EXAMPLE"'), {
      enabled: true,
      rules: { 'DEPLOY-SEC001': 'off' },
    });
    expect(res.findings.find((f) => f.code === 'DEPLOY-SEC001')?.severity).toBe('hard');
    expect(res.status).toBe('blocked');
  });
  it('flags a hardcoded secret in a committed env file (SC2)', () => {
    const res = evaluateDeploymentGate(
      surface({ envFiles: [{ path: '.env.production', content: 'password="hunter2xyz"' }] }),
      { enabled: true }
    );
    expect(res.findings.some((f) => f.code === 'DEPLOY-SEC001')).toBe(true);
  });
});

describe('evaluateDeploymentGate — DEPLOY-RB001 (rollback path)', () => {
  it('blocks when a deploy target has no rollback path (SC3)', () => {
    const res = evaluateDeploymentGate(surface({ hasProductionTarget: true }), { enabled: true });
    const rb = res.findings.find((f) => f.code === 'DEPLOY-RB001');
    expect(rb?.severity).toBe('hard');
    expect(rb?.remediation).toContain('harness-rollback');
    expect(res.status).toBe('blocked');
    expect(res.rollbackPathPresent).toBe(false);
  });
  it('is satisfied by the rollback config seam (D5)', () => {
    const res = evaluateDeploymentGate(surface({ hasProductionTarget: true }), {
      enabled: true,
      rollbackConfigured: true,
    });
    expect(res.findings.some((f) => f.code === 'DEPLOY-RB001')).toBe(false);
    expect(res.rollbackPathPresent).toBe(true);
  });
  it('is satisfied by an in-repo rollback signal', () => {
    const res = evaluateDeploymentGate(
      surface({ hasProductionTarget: true, rollbackSignalInFiles: true }),
      { enabled: true }
    );
    expect(res.findings.some((f) => f.code === 'DEPLOY-RB001')).toBe(false);
    expect(res.rollbackPathPresent).toBe(true);
  });
  it('is waivable to a soft advisory (SC8)', () => {
    const res = evaluateDeploymentGate(surface({ hasProductionTarget: true }), {
      enabled: true,
      rules: { 'DEPLOY-RB001': 'off' },
    });
    const rb = res.findings.find((f) => f.code === 'DEPLOY-RB001');
    expect(rb?.severity).toBe('soft');
    expect(res.status).toBe('pass');
  });
});

describe('evaluateDeploymentGate — DEPLOY-ENV001 (promotion gate)', () => {
  it('blocks an ungated production deploy (SC4)', () => {
    const res = evaluateDeploymentGate(
      surface({ hasProductionTarget: true, productionUngated: true, rollbackSignalInFiles: true }),
      { enabled: true }
    );
    const env = res.findings.find((f) => f.code === 'DEPLOY-ENV001');
    expect(env?.severity).toBe('hard');
    expect(res.status).toBe('blocked');
  });
  it('is waivable to a soft advisory (SC8)', () => {
    const res = evaluateDeploymentGate(
      surface({ hasProductionTarget: true, productionUngated: true, rollbackSignalInFiles: true }),
      { enabled: true, rules: { 'DEPLOY-ENV001': 'off' } }
    );
    const env = res.findings.find((f) => f.code === 'DEPLOY-ENV001');
    expect(env?.severity).toBe('soft');
    expect(res.status).toBe('pass');
  });
});

describe('evaluateDeploymentGate — soft advisories (SC5 + edges)', () => {
  it('passes with only soft advisories listed (SC5)', () => {
    const res = evaluateDeploymentGate(
      surface({
        hasProductionTarget: true,
        productionUngated: false,
        rollbackSignalInFiles: true,
        presentStages: ['build'],
        hasHealthCheck: false,
        pipelineFiles: [
          { path: '.github/workflows/deploy.yml', content: 'run: deploy to production' },
        ],
      }),
      { enabled: true }
    );
    expect(res.status).toBe('pass');
    expect(res.hardViolations).toHaveLength(0);
    const codes = res.findings.map((f) => f.code);
    expect(codes).toContain('DEPLOY-STAGE001');
    expect(codes).toContain('DEPLOY-HC001');
    expect(res.softViolations.every((f) => f.severity === 'soft')).toBe(true);
  });
  it('emits a STAGE001-class advisory for an unparseable pipeline file (edge)', () => {
    const res = evaluateDeploymentGate(
      surface({
        hasProductionTarget: true,
        rollbackSignalInFiles: true,
        hasHealthCheck: true,
        presentStages: ['security-scan', 'smoke-test'],
        pipelineFiles: [
          { path: '.github/workflows/bad.yml', content: ':\n  - [garbage', unparseable: true },
        ],
      }),
      { enabled: true }
    );
    const stage = res.findings.find((f) => f.code === 'DEPLOY-STAGE001');
    expect(stage?.severity).toBe('soft');
    expect(stage?.detail).toMatch(/unparseable|parse/i);
    expect(res.status).toBe('pass');
  });
  it('emits DEPLOY-ENV002 for shared non-secret config across envs', () => {
    const res = evaluateDeploymentGate(
      surface({
        hasProductionTarget: true,
        rollbackSignalInFiles: true,
        hasHealthCheck: true,
        presentStages: ['security-scan', 'smoke-test'],
        envFiles: [
          { path: '.env.production', content: 'LOG_LEVEL=debug\nAPI_URL=https://prod' },
          { path: '.env.staging', content: 'LOG_LEVEL=debug\nAPI_URL=https://staging' },
        ],
      }),
      { enabled: true }
    );
    const env2 = res.findings.find((f) => f.code === 'DEPLOY-ENV002');
    expect(env2?.severity).toBe('soft');
    expect(res.status).toBe('pass');
  });
  it('emits DEPLOY-PERF001 for serial stages with no caching', () => {
    const res = evaluateDeploymentGate(
      surface({
        hasProductionTarget: true,
        rollbackSignalInFiles: true,
        hasHealthCheck: true,
        presentStages: ['security-scan', 'smoke-test'],
        pipelineFiles: [
          {
            path: '.github/workflows/ci.yml',
            content: 'jobs:\n  build: {}\n  deploy:\n    needs: build\n    steps:\n      - run: deploy to production',
          },
        ],
      }),
      { enabled: true }
    );
    const perf = res.findings.find((f) => f.code === 'DEPLOY-PERF001');
    expect(perf?.severity).toBe('soft');
    expect(res.status).toBe('pass');
  });
});
