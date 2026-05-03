import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import {
  GraphImpactView,
  parseGraphImpactResult,
} from '../../../../src/client/components/chat/GraphImpactView';

const sampleImpact = {
  targetNodeId: 'file:src/auth/login.ts',
  impact: {
    tests: [{ id: 'test:login.spec.ts', type: 'test_result', name: 'login.spec.ts' }],
    code: [
      { id: 'file:src/auth/session.ts', type: 'file', name: 'session.ts' },
      { id: 'file:src/api/login.ts', type: 'file', name: 'login.ts' },
    ],
    docs: [],
    other: [],
  },
  stats: { nodesVisited: 12, edgesTraversed: 18, maxDepthReached: 3 },
};

const sampleBlast = {
  mode: 'compact',
  sourceNodeId: 'file:src/db/users.ts',
  sourceName: 'users.ts',
  topRisks: [
    {
      id: 'file:src/api/users.ts',
      type: 'file',
      name: 'api/users.ts',
      cumulativeProbability: 0.85,
      depth: 1,
    },
    {
      id: 'file:src/api/orders.ts',
      type: 'file',
      name: 'api/orders.ts',
      cumulativeProbability: 0.42,
      depth: 2,
    },
  ],
  summary: { totalAffected: 8, maxDepth: 3, meanProbability: 0.35 },
};

describe('parseGraphImpactResult', () => {
  it('detects an impact payload', () => {
    const parsed = parseGraphImpactResult(JSON.stringify(sampleImpact));
    expect(parsed?.kind).toBe('impact');
  });

  it('detects a blast-radius payload', () => {
    const parsed = parseGraphImpactResult(JSON.stringify(sampleBlast));
    expect(parsed?.kind).toBe('blast');
  });

  it('strips the envelope comment', () => {
    const raw = `<!-- packed: structural | 100→50 tokens -->\n${JSON.stringify(sampleImpact)}`;
    expect(parseGraphImpactResult(raw)?.kind).toBe('impact');
  });

  it('returns null for unrelated JSON', () => {
    expect(parseGraphImpactResult(JSON.stringify({ foo: 'bar' }))).toBeNull();
  });
});

describe('GraphImpactView', () => {
  it('renders the impact view with category sections', () => {
    const parsed = parseGraphImpactResult(JSON.stringify(sampleImpact))!;
    render(<GraphImpactView payload={parsed} />);

    expect(screen.getByText(/Tests/)).toBeDefined();
    expect(screen.getByText(/Code/)).toBeDefined();
    expect(screen.getByText('3 affected')).toBeDefined();
    expect(screen.getByText('login.spec.ts')).toBeDefined();
  });

  it('renders the blast-radius view with probability bars', () => {
    const parsed = parseGraphImpactResult(JSON.stringify(sampleBlast))!;
    render(<GraphImpactView payload={parsed} />);

    expect(screen.getByText('users.ts')).toBeDefined();
    expect(screen.getByText('api/users.ts')).toBeDefined();
    expect(screen.getByText('85%')).toBeDefined();
    expect(screen.getByText('42%')).toBeDefined();
    expect(screen.getByText('8 affected')).toBeDefined();
  });
});
