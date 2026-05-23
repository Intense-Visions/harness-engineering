# Pattern spec — ANAT-P001 map-without-empty

> Phase 0 paper artifact. Validates `PatternRule` (tree-sitter query + finding template) on the canonical pattern-presence finding: a JSX `.map(...)` render that has no surrounding empty-array guard.

## Intent

Detect call sites where a data list is rendered via `array.map(item => <JSX/>)` without a guard for the empty case. The guard is conventionally one of:

- `items.length === 0 ? <EmptyState /> : items.map(...)`
- `{items.length > 0 && items.map(...)}` paired with an `else` branch rendering an empty affordance
- An early return `if (!items.length) return <EmptyState/>`

When *none* of the above wraps the `.map(...)` call, the audit emits an `ANAT-P001` finding pointing to the unguarded map.

This is the blue-ocean example pattern: no published lint rule produces this finding class (REFERENCES.md gap #4).

## PatternRule

```yaml
code: ANAT-P001
severityDefault: warn
source:
  ref: "design-component-anatomy/empty-states"
  url: "https://harness.dev/knowledge/design/empty-states"  # internal knowledge skill

treeSitterQuery: |
  (call_expression
    function: (member_expression
      property: (property_identifier) @method
      (#eq? @method "map"))
    arguments: (arguments
      (arrow_function
        body: [
          (jsx_element)            @rendered
          (jsx_self_closing_element) @rendered
          (parenthesized_expression
            (jsx_element)          @rendered)
          (parenthesized_expression
            (jsx_self_closing_element) @rendered)
        ]))) @map-call

# Postprocessing (applied after the query matches):
#   For each @map-call:
#     1. Walk up the AST to the nearest enclosing JSX context.
#     2. Inspect ancestors for ONE of:
#        - a ternary whose test is `<identifier>.length === 0`,
#          `<identifier>.length > 0`, or `!<identifier>.length`,
#          where <identifier> is the receiver of the `.map(...)` call;
#        - a logical-and (`&&`) whose left operand is one of the above tests;
#        - an early `if`-return inside the enclosing function whose test
#          matches the same shape.
#     3. If any guard found: SUPPRESS the match.
#     4. Otherwise: EMIT one ANAT-P001 finding at the location of @map-call.

message: |
  (capture) =>
    `List rendered via .map() without an empty-state guard. ` +
    `When the source array is empty, this branch renders nothing — ` +
    `users see a blank region instead of an explanatory affordance. ` +
    `(file: ${capture.file}, line ${capture.line})`

fixHint: |
  Guard the .map() call with an empty-state branch. Examples:

      {items.length === 0
        ? <EmptyState title="No results" />
        : items.map(item => <Row key={item.id} {...item} />)}

      // or:
      if (!items.length) return <EmptyState title="No results" />;
      return items.map(item => <Row key={item.id} {...item} />);

  If the empty case is genuinely unreachable here (e.g., parent component
  guarantees non-empty input), add an `@anatomy-guarantee non-empty`
  JSDoc tag to suppress this finding for the file.
```

## Example matches

**Positive (finding emitted):**

```tsx
function Inbox({ messages }: { messages: Message[] }) {
  return (
    <ul>
      {messages.map(m => <li key={m.id}>{m.subject}</li>)}
    </ul>
  );
}
```

**Negative (no finding — ternary guard):**

```tsx
function Inbox({ messages }: { messages: Message[] }) {
  return messages.length === 0
    ? <EmptyState title="Inbox zero" />
    : <ul>{messages.map(m => <li key={m.id}>{m.subject}</li>)}</ul>;
}
```

**Negative (no finding — early return guard):**

```tsx
function Inbox({ messages }: { messages: Message[] }) {
  if (!messages.length) return <EmptyState title="Inbox zero" />;
  return <ul>{messages.map(m => <li key={m.id}>{m.subject}</li>)}</ul>;
}
```

## Notes on schema fit

- The `treeSitterQuery` field cleanly absorbs the multi-alternative arrow-body match (jsx_element / self-closing / parenthesized variants) using tree-sitter's `[...]` alternation syntax. The schema's `string` type is sufficient.
- The query alone cannot decide finding emission — a postprocessing step is required to inspect ancestors for guard expressions. The schema does not currently have a field for "postprocessing predicate." In practice this lives inside the runner that consumes `PatternRule`, but having it implicit means rules without postprocessing and rules with extensive postprocessing look identical in the schema. See `review.md`.
- `message` as a `(capture) => string` function is expressive enough; the capture includes file, line, and column from the tree-sitter cursor, which is all this finding needs.
- `fixHint` as multi-line guidance text accommodates code examples and is rendered verbatim into the markdown formatter.
- `source.ref` points at an internal knowledge entry — acceptable per the spec's hierarchy (APG > Open UI > Radix > design-component-anatomy). Empty-state guidance has no APG / Radix coverage.
