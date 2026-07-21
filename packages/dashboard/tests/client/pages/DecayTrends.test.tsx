import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within, act } from '@testing-library/react';
import { DecayTrends } from '../../../src/client/pages/DecayTrends';

const DECAY_TRENDS_URL = '/api/decay-trends';
const HTTP_ERROR_STATUS = 503;

// Direction arrows the source maps each Direction to (see directionArrow()).
const ARROW_IMPROVING = '↓'; // down: fewer violations = better
const ARROW_DECLINING = '↑'; // up: more violations = worse
const ARROW_STABLE = '→'; // right: no change

type Direction = 'improving' | 'stable' | 'declining';
interface TrendLine {
  current: number;
  previous: number;
  delta: number;
  direction: Direction;
}
interface TrendResult {
  stability: TrendLine;
  categories: Record<string, TrendLine>;
  snapshotCount: number;
  from: string;
  to: string;
}

// Categories are intentionally NOT in |delta| order so the test proves the page
// re-sorts them (largest absolute delta first). All three Directions are present
// so the direction formatting (arrow + label) is exercised in one render.
const SORTED_TREND: TrendResult = {
  stability: { current: 82, previous: 75, delta: 7, direction: 'improving' },
  categories: {
    'god-object': { current: 3.0, previous: 8.0, delta: -5, direction: 'improving' },
    'circular-deps': { current: 12.0, previous: 0, delta: 12, direction: 'declining' },
    layering: { current: 5.0, previous: 5.0, delta: 0, direction: 'stable' },
  },
  snapshotCount: 6,
  from: '2026-01-01T00:00:00Z',
  to: '2026-07-01T00:00:00Z',
};

// Expected first-column (Category) text after the descending |delta| sort:
// circular-deps |12|, god-object |5|, layering |0|. formatCategory() also
// title-cases the hyphenated ids.
const EXPECTED_CATEGORY_ORDER = ['Circular Deps', 'God Object', 'Layering'];

const EMPTY_TREND: TrendResult = {
  stability: { current: 0, previous: 0, delta: 0, direction: 'stable' },
  categories: {},
  snapshotCount: 0,
  from: '',
  to: '',
};

type FetchResponse = { ok: boolean; status?: number; json: () => Promise<unknown> };
type Responder = () => Promise<FetchResponse>;

let responder: Responder;
let mockFetch: ReturnType<typeof vi.fn>;

function ok(body: unknown): FetchResponse {
  return { ok: true, status: 200, json: async () => body };
}

beforeEach(() => {
  responder = () => Promise.resolve(ok({ data: EMPTY_TREND }));
  mockFetch = vi.fn((url: string) => {
    if (url === DECAY_TRENDS_URL) return responder();
    return Promise.reject(new Error(`unexpected fetch: ${String(url)}`));
  });
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('DecayTrends page', () => {
  it('fetches decay trends from the API on mount', async () => {
    responder = () => Promise.resolve(ok({ data: SORTED_TREND }));
    render(<DecayTrends />);

    await screen.findByText('Stability Score');
    expect(mockFetch).toHaveBeenCalledWith(DECAY_TRENDS_URL);
  });

  it('shows the loading placeholder before the fetch resolves', async () => {
    let release!: (r: FetchResponse) => void;
    const pending = new Promise<FetchResponse>((resolve) => {
      release = resolve;
    });
    responder = () => pending;

    render(<DecayTrends />);
    expect(screen.getByText(/Loading decay trends/i)).toBeDefined();

    // Flush the pending update deterministically (no dangling act warning).
    await act(async () => {
      release(ok({ data: EMPTY_TREND }));
    });
    expect(await screen.findByText(/No architecture snapshots found/i)).toBeDefined();
  });

  it('surfaces the HTTP error message when the fetch is not ok', async () => {
    responder = () =>
      Promise.resolve({ ok: false, status: HTTP_ERROR_STATUS, json: async () => ({}) });
    render(<DecayTrends />);

    expect(await screen.findByText(`HTTP ${HTTP_ERROR_STATUS}`)).toBeDefined();
  });

  it('renders the empty state when no snapshots have been captured', async () => {
    responder = () => Promise.resolve(ok({ data: EMPTY_TREND }));
    render(<DecayTrends />);

    expect(await screen.findByText(/No architecture snapshots found/i)).toBeDefined();
    // The category table must not render in the empty branch.
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('renders KPI cards with direction-based formatting for the stability line', async () => {
    responder = () => Promise.resolve(ok({ data: SORTED_TREND }));
    render(<DecayTrends />);

    // Stability Score card shows the raw current score.
    const scoreLabel = await screen.findByText('Stability Score');
    expect(scoreLabel.parentElement?.textContent).toContain('82');

    // Trend Direction card maps 'improving' -> 'Improving'.
    const directionLabel = screen.getByText('Trend Direction');
    expect(directionLabel.parentElement?.textContent).toContain('Improving');

    // Score Delta card formats a positive delta with a sign and one decimal.
    const deltaLabel = screen.getByText('Score Delta');
    expect(deltaLabel.parentElement?.textContent).toContain('+7.0');
    expect(deltaLabel.parentElement?.textContent).toContain('Previous: 75');
  });

  it('sorts the category breakdown by absolute delta descending', async () => {
    responder = () => Promise.resolve(ok({ data: SORTED_TREND }));
    render(<DecayTrends />);

    const table = await screen.findByRole('table');
    const bodyRows = within(table.querySelector('tbody') as HTMLElement).getAllByRole('row');
    const renderedCategories = bodyRows.map(
      (row) => within(row).getAllByRole('cell')[0].textContent
    );

    expect(renderedCategories).toEqual(EXPECTED_CATEGORY_ORDER);
  });

  it('formats each category row with the direction arrow, label and delta', async () => {
    responder = () => Promise.resolve(ok({ data: SORTED_TREND }));
    render(<DecayTrends />);

    const table = await screen.findByRole('table');
    const bodyRows = within(table.querySelector('tbody') as HTMLElement).getAllByRole('row');

    // Row order is circular-deps (declining), god-object (improving), layering (stable).
    const decliningCells = within(bodyRows[0]).getAllByRole('cell');
    expect(decliningCells[2].textContent).toContain(ARROW_DECLINING);
    expect(decliningCells[2].textContent).toContain('Degrading');
    expect(decliningCells[3].textContent).toBe('+12.0');

    const improvingCells = within(bodyRows[1]).getAllByRole('cell');
    expect(improvingCells[2].textContent).toContain(ARROW_IMPROVING);
    expect(improvingCells[2].textContent).toContain('Improving');
    expect(improvingCells[3].textContent).toBe('-5.0');

    const stableCells = within(bodyRows[2]).getAllByRole('cell');
    expect(stableCells[2].textContent).toContain(ARROW_STABLE);
    expect(stableCells[2].textContent).toContain('Stable');
    expect(stableCells[3].textContent).toBe('0');
  });

  it('renders the no-category placeholder when snapshots exist but categories are empty', async () => {
    responder = () => Promise.resolve(ok({ data: { ...SORTED_TREND, categories: {} } }));
    render(<DecayTrends />);

    expect(await screen.findByText(/No category data yet/i)).toBeDefined();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('renders the header snapshot summary with a pluralized count and date range', async () => {
    responder = () => Promise.resolve(ok({ data: SORTED_TREND }));
    render(<DecayTrends />);

    expect(
      await screen.findByText(/6 snapshots analyzed from 2026-01-01 to 2026-07-01/)
    ).toBeDefined();
  });

  it('uses the singular noun when exactly one snapshot was analyzed', async () => {
    responder = () => Promise.resolve(ok({ data: { ...SORTED_TREND, snapshotCount: 1 } }));
    render(<DecayTrends />);

    expect(await screen.findByText(/1 snapshot analyzed/)).toBeDefined();
  });
});
