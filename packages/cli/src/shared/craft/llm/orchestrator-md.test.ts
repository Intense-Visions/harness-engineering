import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as path from 'node:path';
import { findOrchestratorMd, readBackendsFromOrchestratorMd } from './orchestrator-md.js';

/**
 * Unit contract for the synchronous orchestrator.md fallback reader. Pins the
 * CURRENT behavior of:
 *   - `findOrchestratorMd`: walks up from `startDir` and returns the first
 *     ancestor containing `harness.orchestrator.md`, or null at/above root.
 *   - `readBackendsFromOrchestratorMd`: extracts `agent.backends` from the YAML
 *     frontmatter, returning null on any bad/missing input.
 *
 * Fully hermetic: every `node:fs` call the SUT makes is mocked, so there is no
 * real IO. `node:path` and the real `yaml` parser are exercised directly, so
 * assertions reflect real observable behavior rather than implementation
 * trivia. Absolute paths are built from the platform root so the walk-up logic
 * is deterministic on POSIX and Windows alike.
 */

const h = vi.hoisted(() => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));

vi.mock('node:fs', () => ({
  existsSync: h.existsSync,
  readFileSync: h.readFileSync,
}));

const FILENAME = 'harness.orchestrator.md';

// Platform-appropriate absolute root (`/` on POSIX, e.g. `C:\` on Windows) so
// the walk-up terminates at the real filesystem root the SUT computes.
const ROOT = path.parse(path.resolve('.')).root;
const START_DIR = path.join(ROOT, 'a', 'b', 'c');
// The orchestrator.md lives two ancestors above START_DIR.
const FOUND_AT = path.join(ROOT, 'a', FILENAME);

/** Frontmatter helper: wraps a YAML body in `---` fences plus a markdown body. */
function frontmatter(yamlBody: string): string {
  return `---\n${yamlBody}\n---\n\n# Orchestrator\n`;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('findOrchestratorMd', () => {
  it('returns the first ancestor containing harness.orchestrator.md', () => {
    h.existsSync.mockImplementation((p: string) => p === FOUND_AT);

    expect(findOrchestratorMd(START_DIR)).toBe(FOUND_AT);
  });

  it('checks candidates from the start dir upward, closest ancestor first', () => {
    // Present in BOTH the start dir and a higher ancestor; the closest wins.
    const closest = path.join(START_DIR, FILENAME);
    h.existsSync.mockImplementation((p: string) => p === closest || p === FOUND_AT);

    expect(findOrchestratorMd(START_DIR)).toBe(closest);
  });

  it('returns null when no ancestor contains the file', () => {
    h.existsSync.mockReturnValue(false);

    expect(findOrchestratorMd(START_DIR)).toBeNull();
  });
});

describe('readBackendsFromOrchestratorMd', () => {
  it('returns the agent.backends map from valid frontmatter', () => {
    h.existsSync.mockImplementation((p: string) => p === FOUND_AT);
    h.readFileSync.mockReturnValue(
      frontmatter(
        [
          'agent:',
          '  backends:',
          '    reasoner:',
          '      type: ollama',
          '      model: qwen3',
          '    coder:',
          '      type: ollama',
          '      model: qwen3-coder',
        ].join('\n')
      )
    );

    expect(readBackendsFromOrchestratorMd(START_DIR)).toEqual({
      reasoner: { type: 'ollama', model: 'qwen3' },
      coder: { type: 'ollama', model: 'qwen3-coder' },
    });
  });

  it('reads the file that findOrchestratorMd resolved', () => {
    h.existsSync.mockImplementation((p: string) => p === FOUND_AT);
    h.readFileSync.mockReturnValue(frontmatter('agent:\n  backends:\n    only: {}'));

    readBackendsFromOrchestratorMd(START_DIR);

    expect(h.readFileSync).toHaveBeenCalledWith(FOUND_AT, 'utf-8');
  });

  it('returns null when no orchestrator.md exists', () => {
    h.existsSync.mockReturnValue(false);

    expect(readBackendsFromOrchestratorMd(START_DIR)).toBeNull();
    expect(h.readFileSync).not.toHaveBeenCalled();
  });

  it('returns null when the file read throws', () => {
    h.existsSync.mockImplementation((p: string) => p === FOUND_AT);
    h.readFileSync.mockImplementation(() => {
      throw new Error('EACCES');
    });

    expect(readBackendsFromOrchestratorMd(START_DIR)).toBeNull();
  });

  it('returns null when the content has no YAML frontmatter fences', () => {
    h.existsSync.mockImplementation((p: string) => p === FOUND_AT);
    h.readFileSync.mockReturnValue('# Just a heading\n\nNo frontmatter here.\n');

    expect(readBackendsFromOrchestratorMd(START_DIR)).toBeNull();
  });

  it('returns null when the frontmatter YAML is malformed', () => {
    h.existsSync.mockImplementation((p: string) => p === FOUND_AT);
    // Tab indentation is a hard YAML parse error.
    h.readFileSync.mockReturnValue(frontmatter('agent:\n\tbad: true'));

    expect(readBackendsFromOrchestratorMd(START_DIR)).toBeNull();
  });

  it('returns null when the frontmatter is empty (parses to null)', () => {
    h.existsSync.mockImplementation((p: string) => p === FOUND_AT);
    h.readFileSync.mockReturnValue(frontmatter(''));

    expect(readBackendsFromOrchestratorMd(START_DIR)).toBeNull();
  });

  it('returns null when the frontmatter parses to a non-object scalar', () => {
    h.existsSync.mockImplementation((p: string) => p === FOUND_AT);
    h.readFileSync.mockReturnValue(frontmatter('just a bare string'));

    expect(readBackendsFromOrchestratorMd(START_DIR)).toBeNull();
  });

  it('returns null when the agent key is absent', () => {
    h.existsSync.mockImplementation((p: string) => p === FOUND_AT);
    h.readFileSync.mockReturnValue(frontmatter('title: Orchestrator\nother: true'));

    expect(readBackendsFromOrchestratorMd(START_DIR)).toBeNull();
  });

  it('returns null when agent is present but backends is absent', () => {
    h.existsSync.mockImplementation((p: string) => p === FOUND_AT);
    h.readFileSync.mockReturnValue(frontmatter('agent:\n  reasoner: qwen3'));

    expect(readBackendsFromOrchestratorMd(START_DIR)).toBeNull();
  });

  it('returns null when agent.backends is a non-object scalar', () => {
    h.existsSync.mockImplementation((p: string) => p === FOUND_AT);
    h.readFileSync.mockReturnValue(frontmatter('agent:\n  backends: not-a-map'));

    expect(readBackendsFromOrchestratorMd(START_DIR)).toBeNull();
  });
});
