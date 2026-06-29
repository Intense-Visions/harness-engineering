import { describe, it, expect } from 'vitest';
import { projectLanes } from '../../../../src/state/event-sourcing/projections/lanes';
import type { Event } from '../../../../src/state/event-sourcing/events';

const env = (seq: number) => ({
  seq,
  writerId: 'w-1',
  timestamp: `2026-06-27T00:00:0${seq}.000Z`,
  scope: { stream: undefined, session: undefined },
});

const registered = (seq: number, taskId: string, dependsOn: string[] = []): Event =>
  ({ ...env(seq), type: 'task_registered', payload: { taskId, dependsOn } }) as Event;

const transitioned = (seq: number, taskId: string, from: string, to: string): Event =>
  ({ ...env(seq), type: 'lane_transitioned', payload: { taskId, from, to } }) as Event;

describe('projectLanes', () => {
  it('seeds a registered task at planned with its dependsOn', () => {
    const lanes = projectLanes([registered(1, 't1', ['t0'])]);
    expect(lanes.tasks.t1).toEqual({
      taskId: 't1',
      lane: 'planned',
      dependsOn: ['t0'],
      history: [],
    });
  });

  it('applies a transition: current lane = last transition, history ordered', () => {
    const events = [registered(1, 't1', ['t0']), transitioned(2, 't1', 'planned', 'claimed')];
    const lanes = projectLanes(events);
    expect(lanes.tasks.t1.lane).toBe('claimed');
    expect(lanes.tasks.t1.history).toHaveLength(1);
    expect(lanes.tasks.t1.history[0]).toMatchObject({
      from: 'planned',
      to: 'claimed',
      seq: 2,
      timestamp: '2026-06-27T00:00:02.000Z',
    });
  });

  it('is order-independent (sorts internally by seq,writerId)', () => {
    const ordered = [
      registered(1, 't1'),
      transitioned(2, 't1', 'planned', 'claimed'),
      transitioned(3, 't1', 'claimed', 'in_progress'),
    ];
    const shuffled = [ordered[2], ordered[0], ordered[1]];
    expect(projectLanes(shuffled)).toEqual(projectLanes(ordered));
    expect(projectLanes(shuffled).tasks.t1.lane).toBe('in_progress');
  });

  it('returns an empty projection for no events', () => {
    expect(projectLanes([])).toEqual({ tasks: {} });
  });
});
