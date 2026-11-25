import { browser } from 'wxt/browser';

import type { RuntimeControllerDependencies } from './controller';
import type { ModelContextResult } from './messages';
import {
  createProviderProfile,
  deleteProviderProfile,
  loadActiveProviderConnection,
  loadCatalogModelContext,
  loadProviderConnection,
  loadProviderApiKey,
  loadPublicSettings,
  saveProviderModel,
  saveCatalogModelContext,
  saveProviderProfile,
  saveRefreshedProvider,
  saveWorkflowPreference,
  setActiveProviderProfile,
} from '../core/settings';
import {
  applyGroupsWithUndo,
  closeDuplicateTabsWithUndo,
  combineGroupingUndo,
  listExistingGroupsInWindow,
  listTabsInWindow,
  restoreTabOperation,
  ungroupAllTabsInWindow,
} from '../core/tab-service';
import type {
  AiGroupingWorkflowResult,
  CloseDuplicatesUndoRecord,
  TabGroupAssignment,
} from '../core/types';
import { clearUndoRecord, loadUndoRecord, saveUndoRecord } from '../core/undo-store';
import { runAiGroupingWorkflow } from '../core/workflow';
import {
  listProviderModels,
  normalizeCompatibleBaseUrl,
  requestProviderGrouping,
  resolveGroupingModelLimits,
  testProviderConnection,
} from '../providers/adapters';
import { lookupCatalogContext } from '../providers/model-catalog';
import type { ProviderFetch, PublicSettings } from '../providers/types';

interface RefreshModelsInput {
  apiKey?: string;
  baseUrl: string;
  profileId: string;
}

export async function refreshProviderModels(
  input: RefreshModelsInput,
  fetcher: ProviderFetch = fetch,
): Promise<PublicSettings> {
  const currentSettings = await loadPublicSettings();
  const profile = currentSettings.profiles.find((candidate) => candidate.id === input.profileId);
  if (!profile) {
    throw new Error('The selected provider profile no longer exists');
  }
  const apiKey = input.apiKey?.trim() || (await loadProviderApiKey(input.profileId));
  if (!apiKey) {
    throw new Error('An API key is required');
  }

  if (!input.baseUrl) {
    throw new Error('An API Base URL is required');
  }
  const baseUrl = normalizeCompatibleBaseUrl(input.baseUrl);

  const models = await listProviderModels(
    { apiKey, baseUrl, modelId: '', providerId: profile.providerId },
    fetcher,
  );
  await saveRefreshedProvider({
    apiKey: input.apiKey?.trim() || undefined,
    baseUrl,
    models,
    profileId: input.profileId,
  });
  return loadPublicSettings();
}

export async function testConfiguredProviderModel(
  profileId: string,
  fetcher: ProviderFetch = fetch,
): Promise<{ connected: true }> {
  const connection = await loadProviderConnection(profileId);
  await testProviderConnection(connection, fetcher);
  return { connected: true };
}

async function resolveConfiguredModelContext(profileId: string, modelId: string): Promise<ModelContextResult> {
  const settings = await loadPublicSettings();
  const profile = settings.profiles.find(({ id }) => id === profileId);
  if (!profile || !modelId || profile.modelId !== modelId) {
    return { catalogContextTokens: null };
  }

  const context = await lookupCatalogContext(profile);
  if (context !== undefined) {
    await saveCatalogModelContext(profile, context);
    return { catalogContextTokens: context };
  }
  return { catalogContextTokens: await loadCatalogModelContext(profile) ?? null };
}

export async function runConfiguredAiGrouping(windowId: number): Promise<AiGroupingWorkflowResult> {
  const settings = await loadPublicSettings();
  let duplicateUndo: CloseDuplicatesUndoRecord | undefined;
  let groupAssignments: TabGroupAssignment[] = [];
  let connection;
  try {
    connection = await loadActiveProviderConnection();
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Unable to load the provider configuration',
      ok: false,
      stage: 'provider',
    };
  }

  return runAiGroupingWorkflow(
    {
      deduplicateBeforeGrouping: settings.deduplicateBeforeGrouping,
      locale: browser.i18n.getUILanguage(),
      windowId,
    },
    {
      applyGroups: async (groups, targetWindowId) => {
        const mutation = await applyGroupsWithUndo(
          groups,
          targetWindowId,
          browser.tabs,
          browser.tabGroups,
        );
        groupAssignments = mutation.assignments;
        return mutation.result;
      },
      closeDuplicates: async (targetWindowId) => {
        const mutation = await closeDuplicateTabsWithUndo(
          targetWindowId,
          browser.tabs,
          browser.tabGroups,
        );
        duplicateUndo = mutation.undo;
        return mutation.result;
      },
      listEligibleTabs: (targetWindowId) => listTabsInWindow(targetWindowId, browser.tabs),
      listExistingGroups: (targetWindowId) =>
        listExistingGroupsInWindow(targetWindowId, browser.tabs, browser.tabGroups),
      requestGrouping: async (tabs, existingGroups, locale) =>
        requestProviderGrouping(await resolveGroupingModelLimits(connection), tabs, existingGroups, locale),
    },
  ).then(async (result) => {
    const undo = result.ok
      ? combineGroupingUndo(windowId, groupAssignments, duplicateUndo)
      : duplicateUndo;
    if (undo) {
      await saveUndoRecord(undo);
    }
    return result;
  });
}

async function closeDuplicatesAndSaveUndo(windowId: number) {
  const mutation = await closeDuplicateTabsWithUndo(
    windowId,
    browser.tabs,
    browser.tabGroups,
  );
  if (mutation.undo) {
    await saveUndoRecord(mutation.undo);
  }
  return mutation.result;
}

async function ungroupAllAndSaveUndo(windowId: number) {
  const mutation = await ungroupAllTabsInWindow(windowId, browser.tabs, browser.tabGroups);
  if (mutation.undo) {
    await saveUndoRecord(mutation.undo);
  }
  return mutation.result;
}

async function undoLastAction() {
  const record = await loadUndoRecord();
  if (!record) {
    throw new Error('There is no tab operation to undo');
  }
  try {
    return await restoreTabOperation(record, browser.tabs, browser.tabGroups);
  } finally {
    await clearUndoRecord();
  }
}

export function createRuntimeDependencies(): RuntimeControllerDependencies {
  return {
    closeDuplicates: closeDuplicatesAndSaveUndo,
    createProviderProfile: async (name, providerId) => {
      await createProviderProfile({ name, providerId });
      return loadPublicSettings();
    },
    deleteProviderProfile: async (profileId) => {
      await deleteProviderProfile(profileId);
      return loadPublicSettings();
    },
    getCurrentWindowId: async () => {
      const window = await browser.windows.getLastFocused({ windowTypes: ['normal'] });
      if (window.id === undefined) {
        throw new Error('No normal browser window is available');
      }
      return window.id;
    },
    getSettings: loadPublicSettings,
    getUndoStatus: async () => {
      const record = await loadUndoRecord();
      return record
        ? { available: true as const, kind: record.kind }
        : { available: false as const };
    },
    groupTabs: runConfiguredAiGrouping,
    refreshModels: refreshProviderModels,
    resolveModelContext: resolveConfiguredModelContext,
    saveModel: async (profileId, modelId) => {
      await saveProviderModel(profileId, modelId);
      return loadPublicSettings();
    },
    saveProviderProfile: async (input) => {
      await saveProviderProfile(input);
      return loadPublicSettings();
    },
    saveWorkflowPreference: async (enabled) => {
      await saveWorkflowPreference(enabled);
      return loadPublicSettings();
    },
    setActiveProviderProfile: async (profileId) => {
      await setActiveProviderProfile(profileId);
      return loadPublicSettings();
    },
    testProviderModel: testConfiguredProviderModel,
    undoLastAction,
    ungroupAll: ungroupAllAndSaveUndo,
  };
}
