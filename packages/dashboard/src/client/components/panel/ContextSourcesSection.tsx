import { Database, CheckCircle2, Loader2, XCircle } from 'lucide-react';

export interface ContextSource {
  name: string;
  status: 'loaded' | 'loading' | 'error';
}

interface Props {
  sources: ContextSource[];
}

function SourceStatusIcon({ status }: { status: ContextSource['status'] }) {
  switch (status) {
    case 'loaded':
      return <CheckCircle2 size={10} className="text-semantic-success" />;
    case 'loading':
      return <Loader2 size={10} className="text-primary-500 animate-spin" />;
    case 'error':
      return <XCircle size={10} className="text-semantic-error" />;
  }
}

export function ContextSourcesSection({ sources }: Props) {
  if (sources.length === 0) return null;

  return (
    <div className="pb-3">
      <div className="flex items-center gap-2 mb-2">
        <Database size={12} className="text-neutral-muted" />
        <h4 className="text-[9px] font-black uppercase tracking-[0.2em] text-neutral-muted">
          Context Sources
        </h4>
      </div>
      <div className="flex flex-col gap-1">
        {sources.map((source) => (
          <div key={source.name} className="flex items-center gap-2 py-0.5">
            <SourceStatusIcon status={source.status} />
            <span className="text-xs text-neutral-muted">{source.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
