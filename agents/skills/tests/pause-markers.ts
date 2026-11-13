// agents/skills/tests/pause-markers.ts
//
// Mechanical check for the Pause Protocol marker convention (SC12 in
// docs/changes/trusted-autonomy-mode/proposal.md). A pause point is a line that asks the
// human something, or stops until the human acts. In a workflow skill every such line must
// sit at most MARKER_WINDOW lines below a canonical marker line, or carry an explicit
// `<!-- not-a-pause: <reason> -->` opt-out.
//
// Detection is phrase-based, so it is a floor, not a proof: a pause worded so that no phrase
// matches is invisible here. scanSkill therefore reports its denominator (phrase lines found),
// and the real-skill test pins a per-skill floor, so a detector that finds nothing cannot pass.
//
// No imports on purpose: agents/skills/tests is inside the architecture scan.

export const PAUSE_CLASSES = ['ceremony', 'judgment', 'irreversible', 'gate'] as const;
export type PauseClass = (typeof PAUSE_CLASSES)[number];

export const WORKFLOW_SKILLS = [
  'harness-brainstorming',
  'harness-planning',
  'harness-autopilot',
  'harness-execution',
  'harness-soundness-review',
  'harness-code-review',
  'harness-integration',
] as const;

/** Phrases that put a question to the human, or stop until the human acts. */
export const PAUSE_PHRASES: readonly RegExp[] = [
  /\b(?:Proceed|Continue)\?/,
  /\?\s*\(\s*(?:yes|y)\b/,
  /\(\s*yes\s*\/\s*no\s*\)|\(y\/n\)/,
  /\bApprove\b/,
  /\bApproval gate\b/,
  /\b[Ww]ait for\b/,
  /\b[Aa]sk (?:the human|the user|in plain text|directly|which)\b|\b[Aa]sk\s*["“]/,
  /\byour (?:input|reply|choice|answer|approval|action)\b/,
  /\bSTOP\b/,
  /\[checkpoint:(?:human-verify|decision|human-action)\]/,
  /(?<!\b(?:not|NOT|never|Never|no|No)\s+)\b[Pp]ause[sd]?\b/,
  /\b[Dd]o not proceed\b/,
  /["']?requiresConfirmation["']?\s*:\s*true/,
  /\b[Ee]scalate\b/,
  /\b[Gg]et (?:explicit )?(?:feedback|approval|acknowledgment)\b/,
  /\b(?:user|human) (?:confirms|declines|approves)\b/,
  /\bfor human review\b/,
];

/** A pause phrase is covered by a marker on its anchor line or up to this many lines above. */
export const MARKER_WINDOW = 3;

/** The heading of the preamble every workflow skill carries exactly once. */
export const PAUSE_PREAMBLE_HEADING = '### Pause points';

/** The preamble every workflow skill carries verbatim (SC1-SC4, SC14), placed before a heading. */
export const PAUSE_PREAMBLE = [
  PAUSE_PREAMBLE_HEADING,
  '',
  'Every point below where this skill stops for the human carries a marker line, `_Pause point (<class>): resolve per the Pause Protocol._` followed by a `<!-- pause: <class> -->` comment. Resolve each one with the Pause Protocol: `agents/skills/templates/pause-protocol.md` (also shipped in the harness CLI package at `dist/agents/skills/templates/pause-protocol.md`).',
  '',
  '- Re-read autonomy at every pause point: `gather_context({ path, session, include: ["autonomy"] })`.',
  '- `irreversible` and `gate` pauses stop at every autonomy level.',
  '- A `ceremony` or `judgment` pause auto-resolves only when autonomy is `trusted`, the pause states a recommendation, a `judgment` fork passed the self-audit, and `record_auto_decision` returned `recorded: true`. In every other case, pause exactly as written below.',
  '- If you cannot read the protocol or resolve autonomy, pause.',
].join('\n');

/** The end-of-run summary step terminal skills carry verbatim (SC11). */
export const SUMMARY_STEP =
  '**Auto-decision summary (SC11).** Run `harness autonomy log --session <session-slug>`. If its output contains a line starting `No auto-decisions recorded`, print nothing more; otherwise print the output verbatim. If the command fails or is not recognised, print `Auto-decision summary unavailable (<reason>); raw log: .harness/sessions/<session-slug>/auto-decisions.jsonl` and never report zero decisions you did not read.';

/** Sections that illustrate, argue, or summarise the protocol; never an instruction to pause. */
const EXEMPT_HEADING =
  /^#{2,6}\s+(?:Red Flags|Rationalizations to Reject|Examples?\b|Pause points\b)/;
const HEADING = /^#{1,6}\s/;
const FENCE = /^\s*(?:```|~~~)/;
const TABLE_ROW = /^\s*\|/;
const ANY_MARKER = /<!--\s*pause\s*:([^>]*?)-->/g;
const OPT_OUT = /<!--\s*not-a-pause\s*:\s*([^>]*?)\s*-->/;
const ANY_COMMENT = /<!--[\s\S]*?-->/g;
const REFERENCE = /_Pause point \([a-z-]+\): resolve per the Pause Protocol\._/g;
/** The protocol's own name is not a pause phrase. */
const PROTOCOL_NAME = /\bPause Protocol\b|pause-protocol(?:\.md)?/g;

/** The one accepted marker line (prettier-stable: emphasis first, comment trailing). */
export function canonicalMarkerLine(c: PauseClass): string {
  return `_Pause point (${c}): resolve per the Pause Protocol._ <!-- pause: ${c} -->`;
}

export interface PausePhraseHit {
  /** 1-based line of the phrase. */
  line: number;
  /** 1-based line coverage is measured from: the fence or table start for lines inside one. */
  anchor: number;
  text: string;
  covered: boolean;
  optedOut: boolean;
  /** Distinct marker classes in the window; more than one is ambiguous and fails SC12. */
  classes: PauseClass[];
}

export interface SkillScan {
  pausePhrases: PausePhraseHit[];
  markers: Array<{ line: number; cls: PauseClass }>;
  optOuts: number;
  exemptHits: number;
  errors: string[];
}

interface ScanState {
  scan: SkillScan;
  markerAt: Map<number, PauseClass>;
  optOutAt: Set<number>;
  fence: number;
  table: number;
  exempt: boolean;
  /** The previous non-blank line was a marker, so this line is a (possibly hand-marked) pause. */
  afterMarker: boolean;
}

export function isPausePhrase(raw: string): boolean {
  const text = raw.replace(REFERENCE, '').replace(ANY_COMMENT, '').replace(PROTOCOL_NAME, '');
  return PAUSE_PHRASES.some((p) => p.test(text));
}

function isPauseClass(s: string): s is PauseClass {
  return (PAUSE_CLASSES as readonly string[]).includes(s);
}

/** Validate every pause marker on a line; return its class when the line is canonical. */
function readMarker(raw: string, n: number, errors: string[]): PauseClass | undefined {
  const found = [...raw.matchAll(ANY_MARKER)];
  if (found.length === 0) return undefined;
  if (found.length > 1) errors.push(`line ${n}: more than one pause marker on one line`);
  const cls = (found[0]?.[1] ?? '').trim();
  if (!isPauseClass(cls)) {
    errors.push(`line ${n}: unknown pause class "${cls}" (expected ${PAUSE_CLASSES.join('|')})`);
    return undefined;
  }
  if (raw.trim() !== canonicalMarkerLine(cls)) {
    errors.push(`line ${n}: non-canonical marker line; expected "${canonicalMarkerLine(cls)}"`);
    return undefined;
  }
  return cls;
}

function readOptOut(raw: string, n: number, errors: string[]): boolean {
  const m = OPT_OUT.exec(raw);
  if (!m) return false;
  if ((m[1] ?? '').split(/\s+/).filter(Boolean).length < 3) {
    errors.push(`line ${n}: not-a-pause needs a reason of at least three words`);
  }
  return true;
}

/** Lines inside a fence or a table are anchored at the block's first line (0-based). */
function anchorOf(raw: string, i: number, st: ScanState): number {
  if (FENCE.test(raw)) {
    st.fence = st.fence < 0 ? i : -1;
    return i;
  }
  if (st.fence >= 0) return st.fence;
  if (!TABLE_ROW.test(raw)) st.table = -1;
  else if (st.table < 0) st.table = i;
  return st.table >= 0 ? st.table : i;
}

function hasNear(at: Set<number>, from: number, window: number): boolean {
  for (let k = from; k >= Math.max(0, from - window); k -= 1) {
    if (at.has(k)) return true;
  }
  return false;
}

/** Distinct marker classes from `from` up to `window` lines above it (0-based lines). */
function classesNear(at: Map<number, PauseClass>, from: number, window: number): PauseClass[] {
  const found = new Set<PauseClass>();
  for (let k = from; k >= Math.max(0, from - window); k -= 1) {
    const cls = at.get(k);
    if (cls !== undefined) found.add(cls);
  }
  return [...found];
}

function recordAnnotations(raw: string, i: number, st: ScanState): void {
  const cls = readMarker(raw, i + 1, st.scan.errors);
  if (cls !== undefined) {
    st.scan.markers.push({ line: i + 1, cls });
    st.markerAt.set(i, cls);
  }
  if (readOptOut(raw, i + 1, st.scan.errors)) {
    st.scan.optOuts += 1;
    st.optOutAt.add(i);
  }
}

/** The first non-blank line under a marker is a pause even without a phrase: one class per window (N1). */
function checkMarkedLine(raw: string, i: number, anchor: number, st: ScanState): void {
  if (raw.trim() === '') return;
  if (st.markerAt.has(i)) {
    st.afterMarker = true;
    return;
  }
  if (!st.afterMarker) return;
  st.afterMarker = false;
  if (isPausePhrase(raw)) return; // checked with the pause phrases
  const classes = classesNear(st.markerAt, anchor, MARKER_WINDOW);
  if (classes.length > 1) {
    st.scan.errors.push(
      `line ${i + 1}: marked line has markers of more than one class in its window (${classes.sort().join(', ')})`
    );
  }
}

function scanLine(raw: string, i: number, st: ScanState): void {
  if (st.fence < 0 && HEADING.test(raw)) st.exempt = EXEMPT_HEADING.test(raw);
  const anchor = anchorOf(raw, i, st);
  recordAnnotations(raw, i, st);
  checkMarkedLine(raw, i, anchor, st);
  if (FENCE.test(raw) || !isPausePhrase(raw)) return;
  if (st.exempt) {
    st.scan.exemptHits += 1;
    return;
  }
  const classes = classesNear(st.markerAt, anchor, MARKER_WINDOW);
  st.scan.pausePhrases.push({
    line: i + 1,
    anchor: anchor + 1,
    text: raw.trim(),
    covered: classes.length > 0,
    classes,
    optedOut: hasNear(st.optOutAt, i, 1) || hasNear(st.optOutAt, anchor, 1),
  });
}

export function scanSkill(text: string): SkillScan {
  const st: ScanState = {
    scan: { pausePhrases: [], markers: [], optOuts: 0, exemptHits: 0, errors: [] },
    markerAt: new Map<number, PauseClass>(),
    optOutAt: new Set<number>(),
    fence: -1,
    table: -1,
    exempt: false,
    afterMarker: false,
  };
  text.split('\n').forEach((raw, i) => scanLine(raw, i, st));
  return st.scan;
}

/** Everything that makes a skill fail SC12. Empty means compliant. */
export function pauseMarkerViolations(scan: SkillScan): string[] {
  const out = [...scan.errors];
  for (const p of scan.pausePhrases) {
    if (!p.covered && !p.optedOut) {
      out.push(`line ${p.line}: unmarked pause point: ${p.text.slice(0, 100)}`);
    }
    if (p.classes.length > 1) {
      out.push(
        `line ${p.line}: pause point has markers of more than one class in its window (${[...p.classes].sort().join(', ')}): ${p.text.slice(0, 80)}`
      );
    }
  }
  return out;
}
