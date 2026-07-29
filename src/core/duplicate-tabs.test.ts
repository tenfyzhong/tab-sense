import { describe, expect, it } from 'vitest';

import { planDuplicateRemoval } from './duplicate-tabs';
import type { TabSnapshot } from './types';

function tab(overrides: Partial<TabSnapshot> & Pick<TabSnapshot, 'id' | 'index'>): TabSnapshot {
  return {
    active: false,
    groupId: -1,
    pinned: false,
    title: '',
    url: undefined,
    ...overrides,
  };
}

describe('planDuplicateRemoval', () => {
  it('compares the complete URL and includes grouped tabs', () => {
    const plan = planDuplicateRemoval([
      tab({ id: 1, index: 0, url: 'https://example.com/a?x=1#one' }),
      tab({ id: 2, index: 1, groupId: 3, url: 'https://example.com/a?x=1#one' }),
      tab({ id: 3, index: 2, url: 'https://example.com/a?x=1#two' }),
      tab({ id: 4, index: 3, url: 'https://example.com/a?x=2#one' }),
    ]);

    expect(plan).toEqual({
      duplicateUrlCount: 1,
      pinnedDuplicatesRetained: 0,
      removeTabIds: [2],
    });
  });

  it('never closes pinned tabs and removes all unpinned duplicates when pinned tabs exist', () => {
    const plan = planDuplicateRemoval([
      tab({ id: 1, index: 0, pinned: true, url: 'https://example.com' }),
      tab({ id: 2, index: 1, pinned: true, url: 'https://example.com' }),
      tab({ id: 3, index: 2, active: true, url: 'https://example.com' }),
      tab({ id: 4, index: 3, url: 'https://example.com' }),
    ]);

    expect(plan).toEqual({
      duplicateUrlCount: 1,
      pinnedDuplicatesRetained: 2,
      removeTabIds: [3, 4],
    });
  });

  it('keeps the active tab when a duplicate set has no pinned tab', () => {
    const plan = planDuplicateRemoval([
      tab({ id: 1, index: 0, url: 'https://example.com' }),
      tab({ id: 2, index: 4, active: true, url: 'https://example.com' }),
      tab({ id: 3, index: 2, url: 'https://example.com' }),
    ]);

    expect(plan.removeTabIds).toEqual([1, 3]);
  });

  it('keeps the leftmost tab when no duplicate is active', () => {
    const plan = planDuplicateRemoval([
      tab({ id: 10, index: 8, url: 'https://example.com' }),
      tab({ id: 11, index: 2, url: 'https://example.com' }),
      tab({ id: 12, index: 5, url: 'https://example.com' }),
    ]);

    expect(plan.removeTabIds).toEqual([10, 12]);
  });

  it('ignores tabs without a non-empty URL', () => {
    const plan = planDuplicateRemoval([
      tab({ id: 1, index: 0 }),
      tab({ id: 2, index: 1, url: '' }),
      tab({ id: 3, index: 2, url: undefined }),
    ]);

    expect(plan).toEqual({
      duplicateUrlCount: 0,
      pinnedDuplicatesRetained: 0,
      removeTabIds: [],
    });
  });
});
