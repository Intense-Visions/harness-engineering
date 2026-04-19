import * as fs from 'node:fs';
import * as path from 'node:path';
import readline from 'node:readline';
import chalk from 'chalk';
import type { StepResult } from './setup-types';

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

function isNo(answer: string): boolean {
  return answer === 'n' || answer === 'no';
}

interface TelemetryWizardResult {
  telemetryEnabled: boolean;
  adoptionEnabled: boolean;
  identity: { project?: string; team?: string; alias?: string };
}

/**
 * Checks whether the project's harness.config.json already has explicit
 * telemetry and adoption configuration.
 */
export function isTelemetryConfigured(cwd: string): boolean {
  const configPath = path.join(cwd, 'harness.config.json');
  try {
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    return raw.telemetry !== undefined && raw.adoption !== undefined;
  } catch {
    return false;
  }
}

/**
 * Writes the wizard results into harness.config.json (telemetry + adoption keys)
 * and .harness/telemetry.json (identity fields).
 */
export function writeTelemetryConfig(cwd: string, result: TelemetryWizardResult): void {
  const configPath = path.join(cwd, 'harness.config.json');

  // Patch harness.config.json
  try {
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    raw.telemetry = { enabled: result.telemetryEnabled };
    raw.adoption = { enabled: result.adoptionEnabled };
    fs.writeFileSync(configPath, JSON.stringify(raw, null, 2) + '\n');
  } catch (err) {
    console.warn(
      `⚠ Could not update ${configPath}: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // Write identity if any fields are set
  const hasIdentity = result.identity.project || result.identity.team || result.identity.alias;
  if (hasIdentity) {
    const harnessDir = path.join(cwd, '.harness');
    fs.mkdirSync(harnessDir, { recursive: true });
    const telemetryFile = path.join(harnessDir, 'telemetry.json');
    fs.writeFileSync(telemetryFile, JSON.stringify({ identity: result.identity }, null, 2) + '\n');
  }
}

async function promptIdentity(): Promise<TelemetryWizardResult['identity']> {
  console.log(
    `  ${chalk.cyan('Identity')} (optional) — tag telemetry with project/team/alias for filtering.`
  );
  console.log('  Leave blank to keep anonymous.');
  const answer = await prompt('  Set identity fields? (y/N) ');
  const identity: TelemetryWizardResult['identity'] = {};

  if (answer === 'y' || answer === 'yes') {
    const projectName = await prompt('    Project name: ');
    if (projectName) identity.project = projectName;

    const teamName = await prompt('    Team name: ');
    if (teamName) identity.team = teamName;

    const alias = await prompt('    Alias: ');
    if (alias) identity.alias = alias;
  }

  return identity;
}

/**
 * Interactive wizard that walks users through telemetry configuration.
 * Returns null if stdin is not a TTY (non-interactive mode).
 */
export async function runTelemetryWizard(): Promise<TelemetryWizardResult | null> {
  if (!process.stdin.isTTY) return null;

  console.log('');
  console.log(`  ${chalk.bold('Telemetry Configuration')}`);
  console.log('');
  console.log('  Harness can collect anonymous usage data to help improve the tool.');
  console.log('  You can change these settings anytime in harness.config.json.');
  console.log('');

  // 1. Anonymous telemetry
  console.log(
    `  ${chalk.cyan('Anonymous telemetry')} — error rates, command usage, performance metrics.`
  );
  console.log('  No code, file contents, or personally identifiable info is sent.');
  const telemetryAnswer = await prompt('  Enable anonymous telemetry? (Y/n) ');
  const telemetryEnabled = !isNo(telemetryAnswer);
  console.log('');

  // 2. Adoption tracking
  console.log(
    `  ${chalk.cyan('Adoption tracking')} — which skills are used, how often, and success rates.`
  );
  console.log('  Stored locally in .harness/adoption/. Never sent externally.');
  const adoptionAnswer = await prompt('  Enable local adoption tracking? (Y/n) ');
  const adoptionEnabled = !isNo(adoptionAnswer);
  console.log('');

  // 3. Optional identity
  const identity = await promptIdentity();

  return { telemetryEnabled, adoptionEnabled, identity };
}

/**
 * Step function for runSetup: checks if telemetry is configured, runs wizard if not.
 * Writes results to config files.
 */
export async function ensureTelemetryConfigured(cwd: string): Promise<StepResult> {
  const configPath = path.join(cwd, 'harness.config.json');
  if (!fs.existsSync(configPath)) {
    return { status: 'warn', message: 'Not a harness project — skipped telemetry configuration' };
  }

  if (isTelemetryConfigured(cwd)) {
    return { status: 'pass', message: 'Telemetry already configured' };
  }

  const result = await runTelemetryWizard();
  if (!result) {
    return { status: 'warn', message: 'Non-interactive mode — skipped telemetry configuration' };
  }

  writeTelemetryConfig(cwd, result);

  const parts: string[] = [];
  parts.push(`telemetry ${result.telemetryEnabled ? 'enabled' : 'disabled'}`);
  parts.push(`adoption ${result.adoptionEnabled ? 'enabled' : 'disabled'}`);
  if (result.identity.project || result.identity.team || result.identity.alias) {
    parts.push('identity set');
  }
  return { status: 'pass', message: `Telemetry configured: ${parts.join(', ')}` };
}
