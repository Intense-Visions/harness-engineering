import { describe, it, expect } from 'vitest';
import {
  renderQuestion,
  renderConfirmation,
  renderTransition,
  renderBatch,
} from './interaction-renderer';
import type {
  InteractionQuestion,
  InteractionConfirmation,
  InteractionTransition,
  InteractionBatch,
  InteractionOption,
} from './interaction-schemas';

function makeOption(overrides: Partial<InteractionOption> = {}): InteractionOption {
  return {
    label: 'Option',
    pros: ['pro'],
    cons: ['con'],
    ...overrides,
  };
}

describe('renderQuestion', () => {
  it('returns raw text for a free-form question with no options', () => {
    const question: InteractionQuestion = { text: 'What should we do?' };
    expect(renderQuestion(question)).toBe('What should we do?');
  });

  it('returns raw text when options is an empty array', () => {
    const question: InteractionQuestion = { text: 'Empty options?', options: [] };
    expect(renderQuestion(question)).toBe('Empty options?');
  });

  it('builds a comparison table with lettered column headers, pros and cons rows', () => {
    const question: InteractionQuestion = {
      text: 'Pick a path',
      options: [
        makeOption({ label: 'Alpha', pros: ['fast', 'cheap'], cons: ['risky'] }),
        makeOption({ label: 'Beta', pros: ['safe'], cons: ['slow', 'costly'] }),
      ],
    };

    const result = renderQuestion(question);

    expect(result).toBe(
      '### Decision needed: Pick a path\n\n' +
        '| | A) Alpha | B) Beta |\n' +
        '|---|---|---|\n' +
        '| **Pros** | fast; cheap | safe |\n' +
        '| **Cons** | risky | slow; costly |'
    );
  });

  it('omits risk and effort rows when no option carries them', () => {
    const question: InteractionQuestion = {
      text: 'No risk metadata',
      options: [makeOption(), makeOption({ label: 'Other' })],
    };

    const result = renderQuestion(question);

    expect(result).not.toContain('**Risk**');
    expect(result).not.toContain('**Effort**');
  });

  it('adds a risk row (capitalized, dash for missing) when any option has risk', () => {
    const question: InteractionQuestion = {
      text: 'With risk',
      options: [makeOption({ label: 'A', risk: 'high' }), makeOption({ label: 'B' })],
    };

    const result = renderQuestion(question);

    expect(result).toContain('| **Risk** | High | - |');
    expect(result).not.toContain('**Effort**');
  });

  it('adds an effort row (capitalized, dash for missing) when any option has effort', () => {
    const question: InteractionQuestion = {
      text: 'With effort',
      options: [makeOption({ label: 'A' }), makeOption({ label: 'B', effort: 'medium' })],
    };

    const result = renderQuestion(question);

    expect(result).toContain('| **Effort** | - | Medium |');
    expect(result).not.toContain('**Risk**');
  });

  it('escapes pipe characters in labels, pros, and cons so table cells do not break', () => {
    const question: InteractionQuestion = {
      text: 'Escaping',
      options: [
        makeOption({ label: 'a|b', pros: ['p|q'], cons: ['c|d'] }),
        makeOption({ label: 'Other' }),
      ],
    };

    const result = renderQuestion(question);

    expect(result).toContain('A) a\\|b');
    expect(result).toContain('p\\|q');
    expect(result).toContain('c\\|d');
  });

  it('appends a recommendation line with the referenced column label and confidence', () => {
    const question: InteractionQuestion = {
      text: 'Recommend one',
      options: [makeOption({ label: 'First' }), makeOption({ label: 'Second' })],
      recommendation: { optionIndex: 1, reason: 'It is safer overall', confidence: 'high' },
    };

    const result = renderQuestion(question);

    expect(result).toContain('**Recommendation:** B) Second (confidence: high)');
    expect(result).toContain('\n> It is safer overall');
  });

  it('omits the reason quote when the reason merely restates the question text', () => {
    const question: InteractionQuestion = {
      text: 'Should we ship?',
      options: [makeOption({ label: 'Yes' }), makeOption({ label: 'No' })],
      recommendation: { optionIndex: 0, reason: '  Should we ship?  ', confidence: 'low' },
    };

    const result = renderQuestion(question);

    expect(result).toContain('**Recommendation:** A) Yes (confidence: low)');
    expect(result).not.toContain('\n> ');
  });

  it('omits the reason quote when the reason begins with the full question text', () => {
    const question: InteractionQuestion = {
      text: 'Should we ship',
      options: [makeOption({ label: 'Yes' }), makeOption({ label: 'No' })],
      recommendation: {
        optionIndex: 0,
        reason: 'Should we ship the release now',
        confidence: 'medium',
      },
    };

    const result = renderQuestion(question);

    expect(result).not.toContain('\n> ');
  });

  it('ignores a recommendation that points at a non-existent option index', () => {
    const question: InteractionQuestion = {
      text: 'Out of range',
      options: [makeOption({ label: 'Only' }), makeOption({ label: 'Two' })],
      recommendation: { optionIndex: 5, reason: 'nope', confidence: 'high' },
    };

    const result = renderQuestion(question);

    expect(result).not.toContain('**Recommendation:**');
  });
});

describe('renderConfirmation', () => {
  it('renders text and context and prompts for yes/no', () => {
    const confirmation: InteractionConfirmation = {
      text: 'Delete the branch?',
      context: 'It has been merged',
    };

    expect(renderConfirmation(confirmation)).toBe(
      'Delete the branch?\n\nContext: It has been merged\n\nProceed? (yes/no)'
    );
  });

  it('includes impact and capitalized risk when provided', () => {
    const confirmation: InteractionConfirmation = {
      text: 'Force push?',
      context: 'Rewrites history',
      impact: 'Peers must reset',
      risk: 'high',
    };

    const result = renderConfirmation(confirmation);

    expect(result).toBe(
      'Force push?\n\nContext: Rewrites history\n\nImpact: Peers must reset\nRisk: High\n\nProceed? (yes/no)'
    );
  });
});

describe('renderTransition', () => {
  it('renders phase summary, artifacts, and a proceeding line when confirmation is not required', () => {
    const transition: InteractionTransition = {
      completedPhase: 'design',
      suggestedNext: 'implementation',
      reason: 'Design approved.',
      artifacts: ['spec.md', 'diagram.svg'],
      requiresConfirmation: false,
      summary: 'We settled the API shape.',
    };

    const result = renderTransition(transition);

    expect(result).toBe(
      'Phase "design" complete. Design approved.\n\n' +
        'We settled the API shape.\n\n' +
        'Artifacts produced:\n  - spec.md\n  - diagram.svg\n\n' +
        'Proceeding to implementation...'
    );
  });

  it('asks for confirmation when requiresConfirmation is true', () => {
    const transition: InteractionTransition = {
      completedPhase: 'plan',
      suggestedNext: 'build',
      reason: 'Plan ready.',
      artifacts: [],
      requiresConfirmation: true,
      summary: 'Plan summary.',
    };

    const result = renderTransition(transition);

    expect(result).toContain('Suggested next: "build". Proceed?');
    expect(result).not.toContain('Proceeding to');
  });

  it('renders a quality gate with PASS/FAIL icons, optional detail, and an all-passed footer', () => {
    const transition: InteractionTransition = {
      completedPhase: 'test',
      suggestedNext: 'release',
      reason: 'Tests done.',
      artifacts: ['report.txt'],
      requiresConfirmation: false,
      summary: 'All green.',
      qualityGate: {
        checks: [
          { name: 'lint', passed: true },
          { name: 'coverage', passed: true, detail: '95%' },
        ],
        allPassed: true,
      },
    };

    const result = renderTransition(transition);

    expect(result).toContain('**Quality Gate:**');
    expect(result).toContain('  - [PASS] lint\n');
    expect(result).toContain('  - [PASS] coverage -- 95%\n');
    expect(result).toContain('  All checks passed.');
  });

  it('marks failed checks with FAIL and a some-checks-failed footer', () => {
    const transition: InteractionTransition = {
      completedPhase: 'test',
      suggestedNext: 'release',
      reason: 'Tests done.',
      artifacts: ['report.txt'],
      requiresConfirmation: false,
      summary: 'Some red.',
      qualityGate: {
        checks: [{ name: 'typecheck', passed: false, detail: '3 errors' }],
        allPassed: false,
      },
    };

    const result = renderTransition(transition);

    expect(result).toContain('  - [FAIL] typecheck -- 3 errors\n');
    expect(result).toContain('  **Some checks failed.**');
  });
});

describe('renderBatch', () => {
  it('enumerates decisions with labels, recommendations, and a fixed low-risk annotation', () => {
    const batch: InteractionBatch = {
      text: 'Approve these defaults?',
      decisions: [
        { label: 'Framework', recommendation: 'Vitest', risk: 'low' },
        { label: 'Placement', recommendation: 'colocated', risk: 'low' },
      ],
    };

    const result = renderBatch(batch);

    expect(result).toBe(
      'Approve these defaults?\n\n' +
        '1. **Framework** -- Recommendation: Vitest (risk: low)\n' +
        '2. **Placement** -- Recommendation: colocated (risk: low)\n' +
        '\nApprove all? (yes/no)'
    );
  });
});
