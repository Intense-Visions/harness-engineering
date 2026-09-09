import { Command } from 'commander';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Result, CICheckName, CIPlatform } from '@harness-engineering/core';
import { Ok, Err } from '@harness-engineering/core';
import { logger } from '../../output/logger';
import { CLIError, ExitCode } from '../../utils/errors';

const ALL_CHECKS: CICheckName[] = [
  'validate',
  'deps',
  'docs',
  'entropy',
  'security',
  'perf',
  'phase-gate',
  'arch',
  'traceability',
];

interface GenerateResult {
  filename: string;
  content: string;
}

function buildSkipFlag(checks?: CICheckName[]): string {
  if (!checks) return '';
  const skipChecks = ALL_CHECKS.filter((c) => !checks.includes(c));
  if (skipChecks.length === 0) return '';
  return ` --skip ${skipChecks.join(',')}`;
}

interface LanguageSteps {
  setup: string; // YAML lines for runtime setup step(s), indented for steps list
  install: string;
  build?: string;
  lint?: string;
  test: string;
}

function stepsForLanguage(language?: string): LanguageSteps {
  switch (language) {
    case 'python':
      return {
        setup: `      - uses: actions/setup-python@v5\n        with:\n          python-version: '3.12'`,
        install: 'pip install -e .',
        lint: 'ruff check .',
        test: 'pytest',
      };
    case 'go':
      return {
        setup: `      - uses: actions/setup-go@v5\n        with:\n          go-version: 'stable'`,
        install: 'go mod download',
        build: 'go build ./...',
        lint: 'golangci-lint run',
        test: 'go test ./...',
      };
    case 'rust':
      return {
        setup: `      - uses: dtolnay/rust-toolchain@stable`,
        install: 'cargo fetch',
        build: 'cargo build',
        lint: 'cargo clippy',
        test: 'cargo test',
      };
    case 'java':
      return {
        setup: `      - uses: actions/setup-java@v4\n        with:\n          distribution: 'temurin'\n          java-version: '21'`,
        install: 'mvn -B -q install -DskipTests',
        test: 'mvn -B verify',
      };
    case 'typescript':
    default:
      return {
        setup: `      - uses: pnpm/action-setup@v4\n      - uses: actions/setup-node@v4\n        with:\n          node-version: '22'`,
        install: 'pnpm i --frozen-lockfile',
        build: 'pnpm build',
        lint: 'pnpm lint',
        test: 'pnpm test',
      };
  }
}

// The `concurrency:` block this emits is SPLIT BY EVENT on purpose — do not
// "simplify" it back to a plain `harness-${{ github.ref }}` + `cancel-in-progress: true`.
//
// The emitted template triggers on BOTH `push:` to main and `pull_request:`. On a push,
// `github.ref` is `refs/heads/main` for EVERY commit, so a per-ref group puts all main
// pushes in ONE bucket and each new merge cancels the still-running verification of the
// previous commit. The run concludes `cancelled`, not `failure`, so nothing alarms — the
// adopter's board reads green while the commit went unverified. Under a merge burst most
// trunk commits are never verified at all.
//
//   push  -> per-COMMIT group (github.sha), never cancelled, so every commit that lands
//            on the adopter's trunk reaches its own verdict.
//   PR    -> per-REF group, cancel-in-progress ON, so a new push to a PR still supersedes
//            the old run. PR runner spend is unchanged.
//
// Trunk runner spend rises with merge-burst size; that increase IS the fix — it is the
// cost of every trunk commit actually being verified.
//
// This is the shape #1865 established for this repo's hand-written ci.yml/harness.yml and
// #1867 / PR #2049 brought the generated persona workflows onto (see
// src/persona/generators/ci-workflow.ts); #2050 brings the adopter-facing template onto it
// too, so all three emitters agree. `cancel-in-progress` officially accepts an expression,
// and the `A && B || C` idiom is already proven on GitHub's runners.
function generateGitHubActions(skipFlag: string, language?: string): string {
  const steps = stepsForLanguage(language);

  const commandSteps: string[] = [];
  commandSteps.push(`      - name: Install dependencies\n        run: ${steps.install}`);
  if (steps.build) {
    commandSteps.push(`      - name: Build\n        run: ${steps.build}`);
  }
  if (steps.lint) {
    commandSteps.push(`      - name: Lint\n        run: ${steps.lint}`);
  }
  commandSteps.push(`      - name: Test\n        run: ${steps.test}`);

  // Concurrency is split by event — see the block comment above this function.
  return `name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

# Split by event: pushes to main get a per-commit group so a merge burst never
# cancels the previous commit's verification; PRs keep per-ref supersession.
concurrency:
  group: harness-\${{ github.event_name == 'pull_request' && github.ref || github.sha }}
  cancel-in-progress: \${{ github.event_name == 'pull_request' }}

jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
${steps.setup}
${commandSteps.join('\n')}
      - name: Install harness CLI
        run: npm install -g @harness-engineering/cli
      - name: Harness gate
        run: harness ci check --json${skipFlag}
`;
}

function generateGitLabCI(skipFlag: string): string {
  return `harness:
  stage: test
  image: node:22
  before_script:
    - npm install -g @harness-engineering/cli
  script:
    - harness ci check --json${skipFlag}
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH
`;
}

function generateGenericScript(skipFlag: string): string {
  return `#!/usr/bin/env bash
set -euo pipefail

# Harness CI Check Script
# Generated by: harness ci init --platform generic

if ! command -v harness &> /dev/null; then
  echo "Installing @harness-engineering/cli..."
  npm install -g @harness-engineering/cli
fi

echo "Running harness checks..."
harness ci check --json${skipFlag}
EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
  echo "All harness checks passed."
elif [ $EXIT_CODE -eq 1 ]; then
  echo "Harness checks failed. See report above."
else
  echo "Harness internal error."
fi

exit $EXIT_CODE
`;
}

export function generateCIConfig(options: {
  platform: CIPlatform;
  checks?: CICheckName[];
  language?: string;
}): Result<GenerateResult, CLIError> {
  const { platform, checks, language } = options;
  const skipFlag = buildSkipFlag(checks);

  const generators: Record<CIPlatform, { filename: string; generate: (skip: string) => string }> = {
    github: {
      filename: '.github/workflows/ci.yml',
      generate: (skip: string) => generateGitHubActions(skip, language),
    },
    gitlab: { filename: '.gitlab-ci-harness.yml', generate: generateGitLabCI },
    generic: { filename: 'harness-ci.sh', generate: generateGenericScript },
  };

  const entry = generators[platform];
  if (!entry) {
    return Err(new CLIError(`Unknown platform: ${platform}`, ExitCode.ERROR));
  }

  return Ok({
    filename: entry.filename,
    content: entry.generate(skipFlag),
  });
}

function detectPlatform(): CIPlatform | null {
  if (fs.existsSync('.github')) return 'github';
  if (fs.existsSync('.gitlab-ci.yml')) return 'gitlab';
  return null;
}

function writeGeneratedConfig(filename: string, content: string, platform: CIPlatform): void {
  const targetPath = path.resolve(filename);
  const dir = path.dirname(targetPath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(targetPath, content);
  if (platform === 'generic' && process.platform !== 'win32') {
    fs.chmodSync(targetPath, '755');
  }
}

async function runInitAction(
  opts: { platform?: string; checks?: string; language?: string },
  globalOpts: { json?: boolean }
): Promise<void> {
  const platform: CIPlatform =
    (opts.platform as CIPlatform | undefined) ?? detectPlatform() ?? 'generic';

  const checks = opts.checks
    ? (opts.checks.split(',').map((s: string) => s.trim()) as CICheckName[])
    : undefined;

  const configOpts: Parameters<typeof generateCIConfig>[0] = { platform };
  if (checks) configOpts.checks = checks;
  if (opts.language) configOpts.language = opts.language;
  const result = generateCIConfig(configOpts);

  if (!result.ok) {
    logger.error(result.error.message);
    process.exit(result.error.exitCode);
  }

  const { filename, content } = result.value;
  writeGeneratedConfig(filename, content, platform);

  if (globalOpts.json) {
    console.log(JSON.stringify({ file: filename, platform }));
  } else {
    logger.success(`Generated ${filename} for ${platform}`);
    logger.dim("Run 'harness ci check' to test locally");
  }
}

export function createInitCommand(): Command {
  return new Command('init')
    .description('Generate CI configuration for harness checks')
    .option('--platform <platform>', 'CI platform: github, gitlab, or generic')
    .option('--language <language>', 'Project language for build/lint/test steps')
    .option('--checks <list>', 'Comma-separated list of checks to include')
    .action(async (opts, cmd) => {
      await runInitAction(opts, cmd.optsWithGlobals());
    });
}
