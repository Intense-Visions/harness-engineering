import { describe, it, expect } from 'vitest';
import { getRoadmapMode, type RoadmapMode } from '../../src/roadmap/mode';

describe('getRoadmapMode', () => {
  it('returns "file-backed" when config is undefined', () => {
    expect(getRoadmapMode(undefined)).toBe('file-backed');
  });
  it('returns "file-backed" when config is null', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(getRoadmapMode(null as any)).toBe('file-backed');
  });
  it('returns "file-backed" when roadmap field is absent', () => {
    expect(getRoadmapMode({})).toBe('file-backed');
  });
  it('returns "file-backed" when roadmap.mode is absent', () => {
    expect(getRoadmapMode({ roadmap: {} })).toBe('file-backed');
  });
  it('returns "file-backed" when roadmap.mode is "file-backed"', () => {
    expect(getRoadmapMode({ roadmap: { mode: 'file-backed' } })).toBe('file-backed');
  });
  it('returns "file-less" when roadmap.mode is "file-less"', () => {
    expect(getRoadmapMode({ roadmap: { mode: 'file-less' } })).toBe('file-less');
  });
  it('returns "file-backed" for malformed mode (defensive)', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(getRoadmapMode({ roadmap: { mode: 'whatever' as any } })).toBe('file-backed');
  });
  it('return type narrows to RoadmapMode literal union', () => {
    const m: RoadmapMode = getRoadmapMode({ roadmap: { mode: 'file-less' } });
    expect(['file-backed', 'file-less']).toContain(m);
  });
});
