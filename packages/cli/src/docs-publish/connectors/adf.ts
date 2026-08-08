/**
 * ADF (Atlassian Document Format) media serialization helpers.
 *
 * INVARIANT: this module emits `mediaSingle` (figure form) EXCLUSIVELY. It
 * NEVER emits a `mediaGroup`. A `mediaGroup` node stores without error but
 * renders as cropped attachment thumbnail cards (a filename + upload date), not
 * a figure — a silent downgrade that only DOM render-verify catches. A
 * `mediaSingle` renders as a real inline figure at the intended width. This
 * distinction is undocumented in the provider schema; the render, not the
 * schema, is the source of truth.
 */

/** Minimal ADF node shape (a recursive block/leaf tree). */
export interface AdfNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: AdfNode[];
  text?: string;
}

/** Attributes for a media reference. */
export interface MediaAttrs {
  /** Attachment/media id to reference. */
  id: string;
  /** Media collection identifier (provider-specific), when required. */
  collection?: string | undefined;
  width?: number | undefined;
  height?: number | undefined;
}

/**
 * Build a `mediaSingle` figure node wrapping a single `media` file node.
 * Always the figure form — NEVER `mediaGroup` (see module invariant).
 */
export function mediaSingle(attrs: MediaAttrs): AdfNode {
  const mediaAttrs: Record<string, unknown> = { type: 'file', id: attrs.id };
  if (attrs.collection !== undefined) mediaAttrs.collection = attrs.collection;
  if (attrs.width !== undefined) mediaAttrs.width = attrs.width;
  if (attrs.height !== undefined) mediaAttrs.height = attrs.height;

  return {
    type: 'mediaSingle',
    attrs: { layout: 'center' },
    content: [{ type: 'media', attrs: mediaAttrs }],
  };
}

/**
 * Build a `mediaInline` file-chip node — an inline attachment chip rather than
 * a figure. Use when an inline chip is the intended render, not a figure.
 */
export function mediaInline(attrs: { id: string; collection?: string | undefined }): AdfNode {
  const inlineAttrs: Record<string, unknown> = { type: 'file', id: attrs.id };
  if (attrs.collection !== undefined) inlineAttrs.collection = attrs.collection;
  return { type: 'mediaInline', attrs: inlineAttrs };
}
