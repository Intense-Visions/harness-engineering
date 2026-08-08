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

export function detectDeploymentSurface(root: string, fsPort: DeploymentFsPort): DeploymentSurface {
  void root; // paths are already root-relative for the injected port.

  const pipelineFiles: DeploymentFile[] = [];
  const deployScripts: DeploymentFile[] = [];
  const envFiles: DeploymentFile[] = [];

  // --- CI/CD pipeline discovery ---
  for (const entry of fsPort.listDir('.github/workflows')) {
    if (!/\.ya?ml$/i.test(entry)) continue;
    const f = capture(fsPort, `.github/workflows/${entry}`, true);
    if (f) pipelineFiles.push(f);
  }
  for (const fixed of FIXED_PIPELINE_FILES) {
    const f = capture(fsPort, fixed, true);
    if (f) pipelineFiles.push(f);
  }

  // --- Deploy script discovery ---
  for (const entry of fsPort.listDir('deploy')) {
    const f = capture(fsPort, `deploy/${entry}`, false);
    if (f) deployScripts.push(f);
  }
  for (const entry of fsPort.listDir('scripts')) {
    if (!entry.toLowerCase().startsWith('deploy')) continue;
    const f = capture(fsPort, `scripts/${entry}`, false);
    if (f) deployScripts.push(f);
  }

  // --- Committed env file discovery (.env.*) ---
  for (const entry of fsPort.listDir('.')) {
    if (!entry.startsWith('.env.')) continue;
    const f = capture(fsPort, entry, false);
    if (f) envFiles.push(f);
  }

  // --- Derived signals ---
  const detected = new Set<string>();
  let hasProductionTarget = false;
  let productionUngated = false;
  let rollbackSignalInFiles = false;
  let hasHealthCheck = false;
  const presentStages = new Set<string>();

  const contentFiles = [...pipelineFiles, ...deployScripts];
  for (const file of contentFiles) {
    collectEnvironments(file.content, detected);
    const reachesProd = PROD_RE.test(file.content);
    if (reachesProd) {
      hasProductionTarget = true;
      if (!hasGating(file.content)) productionUngated = true;
    }
    if (ROLLBACK_RE.test(file.path) || ROLLBACK_RE.test(file.content)) {
      rollbackSignalInFiles = true;
    }
    if (HEALTHCHECK_RE.test(file.content)) hasHealthCheck = true;
    for (const { stage, re } of STAGE_KEYWORDS) {
      if (re.test(file.content)) presentStages.add(stage);
    }
  }
  for (const file of envFiles) {
    collectEnvironments(file.content, detected);
    // Environment name also comes from the file name (.env.production).
    if (PROD_RE.test(file.path)) detected.add('production');
    if (STAGING_RE.test(file.path)) detected.add('staging');
    if (ROLLBACK_RE.test(file.path)) rollbackSignalInFiles = true;
  }

  // Runbook / rollback doc existence satisfies the rollback signal.
  if (!rollbackSignalInFiles) {
    rollbackSignalInFiles = RUNBOOK_CANDIDATES.some((c) => fsPort.exists(c));
  }

  // A gating signal anywhere across the surface downgrades "ungated".
  if (productionUngated && contentFiles.some((f) => hasGating(f.content))) {
    productionUngated = false;
  }

  return {
    pipelineFiles,
    deployScripts,
    envFiles,
    detectedEnvironments: [...detected],
    hasProductionTarget,
    productionUngated,
    rollbackSignalInFiles,
    hasHealthCheck,
    presentStages: [...presentStages],
  };
}
