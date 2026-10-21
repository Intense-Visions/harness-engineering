/**
 * Shared fixtures for the duplication test family.
 *
 * Consolidated in the FINAL_REVIEW batch (review suggestion S2). Each of the
 * three helpers below had been written out BYTE-IDENTICALLY three times, once
 * per phase boundary — `memberSets` in `duplication/acceptance.test.ts`,
 * `entropy/analyzer.duplication.test.ts` and
 * `entropy/detectors/duplication.test.ts`; `body` in `duplication/barrel`,
 * `collision` and `clone-index`; `wrapper` in `duplication/barrel`,
 * `duplication/partial-extraction` and `entropy/detectors/duplication`.
 *
 * The shipped defaults ignore test files, so the detector this feature builds
 * never reported them and no gate ever would have. That is precisely why it is
 * worth fixing by hand: a duplication feature whose own test suite contains
 * hand-copied helpers is the argument against itself. It is also a live
 * demonstration of the gap filed as `typecheck-test-files` — three copies of
 * one function cannot drift apart silently once there is one.
 *
 * These are FIXTURE BUILDERS, not assertions. They are shared because they
 * build the same planted clone shapes, and each consumer still owns its own
 * expectations: `acceptance` asserts the criterion-15 set, `collision` forces a
 * digest collision, `partial-extraction` spells one module three ways. Anything
 * a single test needs to vary stays in that test.
 */

/**
 * Clone classes as sorted, comma-joined member-file lists, themselves sorted.
 *
 * Both sorts are load-bearing: member order within a class and class order
 * within the report are both implementation details no criterion pins, so
 * comparing raw order would make every consumer a sort-stability test.
 */
export function memberSets(classes: { members: { file: string }[] }[]): string[] {
  return classes
    .map((c) =>
      c.members
        .map((m) => m.file)
        .sort()
        .join(',')
    )
    .sort();
}

/** A >=40-token body parameterised only by identifier names (Type-2 clone). */
export const body = (fn: string, p: string, acc: string, el: string) =>
  `export function ${fn}(${p}: { cost: number; label: string }[]) {\n` +
  `  let ${acc} = 0;\n` +
  `  const seen: string[] = [];\n` +
  `  for (const ${el} of ${p}) {\n` +
  `    if (${el}.cost > 0) {\n` +
  `      ${acc} += ${el}.cost;\n` +
  `      seen.push(${el}.label);\n` +
  `    }\n` +
  `  }\n` +
  `  return { total: ${acc}, labels: seen };\n` +
  `}\n`;

/**
 * A >=40-token Type-2 clone body that CALLS the imported `extract`.
 *
 * `spec` is the import specifier, deliberately different per call site: a
 * caller can sit three wrappers at three directory depths so they spell the
 * same module three different ways. That is the arm a raw-specifier
 * implementation fails, and the reason such a fixture is not three siblings.
 *
 * The CALL is the point, not the import: the shipped predicate requires the
 * binding in a call-callee, method-receiver or JSX-element position, so a
 * fixture that merely imported `extract` would not be labelled.
 */
export const wrapper = (spec: string, fn: string, p: string, out: string) =>
  `import { extract } from '${spec}';\n` +
  `export function ${fn}(${p}: string[]): string[] {\n` +
  `  const ${out}: string[] = [];\n` +
  `  for (const item of ${p}) {\n` +
  `    const value = extract(item);\n` +
  `    if (value.length > 0) {\n` +
  `      ${out}.push(value);\n` +
  `    }\n` +
  `  }\n` +
  `  return ${out};\n` +
  `}\n`;
