import { Hono } from 'hono';
import type { Context } from 'hono';
import { mkdir } from 'node:fs/promises';
import { GraphStore, resolveGraphDir } from '@harness-engineering/graph';
import { UatSignoffRecorder } from '@harness-engineering/intelligence';
import type {
  ApiResponse,
  SignoffBasis,
  SignoffDecision,
  SignoffItem,
  SignoffItemDisposition,
  SignoffRequest,
  SignoffResponse,
} from '../../shared/types';
import type { ServerContext } from '../context';
import { gatherSignoffBasis, renderSignoffMarkdown, writeSignoffMarkdown } from '../gather/signoff';

/**
 * UAT sign-off routes (#710) — the dashboard front door to the EXISTING
 * `UatSignoffRecorder`. `GET /api/signoff/:slug` returns the acceptance basis
 * (Success Criteria with soft-degrade) so the browser can render a checklist;
 * `POST /api/signoff` records the human's decision through the exact same recorder
 * the `uat_signoff` MCP tool calls and writes `docs/changes/<slug>/signoff.md`.
 *
 * Human-judged, advisory / record-only: the write derives no authority, runs no
 * LLM, and blocks nothing. It is deliberately NOT wired to any gate, CI, or
 * pipeline step — that is `outcome-eval`'s contract, not this one.
 */

const DECISIONS: readonly SignoffDecision[] = ['ACCEPTED', 'REJECTED', 'CHANGES_REQUESTED'];
const DISPOSITIONS: readonly SignoffItemDisposition[] = ['ACCEPT', 'REJECT', 'CHANGES_REQUESTED'];

// A change slug is a single path segment under docs/changes/. Constrain it to a
// safe charset so a hostile value can never traverse out of the change directory
// (`../`, absolute paths, NUL) when it is joined into a filesystem path.
const SAFE_SLUG_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;
function isSafeSlug(slug: string): boolean {
  return SAFE_SLUG_RE.test(slug) && !slug.includes('..');
}

/** Serialize sign-off writes per artifact path (mirrors actions.ts withFileLock). */
const fileLocks = new Map<string, Promise<void>>();
async function withFileLock(key: string, fn: () => Promise<void>): Promise<void> {
  const prev = fileLocks.get(key) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  fileLocks.set(key, next);
  try {
    await next;
  } finally {
    if (fileLocks.get(key) === next) fileLocks.delete(key);
  }
}

/** True when `v` is a non-empty string once trimmed. */
function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

/** Validate the per-item dispositions: each needs an id and a known disposition. */
function validateItems(items: unknown): string | null {
  if (!Array.isArray(items)) {
    return 'items must be an array';
  }
  for (const item of items) {
    if (!isNonEmptyString(item?.id)) {
      return 'each item requires a non-empty id';
    }
    if (!DISPOSITIONS.includes(item?.disposition as SignoffItemDisposition)) {
      return `each item requires a disposition (one of ${DISPOSITIONS.join(' | ')})`;
    }
  }
  return null;
}

/**
 * Validate the POST body. Returns a human-readable error string, or null when the
 * body is a complete human decision. Enforces the skill's Iron Law at the surface:
 * a missing overall verdict, a missing signer, or ANY item without a disposition
 * is rejected — the surface never infers a verdict.
 */
function validateSignoff(body: Partial<SignoffRequest>): string | null {
  if (!isNonEmptyString(body?.slug)) {
    return 'slug is required';
  }
  if (!isSafeSlug(body.slug)) {
    return 'slug contains invalid characters';
  }
  if (!DECISIONS.includes(body?.decision as SignoffDecision)) {
    return `decision must be one of ${DECISIONS.join(' | ')}`;
  }
  if (!isNonEmptyString(body?.signedOffBy)) {
    return 'signedOffBy is required';
  }
  return validateItems(body?.items);
}

async function handleGetBasis(c: Context, ctx: ServerContext): Promise<Response> {
  const slug = c.req.param('slug');
  if (!slug) {
    return c.json({ error: 'slug is required' }, 400);
  }
  if (!isSafeSlug(slug)) {
    return c.json({ error: 'slug contains invalid characters' }, 400);
  }
  const basis = await gatherSignoffBasis(ctx.projectPath, slug);
  const response: ApiResponse<SignoffBasis> = {
    data: basis,
    timestamp: new Date().toISOString(),
  };
  return c.json(response);
}

/** A validated, narrowed sign-off decision ready to record. */
interface RecordableSignoff {
  slug: string;
  decision: SignoffDecision;
  signedOffBy: string;
  items: SignoffItem[];
  criteriaRefs: string[];
  signedAt: string;
}

/** Narrow a validated body into the recorder's input, defaulting criteriaRefs. */
function toRecordable(body: Partial<SignoffRequest>): RecordableSignoff {
  const items = (body.items as SignoffItem[]) ?? [];
  return {
    slug: body.slug as string,
    decision: body.decision as SignoffDecision,
    signedOffBy: (body.signedOffBy as string).trim(),
    items,
    criteriaRefs:
      body.criteriaRefs ?? items.filter((i) => i.disposition === 'ACCEPT').map((i) => i.id),
    signedAt: new Date().toISOString(),
  };
}

/**
 * Record one sign-off: persist the shared `execution_outcome` node (the exact
 * write path the `uat_signoff` MCP tool uses, so a browser sign-off and a CLI
 * sign-off are the same node) and write the co-located `signoff.md` source of
 * truth. Record-only — nothing here blocks.
 */
async function recordSignoff(
  projectPath: string,
  input: RecordableSignoff
): Promise<SignoffResponse> {
  const { slug, decision, signedOffBy, items, criteriaRefs, signedAt } = input;

  const graphDir = resolveGraphDir(projectPath);
  await mkdir(graphDir, { recursive: true });
  const store = new GraphStore();
  await store.load(graphDir);
  const { outcomeId } = new UatSignoffRecorder(store).record({
    slug,
    decision,
    signedOffBy,
    items,
    criteriaRefs,
    timestamp: signedAt,
  });
  await store.save(graphDir);

  const markdown = renderSignoffMarkdown({ slug, decision, signedOffBy, signedAt, items });
  const signoffPath = await writeSignoffMarkdown(projectPath, slug, markdown);

  return {
    recorded: true,
    outcomeId,
    result: decision === 'ACCEPTED' ? 'success' : 'failure',
    signoffPath,
  };
}

async function handlePostSignoff(c: Context, ctx: ServerContext): Promise<Response> {
  let body: Partial<SignoffRequest>;
  try {
    body = await c.req.json<Partial<SignoffRequest>>();
  } catch {
    return c.json({ error: 'invalid JSON body' }, 400);
  }

  const validationError = validateSignoff(body);
  if (validationError !== null) {
    return c.json({ error: validationError }, 400);
  }

  const input = toRecordable(body);
  let payload: SignoffResponse | undefined;
  await withFileLock(`signoff:${input.slug}`, async () => {
    payload = await recordSignoff(ctx.projectPath, input);
  });
  return c.json(payload!);
}

export function buildSignoffRouter(ctx: ServerContext): Hono {
  const router = new Hono();
  router.get('/signoff/:slug', (c) => handleGetBasis(c, ctx));
  router.post('/signoff', (c) => handlePostSignoff(c, ctx));
  return router;
}
