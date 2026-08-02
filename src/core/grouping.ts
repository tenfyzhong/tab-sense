import { z } from 'zod';

import {
  CHROME_GROUP_COLORS,
  type ChromeGroupColor,
  type GroupingPlan,
  type ProposedGroup,
  type SanitizedTab,
  type TabSnapshot,
} from './types';

const groupingPlanSchema = z.object({
  groups: z.array(
    z.object({
      existingGroupId: z.number().int().optional(),
      name: z.string(),
      tabIds: z.array(z.number().int()),
    }),
  ),
});

export function sanitizeTabForAi(tab: TabSnapshot): SanitizedTab {
  if (!tab.url) {
    throw new Error(`Tab ${tab.id} has no URL`);
  }

  let redactedUrl: string;
  try {
    const parsedUrl = new URL(tab.url);
    parsedUrl.search = '';
    parsedUrl.hash = '';
    redactedUrl = parsedUrl.toString();
  } catch {
    redactedUrl = tab.url.split(/[?#]/u, 1)[0] ?? '';
  }

  return {
    id: tab.id,
    title: (tab.title ?? '').trim().slice(0, 200),
    url: redactedUrl.slice(0, 500),
  };
}

function extractJsonObjects(text: string): string[] {
  const objects: string[] = [];
  let depth = 0;
  let escaped = false;
  let inString = false;
  let start = -1;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }

    if (character === '"' && depth > 0) {
      inString = true;
    } else if (character === '{') {
      if (depth === 0) {
        start = index;
      }
      depth += 1;
    } else if (character === '}' && depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        objects.push(text.slice(start, index + 1));
        start = -1;
      }
    }
  }

  return objects;
}

export function parseGroupingPlan(responseText: string): GroupingPlan {
  const trimmed = responseText.trim();
  const candidates = [trimmed];
  const fencedPattern = /```(?:json)?\s*([\s\S]*?)\s*```/giu;
  for (const match of trimmed.matchAll(fencedPattern)) {
    if (match[1]) {
      candidates.push(match[1]);
    }
  }
  candidates.push(...extractJsonObjects(trimmed));

  for (const candidate of new Set(candidates)) {
    try {
      const result = groupingPlanSchema.safeParse(JSON.parse(candidate));
      if (result.success) {
        return result.data;
      }
    } catch {
      // Try the next candidate extracted from the provider response.
    }
  }

  throw new Error('Invalid grouping response');
}

export function validateGroupingPlan(
  plan: GroupingPlan,
  eligibleTabIds: ReadonlySet<number>,
  existingGroupIds: ReadonlySet<number> = new Set(),
): ProposedGroup[] {
  const seenTabIds = new Set<number>();
  const mergedGroups = new Map<string, ProposedGroup>();

  for (const group of plan.groups) {
    const name = group.name.replace(/\s+/gu, ' ').trim().slice(0, 30);
    if (!name) {
      throw new Error('Grouping response contains an empty group name');
    }
    if (
      group.existingGroupId !== undefined &&
      !existingGroupIds.has(group.existingGroupId)
    ) {
      throw new Error(
        `Grouping response contains unknown existing group ID ${group.existingGroupId}`,
      );
    }

    const key =
      group.existingGroupId === undefined ? `new:${name}` : `existing:${group.existingGroupId}`;
    const merged = mergedGroups.get(key) ?? {
      existingGroupId: group.existingGroupId,
      name,
      tabIds: [],
    };
    for (const tabId of group.tabIds) {
      if (!eligibleTabIds.has(tabId)) {
        throw new Error(`Grouping response contains unknown tab ID ${tabId}`);
      }
      if (seenTabIds.has(tabId)) {
        throw new Error(`Grouping response contains repeated tab ID ${tabId}`);
      }

      seenTabIds.add(tabId);
      merged.tabIds.push(tabId);
    }
    mergedGroups.set(key, merged);
  }

  return [...mergedGroups.values()].filter(
    (group) => group.existingGroupId !== undefined || group.tabIds.length >= 2,
  );
}

export function deterministicGroupColor(name: string): ChromeGroupColor {
  let hash = 2166136261;
  for (const character of name) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }

  return CHROME_GROUP_COLORS[(hash >>> 0) % CHROME_GROUP_COLORS.length] ?? 'grey';
}
