import type { SignalPoint } from '../types/signals';

interface Props {
  points: SignalPoint[];
  width?: number;
  height?: number;
}

/**
 * Spec 534 — tiny inline SVG trend line. No runtime dep, no hex:
 * stroke uses `currentColor` so the parent card's status text-token
 * class drives the line color. Needs >= 2 points to draw a line.
 */
export function Sparkline({ points, width = 96, height = 28 }: Props) {
  if (points.length < 2) return null;
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const stepX = width / (points.length - 1);
  const coords = points
    .map((p, i) => {
      const x = i * stepX;
      const y = height - ((p.value - min) / span) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="overflow-visible"
      aria-hidden="true"
    >
      <polyline
        points={coords}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
