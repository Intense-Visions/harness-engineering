import { z } from 'zod';
import { FULL_SHA_PATTERN } from '@harness-engineering/types';

/** The file autopilot keeps a session's state in, inside the session directory. */
export const AUTOPILOT_STATE_FILENAME = 'autopilot-state.json';

/**
 * The part of a session's `autopilot-state.json` that code reads (types: AutopilotSessionState,
 * AutopilotPhaseEntry). Other fields pass through. A phase is identified by its 0-based position
 * in `phases[]`; `index`, when present, must equal it. The review receipts read the file through
 * `readSessionReviewState` (receipts/decisions.ts), which parses each field with this schema.
 * roadmap/sync.ts and cli migrate.ts still read the file unvalidated: validating there would skip
 * states they read today, which is not a behaviour-neutral change.
 */
export const AutopilotPhaseEntrySchema = z.looseObject({
  index: z.number().int().nonnegative().exactOptional(),
  name: z.string(),
  status: z.string().exactOptional(),
  planPath: z.string().nullable().exactOptional(),
  complexity: z.string().exactOptional(),
});

/** An `index` that is present must be the entry's position: `[position, 'index']` otherwise. */
const phaseList = z.array(AutopilotPhaseEntrySchema).superRefine((phases, ctx) => {
  for (const [position, phase] of phases.entries()) {
    if (phase.index !== undefined && phase.index !== position) {
      ctx.addIssue({
        code: 'custom',
        path: [position, 'index'],
        message: `index ${phase.index} is not the entry's 0-based position ${position}`,
      });
    }
  }
});

export const AutopilotSessionStateSchema = z.looseObject({
  specPath: z.string().exactOptional(),
  /** A full sha: anything else is not a commit the gate can ask git about. */
  startingCommit: z.string().regex(FULL_SHA_PATTERN, 'must be a full sha').exactOptional(),
  phases: phaseList.exactOptional(),
  decisions: z.array(z.unknown()).exactOptional(),
});
