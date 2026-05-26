import type { CopyRubric } from './index.js';

export const describesChangeNotWorkRubric: CopyRubric = {
  id: 'COPY-R006',
  title: 'Describes the change, not the work',
  description:
    'Commit subjects and PR descriptions should describe the OUTCOME (what the code now ' +
    "does that it didn't before) rather than the activity (what the author was doing). " +
    '"update tests" describes the work; "ratchet drift threshold to 0.5%" describes the ' +
    'change. "refactor module" is work; "extract token-import discovery into shared/" is ' +
    'change. The reader six months from now needs the change, not the activity.',
  source: 'Tim Pope, "A Note About Git Commit Messages" + general engineering folklore',
  appliesToSurfaces: ['commit', 'pr-description'],
  contribution: { addedAt: '2026-05-25', addedBy: 'seed' },
  signal: { invocations: 0, suppressedAt: [] },
  version: 1,
};
