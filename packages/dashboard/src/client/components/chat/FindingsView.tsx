import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

type Severity = 'error' | 'warning' | 'info';

interface Finding {
  severity: Severity;
  file?: string;
  line?: number;
  column?: number;
  ruleId?: string;
  ruleName?: string;
  category?: string;
  message?: string;
  match?: string;
  context?: string;
}

export interface FindingsPayload {
  findings: Finding[];
  summary?: { errors?: number; warnings?: number; info?: number };
  title?: string;
}

const SEVERITY_RANK: Record<Severity, number> = { error: 0, warning: 1, info: 2 };

function normalizeSeverity(s: unknown): Severity {
  if (s === 'error' || s === 'fail' || s === 'critical' || s === 'high') return 'error';
  if (s === 'warning' || s === 'warn' || s === 'medium') return 'warning';
  return 'info';
}

/**
 * Best-effort parse of a tool result with a findings list.
 * Strips a leading `<!-- packed: ... -->` envelope and tries JSON.parse.
 * Returns the payload only if a `findings` array of severity-tagged items is present.
 */
export function parseFindingsResult(raw: string): FindingsPayload | null {
  const stripped = raw.replace(/^\s*<!--\s*packed:[^>]*-->\s*/, '').trim();
  const start = stripped.indexOf('{');
  if (start === -1) return null;
  try {
    const parsed = JSON.parse(stripped.slice(start)) as Record<string, unknown>;
    const findings = parsed.findings;
    if (!Array.isArray(findings) || findings.length === 0) return null;
    const first = findings[0] as Record<string, unknown>;
    if (typeof first?.severity !== 'string') return null;

    const normalized: Finding[] = findings.map((f) => {
      const item = f as Record<string, unknown>;
      const out: Finding = {
        severity: normalizeSeverity(item.severity),
      };
      if (typeof item.file === 'string') out.file = item.file;
      if (typeof item.line === 'number') out.line = item.line;
      if (typeof item.column === 'number') out.column = item.column;
      if (typeof item.ruleId === 'string') out.ruleId = item.ruleId;
      if (typeof item.ruleName === 'string') out.ruleName = item.ruleName;
      if (typeof item.category === 'string') out.category = item.category;
      if (typeof item.message === 'string') out.message = item.message;
      if (typeof item.match === 'string') out.match = item.match;
      if (typeof item.context === 'string') out.context = item.context;
      return out;
    });

    const summary =
      parsed.summary && typeof parsed.summary === 'object'
        ? (parsed.summary as FindingsPayload['summary'])
        : undefined;
    return summary ? { findings: normalized, summary } : { findings: normalized };
  } catch {
    return null;
  }
}

const SEVERITY_STYLES: Record<Severity, { pill: string; bar: string; text: string }> = {
  error: {
    pill: 'bg-red-500/15 text-red-300 border-red-500/30',
    bar: 'bg-red-500',
    text: 'text-red-300',
  },
  warning: {
    pill: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30',
    bar: 'bg-yellow-500',
    text: 'text-yellow-300',
  },
  info: {
    pill: 'bg-primary-500/15 text-primary-300 border-primary-500/30',
    bar: 'bg-primary-500',
    text: 'text-primary-300',
  },
};

function FindingRow({ finding }: { finding: Finding }) {
  const [open, setOpen] = useState(false);
  const styles = SEVERITY_STYLES[finding.severity];
  const title = finding.ruleName || finding.message || finding.ruleId || 'Finding';
  const location = finding.file
    ? `${finding.file}${finding.line != null ? `:${finding.line}` : ''}`
    : null;
  const hasDetails = finding.match || finding.context || finding.message;

  return (
    <div className="rounded border border-neutral-border/50 bg-neutral-surface/40 overflow-hidden">
      <div
        className={`flex items-start gap-2 px-3 py-2 ${
          hasDetails ? 'cursor-pointer hover:bg-white/5' : ''
        } transition-colors`}
        onClick={hasDetails ? () => setOpen((v) => !v) : undefined}
      >
        <span
          className={`shrink-0 mt-0.5 rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${styles.pill}`}
        >
          {finding.severity}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-[12px] font-bold text-neutral-text truncate">{title}</span>
            {finding.category && (
              <span className="text-[10px] font-mono text-neutral-muted/70">
                {finding.category}
              </span>
            )}
          </div>
          {location && (
            <div className="mt-0.5 font-mono text-[10px] text-neutral-muted/80 truncate">
              {location}
            </div>
          )}
        </div>
        {hasDetails && (
          <motion.span
            animate={{ rotate: open ? 90 : 0 }}
            className="shrink-0 mt-0.5 text-[9px] text-neutral-muted"
          >
            &#9654;
          </motion.span>
        )}
      </div>
      <AnimatePresence>
        {open && hasDetails && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-neutral-border/50 bg-neutral-bg/40 overflow-hidden"
          >
            <div className="px-3 py-2 flex flex-col gap-2">
              {finding.message && finding.ruleName && finding.message !== finding.ruleName && (
                <p className="text-xs text-neutral-text/80">{finding.message}</p>
              )}
              {finding.match && (
                <pre className="rounded bg-neutral-bg/60 border border-neutral-border/40 px-2 py-1 font-mono text-[11px] text-secondary-300 overflow-x-auto whitespace-pre-wrap">
                  {finding.match}
                </pre>
              )}
              {finding.context && finding.context !== finding.match && (
                <pre className="rounded bg-neutral-bg/30 px-2 py-1 font-mono text-[10px] text-neutral-muted overflow-x-auto whitespace-pre-wrap">
                  {finding.context}
                </pre>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function FindingsView({ payload }: { payload: FindingsPayload }) {
  const findings = [...payload.findings].sort(
    (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
  );
  const counts = findings.reduce(
    (acc, f) => {
      acc[f.severity]++;
      return acc;
    },
    { error: 0, warning: 0, info: 0 } as Record<Severity, number>
  );

  return (
    <div className="flex flex-col gap-2 not-prose">
      <div className="flex flex-wrap items-center gap-2">
        {payload.title && (
          <span className="text-sm font-bold text-neutral-text">{payload.title}</span>
        )}
        {(['error', 'warning', 'info'] as Severity[]).map((sev) =>
          counts[sev] > 0 ? (
            <span
              key={sev}
              className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${SEVERITY_STYLES[sev].pill}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${SEVERITY_STYLES[sev].bar}`} />
              {counts[sev]} {sev}
              {counts[sev] === 1 ? '' : 's'}
            </span>
          ) : null
        )}
        <span className="ml-auto font-mono text-[10px] text-neutral-muted/60">
          {findings.length} total
        </span>
      </div>
      <div className="flex flex-col gap-1">
        {findings.map((f, i) => (
          <FindingRow key={i} finding={f} />
        ))}
      </div>
    </div>
  );
}
