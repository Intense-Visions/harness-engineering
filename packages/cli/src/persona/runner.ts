import type { Result } from '@harness-engineering/core';
import type { Persona, Step, TriggerContext } from './schema';
import type { SkillExecutionResult, SkillExecutionContext } from './skill-executor';
import { detectTrigger, type HandoffContext } from './trigger-detector';

const TIMEOUT_ERROR_MESSAGE = '__PERSONA_RUNNER_TIMEOUT__';

export interface StepReport {
  name: string;
  type: 'command' | 'skill';
  status: 'pass' | 'fail' | 'skipped';
  result?: unknown;
  artifactPath?: string;
  error?: string;
  durationMs: number;
}

export interface PersonaRunReport {
  persona: string;
  status: 'pass' | 'fail' | 'partial';
  steps: StepReport[];
  totalDurationMs: number;
}

export type CommandExecutor = (command: string) => Promise<Result<unknown, Error>>;
export type SkillExecutor = (
  skillName: string,
  context: SkillExecutionContext
) => Promise<SkillExecutionResult>;

export interface StepExecutionContext {
  trigger: TriggerContext | 'auto';
  commandExecutor: CommandExecutor;
  skillExecutor: SkillExecutor;
  projectPath: string;
  handoff?: HandoffContext;
}

function stepName(step: Step): string {
  return 'command' in step ? step.command : step.skill;
}

function stepType(step: Step): 'command' | 'skill' {
  return 'command' in step ? 'command' : 'skill';
}

function matchesTrigger(step: Step, trigger: TriggerContext): boolean {
  const when = step.when ?? 'always';
  return when === 'always' || when === trigger;
}

function skipRemaining(activeSteps: Step[], fromIndex: number, report: PersonaRunReport): void {
  for (let j = fromIndex; j < activeSteps.length; j++) {
    const remaining = activeSteps[j]!;
    report.steps.push({
      name: stepName(remaining),
      type: stepType(remaining),
      status: 'skipped',
      durationMs: 0,
    });
  }
}

interface StepOutcome {
  stepReport: Omit<StepReport, 'durationMs'>;
  halt?: 'fail' | 'partial';
}

async function executeCommandStep(
  command: string,
  remainingTime: number,
  context: StepExecutionContext
): Promise<StepOutcome> {
  const timeoutResult: Result<never, Error> = {
    ok: false,
    error: new Error(TIMEOUT_ERROR_MESSAGE),
  };
  const result = await Promise.race([
    context.commandExecutor(command),
    new Promise<Result<never, Error>>((resolve) =>
      setTimeout(() => resolve(timeoutResult), remainingTime)
    ),
  ]);

  if (result.ok) {
    return { stepReport: { name: command, type: 'command', status: 'pass', result: result.value } };
  }
  if (result.error.message === TIMEOUT_ERROR_MESSAGE) {
    return {
      stepReport: { name: command, type: 'command', status: 'skipped', error: 'timed out' },
      halt: 'partial',
    };
  }
  return {
    stepReport: { name: command, type: 'command', status: 'fail', error: result.error.message },
    halt: 'fail',
  };
}

async function executeSkillStep(
  step: Extract<import('./schema').Step, { skill: string }>,
  trigger: import('./schema').TriggerContext,
  remainingTime: number,
  context: StepExecutionContext,
  handoff: import('./trigger-detector').HandoffContext | undefined
): Promise<StepOutcome> {
  const SKILL_TIMEOUT_RESULT: SkillExecutionResult = {
    status: 'fail',
    output: 'timed out',
    durationMs: 0,
  };
  const skillContext: SkillExecutionContext = {
    trigger,
    projectPath: context.projectPath,
    outputMode: step.output ?? 'auto',
    ...(handoff ? { handoff } : {}),
  };
  const result = await Promise.race([
    context.skillExecutor(step.skill, skillContext),
    new Promise<SkillExecutionResult>((resolve) =>
      setTimeout(() => resolve(SKILL_TIMEOUT_RESULT), remainingTime)
    ),
  ]);

  if (result === SKILL_TIMEOUT_RESULT) {
    return {
      stepReport: { name: step.skill, type: 'skill', status: 'skipped', error: 'timed out' },
      halt: 'partial',
    };
  }
  if (result.status === 'pass') {
    return {
      stepReport: {
        name: step.skill,
        type: 'skill',
        status: 'pass',
        result: result.output,
        ...(result.artifactPath ? { artifactPath: result.artifactPath } : {}),
      },
    };
  }
  return {
    stepReport: { name: step.skill, type: 'skill', status: 'fail', error: result.output },
    halt: 'fail',
  };
}

export async function runPersona(
  persona: Persona,
  context: StepExecutionContext
): Promise<PersonaRunReport> {
  const startTime = Date.now();
  const timeout = persona.config.timeout;
  const report: PersonaRunReport = {
    persona: persona.name.toLowerCase().replace(/\s+/g, '-'),
    status: 'pass',
    steps: [],
    totalDurationMs: 0,
  };

  // Resolve auto trigger
  let resolvedTrigger: TriggerContext;
  let handoff = context.handoff;
  if (context.trigger === 'auto') {
    const detection = detectTrigger(context.projectPath);
    resolvedTrigger = detection.trigger;
    handoff = detection.handoff ?? handoff;
  } else {
    resolvedTrigger = context.trigger;
  }

  const activeSteps = persona.steps.filter((s) => matchesTrigger(s, resolvedTrigger));

  for (let i = 0; i < activeSteps.length; i++) {
    const step = activeSteps[i]!;

    // Check timeout
    if (Date.now() - startTime >= timeout) {
      skipRemaining(activeSteps, i, report);
      report.status = 'partial';
      break;
    }

    const stepStart = Date.now();
    const remainingTime = timeout - (Date.now() - startTime);

    const outcome =
      'command' in step
        ? await executeCommandStep(step.command, remainingTime, context)
        : await executeSkillStep(step, resolvedTrigger, remainingTime, context, handoff);

    const durationMs = Date.now() - stepStart;
    report.steps.push({ ...outcome.stepReport, durationMs });

    if (outcome.halt) {
      report.status = outcome.halt;
      skipRemaining(activeSteps, i + 1, report);
      break;
    }
  }

  report.totalDurationMs = Date.now() - startTime;
  return report;
}
