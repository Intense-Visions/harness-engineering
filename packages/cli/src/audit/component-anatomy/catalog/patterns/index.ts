/**
 * ANAT-P* pattern catalog — "missing-anatomy-component" composition patterns.
 *
 * Where conventions (ANAT-D*) check a component *definition* for required parts,
 * patterns (ANAT-P*) check *composition* sites for missing affordances: a list
 * rendered with no empty state, an async fetch with no loading boundary, a modal
 * with no dismiss, etc. (proposal.md Decision #2 — the "blue-ocean" finding
 * class).
 *
 * Detection is conservative source-heuristic (no tree-sitter dependency): a
 * finding fires only when a *trigger* construct is present in a file AND none of
 * the *mitigating* affordances appear anywhere in that file. This keeps false
 * positives low (proposal Success Criterion 6, ≤5% FP) at the cost of missing
 * intra-file edge cases. Findings are `warn` severity with a manual fix hint.
 *
 * Patterns deliberately avoid pure accessibility checks (img-alt, input-label,
 * etc.) — those overlap harness-accessibility and are deferred to v2 per
 * Decision #2. These are state/affordance *completeness* checks.
 */

import type { AnatomyFinding } from '../../findings/finding.js';

export interface PatternCheck {
  code: AnatomyFinding['code'];
  /** Stable slug surfaced in `summary.catalog.patternsApplied`. */
  id: string;
  /** Authoritative citation written into `finding.rule.source`. */
  source: string;
  /** Scan a file's source; return zero or more findings (file path pre-resolved). */
  detect(file: string, contents: string, componentType: string | null): AnatomyFinding[];
}

/** 1-indexed line number of a character offset. */
function lineAt(contents: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < contents.length; i++) {
    if (contents[i] === '\n') line += 1;
  }
  return line;
}

const anyMatch = (contents: string, res: RegExp[]): boolean => res.some((re) => re.test(contents));

/** First match index across an ordered list of trigger patterns, or -1. */
function firstTrigger(contents: string, triggers: RegExp[]): number {
  let best = -1;
  for (const re of triggers) {
    const m = re.exec(contents);
    if (m && (best === -1 || m.index < best)) best = m.index;
  }
  return best;
}

interface PatternSpec {
  code: AnatomyFinding['code'];
  id: string;
  /** Constructs that, when present, indicate the pattern *could* apply. */
  triggers: RegExp[];
  /** Affordances whose presence anywhere in the file suppresses the finding. */
  mitigations: RegExp[];
  message: string;
  fix: string;
}

/**
 * Build a {@link PatternCheck} from the common "trigger present AND no mitigation
 * in file" shape. Emits at most one finding per file, located at the first
 * trigger. Every pattern in this catalog is expressed this way.
 */
function presencePattern(spec: PatternSpec): PatternCheck {
  return {
    code: spec.code,
    id: spec.id,
    source: `design-component-anatomy/pattern-${spec.id}`,
    detect(file, contents, componentType) {
      const index = firstTrigger(contents, spec.triggers);
      if (index === -1) return [];
      if (anyMatch(contents, spec.mitigations)) return [];
      const line = lineAt(contents, index);
      const snippet = (contents.split('\n')[line - 1] ?? '').trim();
      return [
        {
          code: spec.code,
          severity: 'warn',
          file,
          line,
          componentType,
          message: spec.message,
          evidence: { snippet },
          rule: { id: spec.code, source: `design-component-anatomy/pattern-${spec.id}` },
          fix: { kind: 'manual', description: spec.fix },
        },
      ];
    },
  };
}

const SPECS: PatternSpec[] = [
  {
    code: 'ANAT-P001',
    id: 'map-without-empty',
    triggers: [/\.map\s*\(/],
    mitigations: [
      /\.length\s*===\s*0/,
      /\.length\s*<\s*1/,
      /\.length\s*>\s*0/,
      /\.length\s*\?/,
      /\blength\s*&&/,
      /\?\.length\b/,
      /\bisEmpty\b/,
      /\bEmptyState\b/,
      /\bno\s+(results|items|data|entries)\b/i,
    ],
    message:
      'List rendered with `.map(...)` but no empty state was found. An empty list renders as a blank region — add a length-zero branch (e.g. an EmptyState).',
    fix: 'Guard the list: `items.length === 0 ? <EmptyState/> : items.map(...)`.',
  },
  {
    code: 'ANAT-P002',
    id: 'fetch-without-loading',
    triggers: [/\bfetch\s*\(/, /\buse(Query|SWR|Swr|Mutation)\b/, /\baxios\s*[.(]/, /\bawait\s+/],
    mitigations: [
      /\bis?Loading\b/i,
      /\bisPending\b/i,
      /\bpending\b/i,
      /\bSkeleton\b/,
      /\bSpinner\b/,
      /<Suspense\b/,
      /\bplaceholder\b/i,
    ],
    message:
      'Async data loading found but no loading state. The surface renders empty until data resolves — add a loading boundary (skeleton, spinner, or Suspense).',
    fix: 'Render a loading affordance while the request is in flight (e.g. `if (isLoading) return <Skeleton/>`).',
  },
  {
    code: 'ANAT-P003',
    id: 'fetch-without-error',
    triggers: [/\bfetch\s*\(/, /\buse(Query|SWR|Swr|Mutation)\b/, /\baxios\s*[.(]/, /\bawait\s+/],
    mitigations: [
      /\bis?Error\b/i,
      /\berror\b/i,
      /\bcatch\s*\(/,
      /\.catch\s*\(/,
      /\bErrorState\b/,
      /\bErrorBoundary\b/,
      /role=["']alert["']/,
    ],
    message:
      'Async data loading found but no error state. A failed request renders nothing or throws — handle and display the error case.',
    fix: 'Add an error branch (e.g. `if (isError) return <ErrorState/>`) or a try/catch around the request.',
  },
  {
    code: 'ANAT-P004',
    id: 'conditional-render-without-fallback',
    triggers: [/\{\s*[\w.]*(data|items|list|results|rows|user|profile)[\w.]*\s*&&/i],
    mitigations: [/\?\s*\(?</, /\?\?/, /\bEmptyState\b/, /:\s*null/, /:\s*</, /\.length\s*===\s*0/],
    message:
      'Data-driven `{value && <…>}` render with no fallback. When `value` is falsy the region collapses silently — provide an explicit empty/else branch.',
    fix: 'Use a ternary with a fallback: `value ? <View/> : <EmptyState/>`.',
  },
  {
    code: 'ANAT-P005',
    id: 'form-without-submit-feedback',
    triggers: [/<form\b/i, /\bonSubmit\b/, /\bhandleSubmit\b/],
    mitigations: [
      /\bisSubmitting\b/i,
      /\bpending\b/i,
      /\bsuccess\b/i,
      /\berror\b/i,
      /\bdisabled\b/,
      /role=["']alert["']/,
      /\btoast\b/i,
    ],
    message:
      'Form submission found but no submit feedback (pending / success / error). The user gets no signal that submit worked or failed.',
    fix: 'Disable the submit control while pending and surface a success/error state after submission.',
  },
  {
    code: 'ANAT-P006',
    id: 'modal-without-dismiss',
    triggers: [/<(Modal|Dialog|Drawer|Sheet|Popover)\b/],
    mitigations: [/\bonClose\b/, /\bonDismiss\b/, /\bonOpenChange\b/, /\bclose\b/i, /\bonCancel\b/],
    message:
      'Modal/Dialog/Drawer used with no dismiss affordance (`onClose` / `onDismiss` / `onOpenChange`). A modal the user cannot close is a trap.',
    fix: 'Wire a dismiss handler (`onClose` / `onOpenChange`) and a visible close control.',
  },
  {
    code: 'ANAT-P007',
    id: 'async-action-without-pending',
    triggers: [
      /on[A-Z]\w*=\{?\s*async\b/,
      /\bhandle\w*\s*=\s*async\b/,
      /async\s+function\s+handle/i,
    ],
    mitigations: [
      /\bdisabled\b/,
      /\bis?Pending\b/i,
      /\bis?Loading\b/i,
      /\bis?Submitting\b/i,
      /\bSpinner\b/,
    ],
    message:
      'Async action handler with no pending state. Without disabling/feedback the user can double-submit and gets no progress signal.',
    fix: 'Track a pending flag and disable the control (and show a spinner) while the action runs.',
  },
  {
    code: 'ANAT-P008',
    id: 'list-without-key',
    triggers: [/\.map\s*\(\s*\(?[^)]*\)?\s*=>\s*</],
    mitigations: [/\bkey=/],
    message:
      'Elements rendered from `.map(...)` with no `key` prop. Missing keys break reconciliation (lost state, mis-ordered DOM).',
    fix: 'Add a stable `key` to the top-level mapped element: `items.map((i) => <Row key={i.id} />)`.',
  },
  {
    code: 'ANAT-P009',
    id: 'router-without-not-found',
    triggers: [/<Routes\b/, /<Switch\b/, /\bcreateBrowserRouter\b/],
    mitigations: [
      /path=["']\*["']/,
      /path=["']\/\*["']/,
      /\bNotFound\b/,
      /\bcatchAll\b/i,
      /\b404\b/,
    ],
    message: 'Route table with no catch-all / not-found route. Unmatched URLs render a blank page.',
    fix: 'Add a catch-all route (`<Route path="*" element={<NotFound/>} />`).',
  },
  {
    code: 'ANAT-P010',
    id: 'destructive-action-without-confirm',
    triggers: [
      /\b(onDelete|handleDelete|handleRemove|onRemove)\b/,
      /\b(delete|remove|destroy)\w*\s*\(/i,
    ],
    mitigations: [
      /\bconfirm\s*\(/i,
      /\bAlertDialog\b/,
      /\bConfirm(ation)?(Dialog|Modal)?\b/,
      /\bareYouSure\b/i,
      /\bwindow\.confirm\b/,
    ],
    message:
      'Destructive action (delete/remove) with no confirmation step. A single click irreversibly destroys data.',
    fix: 'Gate the action behind a confirmation (e.g. an AlertDialog) before performing it.',
  },
];

/** The v1 ANAT-P* catalog (10 patterns), in stable order. */
export const PATTERN_CHECKS: readonly PatternCheck[] = SPECS.map(presencePattern);
