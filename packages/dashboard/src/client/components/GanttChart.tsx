import type { DashboardFeature, FeatureStatus } from '@shared/types';

interface Props {
  features: DashboardFeature[];
  /** Milestone filter — empty string means all */
  filterMilestone: string;
  /** Status filter — empty string means all non-done */
  filterStatus: string;
}

const ROW_HEIGHT = 28;
const LABEL_WIDTH = 180;
const BAR_HEIGHT = 16;
const SECTION_HEADER_HEIGHT = 24;
const PADDING = { top: 8, right: 16, bottom: 8, left: 8 };

const STATUS_COLOR: Record<FeatureStatus, string> = {
  done: '#10b981',
  'in-progress': '#3b82f6',
  planned: '#6b7280',
  blocked: '#ef4444',
  backlog: '#374151',
};

export function GanttChart({ features, filterMilestone, filterStatus }: Props) {
  // Apply filters
  const filtered = features.filter((f) => {
    if (filterMilestone && f.milestone !== filterMilestone) return false;
    if (filterStatus) return f.status === filterStatus;
    return f.status !== 'done'; // default: hide done features
  });

  if (filtered.length === 0) {
    return <p className="text-sm text-gray-500">No features match the current filters.</p>;
  }

  // Group by milestone
  const groups = new Map<string, DashboardFeature[]>();
  for (const f of filtered) {
    const list = groups.get(f.milestone) ?? [];
    list.push(f);
    groups.set(f.milestone, list);
  }

  const totalFeatures = filtered.length;
  const chartWidth = 560;
  const barAreaWidth = chartWidth - LABEL_WIDTH;

  // Synthetic width: each feature bar = 1 unit, position = sequential index within milestone
  const barUnitWidth = Math.max(16, Math.floor(barAreaWidth / Math.max(totalFeatures, 1)));

  let svgHeight = PADDING.top + PADDING.bottom;
  for (const feats of groups.values()) {
    svgHeight += SECTION_HEADER_HEIGHT + feats.length * ROW_HEIGHT;
  }

  const rows: JSX.Element[] = [];
  let y = PADDING.top;
  let colIndex = 0;

  for (const [milestone, feats] of groups) {
    // Section header
    rows.push(
      <text
        key={`hdr-${milestone}`}
        x={PADDING.left}
        y={y + SECTION_HEADER_HEIGHT / 2}
        dominantBaseline="middle"
        fontSize={11}
        fontWeight={600}
        fill="#d1d5db"
      >
        {milestone}
      </text>
    );
    y += SECTION_HEADER_HEIGHT;

    for (const feat of feats) {
      const barX = LABEL_WIDTH + colIndex * barUnitWidth;
      const color = STATUS_COLOR[feat.status] ?? '#6b7280';
      const barY = y + (ROW_HEIGHT - BAR_HEIGHT) / 2;

      rows.push(
        <g key={feat.name}>
          <text
            x={PADDING.left + LABEL_WIDTH - 8}
            y={y + ROW_HEIGHT / 2}
            dominantBaseline="middle"
            textAnchor="end"
            fontSize={11}
            fill="#9ca3af"
          >
            {feat.name.length > 24 ? feat.name.slice(0, 23) + '…' : feat.name}
          </text>
          <rect
            x={barX}
            y={barY}
            width={barUnitWidth - 2}
            height={BAR_HEIGHT}
            fill={color}
            rx={2}
          />
        </g>
      );
      colIndex++;
      y += ROW_HEIGHT;
    }
  }

  return (
    <svg
      width={chartWidth + PADDING.left + PADDING.right}
      height={svgHeight}
      className="overflow-visible"
    >
      {rows}
    </svg>
  );
}
