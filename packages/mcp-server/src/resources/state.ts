export async function getStateResource(projectRoot: string): Promise<string> {
  try {
    const { loadState, migrateToStreams } = await import('@harness-engineering/core');
    await migrateToStreams(projectRoot);
    const result = await loadState(projectRoot);
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
