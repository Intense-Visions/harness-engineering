import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import { Impact } from '../../../src/client/pages/Impact';
import type { AnomalyData, BlastRadiusData } from '@shared/types';

// The blast-radius graph is a framer-motion SVG component with its own tests.
// Stub it so the Impact page's own responsibilities (wiring + header) are what we
// assert, and so rendering stays deterministic in jsdom (no animation frames).
vi.mock('../../../src/client/components/BlastRadiusGraph', () => ({
  BlastRadiusGraph: ({ data }: { data: { sourceName: string } }) => (
    <div data-testid="blast-graph">{data.sourceName}</div>
  ),
}));

// Depths mirror the source's DEFAULT_DEPTH and one of its DEPTH_OPTIONS.
const DEFAULT_DEPTH = 3;
const CHANGED_DEPTH = 5;
const ANOMALIES_HTTP_ERROR_STATUS = 503;

const ANOMALIES_URL = '/api/impact/anomalies';
const BLAST_RADIUS_URL = '/api/impact/blast-radius';

const EMPTY_ANOMALIES: AnomalyData = {
  outliers: [],
  articulationPoints: [],
  overlapCount: 0,
};

// Articulation points are intentionally NOT in dependentCount order so the test
// can prove the page re-sorts them (highest dependentCount first).
const SAMPLE_ANOMALIES: AnomalyData = {
  overlapCount: 0,
  articulationPoints: [
    { nodeId: 'a', name: 'Alpha', componentsIfRemoved: 2, dependentCount: 5 },
    { nodeId: 'b', name: 'Bravo', componentsIfRemoved: 3, dependentCount: 12 },
    { nodeId: 'c', name: 'Charlie', componentsIfRemoved: 1, dependentCount: 8 },
  ],
  outliers: [
    { nodeId: 'x', name: 'Xray', type: 'file', metric: 'loc', value: 100, zScore: 2.1 },
    { nodeId: 'y', name: 'Yankee', type: 'file', metric: 'loc', value: 200, zScore: 4.5 },
  ],
};

// Expected DOM order after the page's descending sorts.
const EXPECTED_AP_ORDER = ['Bravo', 'Charlie', 'Alpha']; // by dependentCount: 12, 8, 5
const EXPECTED_OUTLIER_ORDER = ['Yankee', 'Xray']; // by zScore: 4.5, 2.1

const SAMPLE_BLAST: BlastRadiusData = {
  sourceNodeId: 'b',
  sourceName: 'Bravo Service',
  layers: [
    {
      depth: 1,
      nodes: [{ nodeId: 'n1', name: 'Node1', type: 'file', probability: 0.9, parentId: 'b' }],
    },
  ],
  summary: { totalAffected: 1, maxDepth: 1, highRisk: 1, mediumRisk: 0, lowRisk: 0 },
};

type FetchResponse = { ok: boolean; status?: number; json: () => Promise<unknown> };
type Responder = () => Promise<FetchResponse>;

let anomaliesResponder: Responder;
let blastResponder: Responder;
let mockFetch: ReturnType<typeof vi.fn>;

function ok(body: unknown): FetchResponse {
  return { ok: true, status: 200, json: async () => body };
}

beforeEach(() => {
  anomaliesResponder = () => Promise.resolve(ok({ data: EMPTY_ANOMALIES }));
  blastResponder = () => Promise.resolve(ok({ data: SAMPLE_BLAST }));

  mockFetch = vi.fn((url: string) => {
    if (url === ANOMALIES_URL) return anomaliesResponder();
    if (url === BLAST_RADIUS_URL) return blastResponder();
    return Promise.reject(new Error(`unexpected fetch: ${String(url)}`));
  });
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function blastCalls() {
  return mockFetch.mock.calls.filter(([url]) => url === BLAST_RADIUS_URL);
}

describe('Impact Explorer page', () => {
  it('fetches anomalies on mount and renders articulation points sorted by dependentCount desc', async () => {
    anomaliesResponder = () => Promise.resolve(ok({ data: SAMPLE_ANOMALIES }));
    render(<Impact />);

    const heading = await screen.findByRole('heading', { name: /Articulation Points/i });
    const section = heading.closest('section') as HTMLElement;
    const rendered = within(section)
      .getAllByRole('button')
      .map((btn) => btn.textContent ?? '');

    EXPECTED_AP_ORDER.forEach((name, i) => {
      expect(rendered[i]).toContain(name);
    });
    expect(mockFetch).toHaveBeenCalledWith(ANOMALIES_URL);
  });

  it('renders statistical outliers sorted by zScore desc', async () => {
    anomaliesResponder = () => Promise.resolve(ok({ data: SAMPLE_ANOMALIES }));
    render(<Impact />);

    const heading = await screen.findByRole('heading', { name: /Statistical Outliers/i });
    const section = heading.closest('section') as HTMLElement;
    const rendered = within(section)
      .getAllByRole('button')
      .map((btn) => btn.textContent ?? '');

    EXPECTED_OUTLIER_ORDER.forEach((name, i) => {
      expect(rendered[i]).toContain(name);
    });
  });

  it('shows the empty state when anomalies come back with no APs and no outliers', async () => {
    anomaliesResponder = () => Promise.resolve(ok({ data: EMPTY_ANOMALIES }));
    render(<Impact />);

    expect(await screen.findByText(/No anomalies detected/i)).toBeDefined();
  });

  it('surfaces an HTTP error message when the anomalies fetch is not ok', async () => {
    anomaliesResponder = () =>
      Promise.resolve({ ok: false, status: ANOMALIES_HTTP_ERROR_STATUS, json: async () => ({}) });
    render(<Impact />);

    expect(await screen.findByText(`HTTP ${ANOMALIES_HTTP_ERROR_STATUS}`)).toBeDefined();
  });

  it('shows the loading placeholder before anomalies resolve', async () => {
    let release!: (r: FetchResponse) => void;
    const pending = new Promise<FetchResponse>((resolve) => {
      release = resolve;
    });
    anomaliesResponder = () => pending;

    render(<Impact />);
    expect(screen.getByText(/Loading anomalies/i)).toBeDefined();

    // Resolve to flush the pending update deterministically (no dangling act warning).
    await act(async () => {
      release(ok({ data: EMPTY_ANOMALIES }));
    });
    expect(await screen.findByText(/No anomalies detected/i)).toBeDefined();
  });

  it('shows the idle blast-radius prompt when nothing is selected', async () => {
    render(<Impact />);
    expect(await screen.findByText(/Select a node or search to view blast radius/i)).toBeDefined();
  });

  it('clicking an anomaly POSTs a blast-radius query with the node id and default depth', async () => {
    anomaliesResponder = () => Promise.resolve(ok({ data: SAMPLE_ANOMALIES }));
    render(<Impact />);

    const bravo = await screen.findByRole('button', { name: /Bravo/ });
    fireEvent.click(bravo);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        BLAST_RADIUS_URL,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ nodeId: 'b', maxDepth: DEFAULT_DEPTH }),
        })
      );
    });

    // Success branch renders the source name header + passes data to the graph.
    expect(await screen.findByText(/Blast Radius: Bravo Service/)).toBeDefined();
    expect(screen.getByTestId('blast-graph').textContent).toBe('Bravo Service');
  });

  it('search submit queries blast-radius using the trimmed text and selected depth', async () => {
    render(<Impact />);
    // Wait for the initial anomalies load to settle before interacting.
    await screen.findByText(/Select a node or search to view blast radius/i);

    const input = screen.getByPlaceholderText(/Search node by name/i);
    fireEvent.change(input, { target: { value: '  src/core/engine.ts  ' } });

    const depthSelect = screen.getByRole('combobox');
    fireEvent.change(depthSelect, { target: { value: String(CHANGED_DEPTH) } });

    fireEvent.submit(input.closest('form') as HTMLFormElement);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        BLAST_RADIUS_URL,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ nodeId: 'src/core/engine.ts', maxDepth: CHANGED_DEPTH }),
        })
      );
    });
  });

  it('does not query blast-radius when the search text is only whitespace', async () => {
    render(<Impact />);
    await screen.findByText(/Select a node or search to view blast radius/i);

    const input = screen.getByPlaceholderText(/Search node by name/i);
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.submit(input.closest('form') as HTMLFormElement);

    await Promise.resolve();
    expect(blastCalls()).toHaveLength(0);
  });

  it('renders the blast-radius error branch when the query returns not ok', async () => {
    anomaliesResponder = () => Promise.resolve(ok({ data: SAMPLE_ANOMALIES }));
    blastResponder = () =>
      Promise.resolve({
        ok: false,
        status: 500,
        json: async () => ({ error: 'graph unavailable' }),
      });
    render(<Impact />);

    const bravo = await screen.findByRole('button', { name: /Bravo/ });
    fireEvent.click(bravo);

    expect(await screen.findByText('graph unavailable')).toBeDefined();
  });

  it('renders the no-data branch when a successful query returns an inner error payload', async () => {
    anomaliesResponder = () => Promise.resolve(ok({ data: SAMPLE_ANOMALIES }));
    blastResponder = () => Promise.resolve(ok({ data: { error: 'Node not found' } }));
    render(<Impact />);

    const bravo = await screen.findByRole('button', { name: /Bravo/ });
    fireEvent.click(bravo);

    expect(await screen.findByText('Node not found')).toBeDefined();
    expect(screen.queryByTestId('blast-graph')).toBeNull();
  });
});
