import { useState } from 'react';
import type { DashboardFeature, ClaimResponse } from '@shared/types';
import { detectWorkflow, type ClaimWorkflow } from './utils';
import { fetchWithConflict } from '../../utils/fetchWithConflict';
import { useToastStore } from '../../stores/toastStore';

interface Props {
  feature: DashboardFeature;
  identity: string;
  onConfirm: (response: ClaimResponse) => void;
  onCancel: () => void;
}

const WORKFLOW_LABELS: Record<ClaimWorkflow, { label: string; description: string }> = {
  brainstorming: {
    label: 'Brainstorming',
    description: 'No spec found. You\u2019ll start by exploring the problem space.',
  },
  planning: {
    label: 'Planning',
    description: 'Spec exists but no plan. You\u2019ll create an implementation plan.',
  },
  execution: {
    label: 'Execution',
    description: 'Spec and plan exist. You\u2019ll start implementing.',
  },
};

export function ClaimConfirmation({ feature, identity, onConfirm, onCancel }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const workflow = detectWorkflow(feature);
  const info = WORKFLOW_LABELS[workflow];

  async function handleConfirm() {
    setLoading(true);
    setError(null);
    const result = await fetchWithConflict<ClaimResponse>('/api/actions/roadmap/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feature: feature.name, assignee: identity }),
    });
    if (result.ok) {
      onConfirm(result.data);
      return;
    }
    if (result.conflict) {
      useToastStore.getState().pushConflict({
        externalId: result.conflict.externalId,
        conflictedWith:
          typeof result.conflict.conflictedWith === 'string'
            ? result.conflict.conflictedWith
            : null,
      });
      onCancel();
      return;
    }
    setError(result.error ?? 'Claim failed');
    setLoading(false);
  }

  return (
    <div className="absolute right-0 top-full z-50 mt-2 w-80 rounded-lg border border-gray-700 bg-gray-900 p-4 shadow-xl">
      <h3 className="mb-1 text-sm font-semibold text-gray-200">Claim Feature</h3>
      <p className="mb-3 text-xs text-gray-400 truncate" title={feature.name}>
        {feature.name}
      </p>

      <div className="mb-3 rounded border border-gray-800 bg-gray-800/50 px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-primary-400">
            {info.label}
          </span>
        </div>
        <p className="mt-1 text-xs text-gray-400">{info.description}</p>
      </div>

      <p className="mb-3 text-xs text-gray-500">
        Claiming as <span className="font-medium text-gray-300">{identity}</span>
      </p>

      {error && <p className="mb-2 text-xs text-red-400">{error}</p>}

      <div className="flex justify-end gap-2">
        <button
          onClick={onCancel}
          disabled={loading}
          className="rounded px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-gray-500 hover:text-gray-300 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={() => void handleConfirm()}
          disabled={loading}
          className="rounded bg-primary-500 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-white disabled:opacity-40 hover:bg-primary-400 transition-colors"
        >
          {loading ? 'Claiming\u2026' : 'Confirm'}
        </button>
      </div>
    </div>
  );
}
