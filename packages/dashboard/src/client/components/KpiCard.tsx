interface Props {
  label: string;
  value: string | number;
  sub?: string;
  accent?: 'default' | 'green' | 'yellow' | 'red';
}

const ACCENT_CLASSES: Record<NonNullable<Props['accent']>, string> = {
  default: 'text-white',
  green: 'text-emerald-400',
  yellow: 'text-yellow-400',
  red: 'text-red-400',
};

export function KpiCard({ label, value, sub, accent = 'default' }: Props) {
  return (
    <div className="rounded-lg border border-neutral-border bg-neutral-surface p-5">
      <p className="text-xs font-medium uppercase tracking-widest text-neutral-muted">{label}</p>
      <p className={['mt-2 text-3xl font-bold tabular-nums', ACCENT_CLASSES[accent]].join(' ')}>
        {value}
      </p>
      {sub && <p className="mt-1 text-xs text-neutral-muted">{sub}</p>}
    </div>
  );
}
