import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';

import { refreshProviderModels, testConfiguredProviderModel } from './app-service';
import {
  createProviderProfile,
  saveProviderModel,
  saveRefreshedProvider,
} from '../core/settings';

function modelResponse(): Response {
  return new Response(JSON.stringify({ data: [{ id: 'model-1' }] }), {
    headers: { 'Content-Type': 'application/json' },
    status: 200,
  });
}

describe('refreshProviderModels', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('validates models with a new key and saves only a redacted public state', async () => {
    const fetchMock = vi.fn(async () => modelResponse());
    const profile = await createProviderProfile({ name: 'Work OpenAI', providerId: 'openai' });

    const settings = await refreshProviderModels(
      {
        apiKey: 'new-secret',
        baseUrl: 'https://openai.gateway.example/v1',
        profileId: profile.id,
      },
      fetchMock,
    );

    expect(settings.profiles.find((candidate) => candidate.id === profile.id)).toMatchObject({
      baseUrl: 'https://openai.gateway.example/v1',
      hasApiKey: true,
      modelId: '',
      models: [{ displayName: 'model-1', id: 'model-1' }],
    });
    expect(JSON.stringify(settings)).not.toContain('new-secret');
  });

  it('reuses an existing key when the replacement field is empty', async () => {
    const profile = await createProviderProfile({ name: 'OpenAI', providerId: 'openai' });
    await saveRefreshedProvider({
      apiKey: 'stored-secret',
      baseUrl: 'https://api.openai.com/v1',
      models: [{ displayName: 'old', id: 'old' }],
      profileId: profile.id,
    });
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.headers).toEqual(
        expect.objectContaining({ Authorization: 'Bearer stored-secret' }),
      );
      return modelResponse();
    });

    await refreshProviderModels(
      {
        baseUrl: 'https://api.openai.com/v1',
        profileId: profile.id,
      },
      fetchMock,
    );

    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('tests the saved key and selected model without exposing credentials', async () => {
    const profile = await createProviderProfile({ name: 'Claude Gateway', providerId: 'anthropic' });
    await saveRefreshedProvider({
      apiKey: 'stored-secret',
      baseUrl: 'https://anthropic.example',
      models: [{ displayName: 'Claude', id: 'claude-model' }],
      profileId: profile.id,
    });
    await saveProviderModel(profile.id, 'claude-model');
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.headers).toEqual(expect.objectContaining({ 'x-api-key': 'stored-secret' }));
      return new Response(JSON.stringify({ accepted: true }), { status: 200 });
    });

    await expect(testConfiguredProviderModel(profile.id, fetchMock)).resolves.toEqual({
      connected: true,
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
