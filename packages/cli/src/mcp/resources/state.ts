export async function getStateResource(projectRoot: string): Promise<string> {
  try {
    const { migrateToStreams } = await import('@harness-engineering/core');
    const { readHarnessState } = await import('../../shared/state-events.js');
    await migrateToStreams(projectRoot);
    const result = await readHarnessState(projectRoot);
    if (result.ok) {
      return JSON.stringify(result.value, null, 2);
    }
    return JSON.stringify({
      schemaVersion: 1,
      position: {},
      decisions: [],
      blockers: [],
      progress: {},
    });
  } catch {
    return JSON.stringify({
      schemaVersion: 1,
      position: {},
      decisions: [],
      blockers: [],
      progress: {},
    });
  }
}
