import type { FeatureStatus } from '@shared/types';

export const STATUS_COLOR: Record<FeatureStatus, string> = {
  done: '#10b981',
  'in-progress': '#3b82f6',
  planned: '#6b7280',
  blocked: '#ef4444',
  backlog: '#374151',
  'needs-human': '#f59e0b',
};
