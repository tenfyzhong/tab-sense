import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';

import {
  createProviderProfile,
  deleteProviderProfile,
  loadActiveProviderConnection,
  loadPublicSettings,
  saveProviderModel,
  saveProviderProfile,
  saveRefreshedProvider,
  saveWorkflowPreference,
  setActiveProviderProfile,
} from './settings';

describe('settings storage', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('creates safe named defaults and keeps API keys out of public settings', async () => {
    const initial = await loadPublicSettings();

    expect(initial.activeProfileId).toBe('openai-default');
    expect(initial.profiles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          baseUrl: 'https://api.openai.com/v1',
          hasApiKey: false,
          id: 'openai-default',
          name: 'OpenAI',
          providerId: 'openai',
        }),
      ]),
    );

    await saveRefreshedProvider({
      apiKey: 'openai-secret',
      baseUrl: 'https://openai.example/v1',
      models: [{ displayName: 'Model One', id: 'model-1' }],
      profileId: 'openai-default',
    });
    await saveProviderModel('openai-default', 'model-1');

    const publicSettings = await loadPublicSettings();
    expect(publicSettings.profiles.find((profile) => profile.id === 'openai-default')).toMatchObject({
      baseUrl: 'https://openai.example/v1',
      hasApiKey: true,
      modelId: 'model-1',
    });
    expect(JSON.stringify(publicSettings)).not.toContain('openai-secret');
    expect(await loadActiveProviderConnection()).toEqual({
      apiKey: 'openai-secret',
      baseUrl: 'https://openai.example/v1',
      modelId: 'model-1',
      providerId: 'openai',
    });
  });

  it('creates, renames, selects, and deletes independent provider profiles', async () => {
    const profile = await createProviderProfile({
      name: 'Work Claude',
      providerId: 'anthropic',
    });
    await saveProviderProfile({
      baseUrl: 'https://anthropic.work.example/v1',
      name: 'Work Claude Gateway',
      profileId: profile.id,
      providerId: 'anthropic',
    });
    await saveRefreshedProvider({
      apiKey: 'work-secret',
      baseUrl: 'https://anthropic.work.example/v1',
      models: [{ displayName: 'Claude Work', id: 'claude-work' }],
      profileId: profile.id,
    });
    await saveProviderModel(profile.id, 'claude-work');
    await setActiveProviderProfile(profile.id);

    expect(await loadPublicSettings()).toMatchObject({
      activeProfileId: profile.id,
      profiles: expect.arrayContaining([
        expect.objectContaining({
          id: profile.id,
          modelId: 'claude-work',
          name: 'Work Claude Gateway',
          providerId: 'anthropic',
        }),
      ]),
    });
    expect(await loadActiveProviderConnection()).toMatchObject({
      apiKey: 'work-secret',
      modelId: 'claude-work',
      providerId: 'anthropic',
    });

    await deleteProviderProfile(profile.id);
    const afterDelete = await loadPublicSettings();
    expect(afterDelete.profiles.some((candidate) => candidate.id === profile.id)).toBe(false);
    expect(afterDelete.activeProfileId).not.toBe(profile.id);
  });

  it('invalidates models only when the protocol or Base URL changes', async () => {
    await saveRefreshedProvider({
      apiKey: 'secret',
      baseUrl: 'https://api.openai.com/v1',
      models: [{ displayName: 'Model One', id: 'model-1' }],
      profileId: 'openai-default',
    });
    await saveProviderModel('openai-default', 'model-1');

    await saveProviderProfile({
      baseUrl: 'https://api.openai.com/v1',
      name: 'Renamed OpenAI',
      profileId: 'openai-default',
      providerId: 'openai',
    });
    expect(
      (await loadPublicSettings()).profiles.find((profile) => profile.id === 'openai-default'),
    ).toMatchObject({ modelId: 'model-1', name: 'Renamed OpenAI' });

    await saveProviderProfile({
      baseUrl: 'https://gateway.example/v1',
      name: 'Renamed OpenAI',
      profileId: 'openai-default',
      providerId: 'openai',
    });
    expect(
      (await loadPublicSettings()).profiles.find((profile) => profile.id === 'openai-default'),
    ).toMatchObject({ modelId: '', models: [] });
  });

  it('persists the workflow preference and migrates legacy per-protocol settings', async () => {
    await fakeBrowser.storage.local.set({
      tabSenseCredentials: { anthropic: 'legacy-secret' },
      tabSenseSettings: {
        activeProvider: 'anthropic',
        deduplicateBeforeGrouping: true,
        providers: {
          anthropic: {
            modelId: 'claude-legacy',
            models: [{ displayName: 'Claude Legacy', id: 'claude-legacy' }],
          },
        },
      },
    });

    const migrated = await loadPublicSettings();
    expect(migrated).toMatchObject({
      activeProfileId: 'anthropic-default',
      deduplicateBeforeGrouping: true,
      profiles: expect.arrayContaining([
        expect.objectContaining({
          hasApiKey: true,
          id: 'anthropic-default',
          modelId: 'claude-legacy',
        }),
      ]),
    });
    expect(JSON.stringify(migrated)).not.toContain('legacy-secret');

    await saveWorkflowPreference(false);
    expect((await loadPublicSettings()).deduplicateBeforeGrouping).toBe(false);
  });
});
