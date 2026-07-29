import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';

import { refreshProviderModels } from './app-service';
import { saveRefreshedProvider } from '../core/settings';

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

    const settings = await refreshProviderModels(
      {
        apiKey: 'new-secret',
        baseUrl: 'https://openai.gateway.example/v1',
        profileId: 'openai-default',
      },
      fetchMock,
    );

    expect(settings.profiles.find((profile) => profile.id === 'openai-default')).toMatchObject({
      baseUrl: 'https://openai.gateway.example/v1',
      hasApiKey: true,
      modelId: '',
      models: [{ displayName: 'model-1', id: 'model-1' }],
    });
    expect(JSON.stringify(settings)).not.toContain('new-secret');
  });

  it('reuses an existing key when the replacement field is empty', async () => {
    await saveRefreshedProvider({
      apiKey: 'stored-secret',
      baseUrl: 'https://api.openai.com/v1',
      models: [{ displayName: 'old', id: 'old' }],
      profileId: 'openai-default',
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
        profileId: 'openai-default',
      },
      fetchMock,
    );

    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
