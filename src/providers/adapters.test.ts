import { describe, expect, it, vi } from 'vitest';

import {
  getProviderOriginPattern,
  listProviderModels,
  normalizeCompatibleBaseUrl,
  requestProviderGrouping,
  testProviderConnection,
} from './adapters';
import type { ProviderConnection, ProviderId } from './types';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status,
  });
}

describe('normalizeCompatibleBaseUrl', () => {
  it('allows HTTPS and loopback HTTP API roots', () => {
    expect(normalizeCompatibleBaseUrl('https://ai.example.com/v1/')).toBe(
      'https://ai.example.com/v1',
    );
    expect(normalizeCompatibleBaseUrl('http://localhost:11434/v1/')).toBe(
      'http://localhost:11434/v1',
    );
    expect(normalizeCompatibleBaseUrl('http://127.0.0.1:8080/v1')).toBe(
      'http://127.0.0.1:8080/v1',
    );
  });

  it('rejects insecure remote URLs and embedded secrets', () => {
    expect(() => normalizeCompatibleBaseUrl('http://ai.example.com/v1')).toThrow('HTTPS');
    expect(() => normalizeCompatibleBaseUrl('https://user:pass@ai.example.com/v1')).toThrow(
      'credentials',
    );
    expect(() => normalizeCompatibleBaseUrl('https://ai.example.com/v1?key=secret')).toThrow(
      'query',
    );
  });
});

describe('getProviderOriginPattern', () => {
  it('uses configured origins for every protocol and strips ports and paths', () => {
    expect(getProviderOriginPattern({ providerId: 'openai' })).toBe('https://api.openai.com/*');
    expect(
      getProviderOriginPattern({
        baseUrl: 'https://openai.gateway.example/v1',
        providerId: 'openai',
      }),
    ).toBe('https://openai.gateway.example/*');
    expect(
      getProviderOriginPattern({
        baseUrl: 'https://anthropic.gateway.example/v1',
        providerId: 'anthropic',
      }),
    ).toBe('https://anthropic.gateway.example/*');
    expect(
      getProviderOriginPattern({
        baseUrl: 'https://gemini.gateway.example/v1beta',
        providerId: 'gemini',
      }),
    ).toBe('https://gemini.gateway.example/*');
    expect(
      getProviderOriginPattern({
        baseUrl: 'http://localhost:11434/v1',
        providerId: 'openai-compatible',
      }),
    ).toBe('http://localhost/*');
  });
});

describe('listProviderModels', () => {
  it('loads and sorts OpenAI models with bearer authentication', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ data: [{ id: 'z-model' }, { id: 'a-model' }] }),
    );

    const models = await listProviderModels(
      {
        apiKey: 'openai-secret',
        baseUrl: 'https://openai.gateway.example/v1',
        modelId: '',
        providerId: 'openai',
      },
      fetchMock,
    );

    expect(models.map((model) => model.id)).toEqual(['a-model', 'z-model']);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://openai.gateway.example/v1/models',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer openai-secret' }),
      }),
    );
  });

  it('paginates Anthropic models', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          data: [{ display_name: 'Claude B', id: 'claude-b' }],
          has_more: true,
          last_id: 'claude-b',
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: [{ display_name: 'Claude A', id: 'claude-a' }],
          has_more: false,
        }),
      );

    const models = await listProviderModels(
      {
        apiKey: 'anthropic-secret',
        baseUrl: 'https://anthropic.gateway.example/v1',
        modelId: '',
        providerId: 'anthropic',
      },
      fetchMock,
    );

    expect(models.map((model) => model.id)).toEqual(['claude-a', 'claude-b']);
    expect(fetchMock.mock.calls[1]?.[0]).toContain('after_id=claude-b');
    expect(fetchMock.mock.calls[0]?.[0]).toContain('https://anthropic.gateway.example/v1/models');
    expect(fetchMock.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        headers: expect.objectContaining({
          'anthropic-version': '2023-06-01',
          'x-api-key': 'anthropic-secret',
        }),
      }),
    );
  });

  it('adds the Anthropic API version to SDK-style Base URLs', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ data: [], has_more: false }));

    await listProviderModels(
      {
        apiKey: 'deepseek-secret',
        baseUrl: 'https://api.deepseek.com/anthropic',
        modelId: '',
        providerId: 'anthropic',
      },
      fetchMock,
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.deepseek.com/anthropic/v1/models?limit=1000',
      expect.any(Object),
    );
  });

  it('falls back to a sibling OpenAI model catalog when Anthropic discovery is missing', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, 404))
      .mockResolvedValueOnce(
        jsonResponse({
          data: [{ id: 'deepseek-v4-pro' }, { id: 'deepseek-v4-flash' }],
          object: 'list',
        }),
      );

    const models = await listProviderModels(
      {
        apiKey: 'deepseek-secret',
        baseUrl: 'https://api.deepseek.com/anthropic',
        modelId: '',
        providerId: 'anthropic',
      },
      fetchMock,
    );

    expect(models.map((model) => model.id)).toEqual(['deepseek-v4-flash', 'deepseek-v4-pro']);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://api.deepseek.com/anthropic/v1/models?limit=1000',
      expect.objectContaining({
        headers: expect.objectContaining({ 'x-api-key': 'deepseek-secret' }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://api.deepseek.com/models',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer deepseek-secret' }),
      }),
    );
  });

  it('does not fall back from Anthropic authentication errors', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({}, 401));

    await expect(
      listProviderModels(
        {
          apiKey: 'rejected-secret',
          baseUrl: 'https://api.deepseek.com/anthropic',
          modelId: '',
          providerId: 'anthropic',
        },
        fetchMock,
      ),
    ).rejects.toThrow('API key was rejected');
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('paginates Gemini models and retains generateContent support only', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          models: [
            {
              displayName: 'Gemini Chat',
              name: 'models/gemini-chat',
              supportedGenerationMethods: ['generateContent'],
            },
            {
              displayName: 'Embedding',
              name: 'models/embed',
              supportedGenerationMethods: ['embedContent'],
            },
          ],
          nextPageToken: 'next-page',
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ models: [] }));

    const models = await listProviderModels(
      {
        apiKey: 'gemini-secret',
        baseUrl: 'https://gemini.gateway.example/v1beta',
        modelId: '',
        providerId: 'gemini',
      },
      fetchMock,
    );

    expect(models).toEqual([{ displayName: 'Gemini Chat', id: 'gemini-chat' }]);
    expect(fetchMock.mock.calls[1]?.[0]).toContain('pageToken=next-page');
    expect(fetchMock.mock.calls[0]?.[0]).toContain(
      'https://gemini.gateway.example/v1beta/models',
    );
    expect(fetchMock.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        headers: expect.objectContaining({ 'x-goog-api-key': 'gemini-secret' }),
      }),
    );
  });

  it('sanitizes authentication and rate-limit errors', async () => {
    const connection: ProviderConnection = {
      apiKey: 'never-show-this',
      modelId: '',
      providerId: 'openai',
    };

    await expect(
      listProviderModels(connection, vi.fn(async () => jsonResponse({ secret: 'body' }, 401))),
    ).rejects.toThrow('API key was rejected');
    await expect(
      listProviderModels(connection, vi.fn(async () => jsonResponse({}, 429))),
    ).rejects.toThrow('rate limit');
  });
});

describe('requestProviderGrouping', () => {
  const responseByProvider: Record<ProviderId, unknown> = {
    anthropic: { content: [{ text: '{"groups":[]}', type: 'text' }] },
    gemini: {
      candidates: [{ content: { parts: [{ text: '{"groups":[]}' }] } }],
    },
    openai: {
      output: [{ content: [{ text: '{"groups":[]}', type: 'output_text' }] }],
    },
    'openai-compatible': {
      choices: [{ message: { content: '{"groups":[]}' } }],
    },
  };

  for (const providerId of Object.keys(responseByProvider) as ProviderId[]) {
    it(`extracts grouping JSON from ${providerId}`, async () => {
      const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
        expect(input).toBeDefined();
        return jsonResponse(responseByProvider[providerId]);
      });
      const connection: ProviderConnection = {
        apiKey: 'secret',
        baseUrl: `https://${providerId}.gateway.example/v1`,
        modelId: 'model-1',
        providerId,
      };

      const response = await requestProviderGrouping(
        connection,
        [
          { id: 1, title: 'One', url: 'https://one.example/' },
          { id: 2, title: 'Two', url: 'https://two.example/' },
        ],
        [{ id: 7, tabs: [], title: 'Existing Work' }],
        'en',
        fetchMock,
      );

      expect(response).toBe('{"groups":[]}');
      expect(fetchMock).toHaveBeenCalledOnce();
      expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
        `https://${providerId}.gateway.example/v1/`,
      );
    });
  }

  it('uses the versioned Messages endpoint for an Anthropic SDK-style Base URL', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(responseByProvider.anthropic));

    await requestProviderGrouping(
      {
        apiKey: 'deepseek-secret',
        baseUrl: 'https://api.deepseek.com/anthropic',
        modelId: 'deepseek-chat',
        providerId: 'anthropic',
      },
      [{ id: 1, title: 'One', url: 'https://one.example/' }],
      [],
      'en',
      fetchMock,
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.deepseek.com/anthropic/v1/messages',
      expect.any(Object),
    );
  });

  it('instructs the provider to prefer existing groups and sends their context', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(input).toBeDefined();
      expect(init).toBeDefined();
      return jsonResponse({ choices: [{ message: { content: '{"groups":[]}' } }] });
    });

    await requestProviderGrouping(
      {
        apiKey: 'secret',
        baseUrl: 'https://compatible.example/v1',
        modelId: 'model-1',
        providerId: 'openai-compatible',
      },
      [{ id: 1, title: 'New issue', url: 'https://github.example/issues/1' }],
      [
        {
          id: 7,
          tabs: [{ id: 70, title: 'Existing issue', url: 'https://github.example/issues/70' }],
          title: 'GitHub Issues',
        },
      ],
      'en',
      fetchMock,
    );

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as {
      messages: Array<{ content: string; role: string }>;
    };
    expect(body.messages[0]?.content).toContain('Prefer assigning tabs to a suitable existing group');
    expect(body.messages[1]?.content).toContain('"existingGroups"');
    expect(body.messages[1]?.content).toContain('"GitHub Issues"');
  });
});

describe('testProviderConnection', () => {
  it.each([
    {
      baseUrl: 'https://api.openai.com/v1',
      expectedUrl: 'https://api.openai.com/v1/responses',
      headerName: 'Authorization',
      headerValue: 'Bearer test-secret',
      providerId: 'openai' as const,
    },
    {
      baseUrl: 'https://api.deepseek.com/anthropic',
      expectedUrl: 'https://api.deepseek.com/anthropic/v1/messages',
      headerName: 'x-api-key',
      headerValue: 'test-secret',
      providerId: 'anthropic' as const,
    },
    {
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
      expectedUrl:
        'https://generativelanguage.googleapis.com/v1beta/models/model-1:generateContent',
      headerName: 'x-goog-api-key',
      headerValue: 'test-secret',
      providerId: 'gemini' as const,
    },
    {
      baseUrl: 'https://gateway.example/v1',
      expectedUrl: 'https://gateway.example/v1/chat/completions',
      headerName: 'Authorization',
      headerValue: 'Bearer test-secret',
      providerId: 'openai-compatible' as const,
    },
  ])('sends a bounded $providerId generation request', async (testCase) => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(input).toBeDefined();
      expect(init).toBeDefined();
      return jsonResponse({ accepted: true });
    });

    await testProviderConnection(
      {
        apiKey: 'test-secret',
        baseUrl: testCase.baseUrl,
        modelId: 'model-1',
        providerId: testCase.providerId,
      },
      fetchMock,
    );

    expect(fetchMock).toHaveBeenCalledWith(
      testCase.expectedUrl,
      expect.objectContaining({
        headers: expect.objectContaining({ [testCase.headerName]: testCase.headerValue }),
        method: 'POST',
      }),
    );
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as Record<string, unknown>;
    expect(body.model ?? 'model-1').toBe('model-1');
    const outputLimit =
      testCase.providerId === 'gemini'
        ? (body.generationConfig as Record<string, unknown>).maxOutputTokens
        : testCase.providerId === 'openai'
          ? body.max_output_tokens
          : body.max_tokens;
    expect(outputLimit).toBe(16);
  });

  it('returns sanitized provider failures', async () => {
    await expect(
      testProviderConnection(
        {
          apiKey: 'never-show-this',
          baseUrl: 'https://api.openai.com/v1',
          modelId: 'model-1',
          providerId: 'openai',
        },
        vi.fn(async () => jsonResponse({ leaked: 'body' }, 401)),
      ),
    ).rejects.toThrow('API key was rejected');
  });
});
