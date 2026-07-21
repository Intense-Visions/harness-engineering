/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import type {
  HealthData,
  OverviewData,
  ChecksData,
  CIData,
  SecurityData,
  PerfData,
  ArchData,
} from '../../../src/shared/types';

// --- useSSE mock -----------------------------------------------------------
// Health calls useSSE(SSE_ENDPOINT, 'overview') and useSSE(SSE_ENDPOINT, 'checks').
// A hoisted holder lets each test drive both streams independently.
const sse = vi.hoisted(() => ({
  overview: {
    data: null as unknown,
    lastUpdated: null,
    stale: false,
    error: null as string | null,
  },
  checks: { data: null as unknown, lastUpdated: null, stale: false, error: null as string | null },
}));

vi.mock('../../../src/client/hooks/useSSE', () => ({
  useSSE: (_url: string, eventType: string) =>
    eventType === 'overview' ? sse.overview : sse.checks,
}));

const { Health } = await import('../../../src/client/pages/Health');

// --- fixtures --------------------------------------------------------------
const EXPECTED_CHECK_NAMES = [
  'validate',
  'check-deps',
  'check-arch',
  'check-perf',
  'check-security',
  'check-docs',
  'phase-gate',
] as const;

function healthData(over: Partial<HealthData> = {}): HealthData {
  return {
    totalIssues: 0,
    errors: 0,
    warnings: 0,
    fixableCount: 0,
    suggestionCount: 0,
    durationMs: 0,
    analysisErrors: [],
    ...over,
  };
}

const securityData: SecurityData = {
  valid: false,
  findings: [],
  stats: { filesScanned: 42, errorCount: 1, warningCount: 2, infoCount: 3 },
};

const perfData: PerfData = {
  valid: true,
  violations: [],
  stats: { filesAnalyzed: 10, violationCount: 0 },
};

const archData: ArchData = {
  passed: true,
  totalViolations: 0,
  regressions: [],
  newViolations: [],
};

function setOverview(data: unknown, error: string | null = null): void {
  sse.overview.data = data;
  sse.overview.error = error;
}

function setChecks(data: ChecksData | null): void {
  sse.checks.data = data;
}

function makeChecks(over: Partial<ChecksData>): ChecksData {
  return {
    security: securityData,
    perf: perfData,
    arch: archData,
    anomalies: { outliers: [], articulationPoints: [], overlapCount: 0 },
    lastRun: '2026-07-20T12:00:00.000Z',
    ...over,
  };
}

// Only /api/ci is fetched (on CISection mount). Everything else is via useSSE.
function stubCI(ci: CIData): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    if (String(input).includes('/api/ci')) {
      return Promise.resolve(new Response(JSON.stringify({ data: ci }), { status: 200 }));
    }
    return Promise.resolve(new Response('{}', { status: 404 }));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderHealth() {
  return render(
    <MemoryRouter>
      <Health />
    </MemoryRouter>
  );
}

beforeEach(() => {
  setOverview(null, null);
  setChecks(null);
  stubCI({ checks: [], lastRun: null });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Health page', () => {
  it('always renders one CI badge per known check name', async () => {
    renderHealth();

    await waitFor(() => {
      for (const name of EXPECTED_CHECK_NAMES) {
        expect(screen.getByText(name)).toBeDefined();
      }
    });
  });

  it('shows the connecting placeholder when overview has no data and no error', async () => {
    setOverview(null, null);
    renderHealth();

    await waitFor(() => expect(screen.getByText('Connecting to data stream...')).toBeDefined());
  });

  it('renders the health error message (not entropy) when health is an error result', async () => {
    setOverview({ health: { error: 'gather failed' } } as unknown as OverviewData);
    renderHealth();

    await waitFor(() => expect(screen.getByText('gather failed')).toBeDefined());
    // Entropy section is HealthData-only; an error result must not surface it.
    expect(screen.queryByText('Total Issues')).toBeNull();
  });

  it('renders the entropy section with a Fix It action when health has open issues', async () => {
    setOverview({ health: healthData({ totalIssues: 3, errors: 1, warnings: 2 }) } as OverviewData);
    renderHealth();

    await waitFor(() => expect(screen.getByText('Total Issues')).toBeDefined());
    expect(screen.getByText('Scan Details')).toBeDefined();
    // totalIssues > 0 gates the Fix It button (which needs a router via useNavigate).
    expect(screen.getByRole('button', { name: /fix it/i })).toBeDefined();
  });

  it('type-guards each check section: valid renders, error shows message, missing awaits scan', async () => {
    setOverview({ health: healthData() } as OverviewData);
    // security = valid data, perf = error result, arch = not yet scanned (null)
    setChecks(
      makeChecks({
        security: securityData,
        perf: { error: 'perf boom' } as unknown as PerfData,
        arch: null as unknown as ArchData,
      })
    );
    renderHealth();

    await waitFor(() => {
      // Valid SecurityData -> SecuritySection KPI (label unique to security)
      expect(screen.getByText('Files Scanned')).toBeDefined();
      // Error result -> its message is surfaced
      expect(screen.getByText('perf boom')).toBeDefined();
      // Null result -> awaiting-scan placeholder
      expect(screen.getByText('Awaiting first scan...')).toBeDefined();
    });
  });

  it('renders CI pass/fail state and a relative last-checked time from /api/ci', async () => {
    const now = new Date('2026-07-20T12:00:00.000Z').getTime();
    const lastRunIso = new Date(now - 90_000).toISOString(); // 90s ago -> "1m ago"
    vi.spyOn(Date, 'now').mockReturnValue(now);

    stubCI({
      checks: [{ name: 'validate', passed: true, errorCount: 0, warningCount: 0 }],
      lastRun: lastRunIso,
    });
    renderHealth();

    await waitFor(() => expect(screen.getByText('PASS')).toBeDefined());
    expect(screen.getByText('Last checked 1m ago')).toBeDefined();
  });
});
