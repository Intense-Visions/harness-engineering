import type { CodeRubric } from './types.js';

export const revealsIntentRubric: CodeRubric = {
  id: 'CODE-R001',
  title: 'Reveals intent — reads in the domain’s language',
  description:
    'Great code reads like a description of the problem in the domain’s own vocabulary — a ' +
    'reader reconstructs WHY, not just WHAT. Ask: does this unit speak in the concepts a domain ' +
    'expert would recognize, or in incidental machinery (loops, indices, flags, generic ' +
    '"data"/"item"/"result")? Would a reader who knows the domain but not this file understand ' +
    'what problem it solves without running it? Watch for: business rules buried in anonymous ' +
    'conditionals; magic numbers/strings with no named meaning; a comment that apologizes for ' +
    'code that should have said it itself; steps that could be a well-named helper but are ' +
    'inlined so the intent is lost in the mechanics. This is about the code telling its story, ' +
    'NOT about individual identifier quality (naming-craft owns identifier-level critique).',
  source: 'Beck, Implementation Patterns (intention-revealing code) + Fowler, Refactoring (2e)',
  appliesToKinds: ['function', 'method', 'class'],
  contribution: { addedAt: '2026-08-05', addedBy: 'seed' },
  signal: { invocations: 0, suppressedAt: [] },
  version: 1,
};
