import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { Adoption } from '../../../src/client/pages/Adoption';
import type { AdoptionSnapshot, SkillAdoptionSummary } from '@shared/types';

const mkSkill = (over: Partial<SkillAdoptionSummary>): SkillAdoptionSummary => ({
  skill: 'skill-x',
  invocations: 10,
  successRate: 0.9,
  avgDuration: 500,
  lastUsed: '2026-06-15T12:34:56Z',
  ...over,
});

const mkSnapshot = (over: Partial<AdoptionSnapshot>): AdoptionSnapshot => ({
  period: 'weekly',
  totalInvocations: 1234,
  uniqueSkills: 3,
  topSkills: [mkSkill({ skill: 'skill-a' })],
  generatedAt: '2026-06-22T00:00:00Z',
  ...over,
});

function mockAdoption(snapshot: AdoptionSnapshot) {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ data: snapshot }), { status: 200 })
  );
}

afterEach(() => vi.restoreAllMocks());

describe('Adoption page', () => {
  it('shows the loading message before the fetch resolves', () => {
    // Never-resolving fetch keeps the component in its initial loading state.
    vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise(() => {}));
    render(<Adoption />);
    expect(screen.getByText('Loading adoption telemetry...')).toBeDefined();
  });

  it('renders the summary KPIs from the fetched snapshot', async () => {
    mockAdoption(mkSnapshot({ totalInvocations: 1234, uniqueSkills: 7, period: 'weekly' }));
    render(<Adoption />);

    await waitFor(() => expect(screen.getByText('Total Invocations')).toBeDefined());
    expect(screen.getByText('1234')).toBeDefined();
    expect(screen.getByText('7')).toBeDefined();
    expect(screen.getByText('weekly')).toBeDefined();
  });

  it('renders one table row per top skill', async () => {
    mockAdoption(
      mkSnapshot({
        topSkills: [
          mkSkill({ skill: 'skill-a' }),
          mkSkill({ skill: 'skill-b' }),
          mkSkill({ skill: 'skill-c' }),
        ],
      })
    );
    render(<Adoption />);

    await waitFor(() => expect(screen.getByText('skill-a')).toBeDefined());
    expect(screen.getByText('skill-b')).toBeDefined();
    expect(screen.getByText('skill-c')).toBeDefined();
  });

  it('formats avg duration across the ms / s / m thresholds', async () => {
    mockAdoption(
      mkSnapshot({
        topSkills: [
          mkSkill({ skill: 'sub-second', avgDuration: 500 }), // < 1000ms -> "500ms"
          mkSkill({ skill: 'seconds', avgDuration: 1500 }), // < 60000ms -> "1.5s"
          mkSkill({ skill: 'minutes', avgDuration: 90_000 }), // >= 60000ms -> "1.5m"
        ],
      })
    );
    render(<Adoption />);

    await waitFor(() => expect(screen.getByText('500ms')).toBeDefined());
    expect(screen.getByText('1.5s')).toBeDefined();
    expect(screen.getByText('1.5m')).toBeDefined();
  });

  it('formats success rate as a rounded percentage', async () => {
    mockAdoption(mkSnapshot({ topSkills: [mkSkill({ skill: 'rounder', successRate: 0.876 })] }));
    render(<Adoption />);

    await waitFor(() => expect(screen.getByText('88%')).toBeDefined());
  });

  it('applies threshold-based accent classes to the success rate cell', async () => {
    mockAdoption(
      mkSnapshot({
        topSkills: [
          mkSkill({ skill: 'high', successRate: 0.9 }), // >= 0.8 -> emerald
          mkSkill({ skill: 'mid', successRate: 0.6 }), // >= 0.5 -> yellow
          mkSkill({ skill: 'low', successRate: 0.3 }), // < 0.5 -> red
        ],
      })
    );
    render(<Adoption />);

    await waitFor(() => expect(screen.getByText('90%')).toBeDefined());
    expect(screen.getByText('90%').className).toContain('text-emerald-400');
    expect(screen.getByText('60%').className).toContain('text-yellow-400');
    expect(screen.getByText('30%').className).toContain('text-red-400');
  });

  it('truncates lastUsed to the ISO date portion', async () => {
    mockAdoption(
      mkSnapshot({ topSkills: [mkSkill({ skill: 'dated', lastUsed: '2026-06-15T12:34:56Z' })] })
    );
    render(<Adoption />);

    await waitFor(() => expect(screen.getByText('2026-06-15')).toBeDefined());
  });

  it('renders the empty-state message when there are no top skills', async () => {
    mockAdoption(mkSnapshot({ topSkills: [] }));
    render(<Adoption />);

    await waitFor(() =>
      expect(
        screen.getByText('No adoption data yet. Skills will appear here after your next session.')
      ).toBeDefined()
    );
  });

  it('renders the HTTP error message when the fetch responds non-ok', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 500 }));
    render(<Adoption />);

    await waitFor(() => expect(screen.getByText('HTTP 500')).toBeDefined());
  });
});
