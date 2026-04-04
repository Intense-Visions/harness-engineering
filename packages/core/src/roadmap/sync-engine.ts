import * as fs from 'fs';
import type {
  Roadmap,
  RoadmapFeature,
  FeatureStatus,
  SyncResult,
  TrackerSyncConfig,
} from '@harness-engineering/types';
import { parseRoadmap } from './parse';
import { serializeRoadmap } from './serialize';
import type { TrackerSyncAdapter, ExternalSyncOptions } from './tracker-sync';
import { resolveReverseStatus } from './tracker-sync';
import { isRegression } from './status-rank';

function emptySyncResult(): SyncResult {
  return { created: [], updated: [], assignmentChanges: [], errors: [] };
}

/**
 * Push planning fields from roadmap to external service.
 * - Features without externalId get a new ticket (externalId stored on feature object)
 * - Features with externalId get updated with current planning fields
 * Mutates `roadmap` in-place (stores new externalIds).
 * Never throws -- errors collected per-feature.
 */
export async function syncToExternal(
  roadmap: Roadmap,
  adapter: TrackerSyncAdapter,
  _config: TrackerSyncConfig
): Promise<SyncResult> {
  const result = emptySyncResult();

  // Auto-populate assignee from the authenticated user when unset
  let defaultAssignee: string | null = null;
  const userResult = await adapter.getAuthenticatedUser();
  if (userResult.ok) {
    defaultAssignee = userResult.value;
  }

  for (const milestone of roadmap.milestones) {
    for (const feature of milestone.features) {
      if (!feature.assignee && defaultAssignee) {
        feature.assignee = defaultAssignee;
      }

      if (!feature.externalId) {
        // Create new ticket
        const createResult = await adapter.createTicket(feature, milestone.name);
        if (createResult.ok) {
          feature.externalId = createResult.value.externalId;
          result.created.push(createResult.value);
        } else {
          result.errors.push({ featureOrId: feature.name, error: createResult.error });
        }
      } else {
        // Update existing ticket
        const updateResult = await adapter.updateTicket(
          feature.externalId,
          feature,
          milestone.name
        );
        if (updateResult.ok) {
          result.updated.push(feature.externalId);
        } else {
          result.errors.push({ featureOrId: feature.externalId, error: updateResult.error });
        }
      }
    }
  }

  return result;
}

/**
 * Pull execution fields (assignee, status) from external service.
 * - External assignee wins over local assignee
 * - Status changes are subject to directional guard (no regression unless forceSync)
 * - Uses label-based reverse mapping for GitHub status disambiguation
 * Mutates `roadmap` in-place.
 * Never throws -- errors collected per-feature.
 */
export async function syncFromExternal(
  roadmap: Roadmap,
  adapter: TrackerSyncAdapter,
  config: TrackerSyncConfig,
  options?: ExternalSyncOptions
): Promise<SyncResult> {
  const result = emptySyncResult();
  const forceSync = options?.forceSync ?? false;

  // Build lookup from externalId to feature
  const featureByExternalId = new Map<string, RoadmapFeature>();
  for (const milestone of roadmap.milestones) {
    for (const feature of milestone.features) {
      if (feature.externalId) {
        featureByExternalId.set(feature.externalId, feature);
      }
    }
  }

  if (featureByExternalId.size === 0) return result;

  // Fetch all tickets
  const fetchResult = await adapter.fetchAllTickets();
  if (!fetchResult.ok) {
    result.errors.push({ featureOrId: '*', error: fetchResult.error });
    return result;
  }

  for (const ticketState of fetchResult.value) {
    const feature = featureByExternalId.get(ticketState.externalId);
    if (!feature) continue;

    // Assignee: external wins
    if (ticketState.assignee !== feature.assignee) {
      result.assignmentChanges.push({
        feature: feature.name,
        from: feature.assignee,
        to: ticketState.assignee,
      });
      feature.assignee = ticketState.assignee;
    }

    // Status: use reverse mapping with label disambiguation
    const resolvedStatus = resolveReverseStatus(ticketState.status, ticketState.labels, config);
    if (resolvedStatus && resolvedStatus !== feature.status) {
      const newStatus = resolvedStatus as FeatureStatus;
      if (!forceSync && isRegression(feature.status, newStatus)) {
        // Directional guard: skip regression
        continue;
      }
      feature.status = newStatus;
    }
  }

  return result;
}

/**
 * In-process mutex for serializing fullSync calls.
 * Prevents concurrent writes to roadmap.md.
 */
let syncMutex: Promise<void> = Promise.resolve();

/**
 * Full bidirectional sync: read roadmap, push, pull, write back.
 * Serialized by in-process mutex.
 */
export async function fullSync(
  roadmapPath: string,
  adapter: TrackerSyncAdapter,
  config: TrackerSyncConfig,
  options?: ExternalSyncOptions
): Promise<SyncResult> {
  // Queue behind any in-progress sync
  const previousSync = syncMutex;
  let releaseMutex: () => void;
  syncMutex = new Promise<void>((resolve) => {
    releaseMutex = resolve;
  });

  await previousSync;

  try {
    const raw = fs.readFileSync(roadmapPath, 'utf-8');
    const parseResult = parseRoadmap(raw);
    if (!parseResult.ok) {
      return {
        ...emptySyncResult(),
        errors: [{ featureOrId: '*', error: parseResult.error }],
      };
    }

    const roadmap = parseResult.value;

    // Push first (planning fields out)
    const pushResult = await syncToExternal(roadmap, adapter, config);

    // Then pull (execution fields back)
    const pullResult = await syncFromExternal(roadmap, adapter, config, options);

    // Write updated roadmap back to disk
    fs.writeFileSync(roadmapPath, serializeRoadmap(roadmap), 'utf-8');

    // Merge results
    return {
      created: pushResult.created,
      updated: pushResult.updated,
      assignmentChanges: pullResult.assignmentChanges,
      errors: [...pushResult.errors, ...pullResult.errors],
    };
  } finally {
    releaseMutex!();
  }
}

/**
 * Reset the sync mutex. Only for testing.
 */
export function _resetSyncMutex(): void {
  syncMutex = Promise.resolve();
}
