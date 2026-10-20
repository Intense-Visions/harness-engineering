// packages/cli/tests/integration/cleanup-duplication-exit-code.e2e.test.ts
//
// WIRED at the product level: a real spawned process, the real config loader,
// the real EntropyAnalyzer, the real clone detector and the real
// `process.exit`. Phase 2 shipped a detector no production call site could
// reach; a unit test over an enum value would not have caught that.
//
// The claim under test is spec decision D4 / ADR 0134: duplication is
// ADVISORY. It reaches the operator through two gating channels and must be
// absent from both — `process.exit(totalIssues === 0 ? ...)` and the #691
// `--findings-json` maintenance contract.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const CLI_PATH = path.join(__dirname, '../../dist/bin/harness.js');
const CLI_BUILT = fs.existsSync(CLI_PATH);
const FIXTURE = path.join(__dirname, '../fixtures/duplication-cli-project');

function runCLI(args: string[], cwd: string) {
  return spawnSync('node', [CLI_PATH, ...args], { cwd, encoding: 'utf-8' });
}

describe('harness cleanup -t duplication (spawned CLI)', () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-dup-cli-'));
    fs.cpSync(FIXTURE, projectDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  function writeConfig(entropy: Record<string, unknown>): void {
    const configPath = path.join(projectDir, 'harness.config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    config.entropy = { ...config.entropy, ...entropy };
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  }

  it.skipIf(!CLI_BUILT)('exits 0 while reporting a clone class', () => {
    const result = runCLI(['cleanup', '-t', 'duplication', '--json'], projectDir);
    // MUTATION: add duplication to `totalIssues` and this becomes 1
    // (ExitCode.VALIDATION_FAILED). This is forward note 1's regression test.
    expect(result.status).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.duplication.classes).toHaveLength(1);
    expect(payload.duplication.classes[0].memberCount).toBe(3);
    expect(payload.duplication.classes[0].tokenCount).toBe(83);
    expect(payload.duplication.classesReported).toBe(1);
    expect(payload.totalIssues).toBe(0);
    expect(payload.ran).toEqual({
      drift: false,
      deadCode: false,
      patterns: false,
      duplication: true,
    });
  });

  it.skipIf(!CLI_BUILT)('publishes findings: 0 on the --findings-json contract', () => {
    const result = runCLI(['cleanup', '-t', 'duplication', '--findings-json'], projectDir);
    expect(result.status).toBe(0);
    const lines = result.stdout.trim().split('\n');
    // MUTATION: route duplication into the contract and this parses to
    // { findings: 1 }, failing a consumer's build on advisory output (#691).
    expect(JSON.parse(lines[lines.length - 1]!)).toMatchObject({
      findings: 0,
      check: 'cleanup',
    });
  });

  it.skipIf(!CLI_BUILT)('prints the advisory section and no green-ticked zero', () => {
    const result = runCLI(['cleanup', '-t', 'duplication'], projectDir);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Duplication (advisory');
    expect(result.stdout).toContain('1 clone class(es) over 5 scanned file(s)');
    expect(result.stdout).toContain('3x 83 tokens: totalAlpha');
    // `-t duplication` ran no gating analyzer, so its 0 means "not measured".
    expect(result.stdout).toContain('Entropy issues: not checked');
  });

  it.skipIf(!CLI_BUILT)('refuses an explicit request when the detector is disabled', () => {
    writeConfig({ duplication: false });
    const result = runCLI(['cleanup', '-t', 'duplication'], projectDir);
    expect(result.status).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toContain('entropy.duplication');
    // A refusal is not a clean scan: no advisory section may be printed.
    expect(`${result.stdout}${result.stderr}`).not.toContain('Duplication (advisory');
  });

  it.skipIf(!CLI_BUILT)('honors a configured override end to end', () => {
    // The WIRED proof for the config surface: before the schema entry,
    // `entropy.duplication` was stripped with an "ignored unknown key"
    // warning and could not reach the detector at all.
    writeConfig({ duplication: { minInstances: 4 } });
    const result = runCLI(['cleanup', '-t', 'duplication', '--json'], projectDir);
    expect(result.status).toBe(0);
    expect(result.stderr).not.toContain('ignored unknown key');
    const payload = JSON.parse(result.stdout);
    expect(payload.duplication.classes).toHaveLength(0);
    expect(payload.duplication.classesSuppressed).toBe(1);
  });

  it.skipIf(!CLI_BUILT)('refuses an unrecognized -t value instead of exiting 0', () => {
    // Measured before `.choices`: `-t duplicaiton` printed
    // "Entropy issues: not checked" and exited 0, and with --findings-json it
    // published `{"findings":0,"v":1,"check":"cleanup"}` — a green pass on the
    // #691 contract over a run that executed no analyzer at all.
    const result = runCLI(['cleanup', '-t', 'duplicaiton', '--findings-json'], projectDir);
    expect(result.status).not.toBe(0);
    const output = `${result.stdout}${result.stderr}`;
    expect(output).toContain('duplicaiton');
    // No findings line may be published for a run that never happened.
    expect(result.stdout).not.toContain('"findings"');
  });

  it.skipIf(!CLI_BUILT)('does not run duplication under -t all on an unconfigured project', () => {
    const result = runCLI(['cleanup', '-t', 'all'], projectDir);
    // MUTATION: make `all` unconditional and the section appears here.
    expect(result.stdout).not.toContain('Duplication (advisory');
  });
});
