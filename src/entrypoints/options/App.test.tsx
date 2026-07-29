import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { OptionsApp } from './App';
import type { RuntimeRequest, RuntimeResponse } from '../../background/messages';
import type { PublicSettings } from '../../providers/types';
import type { Translator } from '../../ui/i18n';
import type { UiClient } from '../../ui/runtime-client';

const optionsStyles = readFileSync(resolve('src/entrypoints/options/style.css'), 'utf8');

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
  modelTestInProgress: 'Testing model connection…',
  modelTestSuccess: 'Model connection succeeded.',
  newProviderName: 'New provider',
  noProviders: 'No providers yet. Add one to configure AI grouping.',
  openShortcutSettings: 'Configure shortcuts',
  privacyNotice: 'Tab titles and redacted URLs are sent directly to your selected provider.',
  providerAnthropic: 'Anthropic',
  providerGemini: 'Google Gemini',
  providerName: 'Provider name',
  providerOpenai: 'OpenAI Responses',
  providerOpenaiCompatible: 'OpenAI Completions',
  providerCreated: 'Provider profile created.',
  providerDeleted: 'Provider profile deleted.',
  refreshModels: 'Refresh models',
  replaceApiKey: 'Leave blank to keep the saved key',
  saveProvider: 'Save provider',
  savedProvider: 'Saved provider',
  selectModel: 'Select a model',
  settingsSaved: 'Settings saved.',
  settingsTitle: 'Tab Sense Settings',
  testModel: 'Test model',
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

const emptySettings: PublicSettings = {
  activeProfileId: '',
  deduplicateBeforeGrouping: false,
  profiles: [],
};

function settingsResponse(
  request: RuntimeRequest,
  currentSettings: PublicSettings = initialSettings,
): PublicSettings {
  if (request.type === 'set-active-provider-profile') {
    return { ...currentSettings, activeProfileId: request.profileId };
  }
  if (request.type === 'refresh-models') {
    return {
      ...currentSettings,
      profiles: currentSettings.profiles.map((profile) =>
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
      ...currentSettings,
      activeProfileId: 'new-profile',
      profiles: [
        ...currentSettings.profiles,
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
  if (request.type === 'delete-provider-profile') {
    const profiles = currentSettings.profiles.filter((profile) => profile.id !== request.profileId);
    return {
      ...currentSettings,
      activeProfileId: profiles[0]?.id ?? '',
      profiles,
    };
  }
  return currentSettings;
}

function client(currentSettings: PublicSettings = initialSettings): UiClient {
  return {
    getCommands: vi.fn(async () => []),
    openOptions: vi.fn(async () => undefined),
    openShortcutSettings: vi.fn(async () => undefined),
    request: vi.fn(async (request): Promise<RuntimeResponse> => ({
      data:
        request.type === 'test-provider-model'
          ? { connected: true }
          : request.type === 'get-settings'
            ? currentSettings
            : settingsResponse(request, currentSettings),
      ok: true,
    })),
    requestProviderPermission: vi.fn(async () => true),
  };
}

describe('OptionsApp', () => {
  it('shows save feedback in a fixed toast', async () => {
    const uiClient = client();
    render(<OptionsApp client={uiClient} t={t} />);

    const saveButton = await screen.findByRole('button', { name: 'Save provider' });
    await waitFor(() => expect(saveButton).toBeEnabled());
    fireEvent.click(saveButton);

    const toast = await screen.findByRole('status');
    expect(toast).toHaveTextContent('Settings saved.');
    expect(toast).toHaveClass('settings-toast');
    expect(optionsStyles).toMatch(/\.settings-toast\s*\{[^}]*position:\s*fixed/s);
  });

  it('keeps shortcut settings in the page header', async () => {
    const uiClient = client();
    render(<OptionsApp client={uiClient} t={t} />);

    const header = await screen.findByRole('banner');
    const shortcutButton = within(header).getByRole('button', { name: 'Configure shortcuts' });
    fireEvent.click(shortcutButton);

    expect(uiClient.openShortcutSettings).toHaveBeenCalledOnce();
  });

  it('uses a compact responsive settings grid', async () => {
    render(<OptionsApp client={client()} t={t} />);

    expect(await screen.findByTestId('provider-settings-grid')).toHaveClass('settings-grid');
    expect(optionsStyles).toMatch(/\.settings-grid\s*\{[^}]*grid-template-columns:/s);
    expect(optionsStyles).toMatch(/@media\s*\(max-width:\s*\d+px\)/);
  });

  it('top-aligns the API key and model controls when a saved-key indicator is present', async () => {
    render(<OptionsApp client={client()} t={t} />);

    expect(await screen.findByText('API key saved')).toBeInTheDocument();
    expect(screen.getByLabelText('API key').closest('.field')).toBeInTheDocument();
    expect(screen.getByLabelText('Model').closest('.field')).toBeInTheDocument();
    expect(optionsStyles).toMatch(/\.field\s*\{[^}]*align-content:\s*start/s);
  });

  it('disables model testing until a key and model are saved', async () => {
    const unconfiguredSettings: PublicSettings = {
      ...initialSettings,
      profiles: [
        {
          ...initialSettings.profiles[0]!,
          hasApiKey: false,
          modelId: '',
        },
      ],
    };
    render(<OptionsApp client={client(unconfiguredSettings)} t={t} />);

    expect(await screen.findByRole('button', { name: 'Test model' })).toBeDisabled();
  });

  it('shows progress immediately and reports a successful model test', async () => {
    const uiClient = client();
    const fallbackRequest = vi.mocked(uiClient.request).getMockImplementation();
    let resolveTest: ((response: RuntimeResponse) => void) | undefined;
    const pendingTest = new Promise<RuntimeResponse>((resolve) => {
      resolveTest = resolve;
    });
    vi.mocked(uiClient.request).mockImplementation((request) =>
      request.type === 'test-provider-model'
        ? pendingTest
        : (fallbackRequest?.(request) ?? Promise.reject(new Error('Missing mock response'))),
    );
    render(<OptionsApp client={uiClient} t={t} />);

    const testButton = await screen.findByRole('button', { name: 'Test model' });
    fireEvent.click(testButton);

    expect(await screen.findByText('Testing model connection…')).toBeInTheDocument();
    expect(testButton).toBeDisabled();
    expect(uiClient.request).toHaveBeenCalledWith({
      profileId: 'openai-work',
      type: 'test-provider-model',
    });

    resolveTest?.({ data: { connected: true }, ok: true });
    expect(await screen.findByText('Model connection succeeded.')).toBeInTheDocument();
  });

  it('shows a sanitized model test failure', async () => {
    const uiClient = client();
    const fallbackRequest = vi.mocked(uiClient.request).getMockImplementation();
    vi.mocked(uiClient.request).mockImplementation((request) =>
      request.type === 'test-provider-model'
        ? Promise.resolve({ error: 'The selected model is unavailable', ok: false })
        : (fallbackRequest?.(request) ?? Promise.reject(new Error('Missing mock response'))),
    );
    render(<OptionsApp client={uiClient} t={t} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Test model' }));

    expect(await screen.findByText('The selected model is unavailable')).toBeInTheDocument();
  });

  it('shows an empty state and lets the user add the first provider', async () => {
    const uiClient = client(emptySettings);
    render(<OptionsApp client={uiClient} t={t} />);

    expect(
      await screen.findByText('No providers yet. Add one to configure AI grouping.'),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add provider' }));

    await waitFor(() => {
      expect(uiClient.request).toHaveBeenCalledWith({
        name: 'New provider',
        providerId: 'openai',
        type: 'create-provider-profile',
      });
    });
    expect(await screen.findByLabelText('Protocol')).toBeInTheDocument();
  });

  it('allows the final provider to be deleted and returns to the empty state', async () => {
    const onlyProfile = { ...initialSettings, profiles: [initialSettings.profiles[0]!] };
    const uiClient = client(onlyProfile);
    render(<OptionsApp client={uiClient} t={t} />);

    const deleteButton = await screen.findByRole('button', { name: 'Delete provider' });
    expect(deleteButton).toBeEnabled();
    fireEvent.click(deleteButton);

    expect(
      await screen.findByText('No providers yet. Add one to configure AI grouping.'),
    ).toBeInTheDocument();
    expect(uiClient.request).toHaveBeenCalledWith({
      profileId: 'openai-work',
      type: 'delete-provider-profile',
    });
  });

  it('shows distinct names for the OpenAI protocol variants', async () => {
    render(<OptionsApp client={client()} t={t} />);

    const providerSelector = await screen.findByLabelText('Protocol');
    expect(within(providerSelector).getByRole('option', { name: 'OpenAI Responses' })).toHaveValue(
      'openai',
    );
    expect(within(providerSelector).getByRole('option', { name: 'OpenAI Completions' })).toHaveValue(
      'openai-compatible',
    );
  });

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
