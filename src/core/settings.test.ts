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

  it('starts without providers and keeps added API keys out of public settings', async () => {
    const initial = await loadPublicSettings();

    expect(initial).toMatchObject({ activeProfileId: '', profiles: [] });

    const profile = await createProviderProfile({
      name: 'Work OpenAI',
      providerId: 'openai',
    });

    await saveRefreshedProvider({
      apiKey: 'openai-secret',
      baseUrl: 'https://openai.example/v1',
      models: [{ displayName: 'Model One', id: 'model-1' }],
      profileId: profile.id,
    });
    await saveProviderModel(profile.id, 'model-1');

    const publicSettings = await loadPublicSettings();
    expect(publicSettings.profiles.find((candidate) => candidate.id === profile.id)).toMatchObject({
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
    expect(afterDelete).toMatchObject({ activeProfileId: '', profiles: [] });
  });

  it('invalidates models only when the protocol or Base URL changes', async () => {
    const profile = await createProviderProfile({
      name: 'OpenAI',
      providerId: 'openai',
    });
    await saveRefreshedProvider({
      apiKey: 'secret',
      baseUrl: 'https://api.openai.com/v1',
      models: [{ displayName: 'Model One', id: 'model-1' }],
      profileId: profile.id,
    });
    await saveProviderModel(profile.id, 'model-1');

    await saveProviderProfile({
      baseUrl: 'https://api.openai.com/v1',
      name: 'Renamed OpenAI',
      profileId: profile.id,
      providerId: 'openai',
    });
    expect(
      (await loadPublicSettings()).profiles.find((candidate) => candidate.id === profile.id),
    ).toMatchObject({ modelId: 'model-1', name: 'Renamed OpenAI' });

    await saveProviderProfile({
      baseUrl: 'https://gateway.example/v1',
      name: 'Renamed OpenAI',
      profileId: profile.id,
      providerId: 'openai',
    });
    expect(
      (await loadPublicSettings()).profiles.find((candidate) => candidate.id === profile.id),
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

  it('renames legacy built-in OpenAI profiles without changing custom names', async () => {
    await fakeBrowser.storage.local.set({
      tabSenseCredentials: { 'openai-default': 'saved-secret' },
      tabSenseSettings: {
        activeProfileId: 'openai-default',
        deduplicateBeforeGrouping: false,
        profiles: [
          {
            baseUrl: 'https://api.openai.com/v1',
            id: 'openai-default',
            modelId: '',
            models: [],
            name: 'OpenAI',
            providerId: 'openai',
          },
          {
            baseUrl: 'https://gateway.example/v1',
            id: 'openai-compatible-default',
            modelId: '',
            models: [],
            name: 'OpenAI-compatible',
            providerId: 'openai-compatible',
          },
          {
            baseUrl: 'https://work.example/v1',
            id: 'openai-work',
            modelId: '',
            models: [],
            name: 'Work OpenAI',
            providerId: 'openai',
          },
        ],
        version: 2,
      },
    });

    const migrated = await loadPublicSettings();
    expect(migrated.profiles.map(({ id, name }) => ({ id, name }))).toEqual([
      { id: 'openai-default', name: 'OpenAI Responses' },
      { id: 'openai-compatible-default', name: 'OpenAI Completions' },
      { id: 'openai-work', name: 'Work OpenAI' },
    ]);
    expect((await fakeBrowser.storage.local.get('tabSenseSettings')).tabSenseSettings).toMatchObject({
      version: 4,
    });
  });

  it('removes only untouched generated profiles when upgrading current settings', async () => {
    await fakeBrowser.storage.local.set({
      tabSenseCredentials: { 'anthropic-default': 'configured-secret' },
      tabSenseSettings: {
        activeProfileId: 'openai-default',
        deduplicateBeforeGrouping: false,
        profiles: [
          {
            baseUrl: 'https://api.openai.com/v1',
            id: 'openai-default',
            modelId: '',
            models: [],
            name: 'OpenAI Responses',
            providerId: 'openai',
          },
          {
            baseUrl: 'https://api.anthropic.com/v1',
            id: 'anthropic-default',
            modelId: '',
            models: [],
            name: 'Anthropic',
            providerId: 'anthropic',
          },
          {
            baseUrl: 'https://work.example/v1',
            id: 'work-openai',
            modelId: '',
            models: [],
            name: 'Work OpenAI',
            providerId: 'openai',
          },
        ],
        version: 3,
      },
    });

    const migrated = await loadPublicSettings();
    expect(migrated.activeProfileId).toBe('anthropic-default');
    expect(migrated.profiles.map((profile) => profile.id)).toEqual([
      'anthropic-default',
      'work-openai',
    ]);
  });
});
