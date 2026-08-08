import { describe, it, expect } from 'vitest';
import { mediaSingle, mediaInline } from '../../src/docs-publish/connectors/adf';

describe('adf media serialization', () => {
  it('mediaSingle emits a mediaSingle figure node and NEVER a mediaGroup', () => {
    const node = mediaSingle({ id: 'att-1', collection: 'contentId-1', width: 800 });
    expect(node.type).toBe('mediaSingle');
    expect(node.content?.[0]?.type).toBe('media');
    expect(node.content?.[0]?.attrs?.id).toBe('att-1');
    // The whole serialized node must not contain the downgrade form.
    expect(JSON.stringify(node)).not.toContain('mediaGroup');
  });

  it('mediaSingle omits absent optional attrs (exactOptionalPropertyTypes safe)', () => {
    const node = mediaSingle({ id: 'att-2' });
    const attrs = node.content?.[0]?.attrs ?? {};
    expect(attrs).not.toHaveProperty('width');
    expect(attrs).not.toHaveProperty('collection');
  });

  it('mediaInline emits an inline file chip', () => {
    const node = mediaInline({ id: 'att-3' });
    expect(node.type).toBe('mediaInline');
    expect(node.attrs?.id).toBe('att-3');
    expect(JSON.stringify(node)).not.toContain('mediaGroup');
  });
});
