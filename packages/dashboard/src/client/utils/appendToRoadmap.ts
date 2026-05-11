import { fetchWithConflict } from './fetchWithConflict';
import { useToastStore } from '../stores/toastStore';

interface AppendPayload {
  title: string;
  summary?: string | undefined;
  enrichedSpec?:
    | {
        intent: string;
        unknowns: string[];
        ambiguities: string[];
        riskSignals: string[];
        affectedSystems: { name: string }[];
      }
    | undefined;
  cmlRecommendedRoute?: 'local' | 'human' | 'simulation-required' | undefined;
}

export interface AppendResult {
  ok: boolean;
  featureName?: string | undefined;
  externalId?: string | undefined;
  error?: string | undefined;
}

/**
 * Route `POST /api/roadmap/append` (S6) through fetchWithConflict so that
 * file-less ConflictError (D-P7-A) is surfaced via the same toast pathway
 * used by S3 (claim) and S5 (roadmap-status).
 */
export async function appendToRoadmap(payload: AppendPayload): Promise<AppendResult> {
  const r = await fetchWithConflict<{ ok: true; featureName: string; externalId?: string }>(
    '/api/roadmap/append',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }
  );
  if (r.ok) return { ok: true, featureName: r.data.featureName, externalId: r.data.externalId };
  if (r.conflict) {
    useToastStore.getState().pushConflict({
      externalId: r.conflict.externalId,
      conflictedWith:
        typeof r.conflict.conflictedWith === 'string' ? r.conflict.conflictedWith : null,
    });
    return { ok: false, error: 'A conflicting feature was just added — see toast' };
  }
  return { ok: false, error: r.error ?? 'Append failed' };
}
