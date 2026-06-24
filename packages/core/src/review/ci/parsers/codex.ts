import { buildCiReviewVerdict, type CiReviewVerdict } from '../verdict-schema';

/** A single event line in the `codex exec --json` JSONL stream. */
interface CodexEvent {
  type?: string;
  item?: {
    id?: string;
    type?: string;
    /** For `agent_message` items: the JSON-string verdict the model produced. */
    text?: string;
  };
}

/** The inner verdict, parsed out of the last `agent_message` item's `.text`. */
interface CodexInnerVerdict {
  assessment: 'approve' | 'comment' | 'request-changes';
  findings?: unknown[];
}

/**
 * Map a `codex exec --json <instruction>` JSONL event stream into a
 * normalized CiReviewVerdict.
 *
 * The stream is one JSON object per line (thread.started, turn.started,
 * item.completed, turn.completed, ...). The verdict lives in the `.item.text`
 * of the `item.completed` event whose `item.type === 'agent_message'` — a JSON
 * *string* that must itself be parsed. (Confirmed against the real CLI, Task 10
 * smoke test.) If multiple agent_message items appear, the LAST one wins.
 *
 * Robust to non-JSON lines (they are skipped). Throws if no agent_message item
 * is found, or if its `.text` is not valid JSON — matching the parser error
 * convention (no silent pass on a malformed stream).
 */
export function parseCodexVerdict(raw: string): CiReviewVerdict {
  let lastAgentMessageText: string | undefined;

  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    let event: CodexEvent;
    try {
      event = JSON.parse(trimmed) as CodexEvent;
    } catch {
      // Non-JSON noise on stdout (e.g. progress logs) — skip defensively.
      continue;
    }
    if (
      event.type === 'item.completed' &&
      event.item?.type === 'agent_message' &&
      typeof event.item.text === 'string'
    ) {
      lastAgentMessageText = event.item.text;
    }
  }

  if (lastAgentMessageText === undefined) {
    throw new Error(
      'parseCodexVerdict: no `item.completed` agent_message event found in codex JSONL stream'
    );
  }

  // The agent_message text is a JSON-string verdict. Throws on bad JSON.
  const inner = JSON.parse(lastAgentMessageText) as CodexInnerVerdict;

  // findings are still UNVALIDATED here; buildCiReviewVerdict schema-validates
  // them FIRST and then derives blockingFindings/exitCode from validated data.
  return buildCiReviewVerdict({
    runner: 'codex',
    ranLlmTier: true,
    assessment: inner.assessment,
    findings: inner.findings,
  });
}
