import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import React from 'react';

import { AnalysisThreadView } from '../../../../src/client/components/threads/AnalysisThreadView';
import { useThreadStore } from '../../../../src/client/stores/threadStore';
import type { Thread, AnalysisMeta } from '../../../../src/client/types/thread';

// ── framer-motion drives the animated result cards. Replace it with plain
//    DOM so nothing schedules real animation frames (deterministic, no RAF
//    leak from `repeat: Infinity` on the streaming-status pulse).
vi.mock('framer-motion', () => {
  const strip = (props: Record<string, unknown>) => {
    const { initial, animate, exit, transition, whileHover, whileTap, layout, ...rest } = props;
    void initial;
    void animate;
    void exit;
    void transition;
    void whileHover;
    void whileTap;
    void layout;
    return rest;
  };
  const motion = new Proxy(
    {},
    {
      get: (_target, tag: string) => (props: Record<string, unknown>) =>
        React.createElement(tag, strip(props), props.children as React.ReactNode),
    }
  );
  return {
    motion,
    AnimatePresence: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
  };
});

// ── Stub the form leaf so the test targets AnalysisThreadView's own
//    orchestration (POST + SSE consumption + result rendering), not the
//    form's internal input state. The stub exposes the props the view
//    passes down and a button that fires onSubmit with fixed data.
const SUBMIT_DATA = { title: 'Refactor auth', description: 'harden token flow', labels: ['auth'] };

vi.mock('../../../../src/client/components/cards/AnalysisFormCard', () => ({
  AnalysisFormCard: ({
    collapsed,
    initialTitle,
    onSubmit,
  }: {
    collapsed: boolean;
    initialTitle: string;
    onSubmit: (d: typeof SUBMIT_DATA) => void;
  }) => (
    <div
      data-testid="analysis-form"
      data-collapsed={String(collapsed)}
      data-initial-title={initialTitle}
    >
      <button data-testid="form-submit" onClick={() => onSubmit(SUBMIT_DATA)}>
        run analysis
      </button>
    </div>
  ),
}));

// ── SSE result payloads. Expected rendered values are DERIVED from these
//    objects (never hardcoded) so the assertions track the fixture.
const SEL_DATA = {
  intent: 'Refactor the auth token exchange',
  summary: 'Replace the legacy session cookie with rotating refresh tokens.',
  affectedSystems: [
    {
      name: 'auth-service',
      graphNodeId: 'n1',
      confidence: 0.876,
      transitiveDeps: [],
      testCoverage: 0.6,
      owner: 'team-identity',
    },
  ],
  unknowns: [],
  ambiguities: [],
  riskSignals: [],
};

const CML_DATA = {
  overall: 0.42,
  riskLevel: 'high',
  confidence: 0.71,
  blastRadius: { services: 2, modules: 4, filesEstimated: 17, testFilesAffected: 3 },
  dimensions: { structural: 0.4, semantic: 0.5, historical: 0.3 },
  reasoning: ['spans two services'],
  recommendedRoute: 'staged',
};

const PESL_DATA = {
  simulatedPlan: ['rotate tokens'],
  predictedFailures: ['auth token expiry regression'],
  riskHotspots: ['session store'],
  testGaps: ['refresh path'],
  executionConfidence: 0.9,
  recommendedChanges: ['add refresh rotation flow'],
};

const THREAD_ID = 'analysis:1';

function makeAnalysisThread(): Thread {
  return {
    id: THREAD_ID,
    type: 'analysis',
    title: 'Untitled analysis',
    status: 'active',
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    avatar: 'organism',
    unread: false,
    meta: {
      analysisTitle: 'Seed analysis title',
      description: 'seed description',
      labels: ['seed'],
    } as AnalysisMeta,
  };
}

function sseLine(event: Record<string, unknown>): string {
  return `data: ${JSON.stringify(event)}`;
}

interface FakeResponseOptions {
  ok?: boolean;
  status?: number;
  hasBody?: boolean;
  /** When true, the reader delivers the chunks then never resolves the final read. */
  hang?: boolean;
}

/**
 * Build a fetch Response whose body streams the given SSE lines as a single
 * UTF-8 chunk. A trailing newline is appended so the component's line-buffer
 * flushes every line (it holds the last un-terminated segment back).
 */
function sseResponse(lines: string[], opts: FakeResponseOptions = {}): Response {
  const { ok = true, status = 200, hasBody = true, hang = false } = opts;
  const text = lines.join('\n') + '\n';
  const chunks = [new TextEncoder().encode(text)];
  let idx = 0;
  const body = hasBody
    ? {
        getReader() {
          return {
            read() {
              if (idx < chunks.length) {
                return Promise.resolve({ done: false, value: chunks[idx++] });
              }
              if (hang) {
                // Keep the stream open so the view stays in the streaming state.
                return new Promise<never>(() => {});
              }
              return Promise.resolve({ done: true, value: undefined });
            },
          };
        },
      }
    : null;
  return { ok, status, body } as unknown as Response;
}

function seedThreadAndRender(): Thread {
  const thread = makeAnalysisThread();
  useThreadStore.setState({
    threads: new Map([[thread.id, thread]]),
    messages: new Map(),
    panelState: new Map(),
    activeThreadId: null,
  });
  render(<AnalysisThreadView thread={thread} />);
  return thread;
}

async function submitForm(): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByTestId('form-submit'));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AnalysisThreadView initial render', () => {
  it('mounts the form expanded with the analysis meta as its initial values', () => {
    const thread = makeAnalysisThread();
    const meta = thread.meta as AnalysisMeta;
    useThreadStore.setState({
      threads: new Map([[thread.id, thread]]),
      messages: new Map(),
      panelState: new Map(),
      activeThreadId: null,
    });

    render(<AnalysisThreadView thread={thread} />);

    const form = screen.getByTestId('analysis-form');
    expect(form.getAttribute('data-collapsed')).toBe('false');
    expect(form.getAttribute('data-initial-title')).toBe(meta.analysisTitle);
    // No results or error before submitting.
    expect(screen.queryByText(SEL_DATA.intent)).toBeNull();
  });
});

describe('AnalysisThreadView happy-path streaming', () => {
  it('POSTs the request, retitles the thread, and renders SEL/CML/PESL results', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve(
        sseResponse([
          sseLine({ type: 'status', text: 'Enriching spec...' }),
          sseLine({ type: 'sel_result', data: SEL_DATA }),
          sseLine({ type: 'cml_result', data: CML_DATA }),
          sseLine({ type: 'pesl_result', data: PESL_DATA }),
          'data: [DONE]',
        ])
      )
    ) as unknown as typeof fetch;

    const thread = seedThreadAndRender();
    await submitForm();

    // Request went to the analyze endpoint as a POST carrying the form data.
    const fetchMock = vi.mocked(global.fetch);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('/api/analyze');
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe(JSON.stringify(SUBMIT_DATA));

    // The thread is retitled from the submitted title via the store.
    expect(useThreadStore.getState().threads.get(thread.id)?.title).toBe(SUBMIT_DATA.title);

    // SEL block.
    await screen.findByText(SEL_DATA.intent);
    expect(screen.getByText(SEL_DATA.summary)).toBeDefined();
    const sys = SEL_DATA.affectedSystems[0];
    expect(screen.getByText(`${sys.name} (${Math.round(sys.confidence * 100)}%)`)).toBeDefined();

    // CML block — risk level, derived percentages, blast-radius counts, route.
    expect(screen.getByText(CML_DATA.riskLevel)).toBeDefined();
    expect(screen.getByText(`${Math.round(CML_DATA.overall * 100)}%`)).toBeDefined();
    expect(screen.getByText(String(CML_DATA.blastRadius.filesEstimated))).toBeDefined();
    expect(screen.getByText(String(CML_DATA.blastRadius.modules))).toBeDefined();
    expect(screen.getByText(CML_DATA.recommendedRoute)).toBeDefined();

    // PESL block — confidence, predicted failures, recommended changes.
    expect(
      screen.getByText(`Confidence: ${Math.round(PESL_DATA.executionConfidence * 100)}%`)
    ).toBeDefined();
    expect(screen.getByText(`- ${PESL_DATA.predictedFailures[0]}`)).toBeDefined();
    expect(screen.getByText(`- ${PESL_DATA.recommendedChanges[0]}`)).toBeDefined();

    // Stream finished: the form collapses and the post-analysis actions appear.
    await waitFor(() => {
      expect(screen.getByTestId('analysis-form').getAttribute('data-collapsed')).toBe('true');
    });
    expect(screen.getByText('Add to Roadmap')).toBeDefined();
    expect(screen.getByText('Refine')).toBeDefined();
  });

  it('shows the live status while the stream is still open', async () => {
    const STATUS_TEXT = 'Modeling complexity...';
    global.fetch = vi.fn(() =>
      Promise.resolve(sseResponse([sseLine({ type: 'status', text: STATUS_TEXT })], { hang: true }))
    ) as unknown as typeof fetch;

    seedThreadAndRender();
    await submitForm();

    // While streaming (reader never closes), the latest status is visible and
    // no completion actions have rendered yet.
    await screen.findByText(STATUS_TEXT);
    expect(screen.queryByText('Refine')).toBeNull();
  });
});

describe('AnalysisThreadView error handling', () => {
  it('renders an SSE error event and stops streaming', async () => {
    const MESSAGE = 'analysis worker crashed';
    global.fetch = vi.fn(() =>
      Promise.resolve(
        sseResponse([
          sseLine({ type: 'status', text: 'starting' }),
          sseLine({ type: 'error', error: MESSAGE }),
        ])
      )
    ) as unknown as typeof fetch;

    seedThreadAndRender();
    await submitForm();

    expect(await screen.findByText(`Error: ${MESSAGE}`)).toBeDefined();
    // An error event returns early: no results and no completion actions.
    expect(screen.queryByText(SEL_DATA.intent)).toBeNull();
    expect(screen.queryByText('Refine')).toBeNull();
  });

  it('reports a non-ok HTTP response as an error and never reads a stream', async () => {
    const STATUS = 503;
    global.fetch = vi.fn(() =>
      Promise.resolve(sseResponse([], { ok: false, status: STATUS, hasBody: false }))
    ) as unknown as typeof fetch;

    seedThreadAndRender();
    await submitForm();

    expect(await screen.findByText(`Error: HTTP ${STATUS}`)).toBeDefined();
    expect(screen.queryByText('Refine')).toBeNull();
  });
});

describe('AnalysisThreadView refine', () => {
  it('clears results and re-expands the form when Refine is clicked', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve(
        sseResponse([
          sseLine({ type: 'sel_result', data: SEL_DATA }),
          sseLine({ type: 'cml_result', data: CML_DATA }),
          'data: [DONE]',
        ])
      )
    ) as unknown as typeof fetch;

    seedThreadAndRender();
    await submitForm();

    // Wait for completion (Refine action present), then refine.
    const refineButton = await screen.findByText('Refine');
    await act(async () => {
      fireEvent.click(refineButton);
    });

    // Results are cleared and the form is expanded again for a new run.
    expect(screen.queryByText(SEL_DATA.intent)).toBeNull();
    expect(screen.queryByText(CML_DATA.riskLevel)).toBeNull();
    expect(screen.queryByText('Refine')).toBeNull();
    expect(screen.getByTestId('analysis-form').getAttribute('data-collapsed')).toBe('false');
  });
});
