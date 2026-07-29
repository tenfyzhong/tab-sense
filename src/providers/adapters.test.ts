import { describe, expect, it, vi } from 'vitest';

import {
  getProviderOriginPattern,
  listProviderModels,
  normalizeCompatibleBaseUrl,
  requestProviderGrouping,
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
