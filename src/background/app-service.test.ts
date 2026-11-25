import { beforeEach, describe, expect, it, vi } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';

import {
  createRuntimeDependencies,
  refreshProviderModels,
  runConfiguredAiGrouping,
  testConfiguredProviderModel,
} from './app-service';
import {
  createProviderProfile,
  loadActiveProviderConnection,
  saveProviderModel,
  saveRefreshedProvider,
} from '../core/settings';
import type { ProviderFetch } from '../providers/types';

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

describe('browser window lookup', () => {
  it('uses a browser-neutral error when no normal window is available', async () => {
    vi.spyOn(fakeBrowser.windows, 'getLastFocused').mockResolvedValue({} as never);

    await expect(createRuntimeDependencies().getCurrentWindowId()).rejects.toThrow(
      'No normal browser window is available',
    );
  });
});

describe('configured grouping model limits', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it.each([
    {
      baseUrl: 'https://api.openai.com/v1',
      modelId: 'gpt-6-luna',
      providerId: 'openai',
      tokens: 1_050_000,
    },
    {
      baseUrl: 'https://openrouter.ai/api/v1',
      modelId: 'openai/gpt-6-luna',
      providerId: 'openai-compatible',
      tokens: 800_000,
    },
    {
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
      modelId: 'gemini-example',
      providerId: 'gemini',
      tokens: 1_048_576,
    },
    {
      baseUrl: 'https://unlisted-gateway.example/v1',
      modelId: 'unique-model',
      providerId: 'openai-compatible',
      tokens: 32_768,
    },
    {
      baseUrl: 'https://unlisted-gateway.example/v1',
      modelId: 'ambiguous-model',
      providerId: 'openai-compatible',
      tokens: null,
    },
  ] as const)('resolves model context from models.dev ($providerId / $modelId)', async (test) => {
    const profile = await createProviderProfile({ name: 'Test', providerId: test.providerId });
    await saveRefreshedProvider({
      apiKey: 'private-key',
      baseUrl: test.baseUrl,
      models: [{ displayName: 'Test model', id: test.modelId }],
      profileId: profile.id,
    });
    await saveProviderModel(profile.id, test.modelId);
    const fetcher = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({
      google: { models: { 'gemini-example': { limit: { context: 1_048_576 } } } },
      openai: { models: { 'gpt-6-luna': { limit: { context: 1_050_000, input: 922_000, output: 128_000 } } } },
      openrouter: {
        api: 'https://openrouter.ai/api/v1',
        models: { 'openai/gpt-6-luna': { limit: { context: 800_000 } } },
      },
      providerA: { models: {
        'unique-model': { limit: { context: 32_768 } },
        'ambiguous-model': { limit: { context: 4096 } },
      } },
      providerB: { models: { 'ambiguous-model': { limit: { context: 8192 } } } },
    })));

    const dependencies = createRuntimeDependencies();
    await expect(dependencies.resolveModelContext(profile.id, test.modelId)).resolves.toEqual({
      catalogContextTokens: test.tokens,
    });
    expect(fetcher).toHaveBeenCalledWith('https://models.dev/api.json', expect.objectContaining({
      credentials: 'omit',
    }));
    expect(fetcher.mock.calls[0]?.[1]?.headers).toBeUndefined();
    const connection = await loadActiveProviderConnection();
    if (test.tokens === null) {
      expect(connection).not.toHaveProperty('contextWindowTokens');
    } else {
      expect(connection.contextWindowTokens).toBe(test.tokens);
    }

    fetcher.mockRestore();
    const unavailable = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 503 }));
    await expect(dependencies.resolveModelContext(profile.id, test.modelId)).resolves.toEqual({
      catalogContextTokens: test.tokens,
    });
    expect(unavailable).toHaveBeenCalledOnce();
  });

  it.each([2048, undefined])('checks the saved model automatically when its limit is missing (%s)', async (limit) => {
    const baseUrl = 'https://gateway.example/v1';
    const profile = await createProviderProfile({ name: 'Gateway', providerId: 'openai-compatible' });
    await saveRefreshedProvider({
      apiKey: 'secret',
      baseUrl,
      models: [{ displayName: 'Old model', id: 'old' }],
      profileId: profile.id,
    });
    await saveProviderModel(profile.id, 'old');
    vi.spyOn(browser.i18n, 'getUILanguage').mockReturnValue('en');
    vi.spyOn(browser.tabGroups, 'query').mockImplementation(async () => []);
    vi.spyOn(browser.tabs, 'query').mockImplementation(async () =>
      Array.from({ length: 10 }, (_, index) => ({
        active: false,
        groupId: -1,
        highlighted: false,
        id: index + 1,
        incognito: false,
        index,
        pinned: false,
        selected: false,
        title: '长标题🌍'.repeat(35),
        url: `https://example.com/${index}/${'path'.repeat(90)}`,
        windowId: 1,
      })),
    );
    const fetcher = vi.fn<ProviderFetch>(async (_url, init) => {
      const json = init?.method === 'GET'
        ? { data: [{ id: 'unselected', max_model_len: 1024 }, { id: 'old', max_model_len: limit }] }
        : { choices: [{ message: { content: '{"groups":[]}' } }] };
      return new Response(JSON.stringify(json));
    });

    vi.spyOn(globalThis, 'fetch').mockImplementation(fetcher);
    await expect(runConfiguredAiGrouping(1)).resolves.toMatchObject({ ok: true });
    expect(fetcher).toHaveBeenNthCalledWith(
      1,
      `${baseUrl}/models`,
      expect.objectContaining({ method: 'GET' }),
    );
    const requests = fetcher.mock.calls.slice(1);
    if (limit === undefined) {
      expect(requests).toHaveLength(1);
    } else {
      expect(requests.length).toBeGreaterThan(1);
    }
    for (const [, init] of requests) {
      const body = JSON.parse(String(init?.body));
      const input = body.messages.map(({ content }: { content: string }) => content).join('');
      expect(new TextEncoder().encode(input).length + body.max_tokens).toBeLessThanOrEqual(limit ?? 128_000);
    }
  });
});
