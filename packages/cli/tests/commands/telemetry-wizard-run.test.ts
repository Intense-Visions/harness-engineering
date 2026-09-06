/**
 * Covers `runTelemetryWizard` — the interactive driver.
 *
 * `isTelemetryConfigured` / `writeTelemetryConfig` / `ensureTelemetryConfigured`
 * are covered by `telemetry-wizard.test.ts`; this file covers only the prompt
 * loop. Its consent semantics are the point: both telemetry questions are
 * default-ON (`!isNo(answer)`), so a user who just presses Enter opts IN. That
 * is exactly the kind of default a silent regression could invert.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { captureConsole, type ConsoleCapture } from './cli-command-harness';

const script = vi.hoisted(() => ({
  /** Answers handed to `rl.question`, in order. */
  answers: [] as string[],
  /** Every question string the wizard asked, in order. */
  asked: [] as string[],
  /** How many readline interfaces were opened and closed. */
  opened: 0,
  closed: 0,
}));

vi.mock('node:readline', () => {
  const createInterface = () => {
    script.opened += 1;
    return {
      question: (query: string, callback: (answer: string) => void) => {
        script.asked.push(query);
        callback(script.answers.shift() ?? '');
      },
      close: () => {
        script.closed += 1;
      },
    };
  };
  return { default: { createInterface }, createInterface };
});

import { runTelemetryWizard } from '../../src/commands/telemetry-wizard';

const ENTER = '';

let out: ConsoleCapture;
let originalIsTTY: boolean | undefined;

/** Script the answers and run the wizard as an interactive session. */
async function wizardWith(...answers: string[]) {
  script.answers = [...answers];
  process.stdin.isTTY = true;
  return runTelemetryWizard();
}

beforeEach(() => {
  script.answers = [];
  script.asked = [];
  script.opened = 0;
  script.closed = 0;
  originalIsTTY = process.stdin.isTTY;
  out = captureConsole();
});

afterEach(() => {
  process.stdin.isTTY = originalIsTTY as boolean;
  out.restore();
});

describe('non-interactive guard', () => {
  it('returns null without prompting when stdin is not a TTY', async () => {
    process.stdin.isTTY = false;

    expect(await runTelemetryWizard()).toBeNull();
  });

  it('opens no readline interface at all in non-interactive mode', async () => {
    process.stdin.isTTY = false;

    await runTelemetryWizard();

    expect(script.opened).toBe(0);
  });

  it('returns null when isTTY is undefined rather than explicitly false', async () => {
    // `process.stdin.isTTY` is `undefined` — not `false` — on a piped stdin.
    process.stdin.isTTY = undefined as unknown as boolean;

    expect(await runTelemetryWizard()).toBeNull();
  });
});

describe('consent defaults', () => {
  it('enables both telemetry and adoption when the user just presses Enter', async () => {
    const result = await wizardWith(ENTER, ENTER, ENTER);

    expect(result).toEqual({
      telemetryEnabled: true,
      adoptionEnabled: true,
      identity: {},
    });
  });

  it('offers telemetry and adoption as (Y/n) — default yes', async () => {
    await wizardWith(ENTER, ENTER, ENTER);

    expect(script.asked[0]).toContain('(Y/n)');
    expect(script.asked[1]).toContain('(Y/n)');
  });

  it('disables telemetry on "n"', async () => {
    const result = await wizardWith('n', ENTER, ENTER);

    expect(result?.telemetryEnabled).toBe(false);
  });

  it('disables telemetry on the spelled-out "no"', async () => {
    const result = await wizardWith('no', ENTER, ENTER);

    expect(result?.telemetryEnabled).toBe(false);
  });

  it('treats an unrecognised answer as consent, since only n/no decline', async () => {
    const result = await wizardWith('maybe', ENTER, ENTER);

    expect(result?.telemetryEnabled).toBe(true);
  });

  it('normalises case and surrounding whitespace before reading a decline', async () => {
    const result = await wizardWith('  N  ', ENTER, ENTER);

    expect(result?.telemetryEnabled).toBe(false);
  });

  it('decides adoption independently of the telemetry answer', async () => {
    const result = await wizardWith('n', ENTER, ENTER);

    expect(result?.adoptionEnabled).toBe(true);
  });

  it('disables adoption without disabling telemetry', async () => {
    const result = await wizardWith('y', 'no', ENTER);

    expect(result).toMatchObject({ telemetryEnabled: true, adoptionEnabled: false });
  });

  it('asks exactly three questions when identity is declined', async () => {
    await wizardWith(ENTER, ENTER, ENTER);

    expect(script.asked).toHaveLength(3);
  });
});

describe('optional identity', () => {
  it('skips the identity fields unless the user opts in explicitly', async () => {
    // Identity is (y/N): unlike the consent prompts, blank means "no".
    const result = await wizardWith(ENTER, ENTER, ENTER);

    expect(result?.identity).toEqual({});
    expect(script.asked[2]).toContain('(y/N)');
  });

  it('does not prompt for identity fields on an unrecognised answer', async () => {
    const result = await wizardWith(ENTER, ENTER, 'sure');

    expect(result?.identity).toEqual({});
    expect(script.asked).toHaveLength(3);
  });

  it('collects project, team, and alias when the user opts in with "y"', async () => {
    const result = await wizardWith(ENTER, ENTER, 'y', 'checkout', 'payments', 'cw');

    expect(result?.identity).toEqual({ project: 'checkout', team: 'payments', alias: 'cw' });
  });

  it('accepts the spelled-out "yes" and any casing to open the identity prompts', async () => {
    const result = await wizardWith(ENTER, ENTER, 'YES', 'checkout', 'payments', 'cw');

    expect(result?.identity).toEqual({ project: 'checkout', team: 'payments', alias: 'cw' });
  });

  it('preserves the original casing of identity values', async () => {
    const result = await wizardWith(ENTER, ENTER, 'y', 'Checkout API', 'Platform Team', 'CWarner');

    expect(result?.identity).toEqual({
      project: 'Checkout API',
      team: 'Platform Team',
      alias: 'CWarner',
    });
  });

  it('trims surrounding whitespace from identity values without lowercasing them', async () => {
    const result = await wizardWith(ENTER, ENTER, 'y', '  MiXeD Case  ', ENTER, ENTER);

    expect(result?.identity.project).toBe('MiXeD Case');
  });

  it('omits a blank identity field entirely instead of storing an empty string', async () => {
    const result = await wizardWith(ENTER, ENTER, 'y', 'checkout', ENTER, 'cw');

    expect(result?.identity).toEqual({ project: 'checkout', alias: 'cw' });
    // `toEqual` treats an explicit `team: undefined` as equal to an absent key,
    // so the key check is what actually pins "omitted", not "set to nothing".
    expect('team' in (result?.identity ?? {})).toBe(false);
  });

  it('asks six questions in total once identity is opted into', async () => {
    await wizardWith(ENTER, ENTER, 'y', 'checkout', 'payments', 'cw');

    expect(script.asked).toHaveLength(6);
  });
});

describe('readline lifecycle', () => {
  it('closes every readline interface it opens on the short path', async () => {
    await wizardWith(ENTER, ENTER, ENTER);

    expect(script.opened).toBe(3);
    expect(script.closed).toBe(3);
  });

  it('closes every readline interface it opens on the identity path', async () => {
    await wizardWith(ENTER, ENTER, 'y', 'checkout', 'payments', 'cw');

    expect(script.opened).toBe(6);
    expect(script.closed).toBe(6);
  });
});
