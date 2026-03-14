import type { Result } from '@harness-engineering/core';
import type { Persona } from './schema';

export interface PersonaRunReport {
  persona: string;
  status: 'pass' | 'fail' | 'partial';
  commands: Array<{
    name: string;
    status: 'pass' | 'fail' | 'skipped';
    result?: unknown;
    error?: string;
    durationMs: number;
  }>;
  totalDurationMs: number;
}

export type CommandExecutor = (command: string) => Promise<Result<unknown, Error>>;

export async function runPersona(
  persona: Persona,
  executor: CommandExecutor
): Promise<PersonaRunReport> {
  const startTime = Date.now();
  const timeout = persona.config.timeout;
  const report: PersonaRunReport = {
    persona: persona.name.toLowerCase().replace(/\s+/g, '-'),
    status: 'pass',
    commands: [],
    totalDurationMs: 0,
  };

  for (let i = 0; i < persona.commands.length; i++) {
    const command = persona.commands[i];

    // Check timeout
    if (Date.now() - startTime >= timeout) {
      // Mark remaining as skipped
      for (let j = i; j < persona.commands.length; j++) {
        report.commands.push({ name: persona.commands[j], status: 'skipped', durationMs: 0 });
      }
      report.status = 'partial';
      break;
    }

    const cmdStart = Date.now();
    const remaining = timeout - (Date.now() - startTime);

    const result = await Promise.race([
      executor(command),
      new Promise<Result<never, Error>>((resolve) =>
        setTimeout(() => resolve({ ok: false, error: new Error('Command timed out') } as Result<never, Error>), remaining)
      ),
    ]);

    const durationMs = Date.now() - cmdStart;

    if (result.ok) {
      report.commands.push({ name: command, status: 'pass', result: result.value, durationMs });
    } else if (result.error.message === 'Command timed out') {
      report.commands.push({ name: command, status: 'skipped', error: 'timed out', durationMs });
      report.status = 'partial';
      for (let j = i + 1; j < persona.commands.length; j++) {
        report.commands.push({ name: persona.commands[j], status: 'skipped', durationMs: 0 });
      }
      break;
    } else {
      report.commands.push({ name: command, status: 'fail', error: result.error.message, durationMs });
      report.status = 'fail';
      for (let j = i + 1; j < persona.commands.length; j++) {
        report.commands.push({ name: persona.commands[j], status: 'skipped', durationMs: 0 });
      }
      break;
    }
  }

  report.totalDurationMs = Date.now() - startTime;
  return report;
}
