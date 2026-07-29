import { useEffect, useState } from 'react';

import { DEFAULT_PROVIDER_BASE_URLS } from '../../providers/adapters';
import type { ProviderId, PublicSettings } from '../../providers/types';
import { PROVIDER_IDS } from '../../providers/types';
import { isPublicSettings } from '../../ui/guards';
import { translate, type Translator } from '../../ui/i18n';
import { runtimeClient, type UiClient } from '../../ui/runtime-client';

interface OptionsAppProps {
  client?: UiClient;
  t?: Translator;
}

const PROVIDER_MESSAGE_KEYS: Record<ProviderId, string> = {
  anthropic: 'providerAnthropic',
  gemini: 'providerGemini',
  openai: 'providerOpenai',
  'openai-compatible': 'providerOpenaiCompatible',
};

export function OptionsApp({ client = runtimeClient, t = translate }: OptionsAppProps) {
  const [settings, setSettings] = useState<PublicSettings>();
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [name, setName] = useState('');
  const [providerId, setProviderId] = useState<ProviderId>('openai');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');

  useEffect(() => {
    let active = true;
    void client.request({ type: 'get-settings' }).then((response) => {
      if (!active) {
        return;
      }
      if (response.ok && isPublicSettings(response.data)) {
        setSettings(response.data);
      } else if (!response.ok) {
        setStatus(response.error);
      }
    });
    return () => {
      active = false;
    };
  }, [client]);

  const profile = settings?.profiles.find((candidate) => candidate.id === settings.activeProfileId);

  useEffect(() => {
    if (!profile) {
      return;
    }
    setApiKey('');
    setBaseUrl(profile.baseUrl);
    setName(profile.name);
    setProviderId(profile.providerId);
  }, [profile]);

  if (!settings || !profile) {
    return <main className="settings-shell">{status || t('loading')}</main>;
  }

  const currentSettings = settings;
  const currentProfile = profile;

  async function applySettingsRequest(
    request: Parameters<UiClient['request']>[0],
  ): Promise<PublicSettings> {
    const response = await client.request(request);
    if (!response.ok) {
      throw new Error(response.error);
    }
    if (!isPublicSettings(response.data)) {
      throw new Error('The extension returned invalid settings');
    }
    setSettings(response.data);
    return response.data;
  }

  async function selectProfile(profileId: string): Promise<void> {
    setStatus('');
    try {
      await applySettingsRequest({ profileId, type: 'set-active-provider-profile' });
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unknown error');
    }
  }

  async function addProfile(): Promise<void> {
    setStatus('');
    try {
      await applySettingsRequest({
        name: t('newProviderName'),
        providerId: 'openai',
        type: 'create-provider-profile',
      });
      setStatus(t('providerCreated'));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unknown error');
    }
  }

  async function deleteProfile(): Promise<void> {
    setBusy(true);
    setStatus('');
    try {
      await applySettingsRequest({
        profileId: currentProfile.id,
        type: 'delete-provider-profile',
      });
      setStatus(t('providerDeleted'));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  }

  async function saveProfile(): Promise<PublicSettings> {
    return applySettingsRequest({
      baseUrl,
      name,
      profileId: currentProfile.id,
      providerId,
      type: 'save-provider-profile',
    });
  }

  async function saveProfileFromButton(): Promise<void> {
    setBusy(true);
    setStatus('');
    try {
      await saveProfile();
      setStatus(t('settingsSaved'));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  }

  async function changeWorkflowPreference(enabled: boolean): Promise<void> {
    setSettings({ ...currentSettings, deduplicateBeforeGrouping: enabled });
    try {
      await applySettingsRequest({ enabled, type: 'save-workflow-preference' });
    } catch (error) {
      setSettings({ ...currentSettings, deduplicateBeforeGrouping: !enabled });
      setStatus(error instanceof Error ? error.message : 'Unknown error');
    }
  }

  async function refreshModels(): Promise<void> {
    setBusy(true);
    setStatus('');
    try {
      await saveProfile();
      const granted = await client.requestProviderPermission({ baseUrl, providerId });
      if (!granted) {
        throw new Error(t('providerPermissionDenied'));
      }
      await applySettingsRequest({
        apiKey: apiKey || undefined,
        baseUrl,
        profileId: currentProfile.id,
        type: 'refresh-models',
      });
      setApiKey('');
      setStatus(t('modelRefreshSuccess'));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  }

  async function changeModel(modelId: string): Promise<void> {
    try {
      await applySettingsRequest({
        modelId,
        profileId: currentProfile.id,
        type: 'save-model',
      });
      setStatus(t('settingsSaved'));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unknown error');
    }
  }

  const refreshDisabled = busy || (!apiKey && !currentProfile.hasApiKey) || !baseUrl || !name.trim();

  return (
    <main className="settings-shell">
      <header className="settings-header">
        <div className="settings-brand" aria-hidden="true">
          T
        </div>
        <div>
          <h1>{t('settingsTitle')}</h1>
          <p>{t('settingsSubtitle')}</p>
        </div>
      </header>

      <section className="settings-card">
        <div className="profile-picker">
          <label className="field grow-field">
            <span>{t('savedProvider')}</span>
            <select
              aria-label={t('savedProvider')}
              value={currentProfile.id}
              onChange={(event) => void selectProfile(event.target.value)}
            >
              {currentSettings.profiles.map((savedProfile) => (
                <option key={savedProfile.id} value={savedProfile.id}>
                  {savedProfile.name}
                </option>
              ))}
            </select>
          </label>
          <button className="secondary-button" disabled={busy} onClick={() => void addProfile()}>
            {t('addProvider')}
          </button>
        </div>

        <label className="field">
          <span>{t('providerName')}</span>
          <input
            aria-label={t('providerName')}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>

        <label className="field">
          <span>{t('aiProvider')}</span>
          <select
            aria-label={t('aiProvider')}
            value={providerId}
            onChange={(event) => {
              const nextProviderId = event.target.value as ProviderId;
              setProviderId(nextProviderId);
              setBaseUrl(DEFAULT_PROVIDER_BASE_URLS[nextProviderId]);
            }}
          >
            {PROVIDER_IDS.map((id) => (
              <option key={id} value={id}>
                {t(PROVIDER_MESSAGE_KEYS[id])}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>{t('customBaseUrl')}</span>
          <input
            aria-label={t('customBaseUrl')}
            type="url"
            value={baseUrl}
            placeholder="https://api.example.com/v1"
            onChange={(event) => setBaseUrl(event.target.value)}
          />
        </label>

        <button
          className="secondary-button full-width-button"
          disabled={busy || !name.trim() || !baseUrl}
          onClick={() => void saveProfileFromButton()}
        >
          {t('saveProvider')}
        </button>

        <label className="field">
          <span>{t('apiKey')}</span>
          <input
            aria-label={t('apiKey')}
            autoComplete="off"
            type="password"
            value={apiKey}
            placeholder={currentProfile.hasApiKey ? t('replaceApiKey') : ''}
            onChange={(event) => setApiKey(event.target.value)}
          />
        </label>
        {currentProfile.hasApiKey && <p className="saved-indicator">{t('apiKeySaved')}</p>}

        <button className="primary-button" disabled={refreshDisabled} onClick={refreshModels}>
          {busy ? t('loading') : t('refreshModels')}
        </button>

        <label className="field">
          <span>{t('model')}</span>
          <select
            value={currentProfile.modelId}
            onChange={(event) => void changeModel(event.target.value)}
          >
            <option value="">{t('selectModel')}</option>
            {currentProfile.models.map((model) => (
              <option key={model.id} value={model.id}>
                {model.displayName}
              </option>
            ))}
          </select>
        </label>

        <button
          className="danger-button"
          disabled={busy || currentSettings.profiles.length === 1}
          onClick={() => void deleteProfile()}
        >
          {t('deleteProvider')}
        </button>
      </section>

      <section className="settings-card preference-card">
        <label className="toggle-row">
          <span>
            <strong>{t('closeDuplicatesBeforeGrouping')}</strong>
            <small>{t('closeDuplicatesBeforeGroupingDescription')}</small>
          </span>
          <input
            aria-label={t('closeDuplicatesBeforeGrouping')}
            type="checkbox"
            checked={currentSettings.deduplicateBeforeGrouping}
            onChange={(event) => void changeWorkflowPreference(event.target.checked)}
          />
        </label>
      </section>

      <aside className="privacy-note">{t('privacyNotice')}</aside>
      {status && (
        <p className="settings-status" role="status">
          {status}
        </p>
      )}
      <button className="link-button" onClick={() => void client.openShortcutSettings()}>
        {t('openShortcutSettings')}
      </button>
    </main>
  );
}
