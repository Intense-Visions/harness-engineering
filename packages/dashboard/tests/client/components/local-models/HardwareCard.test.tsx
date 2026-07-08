import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HardwareCard } from '../../../../src/client/components/local-models/HardwareCard';
import type { DashHardwareProfile } from '../../../../src/client/types/local-models';

const PROFILE: DashHardwareProfile = {
  platform: 'macos',
  vramGb: 36,
  ramGb: 36,
  bandwidthGbps: 400,
  gpuName: 'Apple M3 Max',
  cpuName: 'Apple M3 Max',
  detectedAt: '2026-07-01T00:00:00.000Z',
};

describe('HardwareCard', () => {
  it('renders the hardware profile fields', () => {
    render(<HardwareCard hardware={PROFILE} error={null} loading={false} />);
    expect(screen.getByTestId('hw-platform').textContent).toContain('macos');
    expect(screen.getByTestId('hw-vram').textContent).toContain('36');
    expect(screen.getByTestId('hw-ram').textContent).toContain('36');
    expect(screen.getByTestId('hw-bandwidth').textContent).toContain('400');
    expect(screen.getByTestId('hw-chip').textContent).toContain('Apple M3 Max');
  });

  it('renders a disabled state when LMLM is disabled (no throw)', () => {
    render(<HardwareCard hardware={null} error="LMLM disabled" loading={false} />);
    expect(screen.getByTestId('hw-card').textContent).toMatch(/LMLM disabled/i);
  });

  it('renders a loading state', () => {
    render(<HardwareCard hardware={null} error={null} loading={true} />);
    expect(screen.getByTestId('hw-card').textContent).toMatch(/loading/i);
  });

  it('[O3] renders "No hardware detected" when detection failed (error, not disabled)', () => {
    render(<HardwareCard hardware={null} error="HTTP 500" loading={false} />);
    expect(screen.getByTestId('hw-card').textContent).toMatch(/no hardware detected/i);
  });
});
