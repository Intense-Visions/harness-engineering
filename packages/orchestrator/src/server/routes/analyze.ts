import type { IncomingMessage, ServerResponse } from 'node:http';
import type { IntelligencePipeline } from '@harness-engineering/intelligence';
import { manualToRawWorkItem, scoreToConcernSignals } from '@harness-engineering/intelligence';
import { z } from 'zod';
import { readBody } from '../utils.js';

const AnalyzeRequestSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  labels: z.array(z.string()).optional(),
});

type AnalyzeRequest = z.infer<typeof AnalyzeRequestSchema>;

type AnalyzeSSEEvent =
  | { type: 'status'; text: string }
  | { type: 'sel_result'; data: Record<string, unknown> }
  | { type: 'cml_result'; data: Record<string, unknown> }
  | { type: 'pesl_result'; data: Record<string, unknown> }
  | { type: 'signals'; data: Array<{ name: string; reason: string }> }
  | { type: 'error'; error: string };

function emit(res: ServerResponse, event: AnalyzeSSEEvent): void {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

function beginSSE(res: ServerResponse): void {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
}

function sendError(res: ServerResponse, status: number, message: string): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: message }));
}

/** Run the full pipeline, streaming results as SSE events. */
async function runPipeline(
  res: ServerResponse,
  pipeline: IntelligencePipeline,
  parsed: AnalyzeRequest
): Promise<void> {
  beginSSE(res);

  let disconnected = false;
  res.on('close', () => {
    disconnected = true;
  });

  emit(res, { type: 'status', text: 'Converting to work item...' });
  const rawItem = manualToRawWorkItem({
    title: parsed.title,
    description: parsed.description ?? '',
    labels: parsed.labels ?? [],
  });
  if (disconnected) return;

  emit(res, { type: 'status', text: 'Running spec enrichment (SEL)...' });
  const spec = await pipeline.enrich(rawItem);
  if (disconnected) return;

  emit(res, {
    type: 'sel_result',
    data: {
      intent: spec.intent,
      summary: spec.summary,
      affectedSystems: spec.affectedSystems,
      unknowns: spec.unknowns,
      ambiguities: spec.ambiguities,
      riskSignals: spec.riskSignals,
    },
  });

  emit(res, { type: 'status', text: 'Scoring complexity (CML)...' });
  const score = pipeline.score(spec);
  if (disconnected) return;

  emit(res, {
    type: 'cml_result',
    data: {
      overall: score.overall,
      riskLevel: score.riskLevel,
      confidence: score.confidence,
      blastRadius: score.blastRadius,
      dimensions: score.dimensions,
      reasoning: score.reasoning,
      recommendedRoute: score.recommendedRoute,
    },
  });

  if (score.recommendedRoute === 'simulation-required' && !disconnected) {
    emit(res, { type: 'status', text: 'Running simulation (PESL)...' });
    const sim = await pipeline.simulate(spec, score, 'guided-change');
    if (!disconnected) {
      emit(res, { type: 'pesl_result', data: sim as unknown as Record<string, unknown> });
    }
  }

  if (disconnected) return;

  const signals = scoreToConcernSignals(score);
  if (signals.length > 0) {
    emit(res, { type: 'signals', data: signals });
  }

  if (!disconnected) {
    res.write('data: [DONE]\n\n');
    res.end();
  }
}

/**
 * Handle the /api/analyze route. Accepts a text description, runs it through
 * the intelligence pipeline (SEL -> CML -> PESL), and streams results as SSE.
 *
 * Returns `true` if the route matched (request handled), `false` otherwise.
 */
export function handleAnalyzeRoute(
  req: IncomingMessage,
  res: ServerResponse,
  pipeline: IntelligencePipeline | null
): boolean {
  if (req.method !== 'POST' || req.url !== '/api/analyze') return false;

  void (async () => {
    try {
      if (!pipeline) {
        sendError(res, 503, 'Intelligence pipeline not enabled');
        return;
      }

      const body = await readBody(req);
      // harness-ignore SEC-DES-001: input validated by Zod schema (AnalyzeRequestSchema)
      const result = AnalyzeRequestSchema.safeParse(JSON.parse(body));
      if (!result.success) {
        sendError(res, 400, result.error.issues[0]?.message ?? 'Invalid request body');
        return;
      }

      await runPipeline(res, pipeline, result.data);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Analysis failed';
      if (!res.headersSent) {
        sendError(res, 500, errorMsg);
      } else {
        emit(res, { type: 'error', error: errorMsg });
        res.end();
      }
    }
  })();
  return true;
}
