import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Proposals } from '../../../src/client/pages/Proposals';
import type { SkillProposal, Proposal } from '@harness-engineering/types';

/**
 * Complementary card-level coverage for the `/s/proposals` review queue.
 *
 * The sibling `Proposals.test.tsx` exercises the list fetch, status filter, and
 * the approve/reject/run-gate actions. This file protects the remaining
 * card behaviors that merged PRs left untested:
 *   - refinement proposals render the diff view (not the SKILL.md view),
 *   - the inline editor toggles and PATCHes content keyed on `skillKind`,
 *   - a decided proposal hides the action controls and shows the decision panel,
 *   - a failed action POST surfaces the HTTP error text on the card.
 *
 * All network IO is routed through a mocked global `fetch`; the component has no
 * timers, randomness, or real IO, so nothing here is order- or clock-dependent.
 */

const mockFetch = vi.fn();

/** GET -> the proposal list; every other method -> a generic ok response. */
function installFetch(proposals: Proposal[]): void {
  mockFetch.mockImplementation((_input: RequestInfo | URL, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    if (method === 'GET') {
      return Promise.resolve({ ok: true, status: 200, json: async () => proposals });
    }
    return Promise.resolve({ ok: true, status: 200, text: async () => '' });
  });
}

function makeNewSkill(overrides: Partial<SkillProposal> = {}): SkillProposal {
  return {
    kind: 'skill',
    skillKind: 'new-skill',
    id: 'prop-new',
    createdAt: '2026-07-01T00:00:00.000Z',
    proposedBy: 'agent-scout',
    source: { justification: 'This skill improves the reviewer workflow substantially.' },
    content: {
      name: 'helper-skill',
      description: 'A skill that does genuinely helpful things for reviewers.',
      skillYaml: 'name: helper-skill',
      skillMd: '# Helper Skill\nOriginal markdown body.',
    },
    status: 'open',
    ...overrides,
  } as SkillProposal;
}

function makeRefinement(overrides: Partial<SkillProposal> = {}): SkillProposal {
  return {
    kind: 'skill',
    skillKind: 'refinement',
    id: 'prop-refine',
    createdAt: '2026-07-01T00:00:00.000Z',
    targetSkill: 'target-skill',
    proposedBy: 'agent-scout',
    source: { justification: 'This refinement tightens the target skill considerably.' },
    content: {
      name: 'refine-target',
      description: 'A refinement that improves the target skill in measurable ways.',
      diff: '--- a/SKILL.md\n+++ b/SKILL.md\n@@\n-old line\n+new line',
    },
    status: 'open',
    ...overrides,
  } as SkillProposal;
}

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Proposals card — refinement rendering', () => {
  it('renders the unified-diff view with the refines-target subheading', async () => {
    installFetch([makeRefinement()]);
    render(<Proposals />);

    await waitFor(() => {
      expect(screen.getByText('Unified diff')).toBeDefined();
    });
    // Refinement uses the ↻ prefix + name in the heading.
    expect(screen.getByText(/↻/)).toBeDefined();
    expect(screen.getByText(/Refines target-skill/)).toBeDefined();
    // The raw diff body is shown, not the new-skill SKILL.md header.
    expect(screen.getByText(/\+new line/)).toBeDefined();
    expect(screen.queryByText('SKILL.md')).toBeNull();
    expect(screen.queryByText('skill.yaml')).toBeNull();
  });
});

describe('Proposals card — inline editor', () => {
  it('toggles the editor and PATCHes new-skill content as skillMd', async () => {
    installFetch([makeNewSkill()]);
    render(<Proposals />);

    const editButton = await waitFor(() => screen.getByRole('button', { name: 'Edit' }));
    fireEvent.click(editButton);

    const textarea = screen.getByDisplayValue(/Original markdown body\./);
    fireEvent.change(textarea, { target: { value: 'edited skill markdown' } });
    fireEvent.click(screen.getByRole('button', { name: /Save \(resets gate\)/ }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/v1/proposals/prop-new',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ content: { skillMd: 'edited skill markdown' } }),
        })
      );
    });
  });

  it('PATCHes refinement content as diff (keyed on skillKind)', async () => {
    installFetch([makeRefinement()]);
    render(<Proposals />);

    const editButton = await waitFor(() => screen.getByRole('button', { name: 'Edit' }));
    fireEvent.click(editButton);

    const textarea = screen.getByDisplayValue(/\+new line/);
    fireEvent.change(textarea, { target: { value: 'edited diff body' } });
    fireEvent.click(screen.getByRole('button', { name: /Save \(resets gate\)/ }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/v1/proposals/prop-refine',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ content: { diff: 'edited diff body' } }),
        })
      );
    });
  });
});

describe('Proposals card — decided proposals', () => {
  it('hides the action controls and shows the decision panel once resolved', async () => {
    installFetch([
      makeNewSkill({
        status: 'rejected',
        decision: {
          action: 'rejected',
          decidedBy: 'dashboard-reviewer',
          decidedAt: '2026-07-03T00:00:00.000Z',
          reason: 'Overlaps an existing skill.',
        },
      }),
    ]);
    render(<Proposals />);

    await waitFor(() => {
      expect(screen.getByText('rejected')).toBeDefined();
    });
    // Action controls are gated behind `!decided`.
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reject' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Run gate' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
    // The decision panel shows who decided and why. The trailing localized
    // timestamp is timezone-dependent, so match only the stable prefix.
    expect(screen.getByText(/by dashboard-reviewer at/)).toBeDefined();
    expect(screen.getByText('Reason: Overlaps an existing skill.')).toBeDefined();
  });
});

describe('Proposals card — action error surfacing', () => {
  it('shows the HTTP error text when an action POST fails', async () => {
    mockFetch.mockImplementation((_input: RequestInfo | URL, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      if (method === 'GET') {
        return Promise.resolve({ ok: true, status: 200, json: async () => [makeNewSkill()] });
      }
      return Promise.resolve({ ok: false, status: 500, text: async () => 'gate crashed' });
    });
    render(<Proposals />);

    const runGate = await waitFor(() => screen.getByRole('button', { name: 'Run gate' }));
    fireEvent.click(runGate);

    await waitFor(() => {
      expect(screen.getByText('HTTP 500: gate crashed')).toBeDefined();
    });
  });
});
