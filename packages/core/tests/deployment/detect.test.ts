import { describe, it, expect } from 'vitest';
import { detectDeploymentSurface } from '../../src/deployment/detect';
import { memFs } from './fixtures';

const ghDeployProd = `name: deploy
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - run: kubectl apply -f k8s/production
`;

describe('detectDeploymentSurface', () => {
  it('abstains structurally on an empty repo (no surfaces)', () => {
    const s = detectDeploymentSurface('.', memFs({}));
    expect(s.pipelineFiles).toHaveLength(0);
    expect(s.deployScripts).toHaveLength(0);
    expect(s.envFiles).toHaveLength(0);
  });
  it('detects a GitHub Actions ungated production deploy', () => {
    const s = detectDeploymentSurface('.', memFs({ '.github/workflows/deploy.yml': ghDeployProd }));
    expect(s.pipelineFiles).toHaveLength(1);
    expect(s.hasProductionTarget).toBe(true);
    expect(s.productionUngated).toBe(true);
    expect(s.detectedEnvironments).toContain('production');
  });
  it('captures committed env files', () => {
    const s = detectDeploymentSurface('.', memFs({ '.env.production': 'API_URL=https://x' }));
    expect(s.envFiles.map((f) => f.path)).toContain('.env.production');
  });
  it('finds a rollback signal from a rollback workflow', () => {
    const s = detectDeploymentSurface(
      '.',
      memFs({ '.github/workflows/rollback.yml': 'name: rollback' })
    );
    expect(s.rollbackSignalInFiles).toBe(true);
  });
  it('finds a rollback signal from a deploy/rollback script', () => {
    const s = detectDeploymentSurface(
      '.',
      memFs({ 'deploy/rollback.sh': '#!/bin/sh\nkubectl rollout undo' })
    );
    expect(s.rollbackSignalInFiles).toBe(true);
  });
  it('finds a rollback signal from a runbook doc', () => {
    const s = detectDeploymentSurface('.', memFs({ 'docs/ROLLBACK.md': '# Rollback runbook' }));
    expect(s.rollbackSignalInFiles).toBe(true);
  });
  it('counts an unparseable pipeline file as a surface without throwing', () => {
    const s = detectDeploymentSurface(
      '.',
      memFs({ '.github/workflows/bad.yml': ':\n  - [garbage' })
    );
    expect(s.pipelineFiles).toHaveLength(1);
    expect(s.pipelineFiles[0]!.unparseable).toBe(true);
  });
  it('treats environment-protected prod as gated', () => {
    const gated = ghDeployProd.replace('    steps:', '    environment: production\n    steps:');
    const s = detectDeploymentSurface('.', memFs({ '.github/workflows/deploy.yml': gated }));
    expect(s.productionUngated).toBe(false);
  });
  it('treats prod with a prior staging job as gated', () => {
    const withStaging = `name: deploy
on:
  push:
    branches: [main]
jobs:
  staging:
    runs-on: ubuntu-latest
    steps:
      - run: kubectl apply -f k8s/staging
  deploy:
    runs-on: ubuntu-latest
    needs: staging
    steps:
      - run: kubectl apply -f k8s/production
`;
    const s = detectDeploymentSurface('.', memFs({ '.github/workflows/deploy.yml': withStaging }));
    expect(s.hasProductionTarget).toBe(true);
    expect(s.productionUngated).toBe(false);
  });
  it('discovers a deploy script under deploy/', () => {
    const s = detectDeploymentSurface(
      '.',
      memFs({ 'deploy/deploy.sh': '#!/bin/sh\necho deploying to production' })
    );
    expect(s.deployScripts.map((f) => f.path)).toContain('deploy/deploy.sh');
    expect(s.hasProductionTarget).toBe(true);
  });
  it('discovers scripts/deploy* scripts', () => {
    const s = detectDeploymentSurface(
      '.',
      memFs({ 'scripts/deploy-prod.sh': '#!/bin/sh\nkubectl apply' })
    );
    expect(s.deployScripts.map((f) => f.path)).toContain('scripts/deploy-prod.sh');
  });
  it('discovers a .gitlab-ci.yml pipeline', () => {
    const s = detectDeploymentSurface(
      '.',
      memFs({ '.gitlab-ci.yml': 'deploy:\n  script: echo deploy to production' })
    );
    expect(s.pipelineFiles.map((f) => f.path)).toContain('.gitlab-ci.yml');
  });
});
