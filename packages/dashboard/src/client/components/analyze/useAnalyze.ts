import { useState, useRef, useCallback, useEffect, type MutableRefObject } from 'react';
import { appendToRoadmap } from '../../utils/appendToRoadmap';
import { streamAnalyze } from './streamAnalyze';
import { buildSpecMarkdown } from './buildSpecMarkdown';
import type { SELResult, CMLResult, PESLResult, Signal, ActionState } from './types';

function parseLabels(labels: string): string[] {
  return labels
    .split(',')
    .map((l) => l.trim())
    .filter(Boolean);
}

/**
 * Result setters bundled so the extracted stream/reset helpers can take them as a
 * single argument instead of threading eight setters through each call site.
 */
interface ResultSetters {
  setStatus: (v: string | null) => void;
  setError: (v: string | null) => void;
  setSelResult: (v: SELResult | null) => void;
  setCmlResult: (v: CMLResult | null) => void;
  setPeslResult: (v: PESLResult | null) => void;
  setSignals: (v: Signal[] | null) => void;
  setStreaming: (v: boolean) => void;
}

/** Clear every result field back to its empty state (used on submit and refine). */
function clearResults(s: ResultSetters): void {
  s.setSelResult(null);
  s.setCmlResult(null);
  s.setPeslResult(null);
  s.setSignals(null);
}

/** Build the analyze request body from the current form inputs. */
function buildAnalyzeBody(
  title: string,
  description: string,
  parsedLabels: string[]
): { title: string; description?: string; labels?: string[] } {
  const body: { title: string; description?: string; labels?: string[] } = {
    title: title.trim(),
  };
  if (description.trim()) body.description = description.trim();
  if (parsedLabels.length > 0) body.labels = parsedLabels;
  return body;
}

/** streamAnalyze callbacks wired to the result setters — extracted to keep the hook flat. */
function makeStreamCallbacks(s: ResultSetters) {
  return {
    onStatus: s.setStatus,
    onSEL: (data: SELResult) => {
      s.setSelResult(data);
      s.setStatus(null);
    },
    onCML: (data: CMLResult) => {
      s.setCmlResult(data);
      s.setStatus(null);
    },
    onPESL: (data: PESLResult) => {
      s.setPeslResult(data);
      s.setStatus(null);
    },
    onSignals: (data: Signal[]) => {
      s.setSignals(data);
      s.setStatus(null);
    },
    onError: (err: string) => {
      s.setError(err);
      s.setStreaming(false);
      s.setStatus(null);
    },
    onDone: () => {
      s.setStreaming(false);
      s.setStatus(null);
    },
  };
}

/** Append the current analysis to the roadmap. Returns the next action state / error. */
async function runAddToRoadmap(
  title: string,
  selResult: SELResult | null,
  cmlResult: CMLResult | null
): Promise<{ state: ActionState; error: string | null }> {
  const r = await appendToRoadmap({
    title: title.trim(),
    summary: selResult?.summary,
    enrichedSpec: selResult
      ? {
          intent: selResult.intent,
          unknowns: selResult.unknowns,
          ambiguities: selResult.ambiguities,
          riskSignals: selResult.riskSignals,
          affectedSystems: selResult.affectedSystems.map((sys) => ({ name: sys.name })),
        }
      : undefined,
    cmlRecommendedRoute: cmlResult?.recommendedRoute,
  });
  if (r.ok) return { state: 'roadmap-done', error: null };
  return { state: 'idle', error: r.error ?? 'Append failed' };
}

/** POST an ad-hoc dispatch. Returns the next action state / error. */
async function runDispatchNow(
  title: string,
  description: string,
  labels: string
): Promise<{ state: ActionState; error: string | null }> {
  try {
    const parsedLabels = parseLabels(labels);
    const res = await fetch('/api/dispatch/adhoc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: title.trim(),
        description: description.trim() || undefined,
        labels: parsedLabels.length > 0 ? parsedLabels : undefined,
      }),
    });
    if (!res.ok) {
      const json = (await res.json()) as { error?: string };
      throw new Error(json.error ?? `HTTP ${res.status}`);
    }
    return { state: 'dispatch-done', error: null };
  } catch (err) {
    return { state: 'idle', error: (err as Error).message };
  }
}

/** Compose the refined description text from the SEL unknowns/ambiguities. */
function buildRefinedDescription(description: string, sel: SELResult): string {
  const parts: string[] = [];
  if (description.trim()) parts.push(description.trim());
  const clarifications = [
    ...sel.unknowns.map((u) => `- Unknown: ${u}`),
    ...sel.ambiguities.map((a) => `- Ambiguity: ${a}`),
  ];
  if (clarifications.length > 0) {
    parts.push('', '---', 'Suggested clarifications from analysis:', ...clarifications);
  }
  return parts.join('\n');
}

/** Trigger a browser download of the exported spec markdown. */
function downloadSpec(
  title: string,
  selResult: SELResult | null,
  cmlResult: CMLResult | null,
  peslResult: PESLResult | null
): void {
  const markdown = buildSpecMarkdown(title.trim(), selResult, cmlResult, peslResult);
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 40);
  const date = new Date().toISOString().slice(0, 10);
  const blob = new Blob([markdown], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `spec-${slug}-${date}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

export interface AnalyzeController {
  title: string;
  setTitle: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  labels: string;
  setLabels: (v: string) => void;
  streaming: boolean;
  status: string | null;
  error: string | null;
  selResult: SELResult | null;
  cmlResult: CMLResult | null;
  peslResult: PESLResult | null;
  signals: Signal[] | null;
  actionState: ActionState;
  actionError: string | null;
  hasResults: boolean;
  isDone: boolean;
  handleSubmit: () => Promise<void>;
  handleCancel: () => void;
  handleAddToRoadmap: () => Promise<void>;
  handleDispatchNow: () => Promise<void>;
  handleRefine: () => void;
  handleExportSpec: () => void;
}

/** Streamed-result + status state, exposed via individual fields plus a stable setters ref. */
function useResultsState() {
  const [streaming, setStreaming] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selResult, setSelResult] = useState<SELResult | null>(null);
  const [cmlResult, setCmlResult] = useState<CMLResult | null>(null);
  const [peslResult, setPeslResult] = useState<PESLResult | null>(null);
  const [signals, setSignals] = useState<Signal[] | null>(null);

  const setters: ResultSetters = {
    setStatus,
    setError,
    setSelResult,
    setCmlResult,
    setPeslResult,
    setSignals,
    setStreaming,
  };
  const settersRef = useRef(setters);
  settersRef.current = setters;

  return { streaming, status, error, selResult, cmlResult, peslResult, signals, settersRef };
}

/** Form inputs + streamed results state, plus the submit/cancel controls over them. */
function useAnalyzeState() {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [labels, setLabels] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const results = useResultsState();
  const { streaming, selResult, cmlResult, peslResult, signals, settersRef } = results;

  const hasResults = Boolean(selResult || cmlResult || peslResult || signals);
  const isDone = !streaming && hasResults;

  const handleSubmit = useCallback(async () => {
    if (!title.trim() || streaming) return;
    const s = settersRef.current;
    s.setError(null);
    clearResults(s);
    s.setStatus(null);
    s.setStreaming(true);
    const controller = new AbortController();
    abortRef.current = controller;
    const body = buildAnalyzeBody(title, description, parseLabels(labels));
    await streamAnalyze(body, makeStreamCallbacks(s), controller.signal);
  }, [title, description, labels, streaming, settersRef]);

  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
    settersRef.current.setStreaming(false);
    settersRef.current.setStatus(null);
  }, [settersRef]);

  return {
    ...results,
    title,
    setTitle,
    description,
    setDescription,
    labels,
    setLabels,
    hasResults,
    isDone,
    handleSubmit,
    handleCancel,
  };
}

interface ActionInputs {
  title: string;
  description: string;
  labels: string;
  selResult: SELResult | null;
  cmlResult: CMLResult | null;
  peslResult: PESLResult | null;
  settersRef: MutableRefObject<ResultSetters>;
  setDescription: (v: string) => void;
}

/** Reset a settled action state back to 'idle' after 3s. */
function useAutoResetAction(
  actionState: ActionState,
  setActionState: (v: ActionState) => void
): void {
  useEffect(() => {
    if (actionState === 'roadmap-done' || actionState === 'dispatch-done') {
      const timer = setTimeout(() => setActionState('idle'), 3000);
      return () => clearTimeout(timer);
    }
  }, [actionState, setActionState]);
}

/** Roadmap/dispatch/refine/export action state and handlers. */
function useAnalyzeActions(inputs: ActionInputs) {
  const { title, description, labels, selResult, cmlResult, peslResult } = inputs;
  const [actionState, setActionState] = useState<ActionState>('idle');
  const [actionError, setActionError] = useState<string | null>(null);
  useAutoResetAction(actionState, setActionState);

  const handleAddToRoadmap = useCallback(async () => {
    setActionState('roadmap-pending');
    setActionError(null);
    const { state, error: err } = await runAddToRoadmap(title, selResult, cmlResult);
    if (err !== null) setActionError(err);
    setActionState(state);
  }, [title, selResult, cmlResult]);

  const handleDispatchNow = useCallback(async () => {
    setActionState('dispatch-pending');
    setActionError(null);
    const { state, error: err } = await runDispatchNow(title, description, labels);
    if (err !== null) setActionError(err);
    setActionState(state);
  }, [title, description, labels]);

  const handleRefine = useCallback(() => {
    if (!selResult) return;
    inputs.setDescription(buildRefinedDescription(description, selResult));
    clearResults(inputs.settersRef.current);
    setActionState('idle');
    setActionError(null);
    document.getElementById('analyze-description')?.focus();
  }, [selResult, description, inputs]);

  const handleExportSpec = useCallback(() => {
    downloadSpec(title, selResult, cmlResult, peslResult);
  }, [title, selResult, cmlResult, peslResult]);

  return {
    actionState,
    actionError,
    handleAddToRoadmap,
    handleDispatchNow,
    handleRefine,
    handleExportSpec,
  };
}

export function useAnalyze(): AnalyzeController {
  const state = useAnalyzeState();
  const actions = useAnalyzeActions({
    title: state.title,
    description: state.description,
    labels: state.labels,
    selResult: state.selResult,
    cmlResult: state.cmlResult,
    peslResult: state.peslResult,
    settersRef: state.settersRef,
    setDescription: state.setDescription,
  });
  const { settersRef: _settersRef, ...publicState } = state;
  return { ...publicState, ...actions };
}
