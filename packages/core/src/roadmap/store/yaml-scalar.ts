/**
 * Emit a free-form string as a deterministic, safe YAML double-quoted scalar.
 *
 * Hand-emitted frontmatter (shard `slug`/`milestone`, `_meta` project/timestamps
 * and the `milestones:` sequence) is byte-stable only if every free-form string
 * value is quoted *unconditionally* — conditional quoting would make the output
 * depend on the value's shape (e.g. whether it contains a colon), which is both
 * non-deterministic to reason about and easy to get subtly wrong. Double-quoting
 * also neutralises values that would otherwise misparse: names containing `: `
 * (e.g. `Maintenance: Lint & Deps`) parse as nested maps, and boolean-/number-
 * looking values (`true`, `123`, `yes`) coerce to non-string scalars.
 *
 * Backslashes are escaped first, then double-quotes, which is the correct order
 * for YAML double-quoted scalars and round-trips through both the `yaml` package
 * and gray-matter's js-yaml engine.
 */
export function quoteYamlScalar(value: string): string {
  const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `"${escaped}"`;
}
