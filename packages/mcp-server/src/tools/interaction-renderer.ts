import type {
  InteractionQuestion,
  InteractionConfirmation,
  InteractionTransition,
  InteractionBatch,
  InteractionOption,
} from './interaction-schemas.js';

function columnLabel(index: number): string {
  return String.fromCharCode(65 + index);
}

export function renderQuestion(question: InteractionQuestion): string {
  const { text, options, recommendation } = question;

  // Free-form question (no options)
  if (!options || options.length === 0) {
    let prompt = text;
    if (question.default !== undefined) {
      prompt += `\n\nDefault: option ${question.default}`;
    }
    return prompt;
  }

  // Build comparison table
  const headers = options.map(
    (opt: InteractionOption, i: number) => `${columnLabel(i)}) ${opt.label}`
  );
  const headerRow = `| | ${headers.join(' | ')} |`;
  const separatorRow = `|---|${options.map(() => '---').join('|')}|`;

  const prosRow = `| **Pros** | ${options.map((opt: InteractionOption) => opt.pros.join('; ')).join(' | ')} |`;
  const consRow = `| **Cons** | ${options.map((opt: InteractionOption) => opt.cons.join('; ')).join(' | ')} |`;

  const rows = [headerRow, separatorRow, prosRow, consRow];

  // Optional risk row
  if (options.some((opt: InteractionOption) => opt.risk)) {
    const riskRow = `| **Risk** | ${options.map((opt: InteractionOption) => (opt.risk ? capitalize(opt.risk) : '-')).join(' | ')} |`;
    rows.push(riskRow);
  }

  // Optional effort row
  if (options.some((opt: InteractionOption) => opt.effort)) {
    const effortRow = `| **Effort** | ${options.map((opt: InteractionOption) => (opt.effort ? capitalize(opt.effort) : '-')).join(' | ')} |`;
    rows.push(effortRow);
  }

  let prompt = `### Decision needed: ${text}\n\n${rows.join('\n')}`;

  // Recommendation
  if (recommendation) {
    const recLabel = `${columnLabel(recommendation.optionIndex)}) ${options[recommendation.optionIndex].label}`;
    prompt += `\n\n**Recommendation:** ${recLabel} (confidence: ${recommendation.confidence})`;
    prompt += `\n> ${recommendation.reason}`;
  }

  return prompt;
}

export function renderConfirmation(confirmation: InteractionConfirmation): string {
  let prompt = `${confirmation.text}\n\nContext: ${confirmation.context}`;
  if (confirmation.impact) {
    prompt += `\n\nImpact: ${confirmation.impact}`;
  }
  if (confirmation.risk) {
    prompt += `\nRisk: ${capitalize(confirmation.risk)}`;
  }
  prompt += '\n\nProceed? (yes/no)';
  return prompt;
}

export function renderTransition(transition: InteractionTransition): string {
  let prompt =
    `Phase "${transition.completedPhase}" complete. ${transition.reason}\n\n` +
    `${transition.summary}\n\n` +
    `Artifacts produced:\n${transition.artifacts.map((a: string) => `  - ${a}`).join('\n')}`;

  if (transition.qualityGate) {
    prompt += '\n\n**Quality Gate:**\n';
    for (const check of transition.qualityGate.checks) {
      const icon = check.passed ? 'PASS' : 'FAIL';
      prompt += `  - [${icon}] ${check.name}`;
      if (check.detail) {
        prompt += ` -- ${check.detail}`;
      }
      prompt += '\n';
    }
    prompt += transition.qualityGate.allPassed
      ? '  All checks passed.'
      : '  **Some checks failed.**';
  }

  prompt += '\n\n';
  prompt += transition.requiresConfirmation
    ? `Suggested next: "${transition.suggestedNext}". Proceed?`
    : `Proceeding to ${transition.suggestedNext}...`;

  return prompt;
}

export function renderBatch(batch: InteractionBatch): string {
  let prompt = `${batch.text}\n\n`;
  batch.decisions.forEach((d, i) => {
    prompt += `${i + 1}. **${d.label}** -- Recommendation: ${d.recommendation} (risk: low)\n`;
  });
  prompt += '\nApprove all? (yes/no)';
  return prompt;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
