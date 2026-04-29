import { useState, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { MapPin, Zap, Sparkles, Download, Plus, RefreshCw } from 'lucide-react';
import { AnalysisFormCard } from '../cards/AnalysisFormCard';
import { useThreadStore } from '../../stores/threadStore';
import type { Thread, AnalysisMeta } from '../../types/thread';
import type { AnalyzeSSEEvent } from '../../types/orchestrator';

interface SELResult {
  intent: string;
  summary: string;
  affectedSystems: Array<{
    name: string;
    graphNodeId: string | null;
    confidence: number;
    transitiveDeps: string[];
    testCoverage: number;
    owner: string | null;
  }>;
  unknowns: string[];
  ambiguities: string[];
  riskSignals: string[];
}

interface CMLResult {
  overall: number;
  riskLevel: string;
  confidence: number;
  blastRadius: {
    services: number;
    modules: number;
    filesEstimated: number;
    testFilesAffected: number;
  };
  dimensions: { structural: number; semantic: number; historical: number };
  reasoning: string[];
  recommendedRoute: string;
}

interface PESLResult {
  simulatedPlan: string[];
  predictedFailures: string[];
  riskHotspots: string[];
  testGaps: string[];
  executionConfidence: number;
  recommendedChanges: string[];
}

const RISK_COLORS: Record<string, string> = {
  low: 'text-semantic-success border-semantic-success/20 bg-semantic-success/10',
  medium: 'text-semantic-warning border-semantic-warning/20 bg-semantic-warning/10',
  high: 'text-orange-400 border-orange-500/20 bg-orange-500/10',
  critical: 'text-semantic-error border-semantic-error/20 bg-semantic-error/10',
};

interface Props {
  thread: Thread;
}

export function AnalysisThreadView({ thread }: Props) {
  const meta = thread.meta as AnalysisMeta;
  // Access store methods via getState() to avoid unbound-method lint errors

  const [submitted, setSubmitted] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [sel, setSel] = useState<SELResult | null>(null);
  const [cml, setCml] = useState<CMLResult | null>(null);
  const [pesl, setPesl] = useState<PESLResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const handleSubmit = useCallback(
    async (data: { title: string; description: string; labels: string[] }) => {
      setSubmitted(true);
      setStreaming(true);
      setStatus('Starting analysis...');
      setError(null);
      setSel(null);
      setCml(null);
      setPesl(null);

      useThreadStore.getState().updateThread(thread.id, { title: data.title });

      controllerRef.current = new AbortController();

      try {
        const res = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
          signal: controllerRef.current.signal,
        });

        if (!res.ok || !res.body) {
          setError(`HTTP ${res.status}`);
          setStreaming(false);
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const payload = line.slice(6).trim();
            if (payload === '[DONE]') {
              setStreaming(false);
              setStatus(null);
              return;
            }
            try {
              const event = JSON.parse(payload) as AnalyzeSSEEvent;
              switch (event.type) {
                case 'status':
                  setStatus(event.text);
                  break;
                case 'sel_result':
                  setSel(event.data as unknown as SELResult);
                  break;
                case 'cml_result':
                  setCml(event.data as unknown as CMLResult);
                  break;
                case 'pesl_result':
                  setPesl(event.data as unknown as PESLResult);
                  break;
                case 'error':
                  setError(event.error);
                  setStreaming(false);
                  return;
              }
            } catch {
              // skip malformed lines
            }
          }
        }

        setStreaming(false);
        setStatus(null);
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          setError((err as Error).message);
        }
        setStreaming(false);
      }
    },
    [thread.id]
  );

  return (
    <div className="flex flex-1 flex-col min-h-0">
      {/* Form card — collapses after submit */}
      <AnalysisFormCard
        initialTitle={meta.analysisTitle}
        initialDescription={meta.description}
        initialLabels={meta.labels}
        collapsed={submitted}
        onSubmit={(data) => void handleSubmit(data)}
      />

      {/* Results stream */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Status */}
        {streaming && status && (
          <motion.div
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 1.5, repeat: Infinity }}
            className="flex items-center gap-2 text-xs text-primary-500"
          >
            <div className="h-2 w-2 rounded-full bg-primary-500 animate-pulse" />
            {status}
          </motion.div>
        )}

        {/* SEL Result */}
        {sel && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl border border-primary-500/20 bg-primary-500/5 p-4 space-y-3"
          >
            <div className="flex items-center gap-2">
              <Sparkles size={14} className="text-primary-500" />
              <h4 className="text-[9px] font-black uppercase tracking-[0.2em] text-primary-500">
                Spec Enrichment (SEL)
              </h4>
            </div>
            <p className="text-sm text-white font-medium">{sel.intent}</p>
            <p className="text-xs text-neutral-text/80 leading-relaxed">{sel.summary}</p>
            {sel.affectedSystems.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {sel.affectedSystems.map((sys) => (
                  <span
                    key={sys.name}
                    className="rounded-md border border-blue-500/20 bg-blue-500/10 px-2 py-0.5 text-[10px] text-blue-400"
                  >
                    {sys.name} ({Math.round(sys.confidence * 100)}%)
                  </span>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {/* CML Result */}
        {cml && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl border border-secondary-400/20 bg-secondary-400/5 p-4 space-y-3"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap size={14} className="text-secondary-400" />
                <h4 className="text-[9px] font-black uppercase tracking-[0.2em] text-secondary-400">
                  Complexity Model (CML)
                </h4>
              </div>
              <span
                className={`rounded-md border px-2 py-0.5 text-[9px] font-bold uppercase ${RISK_COLORS[cml.riskLevel] ?? ''}`}
              >
                {cml.riskLevel}
              </span>
            </div>
            <div className="grid grid-cols-4 gap-3">
              <div className="text-center">
                <span className="block text-lg font-bold text-white">
                  {Math.round(cml.overall * 100)}%
                </span>
                <span className="text-[9px] text-neutral-muted uppercase">Overall</span>
              </div>
              <div className="text-center">
                <span className="block text-lg font-bold text-white">
                  {cml.blastRadius.filesEstimated}
                </span>
                <span className="text-[9px] text-neutral-muted uppercase">Files</span>
              </div>
              <div className="text-center">
                <span className="block text-lg font-bold text-white">
                  {cml.blastRadius.modules}
                </span>
                <span className="text-[9px] text-neutral-muted uppercase">Modules</span>
              </div>
              <div className="text-center">
                <span className="block text-lg font-bold text-white">{cml.recommendedRoute}</span>
                <span className="text-[9px] text-neutral-muted uppercase">Route</span>
              </div>
            </div>
          </motion.div>
        )}

        {/* PESL Result */}
        {pesl && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl border border-accent-500/20 bg-accent-500/5 p-4 space-y-3"
          >
            <div className="flex items-center gap-2">
              <MapPin size={14} className="text-accent-500" />
              <h4 className="text-[9px] font-black uppercase tracking-[0.2em] text-accent-500">
                Simulation (PESL)
              </h4>
              <span className="text-xs text-neutral-muted ml-auto">
                Confidence: {Math.round(pesl.executionConfidence * 100)}%
              </span>
            </div>
            {pesl.predictedFailures.length > 0 && (
              <div>
                <span className="text-[9px] font-bold uppercase text-red-400">
                  Predicted Failures
                </span>
                <ul className="mt-1 space-y-0.5">
                  {pesl.predictedFailures.map((f, i) => (
                    <li key={i} className="text-xs text-neutral-text/80">
                      - {f}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {pesl.recommendedChanges.length > 0 && (
              <div>
                <span className="text-[9px] font-bold uppercase text-accent-400">
                  Recommended Changes
                </span>
                <ul className="mt-1 space-y-0.5">
                  {pesl.recommendedChanges.map((c, i) => (
                    <li key={i} className="text-xs text-neutral-text/80">
                      - {c}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </motion.div>
        )}

        {/* Error */}
        {error && (
          <div className="rounded-xl border border-semantic-error/20 bg-semantic-error/5 p-4">
            <p className="text-xs text-semantic-error">Error: {error}</p>
          </div>
        )}

        {/* Actions — shown after analysis completes */}
        {submitted && !streaming && (sel || cml || pesl) && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 pt-2"
          >
            <button className="flex items-center gap-1.5 rounded-lg bg-primary-500/10 border border-primary-500/20 px-3 py-1.5 text-[10px] font-bold text-primary-500 hover:bg-primary-500/20 transition-colors">
              <Plus size={10} />
              Add to Roadmap
            </button>
            <button className="flex items-center gap-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] px-3 py-1.5 text-[10px] font-bold text-neutral-muted hover:text-white hover:bg-white/[0.08] transition-colors">
              <Download size={10} />
              Export Spec
            </button>
            <button
              onClick={() => {
                setSubmitted(false);
                setSel(null);
                setCml(null);
                setPesl(null);
                setError(null);
              }}
              className="flex items-center gap-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] px-3 py-1.5 text-[10px] font-bold text-neutral-muted hover:text-white hover:bg-white/[0.08] transition-colors"
            >
              <RefreshCw size={10} />
              Refine
            </button>
          </motion.div>
        )}
      </div>
    </div>
  );
}
