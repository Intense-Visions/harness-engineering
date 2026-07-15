// packages/cli/src/commands/skill/preamble.ts

interface Phase {
  name: string;
  description: string;
  required: boolean;
}

interface PreambleOptions {
  complexity?: 'fast' | 'thorough';
  phases?: Phase[];
  principles?: string;
  phase?: string; // re-entry phase name
  priorState?: string; // loaded state content
  stateWarning?: string; // warning if no state
  party?: boolean;
  autonomous?: boolean; // headless mode: agent is the decider (D8/D9)
}

// SC7 (D8/D9): the autonomous-decider preamble. Injected FIRST so it leads the
// output and re-anchors on every stage's rendering — robust against a small
// local model forgetting a once-read template. Text is the design-of-record.
const AUTONOMOUS_SECTION = `## Autonomous Decision-Making: Active

You are running this workflow **headless — there is no human in this session to answer questions.**

Wherever this skill instructs you to present options and a recommendation and then STOP and wait for the human (design forks, \`emit_interaction\`/\`AskUserQuestion\` prompts, spec sign-off, the next-skill handoff), do NOT wait. Instead:

1. Do the full analysis exactly as written — honor every gate (at least two approaches with tradeoffs, YAGNI, the persona council, soundness review). Autonomy narrows the decider, never the rigor.
2. Commit to the option **you** recommend, and record the question, the chosen answer, and the rationale in the spec's **"Decisions made"** section.
3. Continue to the next step. Self-approve the Phase-4 sign-off once the soundness review converges; proceed through the handoff to the next skill.

**Safety valve — surface, do not bury.** For any decision made at **low confidence**, and for any **strategy contradiction** the skill says to "never auto-resolve," still decide and proceed, but additionally record it under an **"## Autonomous decisions requiring review"** heading in the spec (question, your call, confidence, why) so the human's PR review sees exactly what you decided and where you were unsure. You are the decider, not a shortcut — the human's checkpoint is the PR, not a mid-run pause.`;

function buildActivePhasesSection(complexity: 'fast' | 'thorough', phases: Phase[]): string {
  const lines = [`## Active Phases (complexity: ${complexity})`];
  for (const phase of phases) {
    if (complexity === 'fast' && !phase.required) {
      lines.push(`- ~~${phase.name.toUpperCase()}~~ (skipped in fast mode)`);
    } else {
      lines.push(`- ${phase.name.toUpperCase()} (${phase.required ? 'required' : 'optional'})`);
    }
  }
  return lines.join('\n');
}

function buildPhaseReentrySection(
  phase: string,
  priorState: string | undefined,
  stateWarning: string | undefined
): string {
  const lines = [`## Resuming at Phase: ${phase}`];
  if (priorState) {
    lines.push(`## Prior state loaded\n${priorState}`);
  }
  if (stateWarning) {
    lines.push(`> ${stateWarning}`);
  }
  return lines.join('\n');
}

export function buildPreamble(options: PreambleOptions): string {
  const sections: string[] = [];

  // Lead with the autonomous section (before Active Phases) so it anchors the output.
  if (options.autonomous) {
    sections.push(AUTONOMOUS_SECTION);
  }

  if (options.complexity && options.phases && options.phases.length > 0) {
    sections.push(buildActivePhasesSection(options.complexity, options.phases));
  }

  if (options.principles) {
    sections.push(`## Project Principles (from docs/principles.md)\n${options.principles}`);
  }

  if (options.phase) {
    sections.push(
      buildPhaseReentrySection(options.phase, options.priorState, options.stateWarning)
    );
  }

  if (options.party) {
    sections.push(
      '## Party Mode: Active\nEvaluate each approach from multiple contextually relevant perspectives before converging on a recommendation.'
    );
  }

  return sections.length > 0 ? sections.join('\n\n---\n\n') + '\n\n---\n\n' : '';
}
