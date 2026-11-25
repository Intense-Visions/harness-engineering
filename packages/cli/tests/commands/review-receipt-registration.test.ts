import { describe, it, expect } from 'vitest';
import { commandCreators } from '../../src/commands/_registry';

describe('review receipt commands are registered', () => {
  const names = commandCreators.map((create) => create().name());
  it.each(['check-review-receipt', 'review-provenance'])(
    'registers %s as a top-level command',
    (name) => {
      expect(names).toContain(name);
    }
  );
  it('does not register a subcommand creator as a top-level command', () => {
    expect(names).not.toContain('report');
    expect(names).not.toContain('record');
    expect(names).not.toContain('render');
  });
});
