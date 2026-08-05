import type { CodeRubric } from './types.js';

export const oneStoryOneAltitudeRubric: CodeRubric = {
  id: 'CODE-R003',
  title: 'Tells one story at one altitude',
  description:
    'A well-formed function does one thing and keeps its statements at a single level of ' +
    'abstraction. Ask: does this unit mix high-level orchestration (call these three steps) with ' +
    'low-level fiddling (byte offsets, string slicing, cache-key formatting) in the same body? ' +
    'When you read it top to bottom, do the lines stay at one altitude, or does the reader ' +
    'repeatedly plunge from "what" to "how" and back? Watch for: a function whose first half ' +
    'coordinates named steps and whose second half hand-rolls a parser; a name that promises one ' +
    'verb but the body performs several unrelated ones ("and" in the mental summary); a 120-line ' +
    'body that would read as five well-named calls. The fix is usually Extract Function so each ' +
    'level tells its own story. Judge cohesion and altitude, not raw line count.',
  source: 'Martin, Clean Code, ch. 3 (Functions — Single Level of Abstraction / Do One Thing)',
  appliesToKinds: ['function', 'method'],
  contribution: { addedAt: '2026-08-05', addedBy: 'seed' },
  signal: { invocations: 0, suppressedAt: [] },
  version: 1,
};
