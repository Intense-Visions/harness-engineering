/**
 * Harness → GitHub Issues Webhook Handler
 *
 * A standalone Node.js handler that creates GitHub issues when harness
 * detects entropy or constraint violations. Deploy as a serverless function
 * or run as part of a CI step.
 *
 * Usage (as a script):
 *   GITHUB_TOKEN=ghp_... node github-issue-webhook.ts report.json
 *
 * Usage (as a module):
 *   import { processReport } from './github-issue-webhook';
 *   await processReport(report, { owner: 'org', repo: 'repo', token: '...' });
 */

import * as fs from 'node:fs';

interface CICheckIssue {
  severity: 'error' | 'warning';
  message: string;
  file?: string;
  line?: number;
}

interface CICheckResult {
  name: string;
  status: 'pass' | 'fail' | 'warn' | 'skip';
  issues: CICheckIssue[];
  durationMs: number;
}

interface CICheckReport {
  version: 1;
  project: string;
  timestamp: string;
  checks: CICheckResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    warnings: number;
    skipped: number;
  };
  exitCode: number;
}

interface GitHubConfig {
  owner: string;
  repo: string;
  token: string;
}

interface CreatedIssue {
  number: number;
  title: string;
  url: string;
}

/**
 * Process a harness CI check report and create GitHub issues for failures.
 */
export async function processReport(
  report: CICheckReport,
  config: GitHubConfig
): Promise<CreatedIssue[]> {
  const created: CreatedIssue[] = [];

  for (const check of report.checks) {
    if (check.status !== 'fail' && check.status !== 'warn') continue;
    if (check.issues.length === 0) continue;

    const title = `Harness ${check.name}: ${check.issues.length} issue(s) detected`;
    const body = formatIssueBody(check, report);
    const labels = ['automated', 'harness', check.name];

    if (check.status === 'warn') {
      labels.push('entropy');
    }

    const issue = await createGitHubIssue(config, title, body, labels);
    if (issue) {
      created.push(issue);
    }
  }

  return created;
}

function formatIssueBody(check: CICheckResult, report: CICheckReport): string {
  const lines: string[] = [
    `## Harness Check: ${check.name}`,
    '',
    `**Status:** ${check.status}`,
    `**Project:** ${report.project}`,
    `**Detected:** ${report.timestamp}`,
    '',
    '### Issues',
    '',
  ];

  for (const issue of check.issues) {
    const location = issue.file
      ? ` (\`${issue.file}${issue.line ? `:${issue.line}` : ''}\`)`
      : '';
    lines.push(`- **${issue.severity}:** ${issue.message}${location}`);
  }

  lines.push('', '---', '');
  lines.push('*This issue was automatically created by harness CI.*');
  lines.push(`*Run \`harness ci check\` locally to reproduce.*`);

  return lines.join('\n');
}

async function createGitHubIssue(
  config: GitHubConfig,
  title: string,
  body: string,
  labels: string[]
): Promise<CreatedIssue | null> {
  const url = `https://api.github.com/repos/${config.owner}/${config.repo}/issues`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ title, body, labels }),
  });

  if (!response.ok) {
    console.error(`Failed to create issue: ${response.status} ${response.statusText}`);
    return null;
  }

  const data = (await response.json()) as { number: number; html_url: string };
  return {
    number: data.number,
    title,
    url: data.html_url,
  };
}

// ---- CLI Entry Point ----

async function main(): Promise<void> {
  const reportPath = process.argv[2];
  if (!reportPath) {
    console.error('Usage: node github-issue-webhook.ts <report.json>');
    process.exit(2);
  }

  const token = process.env['GITHUB_TOKEN'];
  const repo = process.env['GITHUB_REPOSITORY']; // "owner/repo" format
  if (!token || !repo) {
    console.error('Required env vars: GITHUB_TOKEN, GITHUB_REPOSITORY');
    process.exit(2);
  }

  const [owner, repoName] = repo.split('/');
  if (!owner || !repoName) {
    console.error('GITHUB_REPOSITORY must be in "owner/repo" format');
    process.exit(2);
  }

  const raw = fs.readFileSync(reportPath, 'utf-8');
  const report = JSON.parse(raw) as CICheckReport;

  const issues = await processReport(report, { owner, repo: repoName, token });

  if (issues.length === 0) {
    console.log('No issues to create.');
  } else {
    for (const issue of issues) {
      console.log(`Created issue #${issue.number}: ${issue.title} (${issue.url})`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
