/**
 * Catalog registry contract test.
 *
 * Verifies the contract that `harness-accessibility` Phase 1 step 2.6
 * relies on:
 *   - `getCatalogTypes()` is callable from the public exports surface
 *     and returns the set of component types this audit owns label-slot
 *     findings for.
 *   - Lookup by component type returns the registered convention.
 *   - The returned array is a copy — callers cannot mutate the
 *     registry through the reference.
 *
 * Refs: docs/changes/design-pipeline/audit-component-anatomy/proposal.md
 *  § Integration Points → "Skill module export" + SC-26.
 */

import { describe, it, expect } from 'vitest';
import {
  getCatalogTypes,
  lookupConvention,
  listConventions,
} from '../../../../src/audit/component-anatomy/catalog/index.js';
import { getCatalogTypes as getCatalogTypesPublic } from '../../../../src/audit/component-anatomy/exports.js';

describe('catalog registry', () => {
  it('exposes Button as a catalogued type via the central registry', () => {
    const types = getCatalogTypes();
    expect(types).toContain('Button');
  });

  it('exposes Input as a catalogued type (Phase 2 expansion #2)', () => {
    const types = getCatalogTypes();
    expect(types).toContain('Input');
  });

  it('exposes EmptyState as a catalogued type (Phase 2 expansion #3)', () => {
    const types = getCatalogTypes();
    expect(types).toContain('EmptyState');
  });

  it('exposes Dialog as a catalogued type (Phase 2 expansion #4)', () => {
    const types = getCatalogTypes();
    expect(types).toContain('Dialog');
  });

  it('exposes Select as a catalogued type (Phase 2 expansion #5)', () => {
    const types = getCatalogTypes();
    expect(types).toContain('Select');
  });

  it('exposes Switch as a catalogued type (Phase 2 expansion #6)', () => {
    const types = getCatalogTypes();
    expect(types).toContain('Switch');
  });

  it('exposes Checkbox as a catalogued type (Phase 2 expansion #7)', () => {
    const types = getCatalogTypes();
    expect(types).toContain('Checkbox');
  });

  it('returns the same set of types from the public `exports.ts` surface', () => {
    // harness-accessibility step 2.6 imports getCatalogTypes from the
    // public exports surface. The contract is that both paths return
    // the same data — exports.ts is just a re-export.
    expect(getCatalogTypesPublic()).toEqual(getCatalogTypes());
  });

  it('returns a sorted list so consumers can rely on stable ordering', () => {
    const types = getCatalogTypes();
    const sorted = [...types].sort();
    expect(types).toEqual(sorted);
  });

  it('returns a fresh array on every call (mutating the result does not affect the registry)', () => {
    const first = getCatalogTypes();
    first.push('SyntheticAttacker');
    const second = getCatalogTypes();
    expect(second).not.toContain('SyntheticAttacker');
  });

  it('looks up Button to its full ConventionRule', () => {
    const rule = lookupConvention('Button');
    expect(rule).not.toBeNull();
    expect(rule!.componentType).toBe('Button');
    expect(rule!.source.ref).toBe('APG/button');
    // Button's content slot is the Tier-1 required slot per the spec.
    expect(rule!.slots.find((s) => s.name === 'content')?.required).toBe(true);
  });

  it('looks up Input to its full ConventionRule with label as the required Tier-1 slot', () => {
    const rule = lookupConvention('Input');
    expect(rule).not.toBeNull();
    expect(rule!.componentType).toBe('Input');
    expect(rule!.source.ref).toBe('APG/textbox');
    // Input.label is the only Tier-1 required slot in v1 — the helper-text
    // and error-text slots are recommended (Tier-2) and not yet flagged.
    expect(rule!.slots.find((s) => s.name === 'label')?.required).toBe(true);
    expect(rule!.slots.find((s) => s.name === 'helper-text')?.required).toBe(false);
    expect(rule!.slots.find((s) => s.name === 'error-text')?.required).toBe(false);
  });

  it('looks up Dialog to its full ConventionRule with title as the required Tier-1 slot', () => {
    const rule = lookupConvention('Dialog');
    expect(rule).not.toBeNull();
    expect(rule!.componentType).toBe('Dialog');
    // Dialog sources from APG's dialog-modal pattern — the canonical
    // authoritative spec for the modal-overlay accessible-name mandate.
    expect(rule!.source.ref).toBe('APG/dialog-modal');
    // Dialog.title is the only Tier-1 required slot in v1 — the
    // description, close-action, and footer slots are recommended
    // (Tier-2) and not yet flagged.
    expect(rule!.slots.find((s) => s.name === 'title')?.required).toBe(true);
    expect(rule!.slots.find((s) => s.name === 'description')?.required).toBe(false);
    expect(rule!.slots.find((s) => s.name === 'close-action')?.required).toBe(false);
    expect(rule!.slots.find((s) => s.name === 'footer')?.required).toBe(false);
  });

  it('looks up Select to its full ConventionRule with label as the required Tier-1 slot', () => {
    const rule = lookupConvention('Select');
    expect(rule).not.toBeNull();
    expect(rule!.componentType).toBe('Select');
    // Select sources from APG's listbox pattern — APG carries the
    // normative accessible-name contract; Open UI is descriptive only.
    expect(rule!.source.ref).toBe('APG/listbox');
    // Select.label is the only Tier-1 required slot in v1 — helper-text,
    // error-text, and placeholder slots are recommended (Tier-2) and not
    // yet flagged. Same single-required-slot shape as Input.
    expect(rule!.slots.find((s) => s.name === 'label')?.required).toBe(true);
    expect(rule!.slots.find((s) => s.name === 'helper-text')?.required).toBe(false);
    expect(rule!.slots.find((s) => s.name === 'error-text')?.required).toBe(false);
    expect(rule!.slots.find((s) => s.name === 'placeholder')?.required).toBe(false);
  });

  it('looks up EmptyState to its full ConventionRule with headline as the required Tier-1 slot', () => {
    const rule = lookupConvention('EmptyState');
    expect(rule).not.toBeNull();
    expect(rule!.componentType).toBe('EmptyState');
    // EmptyState sources from Open UI rather than APG — APG does not
    // catalog EmptyState (not an interactive ARIA pattern). Per
    // Decision #5's source hierarchy, Open UI is the next-most
    // authoritative public reference.
    expect(rule!.source.ref).toBe('OpenUI/empty-state');
    expect(rule!.slots.find((s) => s.name === 'headline')?.required).toBe(true);
    // Per Phase 0 spec § EmptyState: headline is the ONLY required
    // slot. icon, description, and the action slots are optional.
    expect(rule!.slots.find((s) => s.name === 'icon')?.required).toBe(false);
    expect(rule!.slots.find((s) => s.name === 'description')?.required).toBe(false);
    expect(rule!.slots.find((s) => s.name === 'primary-action')?.required).toBe(false);
    expect(rule!.slots.find((s) => s.name === 'secondary-action')?.required).toBe(false);
  });

  it('looks up Switch to its full ConventionRule with label as the required Tier-1 slot', () => {
    const rule = lookupConvention('Switch');
    expect(rule).not.toBeNull();
    expect(rule!.componentType).toBe('Switch');
    // Switch sources from APG's switch pattern — the normative
    // accessibility contract for the binary toggle control.
    expect(rule!.source.ref).toBe('APG/switch');
    // Switch.label is the only Tier-1 required slot in v1 — the
    // helper-text and error-text slots are recommended (Tier-2) and
    // not yet flagged.
    expect(rule!.slots.find((s) => s.name === 'label')?.required).toBe(true);
    expect(rule!.slots.find((s) => s.name === 'helper-text')?.required).toBe(false);
    expect(rule!.slots.find((s) => s.name === 'error-text')?.required).toBe(false);
    // Switch has no canonical stylistic variants in APG / Open UI —
    // catalogued as an empty array so the convention surface stays
    // uniform with Input / Dialog.
    expect(rule!.variants).toEqual([]);
  });

  it('looks up Checkbox to its full ConventionRule with label as the required Tier-1 slot', () => {
    const rule = lookupConvention('Checkbox');
    expect(rule).not.toBeNull();
    expect(rule!.componentType).toBe('Checkbox');
    // Checkbox sources from APG's checkbox pattern — the normative
    // accessibility contract for the tri-state form control.
    expect(rule!.source.ref).toBe('APG/checkbox');
    // Checkbox.label is the only Tier-1 required slot in v1 — the
    // helper-text and error-text slots are recommended (Tier-2) and
    // not yet flagged.
    expect(rule!.slots.find((s) => s.name === 'label')?.required).toBe(true);
    expect(rule!.slots.find((s) => s.name === 'helper-text')?.required).toBe(false);
    expect(rule!.slots.find((s) => s.name === 'error-text')?.required).toBe(false);
    // Checkbox is the first catalogued component to carry the
    // `indeterminate` state — included as Tier-2 recommended (not yet
    // gated by the runner). Locked here so a future schema change can't
    // silently drop it.
    expect(rule!.states.find((s) => s.name === 'indeterminate')?.required).toBe(false);
    expect(rule!.states.find((s) => s.name === 'indeterminate')?.exclusive).toBe(true);
    // Checkbox has no canonical stylistic variants in APG / Open UI —
    // catalogued as an empty array so the convention surface stays
    // uniform with Input / Dialog / Switch.
    expect(rule!.variants).toEqual([]);
  });

  it('returns null for an unknown component type (silent skip per Decision #1)', () => {
    expect(lookupConvention('TotallyUnknownThing')).toBeNull();
  });

  it('listConventions returns every registered rule once, no duplicates', () => {
    const conventions = listConventions();
    const types = conventions.map((c) => c.componentType);
    const unique = new Set(types);
    expect(unique.size).toBe(types.length);
    expect(unique.size).toBe(getCatalogTypes().length);
  });
});
