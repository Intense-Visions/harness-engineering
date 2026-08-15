---
'@harness-engineering/graph': patch
---

fix(graph): EnumConstantExtractor no longer mis-reads `as const` / `Object.freeze` objects with nested values

`collectObjectKeys` matched `^(\w+)\s*:` on every line and broke on the first
line starting with `}`, with no brace-depth tracking. A const object whose value
spanned multiple lines with a nested object or array — e.g.

```ts
export const CONFIG = {
  server: {
    port: 3000,
  },
  debug: false,
} as const;
```

was recorded with members `["server", "port"]`: the nested key `port` leaked in
as a false member and the nested closing brace ended collection early, dropping
`debug`. The extractor now tracks nesting depth and collects only the object's
top-level keys (`["server", "debug"]`). Covered by a new reproducing test.
