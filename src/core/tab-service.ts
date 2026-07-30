import { planDuplicateRemoval } from './duplicate-tabs';
import { deterministicGroupColor, sanitizeTabForAi } from './grouping';
import type {
  AppliedGroupingResult,
  ChromeGroupColor,
  CloseDuplicatesUndoRecord,
  ClosedTabSnapshot,
  DuplicateExecutionResult,
  ExistingGroupContext,
  GroupTabsUndoRecord,
  ProposedGroup,
  TabGroupAssignment,
  TabGroupSnapshot,
  TabOperationUndoRecord,
  TabSnapshot,
  UndoExecutionResult,
  UngroupAllResult,
  UngroupAllUndoRecord,
} from './types';

interface BrowserTabLike {
  active?: boolean;
  groupId?: number;
  id?: number;
  index: number;
  pinned?: boolean;
  title?: string;
  url?: string;
}

interface QueryTabsApi {
  query(queryInfo: { windowId: number }): Promise<BrowserTabLike[]>;
}

interface DuplicateTabsApi extends QueryTabsApi {
  remove(tabIds: number[]): Promise<unknown>;
}

interface GroupTabsApi extends QueryTabsApi {
  group(options: { groupId?: number; tabIds: [number, ...number[]] }): Promise<number>;
  ungroup(tabIds: [number, ...number[]]): Promise<unknown>;
}

interface UndoTabsApi extends QueryTabsApi {
  create(properties: {
    active: boolean;
    index: number;
    pinned: boolean;
    url: string;
    windowId: number;
  }): Promise<{ id?: number }>;
  group(options: {
    createProperties?: { windowId: number };
    groupId?: number;
    tabIds: [number, ...number[]];
  }): Promise<number>;
  ungroup(tabIds: [number, ...number[]]): Promise<unknown>;
}

interface BrowserTabGroupLike {
  collapsed: boolean;
  color: ChromeGroupColor;
  id: number;
  title?: string;
}

interface ReadTabGroupsApi {
  get(groupId: number): Promise<BrowserTabGroupLike>;
}

interface UpdateTabGroupsApi {
  update(
    groupId: number,
    properties: { collapsed: boolean; color: ChromeGroupColor; title: string },
  ): Promise<unknown>;
}

interface MoveTabGroupsApi {
  move(groupId: number, properties: { index: number }): Promise<unknown>;
}

interface QueryTabGroupsApi {
  query(queryInfo: { windowId: number }): Promise<BrowserTabGroupLike[]>;
}

function snapshots(tabs: BrowserTabLike[]): TabSnapshot[] {
  return tabs
    .filter((tab): tab is BrowserTabLike & { id: number } => typeof tab.id === 'number')
    .map((tab) => ({
      active: tab.active ?? false,
      groupId: tab.groupId ?? -1,
      id: tab.id,
      index: tab.index,
      pinned: tab.pinned ?? false,
      title: tab.title,
      url: tab.url,
    }));
}

export async function listTabsInWindow(windowId: number, tabsApi: QueryTabsApi): Promise<TabSnapshot[]> {
  return snapshots(await tabsApi.query({ windowId }));
}

export async function listExistingGroupsInWindow(
  windowId: number,
  tabsApi: QueryTabsApi,
  tabGroupsApi: QueryTabGroupsApi,
): Promise<ExistingGroupContext[]> {
  const [tabs, groups] = await Promise.all([
    listTabsInWindow(windowId, tabsApi),
    tabGroupsApi.query({ windowId }),
  ]);

  return groups.slice(0, 50).map((group) => ({
    id: group.id,
    tabs: tabs
      .filter((tab): tab is TabSnapshot & { url: string } =>
        tab.groupId === group.id && Boolean(tab.url),
      )
      .slice(0, 5)
      .map(sanitizeTabForAi),
    title: group.title?.replace(/\s+/gu, ' ').trim().slice(0, 100) || 'Untitled group',
  }));
}

export async function closeDuplicateTabsInWindow(
  windowId: number,
  tabsApi: DuplicateTabsApi,
): Promise<DuplicateExecutionResult> {
  const plan = planDuplicateRemoval(await listTabsInWindow(windowId, tabsApi));
  if (plan.removeTabIds.length > 0) {
    await tabsApi.remove(plan.removeTabIds);
  }

  return {
    closedTabCount: plan.removeTabIds.length,
    duplicateUrlCount: plan.duplicateUrlCount,
    pinnedDuplicatesRetained: plan.pinnedDuplicatesRetained,
  };
}

async function readGroupSnapshots(
  groupIds: Iterable<number>,
  tabGroupsApi: ReadTabGroupsApi,
): Promise<TabGroupSnapshot[]> {
  const groups: TabGroupSnapshot[] = [];
  for (const groupId of new Set(groupIds)) {
    if (groupId === -1) {
      continue;
    }
    try {
      const group = await tabGroupsApi.get(groupId);
      groups.push({
        collapsed: group.collapsed,
        color: group.color,
        id: group.id,
        title: group.title,
      });
    } catch {
      // The tab group may disappear between the tab query and metadata lookup.
    }
  }
  return groups;
}

async function moveGroupsBeforeStandaloneTabs(
  windowId: number,
  tabsApi: QueryTabsApi,
  tabGroupsApi: Partial<MoveTabGroupsApi>,
): Promise<void> {
  if (!tabGroupsApi.move) {
    return;
  }

  const tabs = (await listTabsInWindow(windowId, tabsApi)).sort(
    (left, right) => left.index - right.index,
  );
  const groupSizes = new Map<number, number>();
  for (const tab of tabs) {
    if (tab.groupId !== -1) {
      groupSizes.set(tab.groupId, (groupSizes.get(tab.groupId) ?? 0) + 1);
    }
  }

  let targetIndex = tabs.filter((tab) => tab.pinned).length;
  for (const [groupId, size] of groupSizes) {
    await tabGroupsApi.move(groupId, { index: targetIndex });
    targetIndex += size;
  }
}

export async function closeDuplicateTabsWithUndo(
  windowId: number,
  tabsApi: DuplicateTabsApi,
  tabGroupsApi: ReadTabGroupsApi,
): Promise<{ result: DuplicateExecutionResult; undo?: CloseDuplicatesUndoRecord }> {
  const tabs = await listTabsInWindow(windowId, tabsApi);
  const plan = planDuplicateRemoval(tabs);
  const removeIds = new Set(plan.removeTabIds);
  const closedTabs: ClosedTabSnapshot[] = tabs
    .filter((tab): tab is TabSnapshot & { url: string } => removeIds.has(tab.id) && Boolean(tab.url))
    .map((tab) => ({
      active: tab.active,
      groupId: tab.groupId,
      index: tab.index,
      pinned: tab.pinned,
      url: tab.url,
      windowId,
    }));
  const groups = await readGroupSnapshots(
    closedTabs.map((tab) => tab.groupId),
    tabGroupsApi,
  );

  if (plan.removeTabIds.length > 0) {
    await tabsApi.remove(plan.removeTabIds);
  }
  const result: DuplicateExecutionResult = {
    closedTabCount: plan.removeTabIds.length,
    duplicateUrlCount: plan.duplicateUrlCount,
    pinnedDuplicatesRetained: plan.pinnedDuplicatesRetained,
  };
  return {
    result,
    undo:
      closedTabs.length > 0
        ? { closedTabs, groups, kind: 'close-duplicates', windowId }
        : undefined,
  };
}

export async function applyGroupsWithUndo(
  groups: ProposedGroup[],
  windowId: number,
  tabsApi: GroupTabsApi,
  tabGroupsApi: UpdateTabGroupsApi & Partial<MoveTabGroupsApi & QueryTabGroupsApi>,
): Promise<{ assignments: TabGroupAssignment[]; result: AppliedGroupingResult }> {
  const currentTabs = await listTabsInWindow(windowId, tabsApi);
  const eligibleIds = new Set(
    currentTabs
      .filter((tab) => tab.groupId === -1 && !tab.pinned && Boolean(tab.url))
      .map((tab) => tab.id),
  );
  const assignments: TabGroupAssignment[] = [];
  let groupCount = 0;
  const needsExistingGroups = groups.some((group) => group.existingGroupId !== undefined);
  const existingGroupIds = new Set(
    needsExistingGroups && tabGroupsApi.query
      ? (await tabGroupsApi.query({ windowId })).map((group) => group.id)
      : [],
  );

  try {
    for (const group of groups) {
      const tabIds = group.tabIds.filter((tabId) => eligibleIds.has(tabId));
      const canReuseExisting =
        group.existingGroupId !== undefined && existingGroupIds.has(group.existingGroupId);
      if (tabIds.length < (canReuseExisting ? 1 : 2)) {
        continue;
      }

      let groupId: number;
      let reusedExisting = canReuseExisting;
      if (canReuseExisting) {
        try {
          groupId = await tabsApi.group({
            groupId: group.existingGroupId,
            tabIds: tabIds as [number, ...number[]],
          });
        } catch {
          if (tabIds.length < 2) {
            continue;
          }
          reusedExisting = false;
          groupId = await tabsApi.group({ tabIds: tabIds as [number, ...number[]] });
        }
      } else {
        groupId = await tabsApi.group({ tabIds: tabIds as [number, ...number[]] });
      }
      assignments.push(...tabIds.map((tabId) => ({ groupId, tabId })));
      if (!reusedExisting) {
        await tabGroupsApi.update(groupId, {
          collapsed: false,
          color: deterministicGroupColor(group.name),
          title: group.name,
        });
      }
      groupCount += 1;
    }
    if (assignments.length > 0) {
      await moveGroupsBeforeStandaloneTabs(windowId, tabsApi, tabGroupsApi);
    }
  } catch (error) {
    if (assignments.length > 0) {
      try {
        await tabsApi.ungroup(assignments.map(({ tabId }) => tabId) as [number, ...number[]]);
      } catch {
        // Preserve the original grouping failure.
      }
    }
    throw error;
  }

  return {
    assignments,
    result: { groupCount, groupedTabCount: assignments.length },
  };
}

export async function applyGroupsSafely(
  groups: ProposedGroup[],
  windowId: number,
  tabsApi: GroupTabsApi,
  tabGroupsApi: UpdateTabGroupsApi & Partial<MoveTabGroupsApi & QueryTabGroupsApi>,
): Promise<AppliedGroupingResult> {
  return (await applyGroupsWithUndo(groups, windowId, tabsApi, tabGroupsApi)).result;
}

export async function ungroupAllTabsInWindow(
  windowId: number,
  tabsApi: QueryTabsApi & { ungroup(tabIds: [number, ...number[]]): Promise<unknown> },
  tabGroupsApi: ReadTabGroupsApi,
): Promise<{ result: UngroupAllResult; undo?: UngroupAllUndoRecord }> {
  const tabs = await listTabsInWindow(windowId, tabsApi);
  const assignments = tabs
    .filter((tab) => tab.groupId !== -1)
    .map((tab) => ({ groupId: tab.groupId, tabId: tab.id }));
  const groups = await readGroupSnapshots(
    assignments.map(({ groupId }) => groupId),
    tabGroupsApi,
  );
  if (assignments.length > 0) {
    await tabsApi.ungroup(assignments.map(({ tabId }) => tabId) as [number, ...number[]]);
  }
  const result = {
    groupCount: new Set(assignments.map(({ groupId }) => groupId)).size,
    ungroupedTabCount: assignments.length,
  };
  return {
    result,
    undo:
      assignments.length > 0
        ? { assignments, groups, kind: 'ungroup-all', windowId }
        : undefined,
  };
}

async function restoreAssignments(
  assignments: TabGroupAssignment[],
  groups: TabGroupSnapshot[],
  windowId: number,
  tabsApi: UndoTabsApi,
  tabGroupsApi: UpdateTabGroupsApi,
): Promise<{ failed: number; restored: number }> {
  const groupById = new Map(groups.map((group) => [group.id, group]));
  const tabIdsByGroup = new Map<number, number[]>();
  for (const { groupId, tabId } of assignments) {
    const tabIds = tabIdsByGroup.get(groupId) ?? [];
    tabIds.push(tabId);
    tabIdsByGroup.set(groupId, tabIds);
  }

  let failed = 0;
  let restored = 0;
  for (const [originalGroupId, tabIds] of tabIdsByGroup) {
    const tuple = tabIds as [number, ...number[]];
    let restoredGroupId: number;
    try {
      restoredGroupId = await tabsApi.group({ groupId: originalGroupId, tabIds: tuple });
    } catch {
      try {
        restoredGroupId = await tabsApi.group({ createProperties: { windowId }, tabIds: tuple });
      } catch {
        failed += tabIds.length;
        continue;
      }
    }
    const metadata = groupById.get(originalGroupId);
    if (metadata) {
      try {
        await tabGroupsApi.update(restoredGroupId, {
          collapsed: metadata.collapsed,
          color: metadata.color,
          title: metadata.title ?? '',
        });
      } catch {
        // The tabs are restored even if Chrome rejects a metadata update.
      }
    }
    restored += tabIds.length;
  }
  return { failed, restored };
}

export async function restoreTabOperation(
  record: TabOperationUndoRecord,
  tabsApi: UndoTabsApi,
  tabGroupsApi: UpdateTabGroupsApi,
): Promise<UndoExecutionResult> {
  let failedTabCount = 0;
  let restoredTabCount = 0;

  if (record.kind === 'group-tabs') {
    const currentTabs = await listTabsInWindow(record.windowId, tabsApi);
    const groupByTabId = new Map(currentTabs.map((tab) => [tab.id, tab.groupId]));
    const tabIds = record.assignments
      .filter(({ groupId, tabId }) => groupByTabId.get(tabId) === groupId)
      .map(({ tabId }) => tabId);
    if (tabIds.length > 0) {
      await tabsApi.ungroup(tabIds as [number, ...number[]]);
      restoredTabCount += tabIds.length;
    }
  }

  if (record.kind === 'ungroup-all') {
    const currentTabs = await listTabsInWindow(record.windowId, tabsApi);
    const ungroupedIds = new Set(
      currentTabs.filter((tab) => tab.groupId === -1).map((tab) => tab.id),
    );
    const restorableAssignments = record.assignments.filter(({ tabId }) => ungroupedIds.has(tabId));
    const restored = await restoreAssignments(
      restorableAssignments,
      record.groups,
      record.windowId,
      tabsApi,
      tabGroupsApi,
    );
    failedTabCount += restored.failed;
    restoredTabCount += restored.restored;
  }

  if (record.kind === 'close-duplicates' || record.kind === 'group-tabs') {
    const restoredAssignments: TabGroupAssignment[] = [];
    for (const tab of [...record.closedTabs].sort((left, right) => left.index - right.index)) {
      try {
        const restored = await tabsApi.create({
          active: tab.active,
          index: tab.index,
          pinned: tab.pinned,
          url: tab.url,
          windowId: tab.windowId,
        });
        if (typeof restored.id !== 'number') {
          failedTabCount += 1;
          continue;
        }
        restoredTabCount += 1;
        if (tab.groupId !== -1) {
          restoredAssignments.push({ groupId: tab.groupId, tabId: restored.id });
        }
      } catch {
        failedTabCount += 1;
      }
    }
    const restoredGroups = await restoreAssignments(
      restoredAssignments,
      record.groups,
      record.windowId,
      tabsApi,
      tabGroupsApi,
    );
    failedTabCount += restoredGroups.failed;
  }

  return { failedTabCount, restoredTabCount };
}

export function combineGroupingUndo(
  windowId: number,
  assignments: TabGroupAssignment[],
  duplicateUndo?: CloseDuplicatesUndoRecord,
): GroupTabsUndoRecord | undefined {
  if (assignments.length === 0 && !duplicateUndo) {
    return undefined;
  }
  return {
    assignments,
    closedTabs: duplicateUndo?.closedTabs ?? [],
    groups: duplicateUndo?.groups ?? [],
    kind: 'group-tabs',
    windowId,
  };
}
