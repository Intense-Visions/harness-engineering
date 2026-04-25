import { SkillEntry } from '../types/skills';

export const SKILL_REGISTRY: SkillEntry[] = [
  // Health
  {
    id: 'harness:validate',
    name: 'Validate Project',
    description: 'Run comprehensive project health checks and dependency validation.',
    category: 'health',
    slashCommand: '/harness:validate',
  },
  {
    id: 'harness:verify',
    name: 'Verify Implementation',
    description: 'Deep audit of implemented artifacts against their specs and plans.',
    category: 'health',
    slashCommand: '/harness:verify',
  },
  {
    id: 'harness:integrity',
    name: 'Check Integrity',
    description: 'Verify codebase integrity and find missing or orphaned files.',
    category: 'health',
    slashCommand: '/harness:integrity',
  },

  // Security
  {
    id: 'harness:security-scan',
    name: 'Security Scan',
    description: 'Scan codebase for secrets, vulnerabilities, and misconfigurations.',
    category: 'security',
    slashCommand: '/harness:security-scan',
    contextSources: ['/api/checks'],
  },
  {
    id: 'harness:supply-chain-audit',
    name: 'Supply Chain Audit',
    description: 'Analyze dependency tree for security risks and license compliance.',
    category: 'security',
    slashCommand: '/harness:supply-chain-audit',
  },

  // Performance
  {
    id: 'harness:perf',
    name: 'Performance Audit',
    description: 'Analyze performance bottlenecks and resource utilization.',
    category: 'performance',
    slashCommand: '/harness:perf',
    contextSources: ['/api/checks'],
  },

  // Architecture
  {
    id: 'harness:enforce-architecture',
    name: 'Enforce Architecture',
    description: 'Check for architectural violations and boundary drift.',
    category: 'architecture',
    slashCommand: '/harness:enforce-architecture',
    contextSources: ['/api/checks'],
  },
  {
    id: 'harness:dependency-health',
    name: 'Dependency Health',
    description: 'Evaluate dependency graph for cycles and outdated packages.',
    category: 'architecture',
    slashCommand: '/harness:dependency-health',
  },

  // Code Quality
  {
    id: 'harness:code-review',
    name: 'Code Review',
    description: 'Perform an automated deep-context code review of recent changes.',
    category: 'code-quality',
    slashCommand: '/harness:code-review',
  },
  {
    id: 'harness:codebase-cleanup',
    name: 'Codebase Cleanup',
    description: 'Identify and remove redundant or unreachable code.',
    category: 'code-quality',
    slashCommand: '/harness:codebase-cleanup',
  },
  {
    id: 'harness:cleanup-dead-code',
    name: 'Cleanup Dead Code',
    description: 'Specifically target and remove exported symbols with no consumers.',
    category: 'code-quality',
    slashCommand: '/harness:cleanup-dead-code',
  },
  {
    id: 'harness:detect-doc-drift',
    name: 'Detect Doc Drift',
    description: 'Find mismatches between implementation and documentation.',
    category: 'code-quality',
    slashCommand: '/harness:detect-doc-drift',
  },
  {
    id: 'harness:knowledge-pipeline',
    name: 'Knowledge Pipeline',
    description:
      'Extract business knowledge, detect drift, materialize docs, and report coverage gaps.',
    category: 'code-quality',
    slashCommand: '/harness:knowledge-pipeline',
  },

  // Workflow
  {
    id: 'harness:brainstorming',
    name: 'Brainstorm',
    description: 'Explore ideas, architectural patterns, and implementation strategies.',
    category: 'workflow',
    slashCommand: '/harness:brainstorming',
  },
  {
    id: 'harness:planning',
    name: 'Plan Feature',
    description: 'Generate a detailed implementation plan with atomic tasks.',
    category: 'workflow',
    slashCommand: '/harness:planning',
  },
  {
    id: 'harness:execution',
    name: 'Execute Plan',
    description: 'Implement a feature or fix task-by-task with atomic commits.',
    category: 'workflow',
    slashCommand: '/harness:execution',
  },
  {
    id: 'harness:tdd',
    name: 'TDD Loop',
    description: 'Execute a test-driven development cycle for a specific unit.',
    category: 'workflow',
    slashCommand: '/harness:tdd',
  },
  {
    id: 'harness:debugging',
    name: 'Debug Issue',
    description: 'Analyze logs, traces, and code to find and fix the root cause.',
    category: 'workflow',
    slashCommand: '/harness:debugging',
  },
  {
    id: 'harness:refactoring',
    name: 'Refactor Code',
    description: 'Safely reorganize code for better maintainability without changing behavior.',
    category: 'workflow',
    slashCommand: '/harness:refactoring',
  },
  {
    id: 'harness:onboarding',
    name: 'Codebase Onboarding',
    description: 'Get a high-level overview of the project structure and patterns.',
    category: 'workflow',
    slashCommand: '/harness:onboarding',
  },
  {
    id: 'harness:autopilot',
    name: 'Autopilot',
    description: 'Run an autonomous agent loop to solve a complex issue.',
    category: 'workflow',
    slashCommand: '/harness:autopilot',
  },
  {
    id: 'harness:roadmap-pilot',
    name: 'Roadmap Pilot',
    description: 'Autonomously execute the next logical item on the roadmap.',
    category: 'workflow',
    slashCommand: '/harness:roadmap-pilot',
  },
  {
    id: 'harness:roadmap-sync',
    name: 'Roadmap Sync',
    description: 'Update existing roadmap feature statuses based on current codebase state.',
    category: 'workflow',
    slashCommand: '/harness:roadmap --sync',
  },
  {
    id: 'harness:roadmap-add',
    name: 'Add to Roadmap',
    description: 'Interactively add a new feature to the roadmap.',
    category: 'workflow',
    slashCommand: '/harness:roadmap --add',
  },
];
