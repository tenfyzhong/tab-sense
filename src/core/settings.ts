import { browser } from 'wxt/browser';

import { DEFAULT_PROVIDER_BASE_URLS, normalizeCompatibleBaseUrl } from '../providers/adapters';
import {
  PROVIDER_IDS,
  type ModelOption,
  type ProviderConnection,
  type ProviderId,
  type PublicProviderSettings,
  type PublicSettings,
  type RefreshedProviderInput,
} from '../providers/types';

const SETTINGS_KEY = 'tabSenseSettings';
const CREDENTIALS_KEY = 'tabSenseCredentials';
const SETTINGS_VERSION = 4;
const PREVIOUS_SETTINGS_VERSIONS = [2, 3] as const;

interface StoredProviderProfile {
  baseUrl: string;
  id: string;
  modelId: string;
  models: ModelOption[];
  name: string;
  providerId: ProviderId;
  refreshedAt?: string;
}

interface StoredSettings {
  activeProfileId: string;
  deduplicateBeforeGrouping: boolean;
  profiles: StoredProviderProfile[];
  version: typeof SETTINGS_VERSION;
}

type StoredCredentials = Record<string, string>;

interface LegacyProviderSettings {
  baseUrl?: string;
  modelId?: string;
  models?: ModelOption[];
  refreshedAt?: string;
}

interface LegacySettings {
  activeProvider?: ProviderId;
  deduplicateBeforeGrouping?: boolean;
  providers?: Partial<Record<ProviderId, LegacyProviderSettings>>;
}

const PROVIDER_NAMES: Record<ProviderId, string> = {
  anthropic: 'Anthropic',
  gemini: 'Google Gemini',
  openai: 'OpenAI Responses',
  'openai-compatible': 'OpenAI Completions',
};

const LEGACY_PROVIDER_NAMES: Partial<Record<ProviderId, string>> = {
  openai: 'OpenAI',
  'openai-compatible': 'OpenAI-compatible',
};

function profileIdForProvider(providerId: ProviderId): string {
  return `${providerId}-default`;
}

function defaultProfile(providerId: ProviderId): StoredProviderProfile {
  return {
    baseUrl: DEFAULT_PROVIDER_BASE_URLS[providerId],
    id: profileIdForProvider(providerId),
    modelId: '',
    models: [],
    name: PROVIDER_NAMES[providerId],
    providerId,
  };
}

function isProviderId(value: unknown): value is ProviderId {
  return typeof value === 'string' && PROVIDER_IDS.includes(value as ProviderId);
}

function normalizedBaseUrl(providerId: ProviderId, baseUrl: string | undefined): string {
  const candidate = baseUrl?.trim() || DEFAULT_PROVIDER_BASE_URLS[providerId];
  if (!candidate) {
    return '';
  }
  return normalizeCompatibleBaseUrl(candidate);
}

function migrateLegacyBuiltInProfileName(
  profile: StoredProviderProfile,
): StoredProviderProfile {
  const legacyName = LEGACY_PROVIDER_NAMES[profile.providerId];
  if (
    profile.id === profileIdForProvider(profile.providerId) &&
    legacyName !== undefined &&
    profile.name === legacyName
  ) {
    return { ...profile, name: PROVIDER_NAMES[profile.providerId] };
  }
  return profile;
}

function isUntouchedGeneratedProfile(
  profile: StoredProviderProfile,
  credentials: StoredCredentials,
): boolean {
  return (
    profile.id === profileIdForProvider(profile.providerId) &&
    profile.name === PROVIDER_NAMES[profile.providerId] &&
    profile.baseUrl === DEFAULT_PROVIDER_BASE_URLS[profile.providerId] &&
    profile.modelId === '' &&
    profile.models.length === 0 &&
    profile.refreshedAt === undefined &&
    !credentials[profile.id]
  );
}

function migrateSettings(value: unknown, credentials: StoredCredentials): StoredSettings {
  if (
    typeof value === 'object' &&
    value !== null &&
    'version' in value &&
    value.version === SETTINGS_VERSION &&
    'profiles' in value &&
    Array.isArray(value.profiles)
  ) {
    return value as unknown as StoredSettings;
  }

  if (
    typeof value === 'object' &&
    value !== null &&
    'version' in value &&
    PREVIOUS_SETTINGS_VERSIONS.includes(
      value.version as (typeof PREVIOUS_SETTINGS_VERSIONS)[number],
    ) &&
    'profiles' in value &&
    Array.isArray(value.profiles)
  ) {
    const previous = value as unknown as Omit<StoredSettings, 'version'> & { version: 2 | 3 };
    const profiles = previous.profiles
      .map(migrateLegacyBuiltInProfileName)
      .filter((profile) => !isUntouchedGeneratedProfile(profile, credentials));
    return {
      ...previous,
      activeProfileId: profiles.some((profile) => profile.id === previous.activeProfileId)
        ? previous.activeProfileId
        : (profiles[0]?.id ?? ''),
      profiles,
      version: SETTINGS_VERSION,
    };
  }

  const legacy = (value ?? {}) as LegacySettings;
  const profiles = PROVIDER_IDS.flatMap((providerId) => {
    const old = legacy.providers?.[providerId];
    const profile = defaultProfile(providerId);
    if (old === undefined && !credentials[profile.id]) {
      return [];
    }
    return [
      {
        ...profile,
        baseUrl: normalizedBaseUrl(providerId, old?.baseUrl),
        modelId: old?.modelId ?? '',
        models: old?.models ?? [],
        refreshedAt: old?.refreshedAt,
      },
    ];
  });
  const activeProvider = isProviderId(legacy.activeProvider) ? legacy.activeProvider : undefined;
  const requestedActiveProfileId = activeProvider ? profileIdForProvider(activeProvider) : '';
  return {
    activeProfileId: profiles.some((profile) => profile.id === requestedActiveProfileId)
      ? requestedActiveProfileId
      : (profiles[0]?.id ?? ''),
    deduplicateBeforeGrouping: legacy.deduplicateBeforeGrouping ?? false,
    profiles,
    version: SETTINGS_VERSION,
  };
}

function migrateCredentials(
  value: unknown,
  settingsWereCurrent: boolean,
): StoredCredentials {
  const credentials =
    typeof value === 'object' && value !== null ? (value as StoredCredentials) : {};
  if (settingsWereCurrent) {
    return credentials;
  }

  return Object.fromEntries(
    Object.entries(credentials).map(([key, apiKey]) => [
      isProviderId(key) ? profileIdForProvider(key) : key,
      apiKey,
    ]),
  );
}

async function loadState(): Promise<{
  credentials: StoredCredentials;
  settings: StoredSettings;
}> {
  const stored = await browser.storage.local.get([SETTINGS_KEY, CREDENTIALS_KEY]);
  const rawSettings = stored[SETTINGS_KEY];
  const settingsWereCurrent =
    typeof rawSettings === 'object' &&
    rawSettings !== null &&
    'version' in rawSettings &&
    rawSettings.version === SETTINGS_VERSION;
  const credentials = migrateCredentials(stored[CREDENTIALS_KEY], settingsWereCurrent);
  const settings = migrateSettings(rawSettings, credentials);

  if (!settingsWereCurrent) {
    await browser.storage.local.set({
      [CREDENTIALS_KEY]: credentials,
      [SETTINGS_KEY]: settings,
    });
  }
  return { credentials, settings };
}

async function saveState(settings: StoredSettings, credentials?: StoredCredentials): Promise<void> {
  await browser.storage.local.set({
    ...(credentials ? { [CREDENTIALS_KEY]: credentials } : {}),
    [SETTINGS_KEY]: settings,
  });
}

function findProfile(settings: StoredSettings, profileId: string): StoredProviderProfile {
  const profile = settings.profiles.find((candidate) => candidate.id === profileId);
  if (!profile) {
    throw new Error('The selected provider profile no longer exists');
  }
  return profile;
}

function publicSettings(settings: StoredSettings, credentials: StoredCredentials): PublicSettings {
  return {
    activeProfileId: settings.activeProfileId,
    deduplicateBeforeGrouping: settings.deduplicateBeforeGrouping,
    profiles: settings.profiles.map((profile): PublicProviderSettings => ({
      ...profile,
      hasApiKey: Boolean(credentials[profile.id]),
    })),
  };
}

function createProfileId(providerId: ProviderId): string {
  const suffix = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  return `${providerId}-${suffix}`;
}

export async function loadPublicSettings(): Promise<PublicSettings> {
  const { credentials, settings } = await loadState();
  return publicSettings(settings, credentials);
}

export async function createProviderProfile(input: {
  name: string;
  providerId: ProviderId;
}): Promise<PublicProviderSettings> {
  const { credentials, settings } = await loadState();
  const name = input.name.trim();
  if (!name) {
    throw new Error('A provider name is required');
  }
  const profile: StoredProviderProfile = {
    baseUrl: DEFAULT_PROVIDER_BASE_URLS[input.providerId],
    id: createProfileId(input.providerId),
    modelId: '',
    models: [],
    name,
    providerId: input.providerId,
  };
  settings.profiles.push(profile);
  settings.activeProfileId = profile.id;
  await saveState(settings);
  return { ...profile, hasApiKey: Boolean(credentials[profile.id]) };
}

export async function saveProviderProfile(input: {
  baseUrl: string;
  name: string;
  profileId: string;
  providerId: ProviderId;
}): Promise<void> {
  const { settings } = await loadState();
  const current = findProfile(settings, input.profileId);
  const name = input.name.trim();
  if (!name) {
    throw new Error('A provider name is required');
  }
  const baseUrl = normalizedBaseUrl(input.providerId, input.baseUrl);
  const connectionChanged = current.providerId !== input.providerId || current.baseUrl !== baseUrl;
  Object.assign(current, {
    baseUrl,
    name,
    providerId: input.providerId,
    ...(connectionChanged ? { modelId: '', models: [], refreshedAt: undefined } : {}),
  });
  await saveState(settings);
}

export async function deleteProviderProfile(profileId: string): Promise<void> {
  const { credentials, settings } = await loadState();
  const nextProfiles = settings.profiles.filter((profile) => profile.id !== profileId);
  if (nextProfiles.length === settings.profiles.length) {
    throw new Error('The selected provider profile no longer exists');
  }
  settings.profiles = nextProfiles;
  if (settings.activeProfileId === profileId) {
    settings.activeProfileId = nextProfiles[0]?.id ?? '';
  }
  delete credentials[profileId];
  await saveState(settings, credentials);
}

export async function saveWorkflowPreference(enabled: boolean): Promise<void> {
  const { settings } = await loadState();
  settings.deduplicateBeforeGrouping = enabled;
  await saveState(settings);
}

export async function setActiveProviderProfile(profileId: string): Promise<void> {
  const { settings } = await loadState();
  findProfile(settings, profileId);
  settings.activeProfileId = profileId;
  await saveState(settings);
}

export async function saveRefreshedProvider(input: RefreshedProviderInput): Promise<void> {
  const { credentials, settings } = await loadState();
  const profile = findProfile(settings, input.profileId);
  const apiKey = input.apiKey?.trim() || credentials[profile.id];
  if (!apiKey) {
    throw new Error('An API key is required');
  }

  credentials[profile.id] = apiKey;
  profile.baseUrl = normalizedBaseUrl(profile.providerId, input.baseUrl);
  profile.modelId = input.models.some((model) => model.id === profile.modelId)
    ? profile.modelId
    : '';
  profile.models = input.models;
  profile.refreshedAt = new Date().toISOString();
  await saveState(settings, credentials);
}

export async function saveProviderModel(profileId: string, modelId: string): Promise<void> {
  const { settings } = await loadState();
  const profile = findProfile(settings, profileId);
  if (!profile.models.some((model) => model.id === modelId)) {
    throw new Error('Select a model returned by the provider');
  }
  profile.modelId = modelId;
  await saveState(settings);
}

export async function loadProviderApiKey(profileId: string): Promise<string | undefined> {
  return (await loadState()).credentials[profileId];
}

export async function loadProviderConnection(profileId: string): Promise<ProviderConnection> {
  const { credentials, settings } = await loadState();
  const profile = findProfile(settings, profileId);
  const apiKey = credentials[profile.id];
  if (!apiKey) {
    throw new Error('Configure an API key before grouping tabs');
  }
  if (!profile.modelId) {
    throw new Error('Select a model before grouping tabs');
  }
  return {
    apiKey,
    baseUrl: profile.baseUrl,
    modelId: profile.modelId,
    providerId: profile.providerId,
  };
}

export async function loadActiveProviderConnection(): Promise<ProviderConnection> {
  const { settings } = await loadState();
  return loadProviderConnection(settings.activeProfileId);
}
