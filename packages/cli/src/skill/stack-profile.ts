import fs from 'node:fs';
import path from 'node:path';

export interface StackProfile {
  generatedAt: string;
  signals: Record<string, boolean>;
  detectedDomains: string[];
}

/**
 * Map of file/directory patterns to the domains they indicate.
 * When a pattern is found in the project, the associated domains are marked as detected.
 */
const SIGNAL_DOMAIN_MAP: Record<string, string[]> = {
  'prisma/schema.prisma': ['database'],
  'drizzle.config.ts': ['database'],
  'knexfile.js': ['database'],
  'knexfile.ts': ['database'],
  migrations: ['database'],
  Dockerfile: ['containerization'],
  'docker-compose.yml': ['containerization'],
  'docker-compose.yaml': ['containerization'],
  k8s: ['containerization'],
  kubernetes: ['containerization'],
  helm: ['containerization'],
  '.github/workflows': ['deployment'],
  '.gitlab-ci.yml': ['deployment'],
  Jenkinsfile: ['deployment'],
  terraform: ['infrastructure-as-code'],
  'Pulumi.yaml': ['infrastructure-as-code'],
  'cdk.json': ['infrastructure-as-code'],
  'openapi.yaml': ['api-design'],
  'openapi.json': ['api-design'],
  'swagger.yaml': ['api-design'],
  'swagger.json': ['api-design'],
  'schema.graphql': ['api-design'],
  '.env': ['secrets'],
  '.env.example': ['secrets'],
  'vault.hcl': ['secrets'],
  e2e: ['e2e'],
  cypress: ['e2e'],
  'playwright.config.ts': ['e2e'],
  'playwright.config.js': ['e2e'],
  'stryker.conf.js': ['mutation-test'],
  'stryker.conf.mjs': ['mutation-test'],
  k6: ['load-testing'],
  'artillery.yml': ['load-testing'],
  'dbt_project.yml': ['data-pipeline'],
  airflow: ['data-pipeline'],
  ios: ['mobile-patterns'],
  android: ['mobile-patterns'],
  'pubspec.yaml': ['mobile-patterns'],
  'App.tsx': ['mobile-patterns'],
  runbooks: ['incident-response'],
  'docs/runbooks': ['incident-response'],
};

/**
 * Detect domains from a list of changed file paths by checking each path
 * against SIGNAL_DOMAIN_MAP keys. A file matches a pattern if the path
 * equals the pattern exactly or starts with `pattern/` (i.e., is a descendant).
 */
export function detectDomainsFromFiles(files: string[]): string[] {
  const domainSet = new Set<string>();

  for (const file of files) {
    for (const [pattern, domains] of Object.entries(SIGNAL_DOMAIN_MAP)) {
      if (file === pattern || file.startsWith(pattern + '/')) {
        for (const domain of domains) domainSet.add(domain);
      }
    }
  }

  return [...domainSet].sort();
}

/**
 * Generate a stack profile by scanning the project root for known file patterns.
 */
export function generateStackProfile(projectRoot: string): StackProfile {
  const signals: Record<string, boolean> = {};
  const domainSet = new Set<string>();

  for (const [pattern, domains] of Object.entries(SIGNAL_DOMAIN_MAP)) {
    const fullPath = path.join(projectRoot, pattern);
    const exists = fs.existsSync(fullPath);
    signals[pattern] = exists;
    if (exists) {
      for (const domain of domains) domainSet.add(domain);
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    signals,
    detectedDomains: [...domainSet].sort(),
  };
}

/**
 * Load a cached stack profile or generate a fresh one.
 */
export function loadOrGenerateProfile(projectRoot: string): StackProfile {
  const profilePath = path.join(projectRoot, '.harness', 'stack-profile.json');
  if (fs.existsSync(profilePath)) {
    try {
      return JSON.parse(fs.readFileSync(profilePath, 'utf-8'));
    } catch {
      // Corrupt, regenerate
    }
  }
  const profile = generateStackProfile(projectRoot);
  fs.mkdirSync(path.dirname(profilePath), { recursive: true });
  fs.writeFileSync(profilePath, JSON.stringify(profile, null, 2));
  return profile;
}
