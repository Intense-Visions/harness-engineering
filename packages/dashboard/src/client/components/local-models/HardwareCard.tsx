import type { DashHardwareProfile } from '../../types/local-models';

/**
 * Hardware card for the LMLM panel. Presentational, props-only (no fetch).
 *
 * Renders the resolved `HardwareProfile` from
 * `GET /api/v1/local-models/hardware`. Degrades per-card (D-P8-4):
 *   - `error === 'LMLM disabled'` → disabled state
 *   - `error` (any other) with no data → "No hardware detected" (O3)
 *   - `loading` with no data → loading state
 *
 * Reuses the container classes from `pages/Proposals.tsx`
 * (`rounded-lg border border-white/10 p-4`) — introduces no new design tokens.
 */
export interface HardwareCardProps {
  hardware: DashHardwareProfile | null;
  error: string | null;
  loading: boolean;
}

function Row({
  label,
  value,
  testId,
}: {
  label: string;
  value: string;
  testId: string;
}): JSX.Element {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-neutral-muted">{label}</span>
      <span data-testid={testId} className="font-mono">
        {value}
      </span>
    </div>
  );
}

export function HardwareCard({ hardware, error, loading }: HardwareCardProps): JSX.Element {
  return (
    <div data-testid="hw-card" className="rounded-lg border border-white/10 p-4">
      <h2 className="mb-3 text-base font-semibold">Hardware</h2>
      {hardware ? (
        <div className="space-y-1.5">
          <Row label="Platform" value={hardware.platform} testId="hw-platform" />
          <Row label="VRAM" value={`${hardware.vramGb} GB`} testId="hw-vram" />
          <Row label="RAM" value={`${hardware.ramGb} GB`} testId="hw-ram" />
          <Row label="Bandwidth" value={`${hardware.bandwidthGbps} GB/s`} testId="hw-bandwidth" />
          <Row label="Chip" value={hardware.gpuName ?? hardware.cpuName} testId="hw-chip" />
          <p className="pt-1 text-xs text-neutral-muted">
            Detected {new Date(hardware.detectedAt).toLocaleString()}
          </p>
        </div>
      ) : error === 'LMLM disabled' ? (
        <p className="text-sm text-neutral-muted">Hardware unavailable — LMLM disabled.</p>
      ) : error ? (
        <p className="text-sm text-neutral-muted">No hardware detected.</p>
      ) : loading ? (
        <p className="text-sm text-neutral-muted">Loading hardware…</p>
      ) : (
        <p className="text-sm text-neutral-muted">No hardware detected.</p>
      )}
    </div>
  );
}
