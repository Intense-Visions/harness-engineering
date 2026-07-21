import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import type { MilestoneProgress } from '@shared/types';
import { ProgressChart } from '../../../src/client/components/ProgressChart';
import { STATUS_COLOR } from '../../../src/client/utils/statusColors';

// Geometry constants mirrored from the component under test so expected
// values are derived, not pasted as magic numbers.
const LABEL_WIDTH = 140;
const CHART_WIDTH = 480;
const BAR_AREA_WIDTH = CHART_WIDTH - LABEL_WIDTH; // 340
const BAR_HEIGHT = 20;
const TRACK_COLOR = '#18181b';

function milestone(overrides: Partial<MilestoneProgress> = {}): MilestoneProgress {
  return {
    name: 'Alpha',
    isBacklog: false,
    total: 0,
    done: 0,
    inProgress: 0,
    planned: 0,
    blocked: 0,
    backlog: 0,
    needsHuman: 0,
    ...overrides,
  };
}

/** Segment rects are the stacked bars: every <rect> whose fill is a status color. */
function segmentRects(container: HTMLElement): SVGRectElement[] {
  const colors = new Set(Object.values(STATUS_COLOR));
  return Array.from(container.querySelectorAll('rect')).filter((r) =>
    colors.has(r.getAttribute('fill') ?? '')
  ) as SVGRectElement[];
}

describe('ProgressChart', () => {
  it('renders nothing when there are no non-backlog milestones', () => {
    const { container } = render(<ProgressChart milestones={[]} />);
    expect(container.querySelector('svg')).toBeNull();
  });

  it('renders nothing when every milestone is a backlog row', () => {
    const { container } = render(
      <ProgressChart milestones={[milestone({ isBacklog: true, total: 5, done: 5 })]} />
    );
    expect(container.querySelector('svg')).toBeNull();
  });

  it('excludes backlog milestones from the rendered rows but keeps real ones', () => {
    const { container, getByText } = render(
      <ProgressChart
        milestones={[
          milestone({ name: 'Real', total: 3, done: 3 }),
          milestone({ name: 'Backlog', isBacklog: true, total: 9, done: 9 }),
        ]}
      />
    );
    // One background track rect (fill=TRACK_COLOR) per rendered row.
    const tracks = Array.from(container.querySelectorAll('rect')).filter(
      (r) => r.getAttribute('fill') === TRACK_COLOR
    );
    expect(tracks).toHaveLength(1);
    // The real milestone's label is present; the backlog one is not.
    expect(getByText('Real')).toBeTruthy();
    expect(container.textContent).not.toContain('Backlog');
  });

  it('omits zero-value status segments and keeps only non-empty ones', () => {
    // done + inProgress + planned are non-zero; blocked + needsHuman are zero.
    const { container } = render(
      <ProgressChart milestones={[milestone({ total: 4, done: 2, inProgress: 1, planned: 1 })]} />
    );
    const segments = segmentRects(container);
    expect(segments).toHaveLength(3);
    const fills = segments.map((s) => s.getAttribute('fill'));
    expect(fills).toEqual([
      STATUS_COLOR['done'],
      STATUS_COLOR['in-progress'],
      STATUS_COLOR['planned'],
    ]);
    // No segment carries the blocked or needs-human color.
    expect(fills).not.toContain(STATUS_COLOR['blocked']);
    expect(fills).not.toContain(STATUS_COLOR['needs-human']);
  });

  it('computes cumulative x offsets and proportional widths for stacked segments', () => {
    const maxTotal = 4;
    const { container } = render(
      <ProgressChart
        milestones={[milestone({ total: maxTotal, done: 2, inProgress: 1, planned: 1 })]}
      />
    );
    const [doneSeg, inProgSeg, plannedSeg] = segmentRects(container);
    const unit = BAR_AREA_WIDTH / maxTotal; // width per single item

    // done: starts at the bar origin, width = 2 units.
    expect(Number(doneSeg.getAttribute('x'))).toBeCloseTo(LABEL_WIDTH);
    expect(Number(doneSeg.getAttribute('width'))).toBeCloseTo(2 * unit);
    // in-progress: offset by the 2 done items, width = 1 unit.
    expect(Number(inProgSeg.getAttribute('x'))).toBeCloseTo(LABEL_WIDTH + 2 * unit);
    expect(Number(inProgSeg.getAttribute('width'))).toBeCloseTo(unit);
    // planned: offset by the 3 preceding items, width = 1 unit.
    expect(Number(plannedSeg.getAttribute('x'))).toBeCloseTo(LABEL_WIDTH + 3 * unit);
    expect(Number(plannedSeg.getAttribute('width'))).toBeCloseTo(unit);
    // Every segment is a full bar-height tall.
    for (const seg of [doneSeg, inProgSeg, plannedSeg]) {
      expect(Number(seg.getAttribute('height'))).toBe(BAR_HEIGHT);
    }
  });

  it('merges planned and backlog counts into the single planned-colored segment', () => {
    const { container } = render(
      <ProgressChart milestones={[milestone({ total: 4, planned: 1, backlog: 3 })]} />
    );
    const segments = segmentRects(container);
    // Only the planned-colored segment renders; its width covers planned+backlog=4 items.
    expect(segments).toHaveLength(1);
    expect(segments[0].getAttribute('fill')).toBe(STATUS_COLOR['planned']);
    expect(Number(segments[0].getAttribute('width'))).toBeCloseTo(BAR_AREA_WIDTH);
  });

  it('renders a done/total summary label for each row', () => {
    const { getByText } = render(
      <ProgressChart milestones={[milestone({ total: 5, done: 3, inProgress: 2 })]} />
    );
    expect(getByText('3/5')).toBeTruthy();
  });

  it('truncates milestone names longer than 18 characters with an ellipsis', () => {
    const longName = 'MilestoneNameThatIsQuiteLong'; // 28 chars
    const { getByText } = render(
      <ProgressChart milestones={[milestone({ name: longName, total: 1, done: 1 })]} />
    );
    // slice(0, 17) + '…'
    expect(getByText(longName.slice(0, 17) + '…')).toBeTruthy();
  });

  it('renders a legend entry for every status color', () => {
    const { container } = render(<ProgressChart milestones={[milestone({ total: 1, done: 1 })]} />);
    const swatches = container.querySelectorAll('span.rounded-sm');
    expect(swatches).toHaveLength(Object.keys(STATUS_COLOR).length);
    // Hyphenated status labels are humanized in the legend text.
    expect(container.textContent).toContain('in progress');
    expect(container.textContent).toContain('needs human');
  });
});
