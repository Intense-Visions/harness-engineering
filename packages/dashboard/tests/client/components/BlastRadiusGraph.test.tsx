import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  classifyRisk,
  clampOpacity,
  computeBlastRadiusLayout,
  RISK_COLORS,
  BlastRadiusGraph,
} from '../../../src/client/components/BlastRadiusGraph';
import type { BlastRadiusData } from '../../../src/shared/types';

// --- Test fixtures ---
function makeTestData(overrides?: Partial<BlastRadiusData>): BlastRadiusData {
  return {
    sourceNodeId: 'src-1',
    sourceName: 'core/utils.ts',
    layers: [
      {
        depth: 1,
        nodes: [
          { nodeId: 'a', name: 'moduleA', type: 'file', probability: 0.9, parentId: 'src-1' },
          { nodeId: 'b', name: 'moduleB', type: 'file', probability: 0.5, parentId: 'src-1' },
        ],
      },
      {
        depth: 2,
        nodes: [{ nodeId: 'c', name: 'moduleC', type: 'file', probability: 0.2, parentId: 'a' }],
      },
    ],
    summary: {
      totalAffected: 3,
      maxDepth: 2,
      highRisk: 1,
      mediumRisk: 1,
      lowRisk: 1,
    },
    ...overrides,
  };
}

describe('classifyRisk', () => {
  it('returns high for probability > 0.7', () => {
    expect(classifyRisk(0.71)).toBe('high');
    expect(classifyRisk(1.0)).toBe('high');
  });

  it('returns medium for probability 0.3-0.7', () => {
    expect(classifyRisk(0.3)).toBe('medium');
    expect(classifyRisk(0.5)).toBe('medium');
    expect(classifyRisk(0.7)).toBe('medium');
  });

  it('returns low for probability < 0.3', () => {
    expect(classifyRisk(0.29)).toBe('low');
    expect(classifyRisk(0.0)).toBe('low');
  });
});

describe('clampOpacity', () => {
  it('clamps low values to 0.15 minimum', () => {
    expect(clampOpacity(0.0)).toBe(0.15);
    expect(clampOpacity(0.1)).toBe(0.15);
  });

  it('passes through values in range', () => {
    expect(clampOpacity(0.5)).toBe(0.5);
    expect(clampOpacity(1.0)).toBe(1.0);
  });

  it('clamps values above 1.0', () => {
    expect(clampOpacity(1.5)).toBe(1);
  });
});

describe('computeBlastRadiusLayout', () => {
  it('returns null for empty layers', () => {
    const data = makeTestData({ layers: [] });
    expect(computeBlastRadiusLayout(data)).toBeNull();
  });

  it('creates source node plus all layer nodes', () => {
    const data = makeTestData();
    const layout = computeBlastRadiusLayout(data)!;
    // 1 source + 2 depth-1 + 1 depth-2 = 4
    expect(layout.nodes).toHaveLength(4);
  });

  it('source node is at column 0', () => {
    const data = makeTestData();
    const layout = computeBlastRadiusLayout(data)!;
    expect(layout.sourceNode.x).toBe(layout.nodes[0]!.x);
    expect(layout.sourceNode.nodeId).toBe('src-1');
  });

  it('depth-1 nodes are in column 1 (offset by COL_GAP)', () => {
    const data = makeTestData();
    const layout = computeBlastRadiusLayout(data)!;
    const depth1Nodes = layout.nodes.filter((n) => n.nodeId === 'a' || n.nodeId === 'b');
    expect(depth1Nodes).toHaveLength(2);
    // All depth-1 nodes share the same x
    const x = depth1Nodes[0]!.x;
    expect(depth1Nodes[1]!.x).toBe(x);
    // Must be greater than source x
    expect(x).toBeGreaterThan(layout.sourceNode.x);
  });

  it('creates edges from parentId to nodeId', () => {
    const data = makeTestData();
    const layout = computeBlastRadiusLayout(data)!;
    expect(layout.edges).toHaveLength(3); // a->src-1, b->src-1, c->a
    expect(layout.edges).toContainEqual({ fromId: 'src-1', toId: 'a' });
    expect(layout.edges).toContainEqual({ fromId: 'src-1', toId: 'b' });
    expect(layout.edges).toContainEqual({ fromId: 'a', toId: 'c' });
  });

  it('assigns risk levels based on probability', () => {
    const data = makeTestData();
    const layout = computeBlastRadiusLayout(data)!;
    const nodeA = layout.nodes.find((n) => n.nodeId === 'a')!;
    const nodeB = layout.nodes.find((n) => n.nodeId === 'b')!;
    const nodeC = layout.nodes.find((n) => n.nodeId === 'c')!;
    expect(nodeA.risk).toBe('high'); // 0.9
    expect(nodeB.risk).toBe('medium'); // 0.5
    expect(nodeC.risk).toBe('low'); // 0.2
  });

  it('computes positive width and height', () => {
    const data = makeTestData();
    const layout = computeBlastRadiusLayout(data)!;
    expect(layout.width).toBeGreaterThan(0);
    expect(layout.height).toBeGreaterThan(0);
  });
});

describe('RISK_COLORS', () => {
  it('has all three risk levels', () => {
    expect(RISK_COLORS.high).toBe('#ef4444');
    expect(RISK_COLORS.medium).toBe('#f59e0b');
    expect(RISK_COLORS.low).toBe('#6b7280');
  });
});

describe('BlastRadiusGraph component', () => {
  it('renders "No affected nodes" when layers are empty', () => {
    const data = makeTestData({ layers: [] });
    render(<BlastRadiusGraph data={data} />);
    expect(screen.getByText('No affected nodes')).toBeDefined();
  });

  it('renders an SVG element when layers have nodes', () => {
    const data = makeTestData();
    const { container } = render(<BlastRadiusGraph data={data} />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
  });

  it('renders summary bar with risk counts', () => {
    const data = makeTestData();
    render(<BlastRadiusGraph data={data} />);
    expect(screen.getByText('Total Affected')).toBeDefined();
    expect(screen.getByText('High Risk')).toBeDefined();
    expect(screen.getByText('Medium Risk')).toBeDefined();
    expect(screen.getByText('Low Risk')).toBeDefined();
  });

  it('renders depth labels', () => {
    const data = makeTestData();
    const { container } = render(<BlastRadiusGraph data={data} />);
    const texts = Array.from(container.querySelectorAll('text'));
    const depthTexts = texts.filter((t) => t.textContent?.startsWith('Depth'));
    expect(depthTexts).toHaveLength(2); // Depth 1, Depth 2
  });

  it('renders source label', () => {
    const data = makeTestData();
    const { container } = render(<BlastRadiusGraph data={data} />);
    const texts = Array.from(container.querySelectorAll('text'));
    const sourceLabel = texts.find((t) => t.textContent === 'Source');
    expect(sourceLabel).toBeDefined();
  });

  it('renders node rectangles for each node', () => {
    const data = makeTestData();
    const { container } = render(<BlastRadiusGraph data={data} />);
    // 1 source + 2 depth-1 + 1 depth-2 = 4 nodes, each with a rect
    const rects = container.querySelectorAll('rect');
    expect(rects.length).toBe(4);
  });

  it('renders edges as lines', () => {
    const data = makeTestData();
    const { container } = render(<BlastRadiusGraph data={data} />);
    const lines = container.querySelectorAll('line');
    expect(lines.length).toBe(3); // 3 edges
  });
});
