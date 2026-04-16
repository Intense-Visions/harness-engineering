import type { MilestoneProgress } from '@shared/types';
import { STATUS_COLOR } from '../utils/statusColors';

interface Props {
  milestones: MilestoneProgress[];
}

const BAR_HEIGHT = 20;
const BAR_GAP = 8;
const LABEL_WIDTH = 140;
const PADDING = { top: 12, right: 24, bottom: 12, left: 8 };

export function ProgressChart({ milestones }: Props) {
  const rows = milestones.filter((m) => !m.isBacklog);
  if (rows.length === 0) return null;

  const maxTotal = Math.max(...rows.map((m) => m.total), 1);
  const chartWidth = 480;
  const barAreaWidth = chartWidth - LABEL_WIDTH;
  const svgHeight = PADDING.top + rows.length * (BAR_HEIGHT + BAR_GAP) - BAR_GAP + PADDING.bottom;

  function barX(val: number) {
    return LABEL_WIDTH + (val / maxTotal) * barAreaWidth;
  }

  function stackedBars(m: MilestoneProgress, y: number) {
    const segments = [
      { value: m.done, color: STATUS_COLOR['done'] },
      { value: m.inProgress, color: STATUS_COLOR['in-progress'] },
      { value: m.blocked, color: STATUS_COLOR['blocked'] },
      { value: m.planned + m.backlog, color: STATUS_COLOR['planned'] },
    ];
    let accum = 0;
    return segments.map(({ value, color }, i) => {
      if (value === 0) return null;
      const x = barX(accum);
      const w = (value / maxTotal) * barAreaWidth;
      accum += value;
      return <rect key={i} x={x} y={y} width={w} height={BAR_HEIGHT} fill={color} />;
    });
  }

  return (
    <div>
      <p className="mb-2 text-xs text-neutral-muted">
        Per-milestone progress (done / in-progress / blocked / remaining)
      </p>
      <svg
        width={chartWidth + PADDING.left + PADDING.right}
        height={svgHeight}
        className="overflow-visible"
      >
        <g transform={`translate(${PADDING.left},${PADDING.top})`}>
          {rows.map((m, i) => {
            const y = i * (BAR_HEIGHT + BAR_GAP);
            return (
              <g key={m.name}>
                <text
                  x={LABEL_WIDTH - 8}
                  y={y + BAR_HEIGHT / 2}
                  dominantBaseline="middle"
                  textAnchor="end"
                  fontSize={11}
                  fill="#71717a"
                >
                  {m.name.length > 18 ? m.name.slice(0, 17) + '…' : m.name}
                </text>
                {/* background track */}
                <rect
                  x={LABEL_WIDTH}
                  y={y}
                  width={barAreaWidth}
                  height={BAR_HEIGHT}
                  fill="#18181b"
                  rx={3}
                />
                {stackedBars(m, y)}
                <text
                  x={barX(m.total) + 4}
                  y={y + BAR_HEIGHT / 2}
                  dominantBaseline="middle"
                  fontSize={10}
                  fill="#71717a"
                >
                  {m.done}/{m.total}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
      {/* Legend */}
      <div className="mt-2 flex flex-wrap gap-4">
        {Object.entries(STATUS_COLOR).map(([label, color]) => (
          <div key={label} className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: color }} />
            <span className="text-xs capitalize text-neutral-muted">{label.replace('-', ' ')}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
