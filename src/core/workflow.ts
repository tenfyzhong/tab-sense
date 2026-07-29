import { parseGroupingPlan, sanitizeTabForAi, validateGroupingPlan } from './grouping';
import type {
  AiGroupingWorkflowOptions,
  AiGroupingWorkflowResult,
  DuplicateExecutionResult,
  GroupingWorkflowDependencies,
} from './types';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

export async function runAiGroupingWorkflow(
  options: AiGroupingWorkflowOptions,
  dependencies: GroupingWorkflowDependencies,
): Promise<AiGroupingWorkflowResult> {
  let duplicateResult: DuplicateExecutionResult | undefined;

  if (options.deduplicateBeforeGrouping) {
    try {
      duplicateResult = await dependencies.closeDuplicates(options.windowId);
    } catch (error) {
      return { error: errorMessage(error), ok: false, stage: 'deduplicate' };
    }
  }

  let eligibleTabs;
  let existingGroups;
  try {
    const [tabs, groups] = await Promise.all([
      dependencies.listEligibleTabs(options.windowId),
      dependencies.listExistingGroups(options.windowId),
    ]);
    eligibleTabs = tabs.filter(
      (tab) => tab.groupId === -1 && !tab.pinned && Boolean(tab.url),
    );
    existingGroups = groups;
  } catch (error) {
    return { error: errorMessage(error), ok: false, stage: 'query' };
  }

  if (eligibleTabs.length === 0 || (eligibleTabs.length < 2 && existingGroups.length === 0)) {
    return { duplicateResult, groupCount: 0, groupedTabCount: 0, ok: true };
  }

  const sanitizedTabs = eligibleTabs.map(sanitizeTabForAi);
  let groups;
  try {
    const rawPlan = await dependencies.requestGrouping(
      sanitizedTabs,
      existingGroups,
      options.locale,
    );
    const plan = parseGroupingPlan(rawPlan);
    groups = validateGroupingPlan(
      plan,
      new Set(eligibleTabs.map((tab) => tab.id)),
      new Set(existingGroups.map((group) => group.id)),
    );
  } catch (error) {
    return { error: errorMessage(error), ok: false, stage: 'provider' };
  }

  if (groups.length === 0) {
    return { duplicateResult, groupCount: 0, groupedTabCount: 0, ok: true };
  }

  try {
    const result = await dependencies.applyGroups(groups, options.windowId);
    return { duplicateResult, ok: true, ...result };
  } catch (error) {
    return { error: errorMessage(error), ok: false, stage: 'apply' };
  }
}
