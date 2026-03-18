import * as fs from 'fs';
import * as path from 'path';
import type { TriggerContext } from './schema';

export interface HandoffContext {
  fromSkill: string;
  summary: string;
  pending: string[];
  planPath?: string;
}

export interface TriggerDetectionResult {
  trigger: TriggerContext;
  handoff?: HandoffContext;
}

/**
 * Detect the appropriate trigger context by inspecting project state.
 * Returns `on_plan_approved` when a planning handoff with pending tasks exists.
 * Falls back to `manual` otherwise.
 */
export function detectTrigger(projectPath: string): TriggerDetectionResult {
  const handoffPath = path.join(projectPath, '.harness', 'handoff.json');
  if (!fs.existsSync(handoffPath)) {
    return { trigger: 'manual' };
  }

  try {
    const raw = fs.readFileSync(handoffPath, 'utf-8');
    const handoff = JSON.parse(raw);

    if (
      handoff.fromSkill === 'harness-planning' &&
      Array.isArray(handoff.pending) &&
      handoff.pending.length > 0
    ) {
      return {
        trigger: 'on_plan_approved',
        handoff: {
          fromSkill: handoff.fromSkill,
          summary: handoff.summary ?? '',
          pending: handoff.pending,
          planPath: handoff.planPath,
        },
      };
    }

    return { trigger: 'manual' };
  } catch {
    return { trigger: 'manual' };
  }
}
