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
}

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

  if (options.complexity && options.phases && options.phases.length > 0) {
    sections.push(buildActivePhasesSection(options.complexity, options.phases));
  }

  if (options.principles) {
    sections.push(`## Project Principles (from docs/principles.md)\n${options.principles}`);
  }

  if (options.phase) {
    sections.push(buildPhaseReentrySection(options.phase, options.priorState, options.stateWarning));
  }

  if (options.party) {
    sections.push(
      '## Party Mode: Active\nEvaluate each approach from multiple contextually relevant perspectives before converging on a recommendation.'
    );
  }

  return sections.length > 0 ? sections.join('\n\n---\n\n') + '\n\n---\n\n' : '';
}
