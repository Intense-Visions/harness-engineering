# Confluence Adapter for docs-publish

> The Confluence Cloud adapter implementing the `docs-publish` contract. It maps the contract's four operations — draft, attach-media, verify-render, page-tree — to hard-won Confluence Cloud mechanics: the attachment-upload workaround, ADF media forms, page-tree ops, the draft/publish race, DOM render verification, and deterministic stills. This is one adapter of the contract; a future Notion/GDocs/Markdown adapter would slot in the same way. Ships zero company-specific content: every org-specific pointer is read from the shared company-knowledge config contract.

## When to Use

- When you are implementing or using the Confluence adapter of the `docs-publish` contract and need the concrete Confluence Cloud mechanics behind each operation.
- When building or updating a Confluence Cloud page that must carry embedded figures and you need the images to render (not just store).
- When you hit the Atlassian MCP's missing attachment API and need the proven upload workaround.
- When another pipeline (for example, a proposal or design-review flow) resolves this adapter through the `docs-publish` contract and needs its publishing mechanics.
- When you must verify that a page actually renders correctly — not merely that its stored ADF parsed.
- NOT when reading or ingesting Confluence content — that is a connector/ingest concern, not publishing.
- NOT when running the proposal pipeline end to end — use `proposal-pitch`, which depends on the `docs-publish` contract that this adapter implements.
- NOT when publishing a draft to current/live — that promotion is the page owner's explicit click, never this skill's action.

## Process

### Iron Law

**Operate on drafts, prove every step with an authoritative read-back, and never declare a page done until its rendered DOM passes verification. Stored-format correctness is not rendering correctness.**

A page whose ADF stored without error can still render broken figures. An attachment whose injection reported success can still be missing. The only trustworthy signals are a `GET` of the actual state and a DOM assertion against the actual render.

**This adapter maps each `docs-publish` contract operation to its Confluence mechanics:**

- **draft** → Confluence draft page semantics and the draft/publish race (Phase 1 PREFLIGHT + Phase 5).
- **attach-media** → the osascript + FormData attachment recipe and its three traps, confirmed by an authoritative `GET` (Phase 2).
- **verify-render** → the ADF media-form choice plus the DOM render assertions, including `mediaSingle`-vs-`mediaGroup` counting (Phase 3 + Phase 6).
- **page-tree** → children under a draft parent, the REST move endpoint for sibling ordering, and `data-local-id` preservation across full-body round-trips (Phase 4).
- **Deterministic stills** (Phase 7) are this adapter's still-rendering implementation, feeding the figures the contract operations publish and verify.

The contract's cross-cutting invariants (drafts-only, verify-render before "done", authoritative read-back over optimistic success, stored-format correctness is not rendering correctness) are exactly the invariants the phases below enforce with Confluence-specific mechanics.

---

### Phase 1: PREFLIGHT — Establish a Trustworthy Session and Target (contract op: draft)

1. Confirm a logged-in browser tab is open on the Atlassian origin (the real cloud origin, not a loopback address). The upload recipe relies on that tab's authenticated cookies.
2. Resolve the target page id from the config contract or from the parent page you are working under. Record it as `<PAGE_ID>`.
3. Confirm you are operating on a DRAFT. If the target is already current/live, stop — promotion is the owner's decision (see Gates).
4. Do not proceed until all three are true. A wrong origin, an unknown page id, or an unconfirmed draft state each invalidate every later phase.

### Phase 2: UPLOAD ATTACHMENTS — The osascript + FormData Recipe (contract op: attach-media)

The Atlassian MCP has **no** attachment API. Use this recipe instead:

1. Write the upload JavaScript to a scratch file with the Write tool. Do **not** pass large base64 payloads through tool parameters — they blow the parameter budget and truncate silently.
2. The JS reads the image as base64 from the scratch file, then does `atob(base64)` to bytes, wraps them in a `File`, adds the `File` to a `FormData`, and issues:

   ```
   POST /wiki/rest/api/content/<PAGE_ID>/child/attachment?status=draft
   Header: X-Atlassian-Token: nocheck
   Body:   FormData with the File
   ```

   The `status=draft` query and the `X-Atlassian-Token: nocheck` header are both required; this works on drafts.

3. Inject the JS into the logged-in tab via `osascript` (driving the browser to run it in-page, so it inherits the authenticated session).
4. **Verify authoritatively.** `osascript` may execute in a DIFFERENT tab than the one you poll, so a "success" from the injecting tab proves nothing. Confirm the upload with a `GET` of the page's attachments and assert the new attachment id is present.

Traps to call out explicitly:

- **(a) Never pass large base64 through tool params** — write it to a scratch file and read it in-page.
- **(b) Never serve bytes from `127.0.0.1`** — fetches against the loopback IP literal hang silently with no error. Use the real origin (or `localhost` for local serving), never the `127.0.0.1` literal.
- **(c) Never trust the injecting tab** — verify with a `GET` of the attachments, not by reading the tab you injected into.

### Phase 3: EMIT ADF — media-single, Not media-group (contract op: verify-render, figure form)

1. **Always emit `media-single` figures.** A `media-single` node renders as a real inline figure at the intended width.
2. `media-group` stores without error but renders as cropped attachment cards showing a filename and an upload date — not a figure. It is a silent downgrade.
3. Document and use the `media-inline` file-chip form when you want an inline attachment chip rather than a figure.
4. This distinction is **undocumented in the MCP schema** — it was discovered by writing `mediaSingle` ADF and reading it back as HTML. Treat the render, not the schema, as the source of truth.

### Phase 4: PAGE-TREE OPS — Children, Ordering, Round-Trips (contract op: page-tree)

1. Create child pages under a DRAFT parent.
2. Sidebar ordering has **no MCP support** — use the REST move endpoint directly:

   ```
   PUT /wiki/rest/api/content/<PAGE_ID>/move/{before|after|append}/<TARGET_ID>
   ```

3. When you round-trip a full page body (read → edit → write back), you MUST preserve `data-local-id` on every retained node. Dropping it makes Confluence treat retained nodes as new, which breaks comments, anchors, and ordering.

### Phase 5: HANDLE DRAFT/PUBLISH RACE (contract op: draft)

1. A `status: draft` update issued against a page the owner JUST published becomes a **pending edit**, not a new page. Its response tiny-link encodes a different id — that is NOT a fork.
2. A stale, still-open editor tab that clicks "Update" will clobber your API edits. Confirm no editor tab is mid-edit before writing.
3. Tiny links resolve only AFTER publish. A tiny link that 404s pre-publish is expected, not a failure.

### Phase 6: VERIFY RENDER — DOM Assertions (contract op: verify-render)

Assert against the rendered DOM in view or editor mode. A page is not done until:

1. Every figure `img` reports `naturalWidth > 0` (the image actually loaded).
2. There are ZERO `media-card-error` nodes.
3. The count of `mediaSingle` figures matches the intended count, and there are ZERO unexpected `mediaGroup` nodes. **Counting loaded images alone is insufficient** — thumbnail cards from a `media-group` downgrade ALSO pass a `naturalWidth > 0` check, so compare `mediaSingle` vs `mediaGroup` counts explicitly.

### Phase 7: DETERMINISTIC STILLS (adapter still-rendering implementation)

1. Render stills with a browser automation tool (for example, Playwright) against local `file://` HTML.
2. Pin the environment for reproducibility: `emulateMedia({ colorScheme, reducedMotion: 'reduce' })`.
3. Capture at device scale: `screenshot({ scale: 'device' })`.
4. Serve any assets from the real origin or `localhost` — never the `127.0.0.1` literal (see Phase 2 trap b).

## Harness Integration

- **`harness skill run docs-publish-confluence`** / **`run_skill`** — invoke this skill.
- **`harness skill validate docs-publish-confluence`** — validate this skill's structure and schema.
- **Implements the `docs-publish` contract.** `depends_on: docs-publish`. This adapter provides the contract's four operations — draft, attach-media, verify-render, page-tree — with Confluence Cloud mechanics, and inherits the contract's cross-cutting invariants (drafts-only, verify-render before "done", authoritative read-back over optimistic success, stored-format correctness is not rendering correctness).
- **Config contract (read from the shared company-knowledge file):** this adapter reads its own `confluence` block via the companion config loader. The `confluence` block is the adapter's configuration — the generic contract names no provider block; this adapter names and owns it. Documented with placeholder keys only:

  ```jsonc
  "confluence": {
    "cloud_id": "<CLOUD_ID>",
    "space_id": "<SPACE_ID>",
    "proposals_index_page_id": "<PAGE_ID>",
    "exemplar_page_ids": ["<PAGE_ID>"]
  }
  ```

- **Absent-block degradation:** when the `confluence` block is absent from the shared company-knowledge file, print a clear message that names the missing pointers (`confluence.cloud_id`, `confluence.space_id`, `confluence.proposals_index_page_id`, `confluence.exemplar_page_ids`) and how to add them to the shared company-knowledge file. Do NOT crash and do NOT silently no-op.

## Success Criteria

- From this skill alone, an operator can upload an attachment to a draft and confirm it with an authoritative `GET`.
- The operator emits a `media-single` figure that renders (not a `media-group` card downgrade).
- The operator orders a child page in the sidebar via the move endpoint and round-trips a body while preserving `data-local-id`.
- The operator recognizes a pending-edit tiny-link id and does not mistake it for a fork.
- Render verification passes: every figure `img` has `naturalWidth > 0`, zero `media-card-error`, and `mediaSingle` count matches intent with zero unexpected `mediaGroup`.
- No step operates on a current/live page; all writes target a draft.

## Examples

### Example: upload an image to a draft and verify it renders

Assume `<CLOUD_ID>` and `<PAGE_ID>` resolved from the config contract, and a logged-in tab on the Atlassian origin.

1. PREFLIGHT: confirm the tab origin is the real cloud origin (not `127.0.0.1`), resolve `<PAGE_ID>`, confirm the page is a draft.
2. UPLOAD: write `upload.js` to a scratch path with the Write tool. It reads `figure.png` base64 from a sibling scratch file, does `atob` → `File` → `FormData`, and posts:

   ```
   POST /wiki/rest/api/content/<PAGE_ID>/child/attachment?status=draft
   X-Atlassian-Token: nocheck
   ```

   Inject `upload.js` via `osascript`.

3. VERIFY UPLOAD: `GET /wiki/rest/api/content/<PAGE_ID>/child/attachment?status=draft` and assert the attachment id appears. (Do not trust the injecting tab's "success".)
4. EMIT ADF: write a `mediaSingle` node referencing the attachment id — never `mediaGroup`.
5. VERIFY RENDER: open the draft, then assert in the DOM:

   ```js
   const imgs = [...document.querySelectorAll('img')].filter((i) => i.naturalWidth > 0);
   const errors = document.querySelectorAll('.media-card-error').length;
   const singles = document.querySelectorAll('[data-node-type="mediaSingle"]').length;
   const groups = document.querySelectorAll('[data-node-type="mediaGroup"]').length;
   // require: imgs.length >= 1, errors === 0, singles === intended, groups === 0
   ```

   If `groups > 0`, the figure silently downgraded — go back to Phase 3.

## Gates

- **Drafts only.** Never publish or promote a draft to current/live. That is the owner's click. Operating on a live page is a hard stop.
- **Verify-render before done.** A page is not "done" until the Phase 6 DOM assertions pass. Stored-format correctness is not rendering correctness.
- **Never pass large base64 through tool params.** Write the payload to a scratch file and read it in-page. Passing it through params truncates silently.
- **Never serve bytes from the `127.0.0.1` literal.** Fetches against it hang silently. Use the real origin or `localhost`.
- **Always verify attachment upload with an authoritative `GET`.** An `osascript` success from the injecting tab does not prove the upload landed.
- **Never emit `media-group` for figures.** It renders as cropped attachment cards. Always `media-single`.

## Escalation

- **A `GET` shows the attachment missing after an apparently-successful `osascript` inject.** Likely cause: the injection ran in a different tab than the authenticated one. Report the target `<PAGE_ID>`, the injected tab, and the empty attachment `GET`; re-run the inject against the confirmed logged-in tab. Do not proceed to ADF until the `GET` shows the attachment.
- **Render-verify finds a `media-card-error`, or a `mediaGroup` where `mediaSingle` was intended.** Report the failing DOM assertion (the exact selector and counts) and the offending node; rebuild the figure as `media-single`. Do not declare the page done.
- **A draft update returns a different tiny-link id.** This is the pending-edit vs. fork ambiguity. Do not assume a fork — a draft update against a just-published page is a pending edit. Confirm by reading the page state with a `GET` before any further write, and surface the ambiguity to the author if it cannot be resolved from the read.

## Rationalizations to Reject

| Rationalization                                          | Reality                                                                                                                  |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| "The MCP will have an attachment endpoint."              | It does not. Use the scratch-file + `osascript` + `FormData` upload recipe with `X-Atlassian-Token: nocheck` on a draft. |
| "The `osascript` said success, so the upload worked."    | `osascript` may run in a different tab than the one you poll; only an authoritative `GET` of the attachments proves it.  |
| "The stored ADF is valid, so it renders fine."           | `media-group` stores fine but renders as cropped attachment cards; only DOM render-verify proves rendering.              |
| "Counting loaded images is enough to verify the render." | Thumbnail cards pass `naturalWidth > 0` too. Compare `mediaSingle` vs `mediaGroup` counts, not just loaded-image count.  |
| "127.0.0.1 is the same as localhost for serving stills." | Fetches against the `127.0.0.1` literal hang silently. Serve from the real origin or `localhost`.                        |
| "The tiny-link id changed, so my edit forked the page."  | A draft update against a just-published page is a pending edit, not a fork; the tiny-link id difference is expected.     |
| "I preserved the body text, so the round-trip is safe."  | Dropping `data-local-id` on retained nodes breaks comments, anchors, and ordering. Preserve every `data-local-id`.       |
