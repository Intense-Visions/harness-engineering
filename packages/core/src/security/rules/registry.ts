import type { SecurityRule, SecurityCategory } from '../types';

export class RuleRegistry {
  private rules: Map<string, SecurityRule> = new Map();

  register(rule: SecurityRule): void {
    this.rules.set(rule.id, rule);
  }

  registerAll(rules: SecurityRule[]): void {
    for (const rule of rules) {
      this.register(rule);
    }
  }

  getById(id: string): SecurityRule | undefined {
    return this.rules.get(id);
  }

  getAll(): SecurityRule[] {
    return Array.from(this.rules.values());
  }

  getByCategory(category: SecurityCategory): SecurityRule[] {
    return this.getAll().filter((r) => r.category === category);
  }

  getForStacks(stacks: string[]): SecurityRule[] {
    return this.getAll().filter((rule) => {
      // Rules with no stack restriction apply to all projects
      if (!rule.stack || rule.stack.length === 0) return true;
      // Stack-specific rules apply only if the project has a matching stack
      return rule.stack.some((s) => stacks.includes(s));
    });
  }
}
