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
    const currentById = new Map(current.entries.map((e) => [e.id, e]));
    const freshById = new Map(fresh.entries.map((e) => [e.id, e]));

    const findings: DriftFinding[] = [
      ...this.findNew(currentById, freshById),
      ...this.findStale(currentById, freshById),
      ...this.findDrifted(currentById, freshById),
    ];
    findings.push(...this.findContradicting(fresh.entries, findings));

    const totalEntries = new Set([...currentById.keys(), ...freshById.keys()]).size;
    const driftScore = totalEntries > 0 ? findings.length / totalEntries : 0;

    return { findings, driftScore, summary: this.summarize(findings) };
  }

  /** 1. NEW: entries in fresh but not in current */
  private findNew(
    currentById: ReadonlyMap<string, KnowledgeSnapshotEntry>,
    freshById: ReadonlyMap<string, KnowledgeSnapshotEntry>
  ): DriftFinding[] {
    const findings: DriftFinding[] = [];
    for (const [id, entry] of freshById) {
      if (!currentById.has(id)) {
        findings.push({ entryId: id, classification: 'new', fresh: entry, severity: 'low' });
      }
    }
    return findings;
  }

  /** 2. STALE: entries in current but not in fresh */
  private findStale(
    currentById: ReadonlyMap<string, KnowledgeSnapshotEntry>,
    freshById: ReadonlyMap<string, KnowledgeSnapshotEntry>
  ): DriftFinding[] {
    const findings: DriftFinding[] = [];
    for (const [id, entry] of currentById) {
      if (!freshById.has(id)) {
        findings.push({ entryId: id, classification: 'stale', current: entry, severity: 'high' });
      }
    }
    return findings;
  }

  /** 3. DRIFTED: entries in both but contentHash differs */
  private findDrifted(
    currentById: ReadonlyMap<string, KnowledgeSnapshotEntry>,
    freshById: ReadonlyMap<string, KnowledgeSnapshotEntry>
  ): DriftFinding[] {
    const findings: DriftFinding[] = [];
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
    return findings;
  }

  /** 4. CONTRADICTING: same entity name from different sources with different content */
  private findContradicting(
    entries: readonly KnowledgeSnapshotEntry[],
    existing: readonly DriftFinding[]
  ): DriftFinding[] {
    const result: DriftFinding[] = [];
    // Only add one contradiction finding per group; skip if already contradicting
    const alreadyContradicting = new Set(
      existing.filter((f) => f.classification === 'contradicting').map((f) => f.entryId)
    );
    for (const [, group] of this.groupByName(entries)) {
      const finding = this.contradictionForGroup(group, alreadyContradicting);
      if (finding) {
        result.push(finding);
        alreadyContradicting.add(finding.entryId);
      }
    }
    return result;
  }

  private groupByName(
    entries: readonly KnowledgeSnapshotEntry[]
  ): Map<string, KnowledgeSnapshotEntry[]> {
    const byName = new Map<string, KnowledgeSnapshotEntry[]>();
    for (const entry of entries) {
      const group = byName.get(entry.name) ?? [];
      group.push(entry);
      byName.set(entry.name, group);
    }
    return byName;
  }

  private contradictionForGroup(
    group: readonly KnowledgeSnapshotEntry[],
    alreadyContradicting: ReadonlySet<string>
  ): DriftFinding | undefined {
    if (group.length <= 1) return undefined;
    const sources = new Set(group.map((e) => e.source));
    const hashes = new Set(group.map((e) => e.contentHash));
    if (sources.size <= 1 || hashes.size <= 1) return undefined;
    for (const entry of group) {
      if (!alreadyContradicting.has(entry.id)) {
        return {
          entryId: entry.id,
          classification: 'contradicting',
          fresh: entry,
          severity: 'critical',
        };
      }
    }
    return undefined;
  }

  private summarize(findings: readonly DriftFinding[]): DriftResult['summary'] {
    return {
      new: findings.filter((f) => f.classification === 'new').length,
      drifted: findings.filter((f) => f.classification === 'drifted').length,
      stale: findings.filter((f) => f.classification === 'stale').length,
      contradicting: findings.filter((f) => f.classification === 'contradicting').length,
    };
  }
}
