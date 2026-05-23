# Pattern spec — ANAT-P004 conditional-render-without-fallback

> Phase 0 paper artifact. Validates `PatternRule` on a subtler structural pattern: a JSX conditional render (`condition && <JSX/>`) that omits the else branch entirely, producing a silent "renders nothing" path the user cannot interpret.

## Intent

Detect call sites that render JSX conditionally using the short-circuit `&&` form (or a ternary whose else branch is `null` / `false` / omitted), where the unrendered branch represents a _user-facing condition that warrants an affordance_. Examples:

- `{isLoading && <Spinner />}` — when not loading and there are no children, the region collapses silently. If loading is the only signal, fine; if it gates other content, the false branch needs an affordance.
- `{user.permissions.canEdit && <EditButton />}` — when the user lacks permission, an empty space appears where the action used to be. Often correct (hiding is appropriate), but flagged for human review at strictness=strict.
- `{error ? <ErrorBanner/> : null}` — the explicit `null` is the giveaway; an error UI without a non-error counterpart is fine, but a _content_ slot with a `null` fallback usually warrants either a placeholder or a removed conditional.

The pattern is genuinely ambiguous — many `&&`-renders are correct. The audit emits this finding at `severity: 'info'` by default and lets the human / strictness model promote it.

## PatternRule

```yaml
code: ANAT-P004
severityDefault: info
source:
  ref: 'design-component-anatomy/conditional-content'
  url: 'https://harness.dev/knowledge/design/conditional-content' # internal knowledge skill

treeSitterQuery: |
  (jsx_expression
    [
      (binary_expression
        left: (_) @condition
        operator: "&&"
        right: [
          (jsx_element)            @rendered
          (jsx_self_closing_element) @rendered
        ]) @short-circuit
      (ternary_expression
        condition: (_) @condition
        consequence: [
          (jsx_element)            @rendered
          (jsx_self_closing_element) @rendered
        ]
        alternative: [
          (null)                   @null-branch
          (false)                  @null-branch
        ]) @ternary
    ]) @conditional-render

# Postprocessing:
#   For each match:
#     1. Skip if the rendered JSX is itself a fallback-style affordance
#        (recognized component names: EmptyState, ErrorBoundary, Skeleton,
#        Spinner, LoadingSpinner, Placeholder, ErrorBanner, Toast).
#     2. Skip if the @condition is a negation of an error/loading flag
#        and the enclosing JSX context already renders a sibling
#        affordance for the negative case (heuristic — opt-in only at
#        strictness=strict).
#     3. Skip if a JSDoc `@anatomy-conditional intentional` comment
#        precedes the enclosing function or component.
#     4. Otherwise: EMIT one ANAT-P004 finding at the location of
#        @conditional-render.

message: |
  (capture) => {
    const form = capture.shortCircuit ? "`condition && <JSX/>`"
                                      : "`condition ? <JSX/> : null`";
    return `Conditional render via ${form} has no else-branch affordance. ` +
           `When the condition is false, this region collapses silently. ` +
           `If that is intentional, annotate with ` +
           `\`@anatomy-conditional intentional\`. ` +
           `(file: ${capture.file}, line ${capture.line})`;
  }

fixHint: |
  Replace the silent fallback with an explicit affordance, or annotate
  intentional silence. Examples:

      // Add a fallback element:
      {isLoading ? <Spinner /> : <ContentReady />}

      // Promote to a guard with content fallback:
      {user.permissions.canEdit
        ? <EditButton />
        : <ReadOnlyHint />}

      // Or annotate (suppresses the finding for the enclosing function):
      /** @anatomy-conditional intentional — admin-only badge */
      function AdminBadge({ user }) {
        return <>{user.isAdmin && <ShieldIcon />}</>;
      }
```

## Example matches

**Positive (finding emitted):**

```tsx
function Toolbar({ user }: { user: User }) {
  return (
    <div>
      <ViewButton />
      {user.permissions.canEdit && <EditButton />}
    </div>
  );
}
```

**Positive (finding emitted — explicit null):**

```tsx
function Page({ error }: { error: Error | null }) {
  return error ? <ErrorBanner error={error} /> : null;
}
```

**Negative (no finding — both branches present):**

```tsx
function Status({ isLoading }: { isLoading: boolean }) {
  return isLoading ? <Spinner /> : <CheckIcon />;
}
```

**Negative (no finding — fallback-shaped rendered component):**

```tsx
function Wrapper({ error }: { error: Error | null }) {
  return <>{error && <ErrorBoundary fallback={...} error={error} />}</>;
}
```

## Notes on schema fit

- `treeSitterQuery` accommodates the two query alternatives (short-circuit and explicit-`null` ternary) via top-level `[...]` alternation. The schema's `string` field is again sufficient.
- The postprocessing list here is _substantial_ (3 distinct suppression rules) and includes a hard-coded fallback-component name list ("EmptyState, ErrorBoundary, Skeleton, Spinner, ..."). This list is implementation data the rule needs but the schema does not surface — it lives in the runner as a side-channel constant. Acceptable for v1 but worth surfacing as a schema field (`PatternRule.knownFallbackComponents?: string[]`) so each rule can tune its own list. See `review.md`.
- `message` reads `capture.shortCircuit` to vary phrasing based on which arm of the query matched — the schema's `(capture) => string` shape supports this once captures carry which alternative matched. Tree-sitter does expose this via named captures (`@short-circuit` vs `@ternary`), so the runner can populate `capture.shortCircuit: boolean` from match identity. Schema-fit is fine; this is a runner contract detail.
- `severityDefault: info` correctly expresses that this is a low-confidence pattern (genuinely ambiguous). The downstream strictness × severity matrix will let strict projects promote it.
- `source.ref` again points to an internal knowledge entry — appropriate because conditional-render conventions are project-design taste, not an ARIA contract.
