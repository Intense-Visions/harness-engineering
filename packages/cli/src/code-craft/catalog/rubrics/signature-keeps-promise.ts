import type { CodeRubric } from './types.js';

export const signatureKeepsPromiseRubric: CodeRubric = {
  id: 'CODE-R006',
  title: 'Signature keeps its promise',
  description:
    'A unit’s signature is a contract; honest code keeps it. Ask: do the parameters, return ' +
    'type, and observable side effects match what the name and shape advertise? A function named ' +
    'as a query (`get*`, `find*`, `is*`) that also mutates state or performs I/O breaks ' +
    'command-query separation and surprises every caller. Watch for: a "pure-looking" helper ' +
    'that writes to a module global or logs; a return type of `any`/`unknown`/`void` where the ' +
    'function clearly knows more; out-parameters or mutated arguments the name doesn’t hint at; ' +
    'a boolean or options bag that silently changes what the function fundamentally does; thrown ' +
    'errors the signature gives no clue about. The principle is least surprise: a caller who ' +
    'reads only the signature should be able to predict the effect. Identifier-level naming ' +
    'quality is naming-craft’s job — this rubric fires only when the signature’s SHAPE ' +
    'misrepresents behavior.',
  source:
    'Hunt & Thomas, The Pragmatic Programmer (least surprise) + Meyer (Command-Query Separation)',
  appliesToKinds: ['function', 'method'],
  contribution: { addedAt: '2026-08-05', addedBy: 'seed' },
  signal: { invocations: 0, suppressedAt: [] },
  version: 1,
};
