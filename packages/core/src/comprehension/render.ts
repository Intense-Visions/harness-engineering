import type { ComprehensionUnit } from './types';

/**
 * Render a unit to its compact SERVED (wire) form: the body sections as markdown
 * with provenance collapsed to a single `sourceHash` line — no full frontmatter.
 * Markdown is ~15–30% cheaper than pretty-JSON and read natively by models. A
 * `semantic: absent` unit omits Summary/Invariants (static-only). The LLM half is
 * framed as advisory (truth-vs-freshness: the semantic half is advisory, the
 * static half is exact).
 */
export function renderServedUnit(unit: ComprehensionUnit): string {
  const p = unit.provenance;
  const out: string[] = [`# ${p.module}`, `<!-- sourceHash: ${p.sourceHash} -->`, ''];
  if (p.semantic === 'present') {
    out.push('## Summary (advisory)', '', unit.summary.trim(), '');
    if (unit.invariants.length > 0) {
      out.push('## Invariants (advisory)', '');
      for (const inv of unit.invariants) out.push(`- ${inv}`);
      out.push('');
    }
  }
  out.push('## Interface Contract', '', '```ts', unit.interfaceContract.trim(), '```', '');
  out.push('## Dependency Slice', '', '```', unit.dependencySlice.trim(), '```', '');
  return out.join('\n').replace(/\n+$/, '\n');
}
