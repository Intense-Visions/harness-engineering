/**
 * DRIFT-P* suggestion emitter — precise per-primitive replacement
 * guidance. v1 never auto-applies primitive adoption (prop translation
 * lives in v1.x).
 *
 * Source: docs/changes/design-pipeline/align-design-system/proposal.md
 *   (Technical Design → Suggestion implementation).
 */

import type { DriftFinding } from '../../drift/findings/finding.js';
import type { FixSuggestion } from '../findings/outcome.js';

const TAG_TO_COMPONENT: Record<string, string> = {
  'DRIFT-P001': 'Button',
  'DRIFT-P002': 'Input',
  'DRIFT-P003': 'Link',
  'DRIFT-P004': 'Textarea',
};

export function emitPrimitiveSuggestion(finding: DriftFinding): FixSuggestion {
  const component = TAG_TO_COMPONENT[finding.code] ?? 'Component';
  const tag = component.toLowerCase();
  return {
    description: `Replace raw <${tag}> with the registered <${component}> primitive. Audit props: event handlers (onClick), ref forwarding, and className merging may differ from the raw HTML element.`,
    preview: `Suggested replacement:\n  import { ${component} } from '<your component library>';\n  …\n  <${component} … />`,
  };
}
