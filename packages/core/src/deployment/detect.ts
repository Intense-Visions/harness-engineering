import { parse as parseYaml } from 'yaml';
import type { DeploymentFsPort, DeploymentFile, DeploymentSurface } from './types';

/**
 * Discover a repository's deployment surface using an injected {@link DeploymentFsPort}.
 *
 * Pure and defensive: every file read goes through the port (never `fs`), and a
 * single unparseable pipeline file is captured (marked `unparseable`) rather than
 * throwing — a repo with a broken pipeline still counts as a deployment surface
 * (it must not silently abstain). The heuristics here feed the classifier in
 * `evaluate.ts`; they never block on their own.
 */

/** Fixed-name CI/CD pipeline files (outside `.github/workflows`). */
const FIXED_PIPELINE_FILES = [
  '.gitlab-ci.yml',
  '.gitlab-ci.yaml',
  'Jenkinsfile',
  '.circleci/config.yml',
  '.circleci/config.yaml',
  'bitbucket-pipelines.yml',
  'azure-pipelines.yml',
  'azure-pipelines.yaml',
];

/** Candidate runbook/rollback docs that satisfy the rollback-path signal. */
const RUNBOOK_CANDIDATES = [
  'docs/ROLLBACK.md',
  'ROLLBACK.md',
  'docs/rollback.md',
  'docs/RUNBOOK.md',
  'RUNBOOK.md',
  'docs/runbook.md',
];

const PROD_RE = /\bproduction\b|\bprod\b/i;
const STAGING_RE = /\bstaging\b/i;
const DEV_RE = /\bdevelopment\b|\bdev\b/i;
const ROLLBACK_RE = /rollback|revert/i;
const HEALTHCHECK_RE = /health\s*check|healthcheck|\bsmoke\b|readiness|liveness/i;

/** Does a pipeline path look like YAML (so a parse failure means "unparseable")? */
function isYamlPipeline(path: string): boolean {
  return /\.ya?ml$/i.test(path);
}

/** Capture a file's contents through the port; returns null when absent. */
function capture(
  fsPort: DeploymentFsPort,
  path: string,
  yamlAware: boolean
): DeploymentFile | null {
  const content = fsPort.readFile(path);
  if (content === null) return null;
  const file: DeploymentFile = { path, content };
  if (yamlAware && isYamlPipeline(path)) {
    try {
      parseYaml(content);
    } catch {
      file.unparseable = true;
    }
  }
  return file;
}

function collectEnvironments(content: string, into: Set<string>): void {
  if (PROD_RE.test(content)) into.add('production');
  if (STAGING_RE.test(content)) into.add('staging');
  if (DEV_RE.test(content)) into.add('dev');
  // Explicit `environment:` keys (GitHub Actions env protection, GitLab environment).
  const envKey = /environment:\s*['"]?([A-Za-z0-9._-]+)['"]?/gi;
  let m: RegExpExecArray | null;
  while ((m = envKey.exec(content)) !== null) {
    const name = (m[1] ?? '').toLowerCase();
    if (name) into.add(name);
  }
}

/** A pipeline/script that reaches production has any of these gating signals. */
function hasGating(content: string): boolean {
  return (
    /environment:/i.test(content) ||
    /workflow_dispatch/i.test(content) ||
    /\bapproval\b|manual/i.test(content) ||
    STAGING_RE.test(content) ||
    /needs:/i.test(content)
  );
}

const STAGE_KEYWORDS: Array<{ stage: string; re: RegExp }> = [
  { stage: 'security-scan', re: /security\s*scan|trivy|codeql|snyk|gitleaks/i },
  { stage: 'smoke-test', re: /\bsmoke\b/i },
  { stage: 'lint', re: /\blint\b/i },
  { stage: 'test', re: /\b(unit|integration)?\s*tests?\b|vitest|jest|pytest/i },
  { stage: 'build', re: /\bbuild\b/i },
  { stage: 'post-deploy', re: /post[-\s]?deploy/i },
];

/**
 * Discover CI/CD pipeline files: every YAML under `.github/workflows`, then the
 * fixed-name pipelines of the other major CI providers.
 */
function collectPipelineFiles(fsPort: DeploymentFsPort): DeploymentFile[] {
  const pipelineFiles: DeploymentFile[] = [];
  for (const entry of fsPort.listDir('.github/workflows')) {
    if (!isYamlPipeline(entry)) continue;
    const f = capture(fsPort, `.github/workflows/${entry}`, true);
    if (f) pipelineFiles.push(f);
  }
  for (const fixed of FIXED_PIPELINE_FILES) {
    const f = capture(fsPort, fixed, true);
    if (f) pipelineFiles.push(f);
  }
  return pipelineFiles;
}

/**
 * Discover deploy scripts: everything under `deploy/`, plus the `deploy*`-named
 * entries under `scripts/`.
 */
function collectDeployScripts(fsPort: DeploymentFsPort): DeploymentFile[] {
  const deployScripts: DeploymentFile[] = [];
  for (const entry of fsPort.listDir('deploy')) {
    const f = capture(fsPort, `deploy/${entry}`, false);
    if (f) deployScripts.push(f);
  }
  for (const entry of fsPort.listDir('scripts')) {
    if (!entry.toLowerCase().startsWith('deploy')) continue;
    const f = capture(fsPort, `scripts/${entry}`, false);
    if (f) deployScripts.push(f);
  }
  return deployScripts;
}

/** Discover committed environment files (`.env.*`) at the repository root. */
function collectEnvFiles(fsPort: DeploymentFsPort): DeploymentFile[] {
  const envFiles: DeploymentFile[] = [];
  for (const entry of fsPort.listDir('.')) {
    if (!entry.startsWith('.env.')) continue;
    const f = capture(fsPort, entry, false);
    if (f) envFiles.push(f);
  }
  return envFiles;
}

/**
 * Mutable accumulator for the signals derived from the discovered files.
 *
 * Every discovery pass contributes to the same running totals, so one
 * accumulator is threaded through them instead of being merged afterwards.
 */
interface DerivedSignals {
  detected: Set<string>;
  presentStages: Set<string>;
  hasProductionTarget: boolean;
  productionUngated: boolean;
  rollbackSignalInFiles: boolean;
  hasHealthCheck: boolean;
}

function emptySignals(): DerivedSignals {
  return {
    detected: new Set<string>(),
    presentStages: new Set<string>(),
    hasProductionTarget: false,
    productionUngated: false,
    rollbackSignalInFiles: false,
    hasHealthCheck: false,
  };
}

/**
 * Accumulate environment, production-reach, rollback, health-check and stage
 * signals from pipeline and deploy-script *contents*.
 */
function accumulateContentSignals(files: DeploymentFile[], into: DerivedSignals): void {
  for (const file of files) {
    collectEnvironments(file.content, into.detected);
    const reachesProd = PROD_RE.test(file.content);
    if (reachesProd) {
      into.hasProductionTarget = true;
      if (!hasGating(file.content)) into.productionUngated = true;
    }
    if (ROLLBACK_RE.test(file.path) || ROLLBACK_RE.test(file.content)) {
      into.rollbackSignalInFiles = true;
    }
    if (HEALTHCHECK_RE.test(file.content)) into.hasHealthCheck = true;
    for (const { stage, re } of STAGE_KEYWORDS) {
      if (re.test(file.content)) into.presentStages.add(stage);
    }
  }
}

/**
 * Accumulate signals from committed `.env.*` files. Their *file name* also
 * names an environment (`.env.production`), so paths are matched as well as
 * contents.
 */
function accumulateEnvFileSignals(files: DeploymentFile[], into: DerivedSignals): void {
  for (const file of files) {
    collectEnvironments(file.content, into.detected);
    if (PROD_RE.test(file.path)) into.detected.add('production');
    if (STAGING_RE.test(file.path)) into.detected.add('staging');
    if (ROLLBACK_RE.test(file.path)) into.rollbackSignalInFiles = true;
  }
}

export function detectDeploymentSurface(root: string, fsPort: DeploymentFsPort): DeploymentSurface {
  void root; // paths are already root-relative for the injected port.

  const pipelineFiles = collectPipelineFiles(fsPort);
  const deployScripts = collectDeployScripts(fsPort);
  const envFiles = collectEnvFiles(fsPort);

  // --- Derived signals ---
  const signals = emptySignals();
  const contentFiles = [...pipelineFiles, ...deployScripts];
  accumulateContentSignals(contentFiles, signals);
  accumulateEnvFileSignals(envFiles, signals);

  // Runbook / rollback doc existence satisfies the rollback signal.
  if (!signals.rollbackSignalInFiles) {
    signals.rollbackSignalInFiles = RUNBOOK_CANDIDATES.some((c) => fsPort.exists(c));
  }

  // A gating signal anywhere across the surface downgrades "ungated".
  if (signals.productionUngated && contentFiles.some((f) => hasGating(f.content))) {
    signals.productionUngated = false;
  }

  return {
    pipelineFiles,
    deployScripts,
    envFiles,
    detectedEnvironments: [...signals.detected],
    hasProductionTarget: signals.hasProductionTarget,
    productionUngated: signals.productionUngated,
    rollbackSignalInFiles: signals.rollbackSignalInFiles,
    hasHealthCheck: signals.hasHealthCheck,
    presentStages: [...signals.presentStages],
  };
}
