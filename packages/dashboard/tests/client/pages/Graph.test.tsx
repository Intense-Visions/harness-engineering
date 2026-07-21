/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { GraphData, GraphUnavailable, NodeTypeCount } from '../../../src/shared/types';

// Graph reads its state exclusively from useSSE(SSE_ENDPOINT, 'overview').
// A mutable holder lets each test drive a specific SSE snapshot deterministically,
// with no real EventSource / network.
type SSEState = {
  data: unknown;
  lastUpdated: string | null;
  stale: boolean;
  error: string | null;
};

const sse = vi.hoisted(() => ({
  current: { data: null, lastUpdated: null, stale: false, error: null } as SSEState,
}));

vi.mock('../../../src/client/hooks/useSSE', () => ({
  useSSE: () => sse.current,
}));

import { Graph } from '../../../src/client/pages/Graph';

function setSSE(partial: Partial<SSEState>) {
  sse.current = { data: null, lastUpdated: null, stale: false, error: null, ...partial };
}

// Node types intentionally out of count order so the table's descending sort is observable.
const NODES_BY_TYPE: NodeTypeCount[] = [
  { type: 'directory', count: 30 },
  { type: 'file', count: 120 },
  { type: 'symbol', count: 50 },
];
const NODE_COUNT = 200;
const EDGE_COUNT = 640;

const GRAPH_DATA: GraphData = {
  available: true,
  nodeCount: NODE_COUNT,
  edgeCount: EDGE_COUNT,
  nodesByType: NODES_BY_TYPE,
};

// Expected row order + percentages derived from the data under test (source of truth),
// not hardcoded, so they track NODES_BY_TYPE / NODE_COUNT rather than drifting silently.
const EXPECTED_ROWS = [...NODES_BY_TYPE]
  .sort((a, b) => b.count - a.count)
  .map((n) => ({
    type: n.type,
    count: String(n.count),
    pct: `${((n.count / NODE_COUNT) * 100).toFixed(1)}%`,
  }));

function kpiValueFor(label: string): string {
  const labelEl = screen.getByText(label);
  const card = labelEl.parentElement as HTMLElement;
  // The value <p> is the sibling of the label <p> within the KpiCard container.
  const value = within(card)
    .getAllByText((_, el) => el?.tagName === 'P')
    .map((el) => el.textContent)
    .filter((t) => t !== label);
  return value[0] ?? '';
}

beforeEach(() => {
  setSSE({});
});

describe('Graph page', () => {
  it('always renders the Knowledge Graph header', () => {
    setSSE({ data: { graph: GRAPH_DATA }, lastUpdated: '2026-07-20T00:00:00Z' });
    render(<Graph />);
    expect(screen.getByRole('heading', { level: 1, name: 'Knowledge Graph' })).toBeDefined();
  });

  it('shows the connecting placeholder when there is no data and no error', () => {
    setSSE({ data: null, error: null });
    render(<Graph />);
    expect(screen.getByText(/Connecting to data stream/i)).toBeDefined();
    expect(screen.queryByText(/Graph not connected/i)).toBeNull();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('does not show the connecting placeholder once an error is present', () => {
    setSSE({ data: null, error: 'boom' });
    render(<Graph />);
    expect(screen.queryByText(/Connecting to data stream/i)).toBeNull();
  });

  it('renders the not-connected fallback with the reason when the graph is unavailable', () => {
    const unavailable: GraphUnavailable = { available: false, reason: 'graph db missing' };
    setSSE({ data: { graph: unavailable }, lastUpdated: '2026-07-20T00:00:00Z' });
    render(<Graph />);

    expect(screen.getByText(/Graph not connected/i)).toBeDefined();
    expect(screen.getByText('graph db missing')).toBeDefined();
    // Fallback replaces the metrics view entirely.
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByText(/Graph Metrics/i)).toBeNull();
  });

  it('renders the KPI cards from graph metrics', () => {
    setSSE({ data: { graph: GRAPH_DATA }, lastUpdated: '2026-07-20T00:00:00Z' });
    render(<Graph />);

    expect(kpiValueFor('Nodes')).toBe(String(NODE_COUNT));
    expect(kpiValueFor('Edges')).toBe(String(EDGE_COUNT));
    expect(kpiValueFor('Node Types')).toBe(String(NODES_BY_TYPE.length));
  });

  it('renders the node-type breakdown sorted by count desc with computed percentages', () => {
    setSSE({ data: { graph: GRAPH_DATA }, lastUpdated: '2026-07-20T00:00:00Z' });
    render(<Graph />);

    const table = screen.getByRole('table');
    const bodyRows = within(table).getAllByRole('row').slice(1); // drop the header row

    expect(bodyRows).toHaveLength(EXPECTED_ROWS.length);
    bodyRows.forEach((row, i) => {
      const cells = within(row)
        .getAllByRole('cell')
        .map((c) => c.textContent);
      expect(cells).toEqual([EXPECTED_ROWS[i].type, EXPECTED_ROWS[i].count, EXPECTED_ROWS[i].pct]);
    });
  });

  it('renders 0% percentages when the node count is zero', () => {
    const zeroCount: GraphData = {
      available: true,
      nodeCount: 0,
      edgeCount: 0,
      nodesByType: [{ type: 'file', count: 3 }],
    };
    setSSE({ data: { graph: zeroCount }, lastUpdated: '2026-07-20T00:00:00Z' });
    render(<Graph />);

    const row = within(screen.getByRole('table')).getAllByRole('row')[1];
    const cells = within(row)
      .getAllByRole('cell')
      .map((c) => c.textContent);
    expect(cells).toEqual(['file', '3', '0%']);
  });

  it('omits the breakdown table when there are no node types', () => {
    const noTypes: GraphData = {
      available: true,
      nodeCount: NODE_COUNT,
      edgeCount: EDGE_COUNT,
      nodesByType: [],
    };
    setSSE({ data: { graph: noTypes }, lastUpdated: '2026-07-20T00:00:00Z' });
    render(<Graph />);

    // KPI cards still render, but the breakdown section is suppressed.
    expect(kpiValueFor('Node Types')).toBe('0');
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByText(/Node Type Breakdown/i)).toBeNull();
  });

  it('shows neither metrics nor the not-connected fallback while only connecting', () => {
    setSSE({ data: null, error: null });
    render(<Graph />);
    expect(screen.queryByText(/Graph Metrics/i)).toBeNull();
    expect(screen.queryByText(/Graph not connected/i)).toBeNull();
  });
});
