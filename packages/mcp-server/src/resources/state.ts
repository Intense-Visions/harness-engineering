export async function getStateResource(projectRoot: string): Promise<string> {
  try {
    const { loadState } = await import('@harness-engineering/core');
    const result = await loadState(projectRoot);
    if (result.ok) {
      return JSON.stringify(result.value, null, 2);
    }
    return JSON.stringify({
      schemaVersion: 1, position: {}, decisions: [], blockers: [], progress: {},
    });
  } catch {
    return JSON.stringify({
      schemaVersion: 1, position: {}, decisions: [], blockers: [], progress: {},
    });
  }
}
