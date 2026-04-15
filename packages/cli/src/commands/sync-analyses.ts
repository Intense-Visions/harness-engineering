import type { TrackerComment } from '@harness-engineering/types';
import type { AnalysisRecord } from '@harness-engineering/orchestrator';

/**
 * Scan an array of tracker comments for the most recent one containing
 * a ```json fence with `"_harness_analysis": true`. Parse and return
 * the AnalysisRecord, or null if none found / all malformed.
 */
export function extractAnalysisFromComments(
  comments: TrackerComment[]
): AnalysisRecord | null {
  // Sort by createdAt descending so we check the most recent first
  const sorted = [...comments].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  for (const comment of sorted) {
    // Match ```json ... ``` fences
    const fenceRegex = /```json\n([\s\S]*?)\n```/g;
    let match: RegExpExecArray | null;

    while ((match = fenceRegex.exec(comment.body)) !== null) {
      try {
        const parsed = JSON.parse(match[1]!);
        if (parsed._harness_analysis === true) {
          // Strip discriminator fields before returning
          const { _harness_analysis, _version, ...record } = parsed;
          return record as AnalysisRecord;
        }
      } catch {
        // Malformed JSON -- continue to next fence or next comment
        continue;
      }
    }
  }

  return null;
}
