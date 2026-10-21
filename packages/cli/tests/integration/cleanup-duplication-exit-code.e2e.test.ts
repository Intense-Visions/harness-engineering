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
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
// The SHARED tier vocabulary (ADR 0111), not a locally invented
// dist-existence predicate. ADR 0111 exists precisely because gated suites
// kept inventing their own gate, which makes them invisible to the
// grep-based reachability assertions that stop a silently-skipped suite from
// reading as a pass (`.github/workflows/main-health.yml`: "a silently-skipped
// suite must not read as a pass"). `runHarness` also spawns via
// `process.execPath` instead of a bare `node`, which is the win32-safe form.
//
// The gate is deliberately NOT made to fail loudly: ADR 0111 already decided
// that trade — a contributor who runs vitest before `build` must not get a
// red suite. The mitigation is the CI-side reachability assertion, which this
// suite is now covered by ("Assert gated CLI suites are reachable").
//
// Trade accepted: `HAS_HARNESS_BIN` resolves `dist/bin/harness.js` against
// `process.cwd()`, so this suite is only reachable when vitest runs from
// `packages/cli` — which is how CI and the documented local command run it.
import { runHarness, skipUnlessBin } from '../e2e/support';

const FIXTURE = path.join(__dirname, '../fixtures/duplication-cli-project');

describe.skipIf(skipUnlessBin)('harness cleanup -t duplication (spawned CLI)', () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-dup-cli-'));
    fs.cpSync(FIXTURE, projectDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  function runCLI(args: string[], cwd: string) {
    return runHarness(args, { cwd });
  }

  function writeConfig(entropy: Record<string, unknown>): void {
    const configPath = path.join(projectDir, 'harness.config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    config.entropy = { ...config.entropy, ...entropy };
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  }

  it('exits 0 while reporting a clone class', () => {
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

  it('publishes findings: 0 on the --findings-json contract', () => {
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

  it('prints the advisory section and no green-ticked zero', () => {
    const result = runCLI(['cleanup', '-t', 'duplication'], projectDir);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Duplication (advisory');
    expect(result.stdout).toContain('1 clone class(es) over 5 scanned file(s)');
    expect(result.stdout).toContain('3x 83 tokens: totalAlpha');
    // `-t duplication` ran no gating analyzer, so its 0 means "not measured".
    expect(result.stdout).toContain('Entropy issues: not checked');
  });

  it('refuses an explicit request when the detector is disabled', () => {
    writeConfig({ duplication: false });
    const result = runCLI(['cleanup', '-t', 'duplication'], projectDir);
    expect(result.status).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toContain('entropy.duplication');
    // A refusal is not a clean scan: no advisory section may be printed.
    expect(`${result.stdout}${result.stderr}`).not.toContain('Duplication (advisory');
  });

  it('honors a configured override end to end', () => {
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

  it('still prints the advisory section under --quiet', () => {
    // The quiet gate was `mode !== QUIET || totalIssues > 0`, and
    // `totalIssues` deliberately EXCLUDES duplication (D4) — so the channel
    // this phase added was suppressed by a gate keyed on the counter the phase
    // deliberately kept it out of. Measured before the fix:
    // `-t duplication --quiet` printed NOTHING and exited 0 with a clone class
    // found.
    const result = runCLI(['cleanup', '-t', 'duplication', '--quiet'], projectDir);
    expect(result.status).toBe(0);
    // MUTATION: drop `|| result.value.duplication` from the gate and stdout is
    // empty.
    expect(result.stdout).toContain('Duplication (advisory');
    expect(result.stdout).toContain('3x 83 tokens: totalAlpha');
  });

  it('refuses an unrecognized -t value instead of exiting 0', () => {
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

  it('does not run duplication under -t all on an unconfigured project', () => {
    const result = runCLI(['cleanup', '-t', 'all'], projectDir);
    // MUTATION: make `all` unconditional and the section appears here.
    expect(result.stdout).not.toContain('Duplication (advisory');
  });
});

const PE_FIXTURE = path.join(__dirname, '../fixtures/duplication-partial-extraction-project');

describe.skipIf(skipUnlessBin)(
  'harness cleanup -t duplication, partial-extraction (spawned CLI)',
  () => {
    let projectDir: string;

    beforeEach(() => {
      projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-dup-pe-'));
      fs.cpSync(PE_FIXTURE, projectDir, { recursive: true });
    });

    afterEach(() => {
      fs.rmSync(projectDir, { recursive: true, force: true });
    });

    it('keeps a labelled class out of the exit code (D4 holds for the signal too)', () => {
      const result = runHarness(['cleanup', '-t', 'duplication', '--json'], { cwd: projectDir });
      expect(result.status).toBe(0);
      const payload = JSON.parse(result.stdout);
      expect(payload.totalIssues).toBe(0);
      expect(payload.duplication.classesReported).toBe(2);
    });

    it('orders the SMALLER labelled class above the larger plain duplicate', () => {
      const result = runHarness(['cleanup', '-t', 'duplication', '--json'], { cwd: projectDir });
      expect(result.status).toBe(0);
      const payload = JSON.parse(result.stdout);
      const classes = payload.duplication.classes;
      expect(classes).toHaveLength(2);

      expect(classes[0].signal).toBe('partial-extraction');
      expect(classes[0].sharedImport).toBe('src/shared/payload');
      expect(classes[0].rank).toBe(186);
      expect(classes[0].priority).toBe(372);
      expect(classes[0].priority).toBe(classes[0].rank * 2);

      expect(classes[1].signal).toBe('duplicate');
      expect(classes[1].rank).toBe(309);
      expect(classes[1].priority).toBe(309);
      expect(classes[1].priority).toBe(classes[1].rank);
      expect('sharedImport' in classes[1]).toBe(false);

      // THE ORDERING PROOF: the first class is the SMALLER duplication, and it
      // is first only because it is labelled.
      // MUTATION: set PARTIAL_EXTRACTION_PRIORITY_BOOST = 1 in core, rebuild
      // core AND cli, and this fails — classes[0] becomes the plain duplicate.
      expect(classes[0].rank).toBeLessThan(classes[1].rank);
    });

    it('names the signal on the labelled printed row and on no other', () => {
      const result = runHarness(['cleanup', '-t', 'duplication'], { cwd: projectDir });
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('2 clone class(es) over 9 scanned file(s)');
      const rows = result.stdout.split('\n').filter((l) => l.trimStart().startsWith('- '));
      expect(rows).toHaveLength(2);
      expect(rows[0]).toContain('3x 62 tokens: keepBeta');
      expect(rows[0]).toContain('[partial-extraction -> src/shared/payload]');
      expect(rows[1]).toContain('3x 103 tokens: sumOne');
      expect(rows[1]).not.toContain('partial-extraction');
    });
  }
);
