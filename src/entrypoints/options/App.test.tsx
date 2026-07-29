import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { OptionsApp } from './App';
import type { RuntimeRequest, RuntimeResponse } from '../../background/messages';
import type { PublicSettings } from '../../providers/types';
import type { Translator } from '../../ui/i18n';
import type { UiClient } from '../../ui/runtime-client';

const messages: Record<string, string> = {
  addProvider: 'Add provider',
  aiProvider: 'Protocol',
  apiKey: 'API key',
  apiKeySaved: 'API key saved',
  closeDuplicatesBeforeGrouping: 'Close duplicate tabs before AI grouping',
  closeDuplicatesBeforeGroupingDescription:
    'When enabled, grouping stops if duplicate cleanup fails.',
  customBaseUrl: 'API Base URL',
  deleteProvider: 'Delete provider',
  model: 'Model',
  modelRefreshSuccess: 'Models refreshed.',
  newProviderName: 'New provider',
  openShortcutSettings: 'Configure shortcuts',
  privacyNotice: 'Tab titles and redacted URLs are sent directly to your selected provider.',
  providerAnthropic: 'Anthropic',
  providerGemini: 'Google Gemini',
  providerName: 'Provider name',
  providerOpenai: 'OpenAI',
  providerOpenaiCompatible: 'OpenAI-compatible',
  refreshModels: 'Refresh models',
  replaceApiKey: 'Leave blank to keep the saved key',
  saveProvider: 'Save provider',
  savedProvider: 'Saved provider',
  selectModel: 'Select a model',
  settingsTitle: 'Tab Sense Settings',
};

const t: Translator = (key) => messages[key] ?? key;

const initialSettings: PublicSettings = {
  activeProfileId: 'openai-work',
  deduplicateBeforeGrouping: false,
  profiles: [
    {
      baseUrl: 'https://openai.work.example/v1',
      hasApiKey: true,
      id: 'openai-work',
      modelId: 'model-1',
      models: [{ displayName: 'Model One', id: 'model-1' }],
      name: 'Work OpenAI',
      providerId: 'openai',
    },
    {
      baseUrl: 'https://api.anthropic.com/v1',
      hasApiKey: false,
      id: 'anthropic-personal',
      modelId: '',
      models: [],
      name: 'Personal Claude',
      providerId: 'anthropic',
    },
  ],
};

function settingsResponse(request: RuntimeRequest): PublicSettings {
  if (request.type === 'set-active-provider-profile') {
    return { ...initialSettings, activeProfileId: request.profileId };
  }
  if (request.type === 'refresh-models') {
    return {
      ...initialSettings,
      profiles: initialSettings.profiles.map((profile) =>
        profile.id === request.profileId
          ? {
              ...profile,
              models: [
                { displayName: 'Model One', id: 'model-1' },
                { displayName: 'Model Two', id: 'model-2' },
              ],
            }
          : profile,
      ),
    };
  }
  if (request.type === 'create-provider-profile') {
    return {
      ...initialSettings,
      activeProfileId: 'new-profile',
      profiles: [
        ...initialSettings.profiles,
        {
          baseUrl: 'https://api.openai.com/v1',
          hasApiKey: false,
          id: 'new-profile',
          modelId: '',
          models: [],
          name: request.name,
          providerId: request.providerId,
        },
      ],
    };
  }
  return initialSettings;
}

function client(): UiClient {
  return {
    getCommands: vi.fn(async () => []),
    openOptions: vi.fn(async () => undefined),
    openShortcutSettings: vi.fn(async () => undefined),
    request: vi.fn(async (request): Promise<RuntimeResponse> => ({
      data: request.type === 'get-settings' ? initialSettings : settingsResponse(request),
      ok: true,
    })),
    requestProviderPermission: vi.fn(async () => true),
  };
}

describe('OptionsApp', () => {
  it('switches between saved named provider profiles', async () => {
    const uiClient = client();
    render(<OptionsApp client={uiClient} t={t} />);

    const selector = await screen.findByLabelText('Saved provider');
    expect(screen.getByRole('option', { name: 'Work OpenAI' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Personal Claude' })).toBeInTheDocument();
    fireEvent.change(selector, { target: { value: 'anthropic-personal' } });

    await waitFor(() => {
      expect(uiClient.request).toHaveBeenCalledWith({
        profileId: 'anthropic-personal',
        type: 'set-active-provider-profile',
      });
    });
    expect(await screen.findByDisplayValue('Personal Claude')).toBeInTheDocument();
  });

  it('saves a profile name, protocol, and custom Base URL', async () => {
    const uiClient = client();
    render(<OptionsApp client={uiClient} t={t} />);

    fireEvent.change(await screen.findByLabelText('Provider name'), {
      target: { value: 'Work Gateway' },
    });
    fireEvent.change(screen.getByLabelText('API Base URL'), {
      target: { value: 'https://gateway.example/v1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save provider' }));

    await waitFor(() => {
      expect(uiClient.request).toHaveBeenCalledWith({
        baseUrl: 'https://gateway.example/v1',
        name: 'Work Gateway',
        profileId: 'openai-work',
        providerId: 'openai',
        type: 'save-provider-profile',
      });
    });
  });

  it('requests the configured host for an official protocol before refreshing models', async () => {
    const events: string[] = [];
    const uiClient = client();
    vi.mocked(uiClient.requestProviderPermission).mockImplementation(async () => {
      events.push('permission');
      return true;
    });
    vi.mocked(uiClient.request).mockImplementation(async (request): Promise<RuntimeResponse> => {
      if (request.type === 'get-settings') {
        return { data: initialSettings, ok: true };
      }
      events.push(request.type);
      return { data: settingsResponse(request), ok: true };
    });
    render(<OptionsApp client={uiClient} t={t} />);

    expect(await screen.findByText('API key saved')).toBeInTheDocument();
    expect(await screen.findByDisplayValue('https://openai.work.example/v1')).toBeInTheDocument();
    const refreshButton = screen.getByRole('button', { name: 'Refresh models' });
    expect(refreshButton).toBeEnabled();
    fireEvent.click(refreshButton);

    await waitFor(() => expect(events).toEqual(['save-provider-profile', 'permission', 'refresh-models']));
    expect(uiClient.requestProviderPermission).toHaveBeenCalledWith({
      baseUrl: 'https://openai.work.example/v1',
      providerId: 'openai',
    });
    expect(uiClient.request).toHaveBeenCalledWith({
      apiKey: undefined,
      baseUrl: 'https://openai.work.example/v1',
      profileId: 'openai-work',
      type: 'refresh-models',
    });
  });

  it('creates a new saved profile and persists workflow preferences', async () => {
    const uiClient = client();
    render(<OptionsApp client={uiClient} t={t} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Add provider' }));
    fireEvent.click(
      screen.getByRole('checkbox', { name: 'Close duplicate tabs before AI grouping' }),
    );

    await waitFor(() => {
      expect(uiClient.request).toHaveBeenCalledWith({
        name: 'New provider',
        providerId: 'openai',
        type: 'create-provider-profile',
      });
      expect(uiClient.request).toHaveBeenCalledWith({
        enabled: true,
        type: 'save-workflow-preference',
      });
    });
  });
});
