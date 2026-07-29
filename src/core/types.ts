export const CHROME_GROUP_COLORS = [
  'grey',
  'blue',
  'red',
  'yellow',
  'green',
  'pink',
  'purple',
  'cyan',
  'orange',
] as const;

export type ChromeGroupColor = (typeof CHROME_GROUP_COLORS)[number];

export interface TabSnapshot {
  active: boolean;
  groupId: number;
  id: number;
  index: number;
  pinned: boolean;
  title?: string;
  url?: string;
}

export interface DuplicateRemovalPlan {
  duplicateUrlCount: number;
  pinnedDuplicatesRetained: number;
  removeTabIds: number[];
}

export interface DuplicateExecutionResult {
  closedTabCount: number;
  duplicateUrlCount: number;
  pinnedDuplicatesRetained: number;
}

export interface SanitizedTab {
  id: number;
  title: string;
  url: string;
}

export interface ExistingGroupContext {
  id: number;
  tabs: SanitizedTab[];
  title: string;
}

export interface ProposedGroup {
  existingGroupId?: number;
  name: string;
  tabIds: number[];
}

export interface GroupingPlan {
  groups: ProposedGroup[];
}

export interface AppliedGroupingResult {
  groupCount: number;
  groupedTabCount: number;
}

export interface TabGroupAssignment {
  groupId: number;
  tabId: number;
}

export interface TabGroupSnapshot {
  collapsed: boolean;
  color: ChromeGroupColor;
  id: number;
  title?: string;
}

export interface ClosedTabSnapshot {
  active: boolean;
  groupId: number;
  index: number;
  pinned: boolean;
  url: string;
  windowId: number;
}

export interface CloseDuplicatesUndoRecord {
  closedTabs: ClosedTabSnapshot[];
  groups: TabGroupSnapshot[];
  kind: 'close-duplicates';
  windowId: number;
}

export interface GroupTabsUndoRecord {
  assignments: TabGroupAssignment[];
  closedTabs: ClosedTabSnapshot[];
  groups: TabGroupSnapshot[];
  kind: 'group-tabs';
  windowId: number;
}

export interface UngroupAllUndoRecord {
  assignments: TabGroupAssignment[];
  groups: TabGroupSnapshot[];
  kind: 'ungroup-all';
  windowId: number;
}

export type TabOperationUndoRecord =
  | CloseDuplicatesUndoRecord
  | GroupTabsUndoRecord
  | UngroupAllUndoRecord;

export interface UndoExecutionResult {
  failedTabCount: number;
  restoredTabCount: number;
}

export interface UngroupAllResult {
  groupCount: number;
  ungroupedTabCount: number;
}

export interface AiGroupingWorkflowOptions {
  deduplicateBeforeGrouping: boolean;
  locale: string;
  windowId: number;
}

export interface GroupingWorkflowDependencies {
  applyGroups(groups: ProposedGroup[], windowId: number): Promise<AppliedGroupingResult>;
  closeDuplicates(windowId: number): Promise<DuplicateExecutionResult>;
  listEligibleTabs(windowId: number): Promise<TabSnapshot[]>;
  listExistingGroups(windowId: number): Promise<ExistingGroupContext[]>;
  requestGrouping(
    tabs: SanitizedTab[],
    existingGroups: ExistingGroupContext[],
    locale: string,
  ): Promise<string>;
}

export type AiGroupingWorkflowResult =
  | ({
      duplicateResult: DuplicateExecutionResult | undefined;
      ok: true;
    } & AppliedGroupingResult)
  | {
      error: string;
      ok: false;
      stage: 'deduplicate' | 'query' | 'provider' | 'apply';
    };
