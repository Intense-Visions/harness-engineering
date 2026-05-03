import { motion } from 'framer-motion';

interface SkillMatch {
  skill: string;
  score: number;
  when: string;
  reasons: string[];
}

export interface AdviseSkillsPayload {
  featureName: string;
  skillsPath?: string;
  totalScanned?: number;
  scanDuration?: number;
  apply?: SkillMatch[];
  reference?: SkillMatch[];
  consider?: SkillMatch[];
}

/**
 * Best-effort parse of an advise_skills/dispatch_skills/recommend_skills tool result.
 * Strips a leading `<!-- packed: ... -->` envelope comment if present, then
 * attempts JSON.parse. Returns the payload only if it has the expected shape.
 */
export function parseAdviseSkillsResult(raw: string): AdviseSkillsPayload | null {
  const stripped = raw.replace(/^\s*<!--\s*packed:[^>]*-->\s*/, '').trim();
  const start = stripped.indexOf('{');
  if (start === -1) return null;
  try {
    const parsed = JSON.parse(stripped.slice(start)) as Record<string, unknown>;
    if (typeof parsed.featureName !== 'string') return null;
    const looksLikeMatches = (v: unknown): v is SkillMatch[] =>
      Array.isArray(v) &&
      (v.length === 0 ||
        (typeof (v[0] as SkillMatch)?.skill === 'string' &&
          typeof (v[0] as SkillMatch)?.score === 'number'));
    if (
      !looksLikeMatches(parsed.apply) &&
      !looksLikeMatches(parsed.reference) &&
      !looksLikeMatches(parsed.consider)
    ) {
      return null;
    }
    return parsed as unknown as AdviseSkillsPayload;
  } catch {
    return null;
  }
}

function scoreColor(score: number): string {
  if (score >= 0.7) return 'bg-emerald-500';
  if (score >= 0.5) return 'bg-primary-500';
  if (score >= 0.3) return 'bg-secondary-400';
  return 'bg-neutral-muted';
}

function SkillCard({ match, dim }: { match: SkillMatch; dim?: boolean }) {
  const pct = Math.round(match.score * 100);
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: dim ? 0.7 : 1, y: 0 }}
      className="rounded border border-neutral-border/60 bg-neutral-surface/40 px-3 py-2 hover:bg-neutral-surface/60 transition-colors"
    >
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-[12px] font-bold text-neutral-text truncate">
          {match.skill}
        </span>
        <span className="ml-auto shrink-0 font-mono text-[10px] text-neutral-muted tabular-nums">
          {pct}%
        </span>
      </div>
      <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-neutral-bg/60">
        <div
          className={`h-full rounded-full ${scoreColor(match.score)} transition-all`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="rounded bg-primary-500/10 border border-primary-500/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary-300">
          {match.when}
        </span>
        {match.reasons.map((reason, i) => (
          <span
            key={i}
            className="rounded bg-neutral-bg/60 border border-neutral-border/40 px-1.5 py-0.5 text-[9px] text-neutral-muted"
            title={reason}
          >
            {reason.length > 40 ? reason.slice(0, 38) + '…' : reason}
          </span>
        ))}
      </div>
    </motion.div>
  );
}

function TierSection({
  label,
  matches,
  dim,
}: {
  label: string;
  matches: SkillMatch[];
  dim?: boolean;
}) {
  if (matches.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-muted">
          {label}
        </span>
        <span className="text-[10px] font-mono text-neutral-muted/60">{matches.length}</span>
        <div className="flex-1 h-px bg-neutral-border/40" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
        {matches.map((m) =>
          dim ? <SkillCard key={m.skill} match={m} dim /> : <SkillCard key={m.skill} match={m} />
        )}
      </div>
    </div>
  );
}

export function AdviseSkillsView({ payload }: { payload: AdviseSkillsPayload }) {
  const apply = payload.apply ?? [];
  const reference = payload.reference ?? [];
  const consider = payload.consider ?? [];
  const total = apply.length + reference.length + consider.length;

  return (
    <div className="flex flex-col gap-3 not-prose">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-sm font-bold text-neutral-text">{payload.featureName}</span>
        {payload.totalScanned != null && (
          <span className="font-mono text-[10px] text-neutral-muted">
            {payload.totalScanned} scanned
          </span>
        )}
        {payload.scanDuration != null && (
          <span className="font-mono text-[10px] text-neutral-muted">{payload.scanDuration}ms</span>
        )}
        <span className="font-mono text-[10px] text-neutral-muted">{total} matched</span>
        {payload.skillsPath && (
          <span className="ml-auto font-mono text-[10px] text-neutral-muted/60 truncate">
            {payload.skillsPath}
          </span>
        )}
      </div>

      <TierSection label="Apply" matches={apply} />
      <TierSection label="Reference" matches={reference} dim />
      <TierSection label="Consider" matches={consider} dim />
    </div>
  );
}
