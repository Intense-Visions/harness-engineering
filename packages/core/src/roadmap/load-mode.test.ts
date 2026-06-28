import { describe, it, expect } from 'vitest';
import { detectRoadmapStorageMode } from './load-mode';

describe('detectRoadmapStorageMode', () => {
  const root = '/proj';

  it('reports sharded when docs/roadmap.d exists', () => {
    const exists = (t: string) => t === '/proj/docs/roadmap.d';
    expect(detectRoadmapStorageMode(root, exists)).toBe('sharded');
  });

  it('reports monolith when only the aggregate exists', () => {
    const exists = (t: string) => t === '/proj/docs/roadmap.md';
    expect(detectRoadmapStorageMode(root, exists)).toBe('monolith');
  });

  it('reports monolith when neither exists', () => {
    expect(detectRoadmapStorageMode(root, () => false)).toBe('monolith');
  });
});
