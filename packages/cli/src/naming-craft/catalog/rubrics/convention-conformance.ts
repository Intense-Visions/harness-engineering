import type { NamingRubric } from './index.js';

export const conventionConformanceRubric: NamingRubric = {
  id: 'NAME-R004',
  title: 'Convention conformance',
  description:
    "Does the name match the project's dominant convention for its identifier kind " +
    '(camelCase / snake_case / PascalCase)? Mixing conventions adds cognitive load and ' +
    'often signals copy-paste from a different ecosystem. Skip the rubric when the ' +
    'project has no dominant convention (<50% majority).',
  source: 'Karlton, "two hard things" — naming consistency at the project level',
  appliesTo: ['variable', 'function', 'type', 'file'],
  contribution: { addedAt: '2026-05-24', addedBy: 'seed' },
  signal: { invocations: 0, suppressedAt: [] },
  version: 1,
};
