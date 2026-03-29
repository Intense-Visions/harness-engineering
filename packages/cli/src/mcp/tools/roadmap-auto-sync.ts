import * as fs from 'fs';
import * as path from 'path';

/**
 * Automatically sync the roadmap after state transitions.
 *
 * This is the mechanical enforcement layer — it runs syncRoadmap with apply=true
 * as a side effect of save-handoff and archive_session, removing the dependency
 * on agents remembering to call manage_roadmap manually.
 *
 * Failures are swallowed: roadmap sync is best-effort and must never break
 * the primary state operation.
 */
export async function autoSyncRoadmap(projectPath: string): Promise<void> {
  try {
    const roadmapFile = path.join(projectPath, 'docs', 'roadmap.md');
    if (!fs.existsSync(roadmapFile)) return; // no roadmap — nothing to sync

    const { parseRoadmap, serializeRoadmap, syncRoadmap, applySyncChanges } =
      await import('@harness-engineering/core');

    const raw = fs.readFileSync(roadmapFile, 'utf-8');
    const parseResult = parseRoadmap(raw);
    if (!parseResult.ok) return;

    const roadmap = parseResult.value;
    const syncResult = syncRoadmap({ projectPath, roadmap });
    if (!syncResult.ok || syncResult.value.length === 0) return;

    applySyncChanges(roadmap, syncResult.value);
    fs.writeFileSync(roadmapFile, serializeRoadmap(roadmap), 'utf-8');
  } catch {
    // Best-effort: never let roadmap sync failures break state operations
  }
}
