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
    <div className="rounded-lg border border-gray-800 bg-gray-900 p-5">
      <p className="text-xs font-medium uppercase tracking-widest text-gray-500">{label}</p>
      <p className={['mt-2 text-3xl font-bold tabular-nums', ACCENT_CLASSES[accent]].join(' ')}>
        {value}
      </p>
      {sub && <p className="mt-1 text-xs text-gray-500">{sub}</p>}
    </div>
  );
}
