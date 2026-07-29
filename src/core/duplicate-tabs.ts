import type { DuplicateRemovalPlan, TabSnapshot } from './types';

export function planDuplicateRemoval(tabs: TabSnapshot[]): DuplicateRemovalPlan {
  const tabsByUrl = new Map<string, TabSnapshot[]>();

  for (const tab of tabs) {
    if (!tab.url) {
      continue;
    }

    const matches = tabsByUrl.get(tab.url) ?? [];
    matches.push(tab);
    tabsByUrl.set(tab.url, matches);
  }

  const removeTabIds: number[] = [];
  let duplicateUrlCount = 0;
  let pinnedDuplicatesRetained = 0;

  for (const matches of tabsByUrl.values()) {
    if (matches.length < 2) {
      continue;
    }

    duplicateUrlCount += 1;
    const pinnedTabs = matches.filter((tab) => tab.pinned);

    if (pinnedTabs.length > 0) {
      pinnedDuplicatesRetained += pinnedTabs.length;
      removeTabIds.push(...matches.filter((tab) => !tab.pinned).map((tab) => tab.id));
      continue;
    }

    const retainedTab =
      matches.find((tab) => tab.active) ??
      matches.reduce((leftmost, tab) => (tab.index < leftmost.index ? tab : leftmost));

    removeTabIds.push(...matches.filter((tab) => tab.id !== retainedTab.id).map((tab) => tab.id));
  }

  return {
    duplicateUrlCount,
    pinnedDuplicatesRetained,
    removeTabIds,
  };
}
