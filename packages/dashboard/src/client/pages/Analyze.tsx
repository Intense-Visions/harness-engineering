import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Sparkles, MapPin, Zap, Edit3, Download, Check } from 'lucide-react';
import type { AnalyzeSSEEvent } from '../types/orchestrator';

// --- Result types ---

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
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  confidence: number;
  blastRadius: {
    services: number;
    modules: number;
    filesEstimated: number;
    testFilesAffected: number;
  };
  dimensions: {
    structural: number;
    semantic: number;
    historical: number;
  };
  reasoning: string[];
  recommendedRoute: 'local' | 'human' | 'simulation-required';
}

interface PESLResult {
  simulatedPlan: string[];
  predictedFailures: string[];
  riskHotspots: string[];
  missingSteps: string[];
  testGaps: string[];
  executionConfidence: number;
  recommendedChanges: string[];
  abort: boolean;
  tier: 'graph-only' | 'full-simulation';
}

interface Signal {
  name: string;
  reason: string;
}

// --- SSE streaming ---

async function streamAnalyze(
  body: { title: string; description?: string; labels?: string[] },
  callbacks: {
    onStatus: (text: string) => void;
    onSEL: (data: SELResult) => void;
    onCML: (data: CMLResult) => void;
    onPESL: (data: PESLResult) => void;
    onSignals: (data: Signal[]) => void;
    onError: (error: string) => void;
    onDone: () => void;
  },
  signal: AbortSignal
): Promise<void> {
  try {
    const res = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });

    if (!res.ok) {
      if (res.headers.get('content-type')?.includes('application/json')) {
        const json = (await res.json()) as { error?: string };
        callbacks.onError(json.error ?? `HTTP ${res.status}`);
      } else {
        callbacks.onError(`HTTP ${res.status}`);
      }
      return;
    }

    if (!res.body) {
      callbacks.onError('No response stream');
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
          callbacks.onDone();
          return;
        }
        try {
          const event = JSON.parse(payload) as AnalyzeSSEEvent;
          switch (event.type) {
            case 'status':
              callbacks.onStatus(event.text);
              break;
            case 'sel_result':
              callbacks.onSEL(event.data as unknown as SELResult);
              break;
            case 'cml_result':
              callbacks.onCML(event.data as unknown as CMLResult);
              break;
            case 'pesl_result':
              callbacks.onPESL(event.data as unknown as PESLResult);
              break;
            case 'signals':
              callbacks.onSignals(event.data);
              break;
            case 'error':
              callbacks.onError(event.error);
              return;
          }
        } catch {
          // skip malformed SSE lines
        }
      }
    }

    callbacks.onDone();
  } catch (err) {
    if ((err as Error).name !== 'AbortError') {
      callbacks.onError((err as Error).message ?? 'Stream failed');
    }
  }
}

// --- Score bar ---

function ScoreBar({ value, label, color }: { value: number; label: string; color: string }) {
  const pct = Math.round(value * 100);

  const bgClasses: Record<string, string> = {
    'text-primary-500': 'bg-primary-500',
    'text-secondary-400': 'bg-secondary-400',
    'text-accent-500': 'bg-accent-500',
    'text-blue-400': 'bg-blue-400',
    'text-purple-400': 'bg-purple-400',
    'text-yellow-400': 'bg-yellow-400',
    'text-emerald-400': 'bg-emerald-400',
  };

  const bgClass = bgClasses[color] || 'bg-gray-600';

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-gray-400">{label}</span>
        <span className={color}>{pct}%</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-gray-800">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className={`h-full rounded-full ${bgClass}`}
        />
      </div>
    </div>
  );
}

// --- Risk badge ---

const RISK_COLORS: Record<string, string> = {
  low: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  medium: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  high: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  critical: 'bg-red-500/10 text-red-400 border-red-500/20',
};

function RiskBadge({ level }: { level: string }) {
  return (
    <span
      className={`inline-block rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${RISK_COLORS[level] ?? RISK_COLORS.medium}`}
    >
      {level}
    </span>
  );
}

// --- Route badge ---

const ROUTE_COLORS: Record<string, string> = {
  local: 'text-emerald-400',
  human: 'text-amber-400',
  'simulation-required': 'text-purple-400',
};

// --- Result cards ---

function SELCard({ data }: { data: SELResult }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-lg border border-gray-800 bg-gray-900 p-5 space-y-4"
    >
      <h3 className="text-xs font-semibold uppercase tracking-widest text-primary-500">
        Spec Enrichment (SEL)
      </h3>
      <div className="space-y-3">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
            Intent
          </span>
          <p className="mt-1 text-sm text-white">{data.intent}</p>
        </div>
        <div>
          <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
            Summary
          </span>
          <p className="mt-1 text-sm text-gray-300 leading-relaxed">{data.summary}</p>
        </div>
        {data.affectedSystems.length > 0 && (
          <div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
              Affected Systems
            </span>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {data.affectedSystems.map((sys) => (
                <span
                  key={sys.name}
                  className="rounded-md bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 text-[10px] font-medium text-blue-400"
                  title={`Confidence: ${Math.round(sys.confidence * 100)}% | Tests: ${sys.testCoverage} | Deps: ${sys.transitiveDeps.length}`}
                >
                  {sys.name}
                  {sys.graphNodeId && (
                    <span className="ml-1 text-blue-500/50">
                      {Math.round(sys.confidence * 100)}%
                    </span>
                  )}
                </span>
              ))}
            </div>
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {data.unknowns.length > 0 && (
            <div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-amber-500">
                Unknowns ({data.unknowns.length})
              </span>
              <ul className="mt-1 space-y-0.5">
                {data.unknowns.map((u, i) => (
                  <li key={i} className="text-xs text-gray-400">
                    {u}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {data.ambiguities.length > 0 && (
            <div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-orange-500">
                Ambiguities ({data.ambiguities.length})
              </span>
              <ul className="mt-1 space-y-0.5">
                {data.ambiguities.map((a, i) => (
                  <li key={i} className="text-xs text-gray-400">
                    {a}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {data.riskSignals.length > 0 && (
            <div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-red-500">
                Risk Signals ({data.riskSignals.length})
              </span>
              <ul className="mt-1 space-y-0.5">
                {data.riskSignals.map((r, i) => (
                  <li key={i} className="text-xs text-gray-400">
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function CMLCard({ data }: { data: CMLResult }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-lg border border-gray-800 bg-gray-900 p-5 space-y-4"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-secondary-400">
          Complexity Model (CML)
        </h3>
        <div className="flex items-center gap-2">
          <RiskBadge level={data.riskLevel} />
          <span
            className={`text-xs font-mono font-bold ${ROUTE_COLORS[data.recommendedRoute] ?? 'text-gray-400'}`}
          >
            {data.recommendedRoute}
          </span>
        </div>
      </div>
      <div className="space-y-2">
        <ScoreBar value={data.overall} label="Overall" color="text-primary-500" />
        <ScoreBar
          value={data.dimensions.structural}
          label="Structural"
          color="text-secondary-400"
        />
        <ScoreBar value={data.dimensions.semantic} label="Semantic" color="text-accent-500" />
        <ScoreBar value={data.dimensions.historical} label="Historical" color="text-yellow-400" />
        <ScoreBar value={data.confidence} label="Confidence" color="text-emerald-400" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2 border-t border-gray-800">
        <div className="text-center">
          <span className="block text-lg font-bold text-white">{data.blastRadius.services}</span>
          <span className="text-[10px] text-gray-500 uppercase tracking-widest">Services</span>
        </div>
        <div className="text-center">
          <span className="block text-lg font-bold text-white">{data.blastRadius.modules}</span>
          <span className="text-[10px] text-gray-500 uppercase tracking-widest">Modules</span>
        </div>
        <div className="text-center">
          <span className="block text-lg font-bold text-white">
            {data.blastRadius.filesEstimated}
          </span>
          <span className="text-[10px] text-gray-500 uppercase tracking-widest">Files</span>
        </div>
        <div className="text-center">
          <span className="block text-lg font-bold text-white">
            {data.blastRadius.testFilesAffected}
          </span>
          <span className="text-[10px] text-gray-500 uppercase tracking-widest">Test Files</span>
        </div>
      </div>
      {data.reasoning.length > 0 && (
        <div className="pt-2 border-t border-gray-800">
          <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
            Reasoning
          </span>
          <ul className="mt-1 space-y-0.5">
            {data.reasoning.map((r, i) => (
              <li key={i} className="text-xs text-gray-400">
                {r}
              </li>
            ))}
          </ul>
        </div>
      )}
    </motion.div>
  );
}

function PESLCard({ data }: { data: PESLResult }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-lg border border-gray-800 bg-gray-900 p-5 space-y-4"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-amber-400">
          Simulation (PESL)
        </h3>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] text-gray-500 uppercase">{data.tier}</span>
          {data.abort && (
            <span className="rounded-md bg-red-500/10 border border-red-500/20 px-2 py-0.5 text-[10px] font-bold uppercase text-red-400">
              Abort Recommended
            </span>
          )}
          <span
            className={`text-sm font-bold ${data.executionConfidence >= 0.7 ? 'text-emerald-400' : data.executionConfidence >= 0.4 ? 'text-yellow-400' : 'text-red-400'}`}
          >
            {Math.round(data.executionConfidence * 100)}% confidence
          </span>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {data.simulatedPlan.length > 0 && (
          <div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
              Simulated Plan
            </span>
            <ol className="mt-1 space-y-0.5 list-decimal list-inside">
              {data.simulatedPlan.map((step, i) => (
                <li key={i} className="text-xs text-gray-300">
                  {step}
                </li>
              ))}
            </ol>
          </div>
        )}
        {data.predictedFailures.length > 0 && (
          <div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-red-500">
              Predicted Failures
            </span>
            <ul className="mt-1 space-y-0.5">
              {data.predictedFailures.map((f, i) => (
                <li key={i} className="text-xs text-gray-400">
                  {f}
                </li>
              ))}
            </ul>
          </div>
        )}
        {data.riskHotspots.length > 0 && (
          <div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-orange-500">
              Risk Hotspots
            </span>
            <ul className="mt-1 space-y-0.5">
              {data.riskHotspots.map((h, i) => (
                <li key={i} className="text-xs text-gray-400">
                  {h}
                </li>
              ))}
            </ul>
          </div>
        )}
        {data.testGaps.length > 0 && (
          <div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-amber-500">
              Test Gaps
            </span>
            <ul className="mt-1 space-y-0.5">
              {data.testGaps.map((g, i) => (
                <li key={i} className="text-xs text-gray-400">
                  {g}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      {data.recommendedChanges.length > 0 && (
        <div className="pt-2 border-t border-gray-800">
          <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
            Recommended Changes
          </span>
          <ul className="mt-1 space-y-0.5">
            {data.recommendedChanges.map((c, i) => (
              <li key={i} className="text-xs text-gray-400">
                {c}
              </li>
            ))}
          </ul>
        </div>
      )}
    </motion.div>
  );
}

function SignalsBadges({ signals }: { signals: Signal[] }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-wrap gap-2"
    >
      {signals.map((s, i) => (
        <span
          key={i}
          className="rounded-md bg-red-500/10 border border-red-500/20 px-3 py-1 text-xs font-medium text-red-400"
          title={s.reason}
        >
          {s.name}
        </span>
      ))}
    </motion.div>
  );
}

// --- Export spec markdown builder ---

function buildSpecMarkdown(
  title: string,
  sel: SELResult | null,
  cml: CMLResult | null,
  pesl: PESLResult | null
): string {
  const lines: string[] = [`# Spec: ${title}`, ''];
  lines.push(`**Generated:** ${new Date().toISOString()}`);
  if (cml) {
    lines.push(`**Route Recommendation:** ${cml.recommendedRoute}`);
    lines.push(`**Risk Level:** ${cml.riskLevel}`);
  }
  lines.push('');

  if (sel) {
    lines.push('## Intent', '', sel.intent, '');
    lines.push('## Summary', '', sel.summary, '');
    if (sel.affectedSystems.length > 0) {
      lines.push('## Affected Systems', '');
      for (const sys of sel.affectedSystems) lines.push(`- ${sys.name}`);
      lines.push('');
    }
  }

  if (cml) {
    lines.push('## Complexity Score', '');
    lines.push(`- **Overall:** ${Math.round(cml.overall * 100)}%`);
    lines.push(`- **Structural:** ${Math.round(cml.dimensions.structural * 100)}%`);
    lines.push(`- **Semantic:** ${Math.round(cml.dimensions.semantic * 100)}%`);
    lines.push(`- **Historical:** ${Math.round(cml.dimensions.historical * 100)}%`);
    lines.push(
      `- **Blast Radius:** ${cml.blastRadius.services} services, ${cml.blastRadius.modules} modules, ~${cml.blastRadius.filesEstimated} files`
    );
    lines.push('');
  }

  if (sel) {
    if (sel.unknowns.length > 0) {
      lines.push('## Unknowns', '');
      for (const u of sel.unknowns) lines.push(`- ${u}`);
      lines.push('');
    }
    if (sel.ambiguities.length > 0) {
      lines.push('## Ambiguities', '');
      for (const a of sel.ambiguities) lines.push(`- ${a}`);
      lines.push('');
    }
    if (sel.riskSignals.length > 0) {
      lines.push('## Risk Signals', '');
      for (const r of sel.riskSignals) lines.push(`- ${r}`);
      lines.push('');
    }
  }

  if (pesl) {
    lines.push('## Simulation (PESL)', '');
    lines.push(`**Execution Confidence:** ${Math.round(pesl.executionConfidence * 100)}%`);
    lines.push('');
    if (pesl.simulatedPlan.length > 0) {
      lines.push('### Simulated Plan', '');
      pesl.simulatedPlan.forEach((s, i) => lines.push(`${i + 1}. ${s}`));
      lines.push('');
    }
    if (pesl.predictedFailures.length > 0) {
      lines.push('### Predicted Failures', '');
      for (const f of pesl.predictedFailures) lines.push(`- ${f}`);
      lines.push('');
    }
    if (pesl.recommendedChanges.length > 0) {
      lines.push('### Recommended Changes', '');
      for (const c of pesl.recommendedChanges) lines.push(`- ${c}`);
      lines.push('');
    }
  }

  return lines.join('\n');
}

// --- Action bar ---

type ActionState =
  | 'idle'
  | 'roadmap-pending'
  | 'roadmap-done'
  | 'dispatch-pending'
  | 'dispatch-done';

function ActionButton({
  icon,
  label,
  doneLabel,
  onClick,
  disabled,
  pending,
  done,
  title: tooltip,
  color = 'border-gray-700 text-gray-400 hover:border-primary-500/50 hover:text-primary-400',
}: {
  icon: React.ReactNode;
  label: string;
  doneLabel: string;
  onClick: () => void;
  disabled: boolean;
  pending: boolean;
  done: boolean;
  title?: string;
  color?: string;
}) {
  return (
    <motion.button
      {...(!disabled ? { whileHover: { scale: 1.02 }, whileTap: { scale: 0.98 } } : {})}
      onClick={onClick}
      disabled={disabled || pending || done}
      {...(tooltip != null ? { title: tooltip } : {})}
      className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 text-xs font-bold uppercase tracking-wider transition-all disabled:cursor-not-allowed disabled:opacity-30 ${
        done ? 'border-emerald-500/30 text-emerald-400' : color
      }`}
    >
      {pending ? (
        <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : done ? (
        <Check size={14} />
      ) : (
        icon
      )}
      {done ? doneLabel : label}
    </motion.button>
  );
}

// --- Main component ---

export function Analyze() {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [labels, setLabels] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selResult, setSelResult] = useState<SELResult | null>(null);
  const [cmlResult, setCmlResult] = useState<CMLResult | null>(null);
  const [peslResult, setPeslResult] = useState<PESLResult | null>(null);
  const [signals, setSignals] = useState<Signal[] | null>(null);
  const [actionState, setActionState] = useState<ActionState>('idle');
  const [actionError, setActionError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const hasResults = selResult || cmlResult || peslResult || signals;
  const isDone = !streaming && hasResults;

  // Auto-reset action state after 3 seconds
  useEffect(() => {
    if (actionState === 'roadmap-done' || actionState === 'dispatch-done') {
      const timer = setTimeout(() => setActionState('idle'), 3000);
      return () => clearTimeout(timer);
    }
  }, [actionState]);

  const handleSubmit = useCallback(async () => {
    if (!title.trim() || streaming) return;

    // Reset state
    setError(null);
    setSelResult(null);
    setCmlResult(null);
    setPeslResult(null);
    setSignals(null);
    setStatus(null);
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    const parsedLabels = labels
      .split(',')
      .map((l) => l.trim())
      .filter(Boolean);

    const body: { title: string; description?: string; labels?: string[] } = {
      title: title.trim(),
    };
    if (description.trim()) body.description = description.trim();
    if (parsedLabels.length > 0) body.labels = parsedLabels;

    await streamAnalyze(
      body,
      {
        onStatus: setStatus,
        onSEL: (data) => {
          setSelResult(data);
          setStatus(null);
        },
        onCML: (data) => {
          setCmlResult(data);
          setStatus(null);
        },
        onPESL: (data) => {
          setPeslResult(data);
          setStatus(null);
        },
        onSignals: (data) => {
          setSignals(data);
          setStatus(null);
        },
        onError: (err) => {
          setError(err);
          setStreaming(false);
          setStatus(null);
        },
        onDone: () => {
          setStreaming(false);
          setStatus(null);
        },
      },
      controller.signal
    );
  }, [title, description, labels, streaming]);

  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
    setStreaming(false);
    setStatus(null);
  }, []);

  const handleAddToRoadmap = useCallback(async () => {
    setActionState('roadmap-pending');
    setActionError(null);
    try {
      const res = await fetch('/api/roadmap/append', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          summary: selResult?.summary,
          enrichedSpec: selResult
            ? {
                intent: selResult.intent,
                unknowns: selResult.unknowns,
                ambiguities: selResult.ambiguities,
                riskSignals: selResult.riskSignals,
                affectedSystems: selResult.affectedSystems.map((s) => ({ name: s.name })),
              }
            : undefined,
          cmlRecommendedRoute: cmlResult?.recommendedRoute,
        }),
      });
      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }
      setActionState('roadmap-done');
    } catch (err) {
      setActionError((err as Error).message);
      setActionState('idle');
    }
  }, [title, selResult, cmlResult]);

  const handleDispatchNow = useCallback(async () => {
    setActionState('dispatch-pending');
    setActionError(null);
    try {
      const parsedLabels = labels
        .split(',')
        .map((l) => l.trim())
        .filter(Boolean);
      const res = await fetch('/api/dispatch/adhoc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          labels: parsedLabels.length > 0 ? parsedLabels : undefined,
        }),
      });
      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }
      setActionState('dispatch-done');
    } catch (err) {
      setActionError((err as Error).message);
      setActionState('idle');
    }
  }, [title, description, labels]);

  const handleRefine = useCallback(() => {
    if (!selResult) return;
    const parts: string[] = [];
    if (description.trim()) parts.push(description.trim());
    const clarifications: string[] = [];
    for (const u of selResult.unknowns) clarifications.push(`- Unknown: ${u}`);
    for (const a of selResult.ambiguities) clarifications.push(`- Ambiguity: ${a}`);
    if (clarifications.length > 0) {
      parts.push('', '---', 'Suggested clarifications from analysis:', ...clarifications);
    }
    setDescription(parts.join('\n'));
    // Reset results so the user can re-analyze
    setSelResult(null);
    setCmlResult(null);
    setPeslResult(null);
    setSignals(null);
    setActionState('idle');
    setActionError(null);
    // Focus the description field
    document.getElementById('analyze-description')?.focus();
  }, [selResult, description]);

  const handleExportSpec = useCallback(() => {
    const markdown = buildSpecMarkdown(title.trim(), selResult, cmlResult, peslResult);
    const slug = title
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .slice(0, 40);
    const date = new Date().toISOString().slice(0, 10);
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `spec-${slug}-${date}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [title, selResult, cmlResult, peslResult]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="rounded-full bg-primary-500/10 p-2 text-primary-500">
          <Sparkles size={20} className="drop-shadow-[0_0_10px_var(--color-primary-500)]" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Analyze</h1>
          <p className="text-xs text-gray-500 font-mono uppercase tracking-widest">
            Intelligence Pipeline
          </p>
        </div>
      </div>

      {/* Input form */}
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-5 space-y-4">
        <div>
          <label
            htmlFor="analyze-title"
            className="block text-xs font-semibold uppercase tracking-widest text-gray-500 mb-1.5"
          >
            Title <span className="text-red-400">*</span>
          </label>
          <input
            id="analyze-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void handleSubmit();
              }
            }}
            placeholder="Describe the work item..."
            disabled={streaming}
            className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-sm text-white placeholder-gray-500 transition-all focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 disabled:opacity-50"
          />
        </div>
        <div>
          <label
            htmlFor="analyze-description"
            className="block text-xs font-semibold uppercase tracking-widest text-gray-500 mb-1.5"
          >
            Description
          </label>
          <textarea
            id="analyze-description"
            rows={8}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Additional context, requirements, constraints..."
            disabled={streaming}
            className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-sm text-white placeholder-gray-500 transition-all focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 disabled:opacity-50"
          />
        </div>
        <div>
          <label
            htmlFor="analyze-labels"
            className="block text-xs font-semibold uppercase tracking-widest text-gray-500 mb-1.5"
          >
            Labels
          </label>
          <input
            id="analyze-labels"
            type="text"
            value={labels}
            onChange={(e) => setLabels(e.target.value)}
            placeholder="Comma-separated labels (e.g. frontend, auth, urgent)"
            disabled={streaming}
            className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-sm text-white placeholder-gray-500 transition-all focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 disabled:opacity-50"
          />
        </div>
        <div className="flex items-center gap-3">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => void handleSubmit()}
            disabled={streaming || !title.trim()}
            className="flex items-center gap-2 rounded-lg bg-primary-500 px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-white shadow-[0_0_15px_rgba(79,70,229,0.3)] transition-all hover:shadow-[0_0_20px_rgba(79,70,229,0.5)] disabled:cursor-not-allowed disabled:opacity-30"
          >
            {streaming ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <Send size={14} />
            )}
            {streaming ? 'Analyzing...' : 'Analyze'}
          </motion.button>
          {streaming && (
            <button
              onClick={handleCancel}
              className="rounded-lg border border-gray-700 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-gray-400 transition-colors hover:border-red-500/50 hover:text-red-400"
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* Status indicator */}
      <AnimatePresence>
        {status && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="flex items-center gap-2"
          >
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-primary-500 shadow-[0_0_10px_var(--color-primary-500)]" />
            <span className="font-mono text-xs uppercase tracking-widest text-gray-400">
              {status}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error */}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-lg border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-400"
        >
          {error}
        </motion.div>
      )}

      {/* Results */}
      {hasResults && (
        <div className="space-y-4">
          {selResult && <SELCard data={selResult} />}
          {cmlResult && <CMLCard data={cmlResult} />}
          {signals && signals.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-gray-500">
                Concern Signals
              </h3>
              <SignalsBadges signals={signals} />
            </div>
          )}
          {peslResult && <PESLCard data={peslResult} />}

          {/* Action bar */}
          {isDone && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-800 bg-gray-900 p-4"
            >
              <ActionButton
                icon={<MapPin size={14} />}
                label="Add to Roadmap"
                doneLabel="Added"
                onClick={() => void handleAddToRoadmap()}
                disabled={
                  actionState !== 'idle' &&
                  actionState !== 'roadmap-done' &&
                  actionState !== 'dispatch-done'
                }
                pending={actionState === 'roadmap-pending'}
                done={actionState === 'roadmap-done'}
              />
              <ActionButton
                icon={<Zap size={14} />}
                label="Dispatch Now"
                doneLabel="Dispatched"
                onClick={() => void handleDispatchNow()}
                disabled={
                  cmlResult?.recommendedRoute !== 'local' ||
                  (actionState !== 'idle' &&
                    actionState !== 'roadmap-done' &&
                    actionState !== 'dispatch-done')
                }
                pending={actionState === 'dispatch-pending'}
                done={actionState === 'dispatch-done'}
                {...(cmlResult?.recommendedRoute !== 'local'
                  ? { title: 'Only available for local-route items' }
                  : {})}
                color="border-gray-700 text-gray-400 hover:border-emerald-500/50 hover:text-emerald-400"
              />
              <ActionButton
                icon={<Edit3 size={14} />}
                label="Refine"
                doneLabel="Refine"
                onClick={handleRefine}
                disabled={
                  !selResult ||
                  (selResult.unknowns.length === 0 && selResult.ambiguities.length === 0)
                }
                pending={false}
                done={false}
                title="Pre-populate description with unknowns and ambiguities for re-analysis"
                color="border-gray-700 text-gray-400 hover:border-amber-500/50 hover:text-amber-400"
              />
              <ActionButton
                icon={<Download size={14} />}
                label="Export Spec"
                doneLabel="Export Spec"
                onClick={handleExportSpec}
                disabled={!selResult}
                pending={false}
                done={false}
                color="border-gray-700 text-gray-400 hover:border-blue-500/50 hover:text-blue-400"
              />
              {actionError && <span className="text-xs text-red-400">{actionError}</span>}
            </motion.div>
          )}
        </div>
      )}

      {/* Empty state */}
      {!hasResults && !streaming && !error && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="mb-4 rounded-full bg-primary-500/10 p-4 text-primary-500">
            <Sparkles size={32} className="drop-shadow-[0_0_10px_var(--color-primary-500)]" />
          </div>
          <h2 className="mb-1 text-lg font-bold">Intelligence Pipeline</h2>
          <p className="max-w-sm text-xs text-gray-500">
            Submit a work item description to run it through the SEL, CML, and PESL analysis layers.
            Results stream in real-time.
          </p>
        </div>
      )}
    </div>
  );
}
