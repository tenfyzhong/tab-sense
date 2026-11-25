import type { ExistingGroupContext, SanitizedTab } from '../core/types';
import type { ProviderConnection } from './types';

export const DEFAULT_CONTEXT_WINDOW_TOKENS = 128_000;
export const MIN_CONTEXT_WINDOW_TOKENS = 2048;
const CHAT_OVERHEAD_TOKENS = 256;
const MAX_TABS_PER_REQUEST = 80;
const MAX_OUTPUT_TOKENS = 4096;
const RESPONSE_BASE_TOKENS = 256;
const RESPONSE_TOKENS_PER_TAB = 48;
const encoder = new TextEncoder();

type TabMetadata = Pick<SanitizedTab, 'title' | 'url'>;
type PromptGroup = Pick<ExistingGroupContext, 'id' | 'title'> & { tabs: TabMetadata[] };

interface GroupingBatch {
  existingGroups: PromptGroup[];
  maxOutputTokens: number;
  tabs: SanitizedTab[];
  user: string;
}

export function isValidContextWindow(value: number): boolean {
  return Number.isSafeInteger(value) && value >= MIN_CONTEXT_WINDOW_TOKENS;
}

function bytes(text: string): number {
  return encoder.encode(text).length;
}

function jsonBytes(value: unknown): number {
  return bytes(JSON.stringify(value));
}

function jsonStringPrefix(value: string, maxBytes: number): string {
  if (jsonBytes(value) - 2 <= maxBytes) {
    return value;
  }
  let prefix = '';
  for (const character of value) {
    maxBytes -= jsonBytes(character) - 2;
    if (maxBytes < 0) {
      break;
    }
    prefix += character;
  }
  return prefix;
}

function compactMetadata<T extends TabMetadata>(tab: T, maxBytes: number): T {
  if (jsonBytes(tab) <= maxBytes) {
    return tab;
  }
  const textBudget = maxBytes - jsonBytes({ ...tab, title: '', url: '' });
  const urlPrefix = jsonStringPrefix(tab.url, Math.floor(textBudget / 2));
  const title = jsonStringPrefix(tab.title, textBudget - (jsonBytes(urlPrefix) - 2));
  const url = jsonStringPrefix(tab.url, textBudget - (jsonBytes(title) - 2));
  return { ...tab, title, url };
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

function tabsByHostname(tabs: SanitizedTab[]): SanitizedTab[] {
  const byHost = new Map<string, SanitizedTab[]>();
  for (const tab of tabs) {
    const host = hostname(tab.url);
    const matchingTabs = byHost.get(host) ?? [];
    matchingTabs.push(tab);
    byHost.set(host, matchingTabs);
  }
  return [...byHost.values()].flat();
}

function fitExistingGroups(
  groups: PromptGroup[],
  tabs: SanitizedTab[],
  availableBytes: number,
): PromptGroup[] {
  if (jsonBytes(groups) - 2 <= availableBytes) {
    return groups;
  }
  const hosts = new Set(tabs.map((tab) => hostname(tab.url)).filter(Boolean));
  const ranked = groups.map((group) => {
    const sample = group.tabs.find((tab) => hosts.has(hostname(tab.url)));
    return { group, sample };
  }).sort((left, right) => Number(Boolean(right.sample)) - Number(Boolean(left.sample)));

  const context: PromptGroup[] = [];
  for (const { group, sample } of ranked) {
    const entry: PromptGroup = {
      id: group.id,
      tabs: [],
      title: jsonStringPrefix(group.title, 96),
    };
    const representative = sample ?? group.tabs[0];
    if (representative) {
      const withSample = { ...entry, tabs: [compactMetadata(representative, 160)] };
      if (jsonBytes(withSample) + 1 <= availableBytes) {
        entry.tabs = withSample.tabs;
      }
    }
    const cost = jsonBytes(entry) + 1;
    if (cost <= availableBytes) {
      context.push(entry);
      availableBytes -= cost;
    }
  }
  return context;
}

export function* planGroupingBatches(
  system: string,
  tabs: SanitizedTab[],
  existingGroups: ExistingGroupContext[],
  limits: Pick<ProviderConnection, 'contextWindowTokens' | 'maxInputTokens' | 'maxOutputTokens'>,
): Generator<GroupingBatch> {
  const contextWindow = Math.min(
    limits.contextWindowTokens ?? limits.maxInputTokens ?? DEFAULT_CONTEXT_WINDOW_TOKENS,
    limits.maxInputTokens ?? Infinity,
  );
  if (!isValidContextWindow(contextWindow)) {
    throw new Error(`The model context window is too small for tab grouping (minimum ${MIN_CONTEXT_WINDOW_TOKENS} tokens)`);
  }

  // UTF-8 bytes conservatively bound text token usage for byte-based tokenizers.
  // Keep room for provider message framing in addition to the capped generation.
  const systemTokens = bytes(system) + CHAT_OVERHEAD_TOKENS;
  const outputLimit = Math.min(limits.maxOutputTokens ?? MAX_OUTPUT_TOKENS, MAX_OUTPUT_TOKENS);
  const maxTabs = Math.min(MAX_TABS_PER_REQUEST, Math.max(
    2,
    Math.floor((outputLimit - RESPONSE_BASE_TOKENS) / RESPONSE_TOKENS_PER_TAB),
  ));
  const outputTokens = (count: number) => Math.min(outputLimit, Math.max(
    Math.min(1024, Math.floor(contextWindow / 4)),
    RESPONSE_BASE_TOKENS + RESPONSE_TOKENS_PER_TAB * count,
  ));
  const groups = existingGroups.map(({ id, tabs: members, title }) => ({
    id,
    tabs: members.map(({ title: memberTitle, url }) => ({ title: memberTitle, url })),
    title,
  }));
  const makeBatch = (batchTabs: SanitizedTab[], batchGroups: PromptGroup[]): GroupingBatch => {
    const user = JSON.stringify({ existingGroups: batchGroups, tabs: batchTabs });
    return {
      existingGroups: batchGroups,
      maxOutputTokens: outputTokens(batchTabs.length),
      tabs: batchTabs,
      user,
    };
  };
  const fits = (batch: GroupingBatch) =>
    systemTokens + bytes(batch.user) + batch.maxOutputTokens <= contextWindow;
  if (tabs.length <= maxTabs) {
    const full = makeBatch(tabs, groups);
    if (fits(full)) {
      yield full;
      return;
    }
  }

  const fixedCost = systemTokens + jsonBytes({ existingGroups: [], tabs: [] });
  const spaceForPair = contextWindow - fixedCost - outputTokens(2);
  const groupReserve = groups.length ? Math.floor(spaceForPair / 4) : 0;
  const maxTabBytes = Math.floor((spaceForPair - groupReserve) / 2) - 1;
  const orderedTabs = tabsByHostname(tabs);
  const tabBatches: { tabs: SanitizedTab[]; cost: number }[] = [];
  let current = { tabs: [] as SanitizedTab[], cost: 0 };
  for (const tab of orderedTabs) {
    const compact = compactMetadata(tab, maxTabBytes);
    const cost = jsonBytes(compact) + 1;
    const nextCount = current.tabs.length + 1;
    if (nextCount > maxTabs ||
        fixedCost + current.cost + cost + groupReserve + outputTokens(nextCount) > contextWindow) {
      if (current.tabs.length === 0) {
        throw new Error('The grouping prompt does not fit in the configured model context window');
      }
      tabBatches.push(current);
      current = { tabs: [], cost: 0 };
    }
    current.tabs.push(compact);
    current.cost += cost;
  }
  const previous = tabBatches.at(-1);
  // Leave two tabs in the last batch when possible so it can propose a new group.
  if (current.tabs.length === 1 && previous && previous.tabs.length > 2) {
    const moved = previous.tabs.splice(-1);
    const cost = jsonBytes(moved[0]) + 1;
    previous.cost -= cost;
    current.tabs.unshift(...moved);
    current.cost += cost;
  }
  if (current.tabs.length) {
    tabBatches.push(current);
  }

  for (const { tabs: batchTabs, cost } of tabBatches) {
    const availableBytes = contextWindow - fixedCost - cost - outputTokens(batchTabs.length);
    const batch = makeBatch(batchTabs, fitExistingGroups(groups, batchTabs, availableBytes));
    if (!fits(batch)) {
      throw new Error('The grouping prompt does not fit in the configured model context window');
    }
    yield batch;
  }
}
