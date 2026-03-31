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

export function buildPreamble(options: PreambleOptions): string {
  const sections: string[] = [];

  // Complexity + active phases
  if (options.complexity && options.phases && options.phases.length > 0) {
    const lines = [`## Active Phases (complexity: ${options.complexity})`];
    for (const phase of options.phases) {
      if (options.complexity === 'fast' && !phase.required) {
        lines.push(`- ~~${phase.name.toUpperCase()}~~ (skipped in fast mode)`);
      } else {
        lines.push(`- ${phase.name.toUpperCase()} (${phase.required ? 'required' : 'optional'})`);
      }
    }
    sections.push(lines.join('\n'));
  }

  // Principles
  if (options.principles) {
    sections.push(`## Project Principles (from docs/principles.md)\n${options.principles}`);
  }

  // Phase re-entry
  if (options.phase) {
    const lines = [`## Resuming at Phase: ${options.phase}`];
    if (options.priorState) {
      lines.push(`## Prior state loaded\n${options.priorState}`);
    }
    if (options.stateWarning) {
      lines.push(`> ${options.stateWarning}`);
    }
    sections.push(lines.join('\n'));
  }

  // Party mode
  if (options.party) {
    sections.push(
      '## Party Mode: Active\nEvaluate each approach from multiple contextually relevant perspectives before converging on a recommendation.'
    );
  }

  return sections.length > 0 ? sections.join('\n\n---\n\n') + '\n\n---\n\n' : '';
}
