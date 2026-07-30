import { describe, expect, it, vi } from 'vitest';

import {
  applyGroupsSafely,
  applyGroupsWithUndo,
  closeDuplicateTabsInWindow,
  closeDuplicateTabsWithUndo,
  combineGroupingUndo,
  listExistingGroupsInWindow,
  restoreTabOperation,
  ungroupAllTabsInWindow,
} from './tab-service';

describe('closeDuplicateTabsInWindow', () => {
  it('queries the target window and closes the planned tab IDs', async () => {
    const tabsApi = {
      query: vi.fn(async () => [
        { active: true, groupId: -1, id: 1, index: 0, pinned: false, url: 'https://a.test' },
        { active: false, groupId: 2, id: 2, index: 1, pinned: false, url: 'https://a.test' },
      ]),
      remove: vi.fn(async () => undefined),
    };

    const result = await closeDuplicateTabsInWindow(42, tabsApi);

    expect(tabsApi.query).toHaveBeenCalledWith({ windowId: 42 });
    expect(tabsApi.remove).toHaveBeenCalledWith([2]);
    expect(result).toEqual({
      closedTabCount: 1,
      duplicateUrlCount: 1,
      pinnedDuplicatesRetained: 0,
    });
  });
});

describe('applyGroupsSafely', () => {
  it('drops stale tabs and groups only currently eligible tabs', async () => {
    const tabsApi = {
      group: vi.fn(async () => 9),
      query: vi.fn(async () => [
        { active: false, groupId: -1, id: 1, index: 0, pinned: false, url: 'https://a.test' },
        { active: false, groupId: -1, id: 2, index: 1, pinned: false, url: 'https://b.test' },
        { active: false, groupId: 3, id: 3, index: 2, pinned: false, url: 'https://c.test' },
      ]),
      ungroup: vi.fn(async () => undefined),
    };
    const tabGroupsApi = { update: vi.fn(async () => undefined) };

    const result = await applyGroupsSafely(
      [
        { name: 'Work', tabIds: [1, 2, 3] },
        { name: 'Dropped', tabIds: [3, 4] },
      ],
      42,
      tabsApi,
      tabGroupsApi,
    );

    expect(tabsApi.group).toHaveBeenCalledWith({ tabIds: [1, 2] });
    expect(tabGroupsApi.update).toHaveBeenCalledWith(
      9,
      expect.objectContaining({ collapsed: false, title: 'Work' }),
    );
    expect(result).toEqual({ groupCount: 1, groupedTabCount: 2 });
  });

  it('moves every group before standalone tabs after grouping', async () => {
    const tabsApi = {
      group: vi.fn(async () => 9),
      query: vi
        .fn()
        .mockResolvedValueOnce([
          { groupId: -1, id: 10, index: 0, pinned: true },
          { groupId: -1, id: 1, index: 1, pinned: false, url: 'https://a.test' },
          { groupId: 5, id: 2, index: 2, pinned: false, url: 'https://existing.test' },
          { groupId: -1, id: 3, index: 3, pinned: false, url: 'https://b.test' },
          { groupId: -1, id: 4, index: 4, pinned: false, url: 'https://standalone.test' },
          { groupId: 6, id: 5, index: 5, pinned: false, url: 'https://later.test' },
        ])
        .mockResolvedValueOnce([
          { groupId: -1, id: 10, index: 0, pinned: true },
          { groupId: -1, id: 4, index: 1, pinned: false, url: 'https://standalone.test' },
          { groupId: 5, id: 2, index: 2, pinned: false, url: 'https://existing.test' },
          { groupId: 9, id: 1, index: 3, pinned: false, url: 'https://a.test' },
          { groupId: 9, id: 3, index: 4, pinned: false, url: 'https://b.test' },
          { groupId: 6, id: 5, index: 5, pinned: false, url: 'https://later.test' },
        ]),
      ungroup: vi.fn(async () => undefined),
    };
    const tabGroupsApi = {
      move: vi.fn(async () => undefined),
      update: vi.fn(async () => undefined),
    };

    await applyGroupsSafely(
      [{ name: 'New Work', tabIds: [1, 3] }],
      42,
      tabsApi,
      tabGroupsApi,
    );

    expect(tabGroupsApi.move).toHaveBeenNthCalledWith(1, 5, { index: 1 });
    expect(tabGroupsApi.move).toHaveBeenNthCalledWith(2, 9, { index: 2 });
    expect(tabGroupsApi.move).toHaveBeenNthCalledWith(3, 6, { index: 4 });
  });

  it('expands only the group containing the active tab after grouping', async () => {
    const tabsApi = {
      group: vi.fn(async () => 9),
      query: vi
        .fn()
        .mockResolvedValueOnce([
          { active: false, groupId: -1, id: 1, index: 0, pinned: false, url: 'https://a.test' },
          { active: true, groupId: -1, id: 2, index: 1, pinned: false, url: 'https://b.test' },
          { active: false, groupId: 5, id: 3, index: 2, pinned: false, url: 'https://old.test' },
          { active: false, groupId: 6, id: 4, index: 3, pinned: false, url: 'https://later.test' },
        ])
        .mockResolvedValueOnce([
          { active: false, groupId: 5, id: 3, index: 0, pinned: false, url: 'https://old.test' },
          { active: false, groupId: 9, id: 1, index: 1, pinned: false, url: 'https://a.test' },
          { active: true, groupId: 9, id: 2, index: 2, pinned: false, url: 'https://b.test' },
          { active: false, groupId: 6, id: 4, index: 3, pinned: false, url: 'https://later.test' },
        ]),
      ungroup: vi.fn(async () => undefined),
    };
    const tabGroupsApi = {
      move: vi.fn(async () => undefined),
      update: vi.fn(async () => undefined),
    };

    await applyGroupsSafely(
      [{ name: 'Active Work', tabIds: [1, 2] }],
      42,
      tabsApi,
      tabGroupsApi,
    );

    expect(tabGroupsApi.update.mock.calls.slice(-3)).toEqual([
      [5, { collapsed: true }],
      [9, { collapsed: false }],
      [6, { collapsed: true }],
    ]);
  });

  it('rolls back tabs changed by the current operation when a later group fails', async () => {
    const tabsApi = {
      group: vi.fn().mockResolvedValueOnce(9).mockRejectedValueOnce(new Error('group failed')),
      query: vi.fn(async () => [
        { active: false, groupId: -1, id: 1, index: 0, pinned: false, url: 'https://a.test' },
        { active: false, groupId: -1, id: 2, index: 1, pinned: false, url: 'https://b.test' },
        { active: false, groupId: -1, id: 3, index: 2, pinned: false, url: 'https://c.test' },
        { active: false, groupId: -1, id: 4, index: 3, pinned: false, url: 'https://d.test' },
      ]),
      ungroup: vi.fn(async () => undefined),
    };
    const tabGroupsApi = { update: vi.fn(async () => undefined) };

    await expect(
      applyGroupsSafely(
        [
          { name: 'First', tabIds: [1, 2] },
          { name: 'Second', tabIds: [3, 4] },
        ],
        42,
        tabsApi,
        tabGroupsApi,
      ),
    ).rejects.toThrow('group failed');
    expect(tabsApi.ungroup).toHaveBeenCalledWith([1, 2]);
  });

  it('adds a singleton to an existing group without changing its metadata', async () => {
    const tabsApi = {
      group: vi.fn(async () => 5),
      query: vi.fn(async () => [
        { active: false, groupId: -1, id: 1, index: 0, pinned: false, url: 'https://a.test' },
      ]),
      ungroup: vi.fn(async () => undefined),
    };
    const tabGroupsApi = {
      query: vi.fn(async () => [
        { collapsed: true, color: 'blue' as const, id: 5, title: 'Existing Work' },
      ]),
      update: vi.fn(async () => undefined),
    };

    const mutation = await applyGroupsWithUndo(
      [{ existingGroupId: 5, name: 'Existing Work', tabIds: [1] }],
      42,
      tabsApi,
      tabGroupsApi,
    );

    expect(tabsApi.group).toHaveBeenCalledWith({ groupId: 5, tabIds: [1] });
    expect(tabGroupsApi.update).not.toHaveBeenCalled();
    expect(mutation.result).toEqual({ groupCount: 1, groupedTabCount: 1 });
    expect(mutation.assignments).toEqual([{ groupId: 5, tabId: 1 }]);
  });

  it('creates a new group when an existing target disappeared and two tabs remain', async () => {
    const tabsApi = {
      group: vi.fn(async () => 11),
      query: vi.fn(async () => [
        { active: false, groupId: -1, id: 1, index: 0, pinned: false, url: 'https://a.test' },
        { active: false, groupId: -1, id: 2, index: 1, pinned: false, url: 'https://b.test' },
      ]),
      ungroup: vi.fn(async () => undefined),
    };
    const tabGroupsApi = {
      query: vi.fn(async () => []),
      update: vi.fn(async () => undefined),
    };

    await applyGroupsWithUndo(
      [{ existingGroupId: 5, name: 'Former Work', tabIds: [1, 2] }],
      42,
      tabsApi,
      tabGroupsApi,
    );

    expect(tabsApi.group).toHaveBeenCalledWith({ tabIds: [1, 2] });
    expect(tabGroupsApi.update).toHaveBeenCalledWith(
      11,
      expect.objectContaining({ title: 'Former Work' }),
    );
  });
});

describe('listExistingGroupsInWindow', () => {
  it('returns group titles with at most five sanitized member tabs', async () => {
    const tabsApi = {
      query: vi.fn(async () => [
        ...Array.from({ length: 6 }, (_, index) => ({
          active: false,
          groupId: 5,
          id: index + 1,
          index,
          pinned: false,
          title: `Member ${index + 1}`,
          url: `https://work.test/${index + 1}?secret=value`,
        })),
        { active: false, groupId: -1, id: 20, index: 6, url: 'https://ungrouped.test' },
      ]),
    };
    const tabGroupsApi = {
      query: vi.fn(async () => [
        { collapsed: false, color: 'blue' as const, id: 5, title: 'Existing Work' },
      ]),
    };

    const contexts = await listExistingGroupsInWindow(42, tabsApi, tabGroupsApi);

    expect(tabGroupsApi.query).toHaveBeenCalledWith({ windowId: 42 });
    expect(contexts).toHaveLength(1);
    expect(contexts[0]).toMatchObject({ id: 5, title: 'Existing Work' });
    expect(contexts[0]?.tabs).toHaveLength(5);
    expect(contexts[0]?.tabs[0]?.url).toBe('https://work.test/1');
  });
});

describe('tab operation undo snapshots', () => {
  it('captures closed duplicates with their positions and group metadata', async () => {
    const tabsApi = {
      query: vi.fn(async () => [
        { active: true, groupId: 5, id: 1, index: 0, pinned: false, url: 'https://a.test' },
        { active: false, groupId: 5, id: 2, index: 1, pinned: false, url: 'https://a.test' },
      ]),
      remove: vi.fn(async () => undefined),
    };
    const tabGroupsApi = {
      get: vi.fn(async () => ({ collapsed: true, color: 'blue' as const, id: 5, title: 'Saved' })),
    };

    const mutation = await closeDuplicateTabsWithUndo(42, tabsApi, tabGroupsApi);

    expect(mutation.result.closedTabCount).toBe(1);
    expect(mutation.undo).toEqual({
      closedTabs: [
        expect.objectContaining({ groupId: 5, index: 1, url: 'https://a.test', windowId: 42 }),
      ],
      groups: [{ collapsed: true, color: 'blue', id: 5, title: 'Saved' }],
      kind: 'close-duplicates',
      windowId: 42,
    });
  });

  it('captures the group ID assigned to every tab by AI grouping', async () => {
    const tabsApi = {
      group: vi.fn(async () => 9),
      query: vi.fn(async () => [
        { active: false, groupId: -1, id: 1, index: 0, pinned: false, url: 'https://a.test' },
        { active: false, groupId: -1, id: 2, index: 1, pinned: false, url: 'https://b.test' },
      ]),
      ungroup: vi.fn(async () => undefined),
    };
    const tabGroupsApi = { update: vi.fn(async () => undefined) };

    const mutation = await applyGroupsWithUndo(
      [{ name: 'Work', tabIds: [1, 2] }],
      42,
      tabsApi,
      tabGroupsApi,
    );

    expect(mutation.result).toEqual({ groupCount: 1, groupedTabCount: 2 });
    expect(mutation.assignments).toEqual([
      { groupId: 9, tabId: 1 },
      { groupId: 9, tabId: 2 },
    ]);
  });

  it('ungroups every grouped tab and captures original group metadata', async () => {
    const tabsApi = {
      query: vi.fn(async () => [
        { groupId: 5, id: 1, index: 0 },
        { groupId: 5, id: 2, index: 1 },
        { groupId: -1, id: 3, index: 2 },
      ]),
      ungroup: vi.fn(async () => undefined),
    };
    const tabGroupsApi = {
      get: vi.fn(async () => ({ collapsed: false, color: 'red' as const, id: 5, title: 'Work' })),
    };

    const mutation = await ungroupAllTabsInWindow(42, tabsApi, tabGroupsApi);

    expect(tabsApi.ungroup).toHaveBeenCalledWith([1, 2]);
    expect(mutation.result).toEqual({ groupCount: 1, ungroupedTabCount: 2 });
    expect(mutation.undo).toEqual({
      assignments: [
        { groupId: 5, tabId: 1 },
        { groupId: 5, tabId: 2 },
      ],
      groups: [{ collapsed: false, color: 'red', id: 5, title: 'Work' }],
      kind: 'ungroup-all',
      windowId: 42,
    });
  });

  it('restores closed tabs and surviving group membership', async () => {
    const tabsApi = {
      create: vi.fn(async () => ({ id: 10 })),
      group: vi.fn(async () => 5),
      query: vi.fn(async () => []),
      ungroup: vi.fn(async () => undefined),
    };
    const tabGroupsApi = { update: vi.fn(async () => undefined) };

    const result = await restoreTabOperation(
      {
        closedTabs: [
          {
            active: false,
            groupId: 5,
            index: 1,
            pinned: false,
            url: 'https://a.test',
            windowId: 42,
          },
        ],
        groups: [{ collapsed: true, color: 'blue', id: 5, title: 'Saved' }],
        kind: 'close-duplicates',
        windowId: 42,
      },
      tabsApi,
      tabGroupsApi,
    );

    expect(tabsApi.create).toHaveBeenCalledWith({
      active: false,
      index: 1,
      pinned: false,
      url: 'https://a.test',
      windowId: 42,
    });
    expect(tabsApi.group).toHaveBeenCalledWith({ groupId: 5, tabIds: [10] });
    expect(result).toEqual({ failedTabCount: 0, restoredTabCount: 1 });
  });

  it('only ungroups AI tabs that still belong to the group created by the operation', async () => {
    const tabsApi = {
      create: vi.fn(async () => ({ id: 10 })),
      group: vi.fn(async () => 9),
      query: vi.fn(async () => [
        { groupId: 9, id: 1, index: 0 },
        { groupId: 12, id: 2, index: 1 },
      ]),
      ungroup: vi.fn(async () => undefined),
    };
    const tabGroupsApi = { update: vi.fn(async () => undefined) };

    const result = await restoreTabOperation(
      {
        assignments: [
          { groupId: 9, tabId: 1 },
          { groupId: 9, tabId: 2 },
        ],
        closedTabs: [],
        groups: [],
        kind: 'group-tabs',
        windowId: 42,
      },
      tabsApi,
      tabGroupsApi,
    );

    expect(tabsApi.ungroup).toHaveBeenCalledWith([1]);
    expect(result).toEqual({ failedTabCount: 0, restoredTabCount: 1 });
  });

  it('combines preprocessing cleanup and AI grouping into one undo record', () => {
    expect(
      combineGroupingUndo(
        42,
        [{ groupId: 9, tabId: 1 }],
        {
          closedTabs: [
            {
              active: false,
              groupId: -1,
              index: 2,
              pinned: false,
              url: 'https://duplicate.test',
              windowId: 42,
            },
          ],
          groups: [],
          kind: 'close-duplicates',
          windowId: 42,
        },
      ),
    ).toMatchObject({
      assignments: [{ groupId: 9, tabId: 1 }],
      closedTabs: [expect.objectContaining({ url: 'https://duplicate.test' })],
      kind: 'group-tabs',
    });
  });

  it('reports tabs that Chrome cannot recreate during undo', async () => {
    const tabsApi = {
      create: vi.fn(async () => Promise.reject(new Error('restricted URL'))),
      group: vi.fn(async () => 9),
      query: vi.fn(async () => []),
      ungroup: vi.fn(async () => undefined),
    };
    const tabGroupsApi = { update: vi.fn(async () => undefined) };

    const result = await restoreTabOperation(
      {
        closedTabs: [
          {
            active: false,
            groupId: -1,
            index: 1,
            pinned: false,
            url: 'chrome://settings',
            windowId: 42,
          },
        ],
        groups: [],
        kind: 'close-duplicates',
        windowId: 42,
      },
      tabsApi,
      tabGroupsApi,
    );

    expect(result).toEqual({ failedTabCount: 1, restoredTabCount: 0 });
  });
});
