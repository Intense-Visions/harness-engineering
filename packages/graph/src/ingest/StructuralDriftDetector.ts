import type { NodeType } from '../types.js';

export type DriftClassification = 'new' | 'drifted' | 'stale' | 'contradicting';

export interface KnowledgeSnapshotEntry {
  readonly id: string;
  readonly type: NodeType;
  readonly contentHash: string;
  readonly source: string; // 'extractor', 'linker', 'diagram', 'manual'
  readonly name: string;
}

export interface KnowledgeSnapshot {
  readonly entries: readonly KnowledgeSnapshotEntry[];
  readonly timestamp: string; // ISO 8601
}

export interface DriftFinding {
  readonly entryId: string;
  readonly classification: DriftClassification;
  readonly current?: KnowledgeSnapshotEntry;
  readonly fresh?: KnowledgeSnapshotEntry;
  readonly severity: 'critical' | 'high' | 'medium' | 'low';
}

export interface DriftResult {
  readonly findings: readonly DriftFinding[];
  readonly driftScore: number; // 0.0-1.0
  readonly summary: {
    readonly new: number;
    readonly drifted: number;
    readonly stale: number;
    readonly contradicting: number;
  };
}

export interface DriftDetector {
  detect(current: KnowledgeSnapshot, fresh: KnowledgeSnapshot): DriftResult;
}

export class StructuralDriftDetector implements DriftDetector {
  detect(current: KnowledgeSnapshot, fresh: KnowledgeSnapshot): DriftResult {
    const findings: DriftFinding[] = [];
    const currentById = new Map(current.entries.map((e) => [e.id, e]));
    const freshById = new Map(fresh.entries.map((e) => [e.id, e]));

    // 1. NEW: entries in fresh but not in current
    for (const [id, entry] of freshById) {
      if (!currentById.has(id)) {
        findings.push({
          entryId: id,
          classification: 'new',
          fresh: entry,
          severity: 'low',
        });
      }
    }

    // 2. STALE: entries in current but not in fresh
    for (const [id, entry] of currentById) {
      if (!freshById.has(id)) {
        findings.push({
          entryId: id,
          classification: 'stale',
          current: entry,
          severity: 'high',
        });
      }
    }

    // 3. DRIFTED: entries in both but contentHash differs
    for (const [id, freshEntry] of freshById) {
      const currentEntry = currentById.get(id);
      if (currentEntry && currentEntry.contentHash !== freshEntry.contentHash) {
        findings.push({
          entryId: id,
          classification: 'drifted',
          current: currentEntry,
          fresh: freshEntry,
          severity: 'medium',
        });
      }
    }

    // 4. CONTRADICTING: same entity name from different sources with different content
    const byName = new Map<string, KnowledgeSnapshotEntry[]>();
    for (const entry of fresh.entries) {
      const group = byName.get(entry.name) ?? [];
      group.push(entry);
      byName.set(entry.name, group);
    }
    for (const [, group] of byName) {
      if (group.length > 1) {
        const sources = new Set(group.map((e) => e.source));
        const hashes = new Set(group.map((e) => e.contentHash));
        if (sources.size > 1 && hashes.size > 1) {
          // Only add one contradiction finding per group; skip if already contradicting
          const alreadyContradicting = new Set(
            findings.filter((f) => f.classification === 'contradicting').map((f) => f.entryId)
          );
          for (const entry of group) {
            if (!alreadyContradicting.has(entry.id)) {
              findings.push({
                entryId: entry.id,
                classification: 'contradicting',
                fresh: entry,
                severity: 'critical',
              });
              break; // One finding per contradiction group
            }
          }
        }
      }
    }

    const totalEntries = new Set([...currentById.keys(), ...freshById.keys()]).size;
    const driftScore = totalEntries > 0 ? findings.length / totalEntries : 0;

    const summary = {
      new: findings.filter((f) => f.classification === 'new').length,
      drifted: findings.filter((f) => f.classification === 'drifted').length,
      stale: findings.filter((f) => f.classification === 'stale').length,
      contradicting: findings.filter((f) => f.classification === 'contradicting').length,
    };

    return { findings, driftScore, summary };
  }
}
