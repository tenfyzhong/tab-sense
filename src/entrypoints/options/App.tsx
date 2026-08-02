import { useEffect, useState } from 'react';

import { DEFAULT_PROVIDER_BASE_URLS } from '../../providers/adapters';
import type { ProviderId, PublicSettings } from '../../providers/types';
import { PROVIDER_IDS } from '../../providers/types';
import { isPublicSettings } from '../../ui/guards';
import { GuidedTour } from '../../ui/GuidedTour';
import {
  guidedTourStateClient,
  type GuidedTourStateClient,
  type GuidedTourStep,
} from '../../ui/guided-tour-state';
import { translate, type Translator } from '../../ui/i18n';
import { runtimeClient, type UiClient } from '../../ui/runtime-client';

interface OptionsAppProps {
  client?: UiClient;
  t?: Translator;
  tourClient?: GuidedTourStateClient;
}

const PROVIDER_MESSAGE_KEYS: Record<ProviderId, string> = {
  anthropic: 'providerAnthropic',
  gemini: 'providerGemini',
  openai: 'providerOpenai',
  'openai-compatible': 'providerOpenaiCompatible',
};

export function OptionsApp({
  client = runtimeClient,
  t = translate,
  tourClient = guidedTourStateClient,
}: OptionsAppProps) {
  const [settings, setSettings] = useState<PublicSettings>();
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [name, setName] = useState('');
  const [providerId, setProviderId] = useState<ProviderId>('openai');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [tourStep, setTourStep] = useState<GuidedTourStep>();

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

  useEffect(() => {
    let active = true;
    void tourClient.loadStep().then((step) => {
      if (active) {
        setTourStep(step);
      }
    });
    return () => {
      active = false;
    };
  }, [tourClient]);

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

  useEffect(() => {
    if (!status || busy) {
      return;
    }
    const timeout = globalThis.setTimeout(() => setStatus(''), 2000);
    return () => globalThis.clearTimeout(timeout);
  }, [busy, status]);

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

  async function moveTour(nextStep: GuidedTourStep): Promise<void> {
    await tourClient.saveStep(nextStep);
    setTourStep(nextStep);
  }

  async function finishTour(): Promise<void> {
    await moveTour('complete');
  }

  async function addProfile(): Promise<void> {
    setStatus('');
    try {
      await applySettingsRequest({
        name: t('newProviderName'),
        providerId: 'openai',
        type: 'create-provider-profile',
      });
      if (tourStep === 'options-add-provider') {
        await moveTour('options-configure-provider');
      }
      setStatus(t('providerCreated'));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unknown error');
    }
  }

  if (!settings) {
    return <main className="settings-shell">{status || t('loading')}</main>;
  }

  const currentSettings = settings;
  const guidedTour =
    tourStep === 'options-add-provider' ? (
      <GuidedTour
        body={t('tourAddProviderBody')}
        onSkip={finishTour}
        skipLabel={t('tourSkip')}
        stepLabel={t('tourStepLabel', ['4', '6'])}
        title={t('tourAddProviderTitle')}
      />
    ) : tourStep === 'options-configure-provider' ? (
      <GuidedTour
        body={t('tourConfigureProviderBody')}
        nextLabel={t('tourNext')}
        onNext={() => moveTour('options-shortcuts')}
        onSkip={finishTour}
        skipLabel={t('tourSkip')}
        stepLabel={t('tourStepLabel', ['5', '6'])}
        title={t('tourConfigureProviderTitle')}
      />
    ) : tourStep === 'options-shortcuts' ? (
      <GuidedTour
        body={t('tourShortcutsBody')}
        nextLabel={t('tourFinish')}
        onNext={finishTour}
        onSkip={finishTour}
        skipLabel={t('tourSkip')}
        stepLabel={t('tourStepLabel', ['6', '6'])}
        title={t('tourShortcutsTitle')}
      />
    ) : null;
  const settingsHeader = (
    <header className="settings-header">
      <div className="settings-identity">
        <div className="settings-brand" aria-hidden="true">
          T
        </div>
        <div>
          <h1>{t('settingsTitle')}</h1>
          <p>{t('settingsSubtitle')}</p>
        </div>
      </div>
      <button
        className={`shortcut-button${tourStep === 'options-shortcuts' ? ' guided-tour-target' : ''}`}
        onClick={() => void client.openShortcutSettings()}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M4 7.5h16v9H4zM7 10h.01M10 10h.01M13 10h.01M16 10h.01M8 13.5h8" />
        </svg>
        <span>{t('openShortcutSettings')}</span>
      </button>
    </header>
  );
  const statusToast = status ? (
    <p aria-live="polite" className="settings-toast" role="status">
      {status}
    </p>
  ) : null;

  if (!profile) {
    return (
      <main className="settings-shell">
        {settingsHeader}

        <section className="settings-card empty-provider-state">
          <p>{t('noProviders')}</p>
          <button
            className={`secondary-button${tourStep === 'options-add-provider' ? ' guided-tour-target' : ''}`}
            disabled={busy}
            onClick={() => void addProfile()}
          >
            {t('addProvider')}
          </button>
        </section>

        <aside className="privacy-note">{t('privacyNotice')}</aside>
        {statusToast}
        {guidedTour}
      </main>
    );
  }

  const currentProfile = profile;

  async function selectProfile(profileId: string): Promise<void> {
    setStatus('');
    try {
      await applySettingsRequest({ profileId, type: 'set-active-provider-profile' });
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
      const granted = await client.requestProviderPermission({ baseUrl, providerId });
      if (!granted) {
        throw new Error(t('providerPermissionDenied'));
      }
      await saveProfile();
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

  async function testModel(): Promise<void> {
    setBusy(true);
    setStatus(t('modelTestInProgress'));
    try {
      const response = await client.request({
        profileId: currentProfile.id,
        type: 'test-provider-model',
      });
      if (!response.ok) {
        throw new Error(response.error);
      }
      setStatus(t('modelTestSuccess'));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  }

  const refreshDisabled = busy || (!apiKey && !currentProfile.hasApiKey) || !baseUrl || !name.trim();

  return (
    <main className="settings-shell">
      {settingsHeader}

      <section
        className={`settings-card${tourStep === 'options-configure-provider' ? ' guided-tour-target' : ''}`}
      >
        <div className="settings-grid" data-testid="provider-settings-grid">
          <div className="profile-picker grid-wide">
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
            <button
              className={`secondary-button${tourStep === 'options-add-provider' ? ' guided-tour-target' : ''}`}
              disabled={busy}
              onClick={() => void addProfile()}
            >
              {t('addProvider')}
            </button>
          </div>

          <label className="field grow-field">
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

          <label className="field grid-wide">
            <span>{t('customBaseUrl')}</span>
            <input
              aria-label={t('customBaseUrl')}
              type="url"
              value={baseUrl}
              placeholder="https://api.example.com/v1"
              onChange={(event) => setBaseUrl(event.target.value)}
            />
          </label>

          <div className="field">
            <label htmlFor="provider-api-key">{t('apiKey')}</label>
            <div className="inline-control">
              <input
                id="provider-api-key"
                autoComplete="off"
                type="password"
                value={apiKey}
                placeholder={currentProfile.hasApiKey ? t('replaceApiKey') : ''}
                onChange={(event) => setApiKey(event.target.value)}
              />
              <button className="primary-button" disabled={refreshDisabled} onClick={refreshModels}>
                {busy ? t('loading') : t('refreshModels')}
              </button>
            </div>
            {currentProfile.hasApiKey && (
              <small className="saved-indicator">{t('apiKeySaved')}</small>
            )}
          </div>

          <div className="field">
            <label htmlFor="provider-model">{t('model')}</label>
            <div className="inline-control">
              <select
                id="provider-model"
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
              <button
                className="secondary-button"
                disabled={busy || !currentProfile.hasApiKey || !currentProfile.modelId}
                onClick={() => void testModel()}
              >
                {t('testModel')}
              </button>
            </div>
          </div>

          <div className="provider-actions grid-wide">
            <button
              className="danger-button compact-danger-button"
              disabled={busy}
              onClick={() => void deleteProfile()}
            >
              {t('deleteProvider')}
            </button>
            <button
              className="secondary-button"
              disabled={busy || !name.trim() || !baseUrl}
              onClick={() => void saveProfileFromButton()}
            >
              {t('saveProvider')}
            </button>
          </div>
        </div>
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
      {statusToast}
      {guidedTour}
    </main>
  );
}
