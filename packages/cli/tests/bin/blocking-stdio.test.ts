import { describe, it, expect, vi } from 'vitest';
import { makeStdioPipesBlocking } from '../../src/bin/blocking-stdio';

function pipe(ret = 0) {
  const setBlocking = vi.fn(() => ret);
  return { stream: { _type: 'pipe', _handle: { setBlocking } }, setBlocking };
}

describe('makeStdioPipesBlocking (#2254)', () => {
  it('switches pipe handles to blocking mode', () => {
    const a = pipe();
    const b = pipe();
    expect(makeStdioPipesBlocking([a.stream, b.stream])).toBe(2);
    expect(a.setBlocking).toHaveBeenCalledWith(true);
    expect(b.setBlocking).toHaveBeenCalledWith(true);
  });

  it('leaves files and TTYs alone (already synchronous)', () => {
    const fileHandle = { setBlocking: vi.fn(() => 0) };
    const ttyHandle = { setBlocking: vi.fn(() => 0) };
    const n = makeStdioPipesBlocking([
      { _type: 'fs' },
      { _type: 'fs', _handle: fileHandle },
      { _type: 'tty', _handle: ttyHandle },
    ]);
    expect(n).toBe(0);
    expect(fileHandle.setBlocking).not.toHaveBeenCalled();
    expect(ttyHandle.setBlocking).not.toHaveBeenCalled();
  });

  it('tolerates a missing handle, a missing method, a failure code and a throw', () => {
    const failing = pipe(-22);
    const throwing = {
      _type: 'pipe',
      _handle: {
        setBlocking: () => {
          throw new Error('boom');
        },
      },
    };
    const n = makeStdioPipesBlocking([
      undefined,
      null,
      { _type: 'pipe' },
      { _type: 'pipe', _handle: null },
      { _type: 'pipe', _handle: {} },
      failing.stream,
      throwing,
    ]);
    expect(n).toBe(0);
    expect(failing.setBlocking).toHaveBeenCalledWith(true);
  });
});
