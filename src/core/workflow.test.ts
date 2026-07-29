import { describe, expect, it, vi } from 'vitest';

import { runAiGroupingWorkflow } from './workflow';
import type { DuplicateExecutionResult, GroupingWorkflowDependencies, TabSnapshot } from './types';

const duplicateResult: DuplicateExecutionResult = {
  closedTabCount: 1,
  duplicateUrlCount: 1,
  pinnedDuplicatesRetained: 0,
};

const eligibleTabs: TabSnapshot[] = [
  {
    active: true,
    groupId: -1,
    id: 1,
    index: 0,
    pinned: false,
    title: 'One',
    url: 'https://one.example/path?secret=value',
  },
  {
    active: false,
    groupId: -1,
    id: 2,
    index: 1,
    pinned: false,
    title: 'Two',
    url: 'https://two.example/path#private',
  },
];

function dependencies(events: string[]): GroupingWorkflowDependencies {
  return {
    applyGroups: vi.fn(async () => {
      events.push('apply');
      return { groupCount: 1, groupedTabCount: 2 };
    }),
    closeDuplicates: vi.fn(async () => {
      events.push('deduplicate');
      return duplicateResult;
    }),
    listEligibleTabs: vi.fn(async () => {
      events.push('query');
      return eligibleTabs;
    }),
    listExistingGroups: vi.fn(async () => {
      events.push('groups');
      return [
        {
          id: 7,
          tabs: [{ id: 70, title: 'Existing', url: 'https://existing.example/' }],
          title: 'Work',
        },
      ];
    }),
    requestGrouping: vi.fn(async (tabs, existingGroups) => {
      events.push('request');
      expect(tabs[0]?.url).toBe('https://one.example/path');
      expect(existingGroups[0]?.id).toBe(7);
      return '{"groups":[{"existingGroupId":7,"name":"Work","tabIds":[1,2]}]}';
    }),
  };
}

describe('runAiGroupingWorkflow', () => {
  it('does not deduplicate when the preference is disabled', async () => {
    const events: string[] = [];
    const deps = dependencies(events);

    const result = await runAiGroupingWorkflow(
      { deduplicateBeforeGrouping: false, locale: 'en', windowId: 10 },
      deps,
    );

    expect(events).toEqual(['query', 'groups', 'request', 'apply']);
    expect(deps.applyGroups).toHaveBeenCalledWith(
      [{ existingGroupId: 7, name: 'Work', tabIds: [1, 2] }],
      10,
    );
    expect(deps.closeDuplicates).not.toHaveBeenCalled();
    expect(result).toEqual({
      duplicateResult: undefined,
      groupCount: 1,
      groupedTabCount: 2,
      ok: true,
    });
  });

  it('deduplicates before querying tabs and returns a combined result', async () => {
    const events: string[] = [];
    const deps = dependencies(events);

    const result = await runAiGroupingWorkflow(
      { deduplicateBeforeGrouping: true, locale: 'zh-CN', windowId: 10 },
      deps,
    );

    expect(events).toEqual(['deduplicate', 'query', 'groups', 'request', 'apply']);
    expect(result).toEqual({
      duplicateResult,
      groupCount: 1,
      groupedTabCount: 2,
      ok: true,
    });
  });

  it('stops before querying or calling AI when deduplication fails', async () => {
    const events: string[] = [];
    const deps = dependencies(events);
    vi.mocked(deps.closeDuplicates).mockRejectedValueOnce(new Error('tab removal failed'));

    const result = await runAiGroupingWorkflow(
      { deduplicateBeforeGrouping: true, locale: 'en', windowId: 10 },
      deps,
    );

    expect(events).toEqual([]);
    expect(deps.listEligibleTabs).not.toHaveBeenCalled();
    expect(deps.requestGrouping).not.toHaveBeenCalled();
    expect(result).toEqual({
      error: 'tab removal failed',
      ok: false,
      stage: 'deduplicate',
    });
  });

  it('uses AI for one ungrouped tab when it may join an existing group', async () => {
    const events: string[] = [];
    const deps = dependencies(events);
    vi.mocked(deps.listEligibleTabs).mockResolvedValueOnce([eligibleTabs[0] as TabSnapshot]);
    vi.mocked(deps.requestGrouping).mockResolvedValueOnce(
      '{"groups":[{"existingGroupId":7,"name":"Work","tabIds":[1]}]}',
    );
    vi.mocked(deps.applyGroups).mockResolvedValueOnce({ groupCount: 1, groupedTabCount: 1 });

    await expect(
      runAiGroupingWorkflow(
        { deduplicateBeforeGrouping: false, locale: 'en', windowId: 10 },
        deps,
      ),
    ).resolves.toMatchObject({ groupCount: 1, groupedTabCount: 1, ok: true });
    expect(deps.requestGrouping).toHaveBeenCalledOnce();
  });
});
