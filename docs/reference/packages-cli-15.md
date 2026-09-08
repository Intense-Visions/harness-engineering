# Reference: packages / cli / 15

Auto-generated reference index for previously-undocumented modules in this group. Each entry links the source file and summarizes its purpose and key exports.

## packages/cli/src/cli-ergonomics-craft/catalog/rubrics/composes-with-other-tools.ts

[`packages/cli/src/cli-ergonomics-craft/catalog/rubrics/composes-with-other-tools.ts`](/packages/cli/src/cli-ergonomics-craft/catalog/rubrics/composes-with-other-tools.ts)

CLI-R006 — leaf-command rubric judging pipeline citizenship: whether a machine-readable mode exists, whether results go to stdout while diagnostics go to stderr, whether the exit code is non-zero on failure, and whether stdin composes where a file path is demanded.

**Exports:** `composesWithOtherToolsRubric`

## packages/cli/src/cli-ergonomics-craft/catalog/rubrics/defaults-are-sane.ts

[`packages/cli/src/cli-ergonomics-craft/catalog/rubrics/defaults-are-sane.ts`](/packages/cli/src/cli-ergonomics-craft/catalog/rubrics/defaults-are-sane.ts)

CLI-R004 — leaf-command rubric judging the zero-flag invocation: whether the common case works without ceremony, whether the default path is the safe one, and whether any mandatory flag or positional could be replaced by discovery or a sensible default.

**Exports:** `defaultsAreSaneRubric`

## packages/cli/src/cli-ergonomics-craft/catalog/rubrics/destructive-actions-are-guarded.ts

[`packages/cli/src/cli-ergonomics-craft/catalog/rubrics/destructive-actions-are-guarded.ts`](/packages/cli/src/cli-ergonomics-craft/catalog/rubrics/destructive-actions-are-guarded.ts)

CLI-R007 — leaf-command rubric judging irreversible operations: whether a delete/reset/prune confirms or requires an explicit override, offers a preview mode, scopes its blast radius, and behaves sanely with no TTY instead of hanging or silently destroying.

**Exports:** `destructiveActionsAreGuardedRubric`

## packages/cli/src/cli-ergonomics-craft/catalog/rubrics/errors-are-actionable.ts

[`packages/cli/src/cli-ergonomics-craft/catalog/rubrics/errors-are-actionable.ts`](/packages/cli/src/cli-ergonomics-craft/catalog/rubrics/errors-are-actionable.ts)

CLI-R003 — leaf-command rubric judging failure messages: whether each error names the bad input and the fix in the user's terms rather than surfacing a raw stack trace, and whether expected failures are caught and rewritten instead of swallowed.

**Exports:** `errorsAreActionableRubric`

## packages/cli/src/cli-ergonomics-craft/catalog/rubrics/help-is-task-oriented.ts

[`packages/cli/src/cli-ergonomics-craft/catalog/rubrics/help-is-task-oriented.ts`](/packages/cli/src/cli-ergonomics-craft/catalog/rubrics/help-is-task-oriented.ts)

CLI-R002 — rubric applying to every command node, judging whether help text teaches the job: an outcome-naming one-liner rather than a restatement of the command name, at least one worked example, and flags described by what they accomplish with defaults stated.

**Exports:** `helpIsTaskOrientedRubric`

## packages/cli/src/cli-ergonomics-craft/catalog/rubrics/names-are-predictable.ts

[`packages/cli/src/cli-ergonomics-craft/catalog/rubrics/names-are-predictable.ts`](/packages/cli/src/cli-ergonomics-craft/catalog/rubrics/names-are-predictable.ts)

CLI-R001 — rubric applying to every command node, judging guessability of the command surface: one consistent subcommand grammar, one spelling per concept across flags, conventional short flags with long twins, and no abbreviation only the author would expand.

**Exports:** `namesArePredictableRubric`

## packages/cli/src/cli-ergonomics-craft/catalog/rubrics/output-is-scannable.ts

[`packages/cli/src/cli-ergonomics-craft/catalog/rubrics/output-is-scannable.ts`](/packages/cli/src/cli-ergonomics-craft/catalog/rubrics/output-is-scannable.ts)

CLI-R005 — leaf-command rubric judging human-facing output: whether the result stands out from the noise, whether color carries meaning and disables itself off a TTY or under NO_COLOR, whether chatter stays off stdout, and whether verbosity is proportionate.

**Exports:** `outputIsScannableRubric`

## packages/cli/src/code-craft/catalog/rubrics/abstraction-earns-keep.ts

[`packages/cli/src/code-craft/catalog/rubrics/abstraction-earns-keep.ts`](/packages/cli/src/code-craft/catalog/rubrics/abstraction-earns-keep.ts)

CODE-R004 — rubric for functions, methods, and classes judging whether an abstraction is deep enough to pay for itself: shallow pass-throughs, premature single-caller indirection, leaky interfaces, and the missing concept that Rule-of-Three duplication is asking for.

**Exports:** `abstractionEarnsKeepRubric`

## packages/cli/src/code-craft/catalog/rubrics/control-flow-honest.ts

[`packages/cli/src/code-craft/catalog/rubrics/control-flow-honest.ts`](/packages/cli/src/code-craft/catalog/rubrics/control-flow-honest.ts)

CODE-R002 — rubric for functions and methods judging branch structure: whether every conditional is load-bearing, whether the happy path reads straight down behind early guards, and whether boolean parameters, dead defensive checks, or error-swallowing catches distort the shape of the decision.

**Exports:** `controlFlowHonestRubric`

## packages/cli/src/code-craft/catalog/rubrics/one-story-one-altitude.ts

[`packages/cli/src/code-craft/catalog/rubrics/one-story-one-altitude.ts`](/packages/cli/src/code-craft/catalog/rubrics/one-story-one-altitude.ts)

CODE-R003 — rubric for functions and methods judging cohesion and level of abstraction: whether a body mixes orchestration with low-level fiddling, and whether the name promises one verb while the code performs several. Judges altitude, not raw line count.

**Exports:** `oneStoryOneAltitudeRubric`

## packages/cli/src/code-craft/catalog/rubrics/reveals-intent.ts

[`packages/cli/src/code-craft/catalog/rubrics/reveals-intent.ts`](/packages/cli/src/code-craft/catalog/rubrics/reveals-intent.ts)

CODE-R001 — rubric for functions, methods, and classes judging whether code reads in the domain's own vocabulary so a reader reconstructs WHY: business rules buried in anonymous conditionals, unnamed magic values, and apologetic comments. Identifier-level naming is left to naming-craft.

**Exports:** `revealsIntentRubric`

## packages/cli/src/code-craft/catalog/rubrics/senior-nods-not-winces.ts

[`packages/cli/src/code-craft/catalog/rubrics/senior-nods-not-winces.ts`](/packages/cli/src/code-craft/catalog/rubrics/senior-nods-not-winces.ts)

CODE-R007 — the holistic pass over functions, methods, and classes, asking what makes a senior reviewer wince rather than what breaks a nameable rule: silent shared mutation, ordering dependencies between calls, unclosed resources, a missing await, a comparison that works today by luck.

**Exports:** `seniorNodsNotWincesRubric`

## packages/cli/src/code-craft/catalog/rubrics/signature-keeps-promise.ts

[`packages/cli/src/code-craft/catalog/rubrics/signature-keeps-promise.ts`](/packages/cli/src/code-craft/catalog/rubrics/signature-keeps-promise.ts)

CODE-R006 — rubric for functions and methods judging the signature as a contract: query-named units that mutate or perform I/O, mutated arguments the name does not hint at, over-broad return types, and undocumented throws. Fires only when the signature's shape misrepresents behavior.

**Exports:** `signatureKeepsPromiseRubric`

## packages/cli/src/code-craft/catalog/rubrics/simplest-it-could-be.ts

[`packages/cli/src/code-craft/catalog/rubrics/simplest-it-could-be.ts`](/packages/cli/src/code-craft/catalog/rubrics/simplest-it-could-be.ts)

CODE-R005 — rubric for functions, methods, and classes separating essential from accidental complexity: the obvious-in-retrospect simplification, hand-rolled loops a single combinator expresses, special cases the general case already covers, and cleverness chosen over the plain form.

**Exports:** `simplestItCouldBeRubric`

## packages/cli/src/code-craft/extract/units.ts

[`packages/cli/src/code-craft/extract/units.ts`](/packages/cli/src/code-craft/extract/units.ts)

AST code-unit extractor for code-craft: one TypeScript Compiler API walk per file emits the substantive functions, methods, and classes worth critiquing, filtering out getters, one-line arrows, and pass-through wrappers so LLM budget is spent only where craft judgment can move the needle. Also slices a bounded source excerpt for a given unit.

**Exports:** `extractUnits`, `unitSource`

## packages/cli/src/docs-craft/catalog/rubrics/api-doc-predicts-response.ts

[`packages/cli/src/docs-craft/catalog/rubrics/api-doc-predicts-response.ts`](/packages/cli/src/docs-craft/catalog/rubrics/api-doc-predicts-response.ts)

DOCS-R005 — reference-only rubric asking whether a reader can predict what comes back before running anything: typed parameters with required-vs-optional and defaults, a concrete example response rather than prose, and an enumeration of error modes and status codes.

**Exports:** `apiDocPredictsResponseRubric`

## packages/cli/src/docs-craft/catalog/rubrics/examples-earn-their-place.ts

[`packages/cli/src/docs-craft/catalog/rubrics/examples-earn-their-place.ts`](/packages/cli/src/docs-craft/catalog/rubrics/examples-earn-their-place.ts)

DOCS-R003 — rubric for reference, guide, and readme docs judging code examples: whether each is concrete and runnable, teaches something the prose cannot, shows its output, and is not a near-duplicate varying only in a constant.

**Exports:** `examplesEarnTheirPlaceRubric`

## packages/cli/src/docs-craft/catalog/rubrics/order-matches-mental-model.ts

[`packages/cli/src/docs-craft/catalog/rubrics/order-matches-mental-model.ts`](/packages/cli/src/docs-craft/catalog/rubrics/order-matches-mental-model.ts)

DOCS-R002 — all-kinds rubric on sequencing and progressive disclosure: prerequisites before the steps needing them, common path before edge cases, and a structure that follows the reader's journey rather than the module layout or the order the code was written.

**Exports:** `orderMatchesMentalModelRubric`

## packages/cli/src/docs-craft/catalog/rubrics/prose-is-alive.ts

[`packages/cli/src/docs-craft/catalog/rubrics/prose-is-alive.ts`](/packages/cli/src/docs-craft/catalog/rubrics/prose-is-alive.ts)

DOCS-R004 — all-kinds rubric on writing voice: whether the prose is direct, active, and second-person, or clogged with passive constructions, nominalizations, hedging, and filler phrases such as "in order to" and "utilize".

**Exports:** `proseIsAliveRubric`

## packages/cli/src/docs-craft/catalog/rubrics/scannable-and-navigable.ts

[`packages/cli/src/docs-craft/catalog/rubrics/scannable-and-navigable.ts`](/packages/cli/src/docs-craft/catalog/rubrics/scannable-and-navigable.ts)

DOCS-R007 — all-kinds rubric on information findability: whether headings describe content well enough to jump to, whether paragraphs are skimmable, whether lists and tables replace prose where they beat it, and whether deep-linkable anchors exist.

**Exports:** `scannableAndNavigableRubric`

## packages/cli/src/docs-craft/catalog/rubrics/stranger-same-understanding.ts

[`packages/cli/src/docs-craft/catalog/rubrics/stranger-same-understanding.ts`](/packages/cli/src/docs-craft/catalog/rubrics/stranger-same-understanding.ts)

DOCS-R006 — all-kinds rubric on self-contained context: unexpanded acronyms, undefined jargon, internal systems or tickets named as if already known, and steps that silently assume a tool is installed or a permission granted.

**Exports:** `strangerSameUnderstandingRubric`

## packages/cli/src/docs-craft/catalog/rubrics/teaches-not-describes.ts

[`packages/cli/src/docs-craft/catalog/rubrics/teaches-not-describes.ts`](/packages/cli/src/docs-craft/catalog/rubrics/teaches-not-describes.ts)

DOCS-R001 — all-kinds rubric asking whether a doc hands over a mental model the reader can reason with, so they could predict behavior the page never spelled out, rather than enumerating options without saying which problem they solve or which one to reach for.

**Exports:** `teachesNotDescribesRubric`
