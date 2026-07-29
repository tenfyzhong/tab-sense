import type { ExistingGroupContext, SanitizedTab } from '../core/types';

export const PROVIDER_IDS = ['openai', 'anthropic', 'gemini', 'openai-compatible'] as const;

export type ProviderId = (typeof PROVIDER_IDS)[number];

export interface ModelOption {
  displayName: string;
  id: string;
}

export interface ProviderConnection {
  apiKey: string;
  baseUrl?: string;
  modelId: string;
  providerId: ProviderId;
}

export interface PublicProviderSettings {
  baseUrl: string;
  hasApiKey: boolean;
  id: string;
  modelId: string;
  models: ModelOption[];
  name: string;
  providerId: ProviderId;
  refreshedAt?: string;
}

export interface PublicSettings {
  activeProfileId: string;
  deduplicateBeforeGrouping: boolean;
  profiles: PublicProviderSettings[];
}

export interface RefreshedProviderInput {
  apiKey?: string;
  baseUrl: string;
  models: ModelOption[];
  profileId: string;
}

export type ProviderFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface GroupingRequest {
  connection: ProviderConnection;
  existingGroups: ExistingGroupContext[];
  locale: string;
  tabs: SanitizedTab[];
}
