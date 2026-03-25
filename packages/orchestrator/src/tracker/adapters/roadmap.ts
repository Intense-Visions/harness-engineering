import * as fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { parseRoadmap } from '@harness-engineering/core';
import {
  Result,
  Ok,
  Err,
  Issue,
  IssueTrackerClient,
  TrackerConfig,
  BlockerRef,
} from '@harness-engineering/types';

export class RoadmapTrackerAdapter implements IssueTrackerClient {
  private config: TrackerConfig;

  constructor(config: TrackerConfig) {
    this.config = config;
    if (!config.filePath) {
      throw new Error('RoadmapTrackerAdapter requires a filePath in TrackerConfig');
    }
  }

  async fetchCandidateIssues(): Promise<Result<Issue[], Error>> {
    return this.fetchIssuesByStates(this.config.activeStates);
  }

  async fetchIssuesByStates(stateNames: string[]): Promise<Result<Issue[], Error>> {
    try {
      if (!this.config.filePath) return Err(new Error('Missing filePath'));
      const content = await fs.readFile(this.config.filePath, 'utf-8');
      const roadmapResult = parseRoadmap(content);
      if (!roadmapResult.ok) return roadmapResult as any; // Cast for Error

      const issues: Issue[] = [];
      for (const milestone of roadmapResult.value.milestones) {
        for (const feature of milestone.features) {
          if (stateNames.includes(feature.status)) {
            issues.push(this.mapFeatureToIssue(feature));
          }
        }
      }

      return Ok(issues);
    } catch (error) {
      return Err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async fetchIssueStatesByIds(issueIds: string[]): Promise<Result<Map<string, Issue>, Error>> {
    try {
      if (!this.config.filePath) return Err(new Error('Missing filePath'));
      const content = await fs.readFile(this.config.filePath, 'utf-8');
      const roadmapResult = parseRoadmap(content);
      if (!roadmapResult.ok) return roadmapResult as any;

      const issueMap = new Map<string, Issue>();
      for (const milestone of roadmapResult.value.milestones) {
        for (const feature of milestone.features) {
          const issue = this.mapFeatureToIssue(feature);
          if (issueIds.includes(issue.id)) {
            issueMap.set(issue.id, issue);
          }
        }
      }

      return Ok(issueMap);
    } catch (error) {
      return Err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private mapFeatureToIssue(feature: any): Issue {
    const id = this.generateId(feature.name);
    return {
      id,
      identifier: id,
      title: feature.name,
      description: feature.summary,
      priority: null,
      state: feature.status,
      branchName: null,
      url: null,
      labels: [],
      blockedBy: feature.blockedBy.map((b: string) => ({
        id: this.generateId(b),
        identifier: b,
        state: null,
      })) as BlockerRef[],
      createdAt: null,
      updatedAt: null,
    };
  }

  private generateId(name: string): string {
    const hash = createHash('sha256').update(name).digest('hex').slice(0, 8);
    const sanitized = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .slice(0, 20);
    return `${sanitized}-${hash}`;
  }
}
