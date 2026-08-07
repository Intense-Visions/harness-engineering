import type {
  AttachMediaInput,
  AttachMediaResult,
  DocsPublishConnector,
  DocsPublishResult,
  DraftHandle,
  DraftInput,
  HttpClient,
  HttpResponse,
  PageTreeInput,
  PageTreeResult,
  VerifyRenderInput,
  VerifyRenderResult,
} from '../interface.js';
import { verifyRender as renderVerify } from '../render/verify.js';

/**
 * Default HTTP client: a thin `fetch` wrapper. Callers inject their own client
 * (a retrying one, or a fake in tests) via the constructor — mirroring
 * `JiraConnector`'s injectable-`HttpClient` idiom (its default is
 * `withRetry(fetch)`). A retry wrapper is intentionally NOT imported here to
 * avoid a deep cross-package dependency; a caller wanting retries injects one.
 * Native `fetch`'s `Response` satisfies {@link HttpResponse} directly.
 */
const defaultHttpClient: HttpClient = (url, init) =>
  fetch(url, init) as unknown as Promise<HttpResponse>;

/** Attachment-upload recipe + the three traps, preserved as the manual-step payload. */
const ATTACH_MEDIA_INSTRUCTIONS = `Manual attachment upload (headless upload is impossible — no attachment API; the working recipe needs a logged-in browser tab).

1. Confirm a logged-in browser tab is open on the Atlassian origin (the real cloud origin, e.g. https://<your-domain>.atlassian.net — NOT a loopback address). The upload relies on that tab's authenticated cookies.
2. Write the upload JavaScript to a scratch file with the Write tool (do NOT pass the base64 payload through tool parameters — see trap a). The JS:
   - reads the image as base64 from a sibling scratch file,
   - does atob(base64) to bytes, wraps them in a File,
   - adds the File to a FormData, and issues:
       POST /wiki/rest/api/content/{PAGE_ID}/child/attachment?status=draft
       Header: X-Atlassian-Token: nocheck
       Body:   FormData with the File
     Both the status=draft query and the X-Atlassian-Token: nocheck header are required; this works on drafts.
3. Inject the JS into the logged-in tab via osascript (driving the browser to run it in-page so it inherits the authenticated session).
4. Verify authoritatively with a GET of /wiki/rest/api/content/{PAGE_ID}/child/attachment?status=draft and assert the new attachment id is present.

Three traps to respect:
  (a) Never pass large base64 through tool params — write it to a scratch file and read it in-page; params truncate silently.
  (b) Never serve bytes from the 127.0.0.1 literal — fetches against the loopback IP literal hang silently with no error. Use the real origin (or localhost for local serving), never the 127.0.0.1 literal.
  (c) Never trust the injecting tab — osascript may run in a DIFFERENT tab than the one you poll, so verify authoritatively with a GET of the attachments, not by reading the tab you injected into.`;

/**
 * Build the content payload for a draft create/update. `data-local-id`
 * preservation for page-tree round-trips is handled in `pageTree`.
 */
function buildContentPayload(input: DraftInput): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    type: 'page',
    title: input.title,
    space: { key: input.spaceId },
    // DRAFT-ONLY (invariant 1): status is always 'draft', never 'current'.
    status: 'draft',
  };
  if (input.parentId) payload.ancestors = [{ id: input.parentId }];
  if (input.adf !== undefined) {
    payload.body = {
      atlas_doc_format: { value: JSON.stringify(input.adf), representation: 'atlas_doc_format' },
    };
  } else if (input.body !== undefined) {
    payload.body = { storage: { value: input.body, representation: 'storage' } };
  }
  return payload;
}

/**
 * Confluence Cloud connector. Codifies the provider mechanics in code:
 * draft-only page CRUD, the typed manual-step attachment upload, ADF
 * media-single serialization (see `adf.ts`), page-tree move ordering with
 * `data-local-id` preservation, and Playwright render verification.
 *
 * Injectable `HttpClient` (default a `fetch` wrapper) so tests need no network,
 * mirroring `JiraConnector`.
 */
export class ConfluenceConnector implements DocsPublishConnector {
  readonly name = 'confluence';
  private readonly config: Record<string, unknown>;
  private readonly http: HttpClient;

  constructor(config: Record<string, unknown>, http: HttpClient = defaultHttpClient) {
    this.config = config;
    this.http = http;
  }

  /** Resolve the provider base URL from config, or a structured error. */
  private baseUrl(): { ok: true; value: string } | { ok: false; error: string } {
    const baseUrl = this.config.baseUrl;
    if (typeof baseUrl !== 'string' || baseUrl.length === 0) {
      return {
        ok: false,
        error:
          'confluence connector requires a "baseUrl" in its docsPublish.config block (e.g. https://<your-domain>.atlassian.net)',
      };
    }
    return { ok: true, value: baseUrl.replace(/\/$/, '') };
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const authToken = this.config.authToken;
    if (typeof authToken === 'string' && authToken.length > 0) {
      headers.Authorization = `Basic ${authToken}`;
    }
    return headers;
  }

  /**
   * Create or update a page in DRAFT state.
   *
   * Draft/publish race notes (preserved from hard-won provider mechanics):
   *   - A `status: draft` update issued against a page the owner JUST published
   *     becomes a PENDING EDIT, not a new page. Its response tiny-link encodes a
   *     DIFFERENT id — that is NOT a fork; do not treat it as one.
   *   - A stale, still-open editor tab that clicks "Update" will CLOBBER these
   *     API edits. Confirm no editor tab is mid-edit before writing.
   *   - Tiny links resolve only AFTER publish. A tiny link that 404s pre-publish
   *     is expected, not a failure.
   *
   * Never publishes/promotes (invariant 1): status is always `draft`.
   */
  async draft(input: DraftInput): Promise<DocsPublishResult<DraftHandle>> {
    const base = this.baseUrl();
    if (!base.ok) return { ok: false, error: base.error };
    const baseUrl = base.value;

    try {
      const written = await this.writeDraft(baseUrl, input);
      if (!written.ok) return { ok: false, error: written.error };

      // Authoritative read-back (invariant 3): the write-succeeded response is
      // not trusted until a GET confirms the persisted draft.
      const readBack = await this.http(
        `${baseUrl}/wiki/rest/api/content/${written.pageId}?status=draft`,
        { headers: this.headers() }
      );

      const handle: DraftHandle = { pageId: written.pageId, draftStatus: 'draft' };
      if (written.tinyLink) handle.tinyLink = written.tinyLink;
      return { ok: true, value: handle, confirmedByReadBack: readBack.ok };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  /**
   * Issue the draft create (POST) or update (PUT) write and resolve the page id
   * + tiny link from the response. Split out of {@link draft} to keep each
   * function within the cyclomatic-complexity budget; the read-back confirmation
   * stays in `draft`.
   */
  private async writeDraft(
    baseUrl: string,
    input: DraftInput
  ): Promise<{ ok: true; pageId: string; tinyLink?: string } | { ok: false; error: string }> {
    const isUpdate = Boolean(input.pageId);
    const url = isUpdate
      ? `${baseUrl}/wiki/rest/api/content/${input.pageId}?status=draft`
      : `${baseUrl}/wiki/rest/api/content?status=draft`;
    const res = await this.http(url, {
      method: isUpdate ? 'PUT' : 'POST',
      headers: this.headers(),
      body: JSON.stringify(buildContentPayload(input)),
    });
    if (!res.ok) {
      return { ok: false, error: `draft write failed (status ${res.status ?? 'unknown'})` };
    }
    const created = (await res.json()) as { id?: string; _links?: { tinyui?: string } };
    const pageId = input.pageId ?? created.id;
    if (!pageId) return { ok: false, error: 'draft write returned no page id' };
    const tinyLink = created._links?.tinyui;
    return tinyLink ? { ok: true, pageId, tinyLink } : { ok: true, pageId };
  }

  /**
   * Attach media to a draft page.
   *
   * This CANNOT be automated headless: the provider MCP has no attachment API,
   * and the working upload recipe requires a logged-in browser tab driven by
   * osascript (so the request inherits the tab's authenticated session cookies)
   * — there is no headless equivalent. So this returns a typed manual step the
   * pipeline surfaces to the human, with the full recipe + three traps as the
   * `instructions` payload, and confirms via an authoritative GET / verifyRender.
   */
  async attachMedia(input: AttachMediaInput): Promise<AttachMediaResult> {
    // Substitute the known page id (and origin, when supplied) into the recipe
    // so the surfaced manual step is directly actionable rather than templated.
    const pageId = input.pageId || '{PAGE_ID}';
    const instructions = ATTACH_MEDIA_INSTRUCTIONS.replaceAll('{PAGE_ID}', pageId);
    const originNote = input.origin ? ` (origin: ${input.origin})` : '';
    return {
      status: 'manual-step-required',
      instructions: instructions + originNote,
      verifyWith: `After the manual upload, confirm authoritatively: GET /wiki/rest/api/content/${pageId}/child/attachment?status=draft and assert the new attachment id is present, then run verify-render against the rendered draft.`,
    };
  }

  /** Delegate render correctness to Playwright (invariants 2 & 4). */
  async verifyRender(input: VerifyRenderInput): Promise<VerifyRenderResult> {
    return renderVerify(input);
  }

  /**
   * Create/order draft children under a draft parent.
   *
   * Sidebar ordering has no MCP support — use the REST move endpoint directly:
   *   PUT /wiki/rest/api/content/{id}/move/{before|after|append}/{targetId}
   *
   * When round-tripping a full page body (read → edit → write back), preserve
   * `data-local-id` on EVERY retained node. Dropping it makes the provider treat
   * retained nodes as new, which breaks comments, anchors, and ordering.
   */
  async pageTree(input: PageTreeInput): Promise<DocsPublishResult<PageTreeResult>> {
    const base = this.baseUrl();
    if (!base.ok) return { ok: false, error: base.error };
    const baseUrl = base.value;

    try {
      const childPageIds: string[] = [];
      let allConfirmed = true;

      for (const child of input.children) {
        const outcome = await this.upsertChild(baseUrl, input, child);
        if (!outcome.ok) return { ok: false, error: outcome.error };
        childPageIds.push(outcome.pageId);
        allConfirmed &&= outcome.confirmedByReadBack;
      }

      return {
        ok: true,
        value: { parentId: input.parentId, childPageIds },
        confirmedByReadBack: allConfirmed,
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  /**
   * Create/update one draft child under the parent, then apply its sidebar
   * ordering via the move endpoint. Extracted from {@link pageTree} to keep the
   * loop body flat (nesting/complexity budget).
   */
  private async upsertChild(
    baseUrl: string,
    input: PageTreeInput,
    child: PageTreeInput['children'][number]
  ): Promise<
    { ok: true; pageId: string; confirmedByReadBack: boolean } | { ok: false; error: string }
  > {
    // Create/update the child under the draft parent (draft-only).
    const draftResult = await this.draft({
      pageId: child.pageId,
      spaceId: input.spaceId,
      title: child.title,
      adf: child.adf,
      body: child.body,
      parentId: input.parentId,
    });
    if (!draftResult.ok) return { ok: false, error: draftResult.error };
    const pageId = draftResult.value.pageId;

    const moved = await this.moveChild(baseUrl, pageId, child);
    if (!moved.ok) return moved;
    return { ok: true, pageId, confirmedByReadBack: draftResult.confirmedByReadBack };
  }

  /**
   * Sidebar ordering via the move endpoint (no MCP support for this). A no-op
   * when the child specifies no move position/target.
   */
  private async moveChild(
    baseUrl: string,
    childId: string,
    child: PageTreeInput['children'][number]
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    if (!child.movePosition || !child.targetId) return { ok: true };
    const moveUrl = `${baseUrl}/wiki/rest/api/content/${childId}/move/${child.movePosition}/${child.targetId}`;
    const moveRes = await this.http(moveUrl, { method: 'PUT', headers: this.headers() });
    if (!moveRes.ok) {
      return {
        ok: false,
        error: `page-tree move failed for child ${childId} (status ${moveRes.status ?? 'unknown'})`,
      };
    }
    return { ok: true };
  }
}
