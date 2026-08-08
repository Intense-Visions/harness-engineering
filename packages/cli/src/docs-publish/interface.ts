/**
 * Docs-publish connector interface + operation/result types + invariants.
 *
 * The publishing capability is modeled as a small, pluggable connector rather
 * than a prose "contract skill". A {@link DocsPublishConnector} exposes four
 * operations — `draft`, `attachMedia`, `verifyRender`, `pageTree` — resolved
 * from `harness.config.json` by name. Concrete implementations (e.g. the
 * Confluence connector) codify the provider mechanics in code; the pipeline
 * skill invokes the surface and never embeds the mechanics.
 *
 * ## Invariants (honored by every operation)
 *
 * 1. **Drafts-only.** No operation publishes, promotes, or moves a draft to
 *    current/live. Promotion is the page owner's explicit action, never the
 *    connector's. `draft`/`pageTree` write draft state exclusively.
 *
 * 2. **Verify-render-before-done.** A page is not "done" until
 *    {@link DocsPublishConnector.verifyRender} passes. A stored-without-error
 *    page can still render broken figures — see invariant 4.
 *
 * 3. **Authoritative read-back over optimistic success.** A write is only
 *    trustworthy after an authoritative GET confirms the persisted state.
 *    `DocsPublishResult` carries a {@link DocsPublishResult.confirmedByReadBack}
 *    flag that is `true` ONLY after such a read-back — an optimistic
 *    write-succeeded response sets it `false`.
 *
 * 4. **Stored ≠ rendered.** Only {@link DocsPublishConnector.verifyRender}
 *    decides render correctness. Correct stored format (valid ADF, a 200 on
 *    write) is not evidence that the page renders correctly.
 */

/**
 * Minimal HTTP client shape, injectable so tests need no network. Mirrors the
 * graph connectors' `HttpClient` (`ConnectorInterface.ts`) but adds `text()`
 * for authoritative read-back bodies. Native `fetch`'s `Response` satisfies
 * this shape directly.
 */
export interface HttpResponse {
  ok: boolean;
  status?: number;
  text(): Promise<string>;
  json(): Promise<unknown>;
}

/** Injectable HTTP client (default is a `fetch` wrapper in each connector). */
export type HttpClient = (
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  }
) => Promise<HttpResponse>;

/**
 * Never-throw structured result for write/read operations. `confirmedByReadBack`
 * distinguishes an authoritative read-back (invariant 3) from an optimistic
 * write-succeeded response.
 */
export type DocsPublishResult<T> =
  | { ok: true; value: T; confirmedByReadBack: boolean }
  | { ok: false; error: string };

/** Input to {@link DocsPublishConnector.draft}. */
export interface DraftInput {
  /** Existing page id to update; omit to create a new draft. */
  pageId?: string | undefined;
  /** Target space id (required to create). */
  spaceId: string;
  /** Page title. */
  title: string;
  /** Page body as ADF (Atlassian Document Format) or an equivalent block tree. */
  adf?: unknown;
  /** Raw storage/body string, when a provider takes a serialized body. */
  body?: string | undefined;
  /** Parent page id for placement in the tree. */
  parentId?: string | undefined;
}

/** Handle returned for a created/updated draft. */
export interface DraftHandle {
  pageId: string;
  /** Provider draft state marker (e.g. 'draft'). Never 'current'/'live'. */
  draftStatus: string;
  /** Tiny/short link — resolves only AFTER publish; may be absent for a draft. */
  tinyLink?: string | undefined;
}

/** Input to {@link DocsPublishConnector.attachMedia}. */
export interface AttachMediaInput {
  /** Draft page id the attachment belongs to. */
  pageId: string;
  /** Local path to the media file to upload. */
  mediaFilePath: string;
  /** Provider origin (real cloud origin or localhost — NEVER the 127.0.0.1 literal). */
  origin?: string | undefined;
}

/**
 * `attachMedia` never silently "succeeds": a headless attachment upload is
 * impossible for some providers (no attachment API; the working recipe needs a
 * logged-in browser tab driven by osascript), so it returns a typed manual step
 * the pipeline surfaces to the human, or an `unsupported` reason.
 */
export type AttachMediaResult =
  | { status: 'manual-step-required'; instructions: string; verifyWith: string }
  | { status: 'unsupported'; reason: string };

/** Input to {@link DocsPublishConnector.verifyRender}. */
export interface VerifyRenderInput {
  /** Rendered URL (http(s) or file://) to load and assert against. */
  targetUrl: string;
}

/**
 * Render-verification result. `verifyRender` is the ONLY authority on render
 * correctness (invariant 4). `degraded` signals a non-verdict (e.g. Playwright
 * absent), which is never a pass.
 */
export interface VerifyRenderResult {
  ok: boolean;
  /** `<img>` elements with `naturalWidth > 0`. */
  imagesLoaded: number;
  /** `.media-card-error` nodes; must be 0 for `ok`. */
  mediaCardErrors: number;
  /** `[data-node-type="mediaSingle"]` nodes (intended figure form). */
  mediaSingleCount: number;
  /** `[data-node-type="mediaGroup"]` nodes; expected 0 (silent downgrade). */
  mediaGroupCount: number;
  /** Present when verification could not run (never a pass). */
  degraded?: 'playwright-not-installed' | undefined;
  /** Human-readable list of which assertions failed / why it degraded. */
  failures: string[];
}

/** Placement of a child relative to a sibling in the page tree. */
export type MovePosition = 'before' | 'after' | 'append';

/** A single node in a requested page tree. */
export interface PageTreeNode {
  /** Existing page id to retain/move, or omit to create. */
  pageId?: string | undefined;
  title: string;
  adf?: unknown;
  body?: string | undefined;
  /** Ordering relative to `targetId` within the parent. */
  movePosition?: MovePosition | undefined;
  /** Sibling id the `movePosition` is relative to. */
  targetId?: string | undefined;
}

/** Input to {@link DocsPublishConnector.pageTree}. */
export interface PageTreeInput {
  spaceId: string;
  /** Draft parent under which children are created/ordered. */
  parentId: string;
  children: PageTreeNode[];
}

/** Result of a page-tree operation. */
export interface PageTreeResult {
  parentId: string;
  /** Page ids of the children created/retained, in final order. */
  childPageIds: string[];
}

/**
 * A pluggable docs-publish connector. Every operation follows the never-throw,
 * structured-result idiom and honors the four invariants documented above.
 */
export interface DocsPublishConnector {
  /** Connector name as configured in `harness.config.json` (e.g. 'confluence'). */
  readonly name: string;
  /** Create/update a page in DRAFT state; never publishes (invariant 1). */
  draft(input: DraftInput): Promise<DocsPublishResult<DraftHandle>>;
  /** Attach media; returns a typed manual step (headless upload is impossible). */
  attachMedia(input: AttachMediaInput): Promise<AttachMediaResult>;
  /** The sole authority on render correctness (invariants 2 & 4). */
  verifyRender(input: VerifyRenderInput): Promise<VerifyRenderResult>;
  /** Create/order draft children; preserves node identity across round-trips. */
  pageTree(input: PageTreeInput): Promise<DocsPublishResult<PageTreeResult>>;
}
