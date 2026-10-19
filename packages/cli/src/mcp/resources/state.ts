import { describeStaleBuildError } from '../stale-build.js';

/** What this resource answers when the project simply has no state yet. */
const EMPTY_STATE = {
  schemaVersion: 1,
  position: {},
  decisions: [],
  blockers: [],
  progress: {},
};

export async function getStateResource(projectRoot: string): Promise<string> {
  try {
    const { migrateToStreams } = await import('@harness-engineering/core');
    const { readHarnessState } = await import('../../shared/state-events.js');
    await migrateToStreams(projectRoot);
    const result = await readHarnessState(projectRoot);
    if (result.ok) {
      return JSON.stringify(result.value, null, 2);
    }
    return JSON.stringify(EMPTY_STATE);
  } catch (error) {
    // The blanket catch is here so a project with no readable state answers an
    // empty one instead of failing. A server running a build that no longer
    // exists on disk is not that: the two `import()`s above resolve against
    // deleted chunks, and swallowing THAT reports "no decisions, no blockers,
    // no progress" over a read that never happened — a fabricated clean answer,
    // which is worse than the opaque error it replaces. Rethrow so the resource
    // seam can name the cause and the remedy.
    if (describeStaleBuildError(error) !== null) throw error;
    return JSON.stringify(EMPTY_STATE);
  }
}
